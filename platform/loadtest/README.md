# Read API loadtest

`platform/loadtest`는 Medikong 공개 조회 API 기준선을 k6로 측정하는 별도 runner다.
`platform/synthetic`은 낮은 트래픽의 해피패스 검증만 맡고, 이 chart는 VU, duration, threshold를 조절하는 부하테스트만 맡는다.

## Scenario

`read-api-baseline`은 read-only 요청만 실행한다.

```text
GET /concerts
GET /concerts/{id}/performances
GET /performances/{id}/seats
```

목록 응답은 `items` 배열을 기준으로 읽고, VU/iteration 값으로 concert와 performance를 고른다.
좌석 예약, 결제, 티켓 발급 같은 write path는 실행하지 않는다.

`setup-read-dataset`은 부하테스트용 fake read dataset을 준비한다.
이 시나리오는 provider/admin write API를 사용하므로 read baseline 결과와 섞지 않는다.
생성 대상은 `dataset.profile`, `dataset.revision`, 수량 값으로 조절한다.
`flows/dataset.js`는 profile registry만 담당하고, 실제 데이터셋 구성은 `flows/datasets/<profile>.js`가 소유한다.
새 케이스가 필요하면 profile 파일을 추가하고 registry에 등록한다.

예를 들어 공연 수를 넓게 퍼뜨리는 `read-api-wide`, 좌석 맵이 큰 `large-seat-map`, 공연 회차가 많은 `many-performances` 같은 profile을 추가할 수 있다.
이때 `setup-read-dataset` scenario, Helm template, CronJob, GitOps manualRuns는 바꾸지 않고 `dataset.profile` 값만 바꿔 실행한다.

```text
provider/admin login
venue 생성
concert N개 생성 또는 기존 공개 dataset 재사용
concert별 performance M개 보강
performance별 seat map 생성
sale policy 승인
open schedule 설정
public read API 검증
```

## Collection decision

현재 GitOps 모니터링 스택은 Prometheus remote write receiver를 열지 않는다.
OpenTelemetry Collector는 Kubernetes stdout/stderr를 `filelog` receiver로 읽고 JSON body를 파싱해 Loki로 보낸다.

그래서 loadtest runner는 Loki client를 직접 쓰지 않는다.
k6 실행 로그와 `handleSummary` 결과를 stdout JSON line으로 남기고, Collector가 기존 경로로 수집한다.
구분 필드는 `test_type=loadtest`, `scenario=read-api-baseline`, `step=read_api.*`이고, chart label과 namespace도 synthetic과 분리한다.

실험 조건은 실행 시점에 `loadtest_experiment_conditions` 이벤트로 별도 기록한다.
이 이벤트에는 `environment`, `target`, `target_base_url`, `scenario`, `vus`, `duration`, threshold, dataset profile/revision, 계산된 dataset 총량, runner image tag, `revision`이 들어간다.
발표 자료나 회고에서는 Grafana time range와 이 이벤트를 함께 보고 같은 조건을 다시 재현한다.

## Commands

운영에서는 command로 Job을 만들지 않는다.
aws-dev는 GitOps sync와 Kubernetes CronJob이 dataset 준비와 read baseline 실행을 관리한다.
수동 실행도 `kubectl create job`이 아니라 `manualRuns.*.enabled`와 `manualRuns.*.runId` 값을 GitOps로 바꿔 선언한다.

로컬에서는 개발 편의를 위해 Taskfile 명령으로 직접 실행한다.
`dev:loadtest`는 로컬 Secret, image, Helm release를 준비한 뒤 dataset setup과 read baseline을 순차 실행한다.
배포만 필요하면 `dev:loadtest:deploy`를 사용한다.
공개 concert ingress는 Kong rate limit이 `minute: 120`으로 설정되어 있으므로, 기본 local/aws-dev values는 `thinkTimeSeconds`를 둬 한도 안에서 기준선을 확인한다.
rate limit이나 병목을 일부러 확인하려면 `loadtest.vus`, `loadtest.duration`, `loadtest.thinkTimeSeconds`, threshold 값을 GitOps values로 조정한다.

```bash
task --dir gitops/platform/loadtest lint
task --dir gitops/platform/loadtest render
LOADTEST_VALUES_FILE=values/aws-dev.yaml task --dir gitops/platform/loadtest render
task --dir gitops/platform/loadtest deploy
task --dir gitops/platform/loadtest setup-dataset
task --dir gitops/platform/loadtest run
task --dir gitops/platform/loadtest logs
task --dir gitops/platform/loadtest status
```

로컬 root task 기준:

```bash
task --dir gitops dev:loadtest
task --dir gitops dev:loadtest:deploy
task --dir gitops dev:loadtest:setup-dataset
task --dir gitops dev:loadtest:run
```

`values/aws-dev.yaml`은 기본으로 dataset CronJob과 read baseline CronJob을 켠다.
dataset은 `5 */6 * * *`, read baseline은 `20 */6 * * *`에 실행해 같은 주기 안에서 dataset 준비가 먼저 끝나도록 둔다.
Argo sync 때도 `syncJobs.dataset`이 먼저 실행되고, `syncJobs.read`가 뒤따른다.

GitOps 관리형 수동 dataset setup 예시:

```yaml
manualRuns:
  dataset:
    enabled: true
    runId: dataset-20260615-001
```

GitOps 관리형 수동 read baseline 예시:

```yaml
manualRuns:
  read:
    enabled: true
    runId: read-20260615-001
```

같은 수동 Job을 다시 만들려면 `runId`를 새 값으로 바꾼다.
dataset setup에는 `LOADTEST_PROVIDER_EMAIL`, `LOADTEST_PROVIDER_PASSWORD`, `LOADTEST_ADMIN_EMAIL`, `LOADTEST_ADMIN_PASSWORD`를 가진 `dataset.credentialsSecretName` Secret이 필요하다.

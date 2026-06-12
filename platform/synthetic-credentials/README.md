# Synthetic credentials

`synthetic-traffic-credentials.sealedsecret.yaml` manages the aws-dev credential Secret that the
synthetic k6 runner reads through `envFrom.secretRef`.

Do not commit a plain Kubernetes `Secret` with email/password values. Generate or rotate this file
with `kubeseal` against the aws-dev Sealed Secrets controller certificate, then let Argo CD apply the
encrypted `SealedSecret`.

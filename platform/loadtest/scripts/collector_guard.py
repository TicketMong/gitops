#!/usr/bin/env python3
import json
import os
import ssl
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen


TOKEN_PATH = "/var/run/secrets/kubernetes.io/serviceaccount/token"
CA_PATH = "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt"


def env_int(name, default):
    raw = os.getenv(name, str(default)).strip()
    try:
        value = int(raw)
    except ValueError:
        raise SystemExit(f"{name} must be an integer")
    if value <= 0:
        raise SystemExit(f"{name} must be greater than 0")
    return value


def ready_condition(pod):
    for condition in pod.get("status", {}).get("conditions", []):
        if condition.get("type") == "Ready":
            return condition.get("status") == "True"
    return False


def list_collector_pods(api_url, token, namespace, node_name, label_selector):
    query = (
        f"fieldSelector={quote(f'spec.nodeName={node_name}')}"
        f"&labelSelector={quote(label_selector)}"
    )
    url = f"{api_url}/api/v1/namespaces/{quote(namespace)}/pods?{query}"
    request = Request(url, headers={
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
    })
    context = ssl.create_default_context(cafile=CA_PATH)
    with urlopen(request, context=context, timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))


def main():
    node_name = os.getenv("NODE_NAME", "").strip()
    if not node_name:
        raise SystemExit("NODE_NAME is required for collector guard")

    namespace = os.getenv("LOADTEST_COLLECTOR_GUARD_NAMESPACE", "observability").strip()
    label_selector = os.getenv(
        "LOADTEST_COLLECTOR_GUARD_LABEL_SELECTOR",
        "app.kubernetes.io/name=opentelemetry-collector",
    ).strip()
    timeout_seconds = env_int("LOADTEST_COLLECTOR_GUARD_TIMEOUT_SECONDS", 60)
    poll_interval_seconds = env_int("LOADTEST_COLLECTOR_GUARD_POLL_INTERVAL_SECONDS", 5)
    host = os.getenv("KUBERNETES_SERVICE_HOST", "kubernetes.default.svc")
    port = os.getenv("KUBERNETES_SERVICE_PORT", "443")
    api_url = f"https://{host}:{port}"

    with open(TOKEN_PATH, "r", encoding="utf-8") as token_file:
        token = token_file.read().strip()

    deadline = time.time() + timeout_seconds
    last_error = None
    while time.time() <= deadline:
        try:
            pods = list_collector_pods(api_url, token, namespace, node_name, label_selector)
            ready_pods = [pod["metadata"]["name"] for pod in pods.get("items", []) if ready_condition(pod)]
            if ready_pods:
                print(json.dumps({
                    "event": "loadtest_experiment_conditions",
                    "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "test_type": "loadtest",
                    "loadtest_run_id": os.getenv("LOADTEST_RUN_ID", ""),
                    "scenario": os.getenv("LOADTEST_SCENARIO", ""),
                    "phase": "collector_guard_ready",
                    "node": node_name,
                    "collector_namespace": namespace,
                    "collector_label_selector": label_selector,
                    "collector_pods": ready_pods,
                }), flush=True)
                return
            last_error = f"no Ready collector pod on node={node_name}"
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as error:
            last_error = str(error)
        time.sleep(poll_interval_seconds)

    print(json.dumps({
        "event": "loadtest_experiment_conditions",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "test_type": "loadtest",
        "loadtest_run_id": os.getenv("LOADTEST_RUN_ID", ""),
        "scenario": os.getenv("LOADTEST_SCENARIO", ""),
        "phase": "collector_guard_failed",
        "node": node_name,
        "collector_namespace": namespace,
        "collector_label_selector": label_selector,
        "error": last_error,
    }), flush=True)
    raise SystemExit(1)


if __name__ == "__main__":
    main()

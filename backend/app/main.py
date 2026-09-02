import os

from fastapi import FastAPI

app = FastAPI(
    title="ClusterScope Backend",
    version="0.1.0",
)


def get_pod_status() -> dict[str, str | int | None]:
    return {
        "podIp": os.getenv("POD_IP"),
        "namespace": os.getenv("POD_NAMESPACE"),
        "appName": os.getenv("APP_NAME"),
        "podName": os.getenv("POD_NAME"),
        "nodeName": os.getenv("NODE_NAME"),
        "podStartTime": None,
        "restartCount": 0,
    }


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/status")
def status() -> dict[str, str | int | None]:
    return get_pod_status()
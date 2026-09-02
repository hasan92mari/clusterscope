from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_healthz() -> None:
    response = client.get("/healthz")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_status() -> None:
    response = client.get("/api/status")

    assert response.status_code == 200

    data = response.json()

    assert "podIp" in data
    assert "namespace" in data
    assert "appName" in data
    assert "podName" in data
    assert "nodeName" in data
    assert "podStartTime" in data
    assert "restartCount" in data
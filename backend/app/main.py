import os

from fastapi import Depends, FastAPI, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import Base, SessionLocal, engine
from app.models import MagicValue


app = FastAPI(
    title="ClusterScope Backend",
    version="0.1.0",
)


@app.on_event("startup")
def create_tables() -> None:
    Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()


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


@app.get("/readyz")
def readyz() -> dict[str, str]:
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))

        return {"status": "ready"}

    except Exception as error:
        print(f"Database connection error: {error}")

        raise HTTPException(
            status_code=503,
            detail="Database unavailable",
        )


@app.get("/api/status")
def status() -> dict[str, str | int | None]:
    return get_pod_status()


@app.get("/api/magic/{name}")
def get_magic_value(
    name: str,
    db: Session = Depends(get_db),
) -> dict[str, str]:
    magic_value = (
        db.query(MagicValue)
        .filter(MagicValue.name == name)
        .first()
    )

    if magic_value is None:
        raise HTTPException(
            status_code=404,
            detail=f"No magic value found for '{name}'",
        )

    return {
        "name": magic_value.name,
        "magicValue": magic_value.magic_value,
    }

@app.post("/api/magic/{name}")
def save_magic_value(
    name: str,
    payload: dict[str, str],
    db: Session = Depends(get_db),
) -> dict[str, str]:
    magic_value = payload.get("magicValue")

    if not magic_value:
        raise HTTPException(
            status_code=400,
            detail="magicValue is required",
        )

    existing = (
        db.query(MagicValue)
        .filter(MagicValue.name == name)
        .first()
    )

    if existing:
        existing.magic_value = magic_value
    else:
        existing = MagicValue(
            name=name,
            magic_value=magic_value,
        )
        db.add(existing)

    db.commit()
    db.refresh(existing)

    return {
        "name": existing.name,
        "magicValue": existing.magic_value,
    }
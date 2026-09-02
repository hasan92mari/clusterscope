# ============================================================
# Builder stage
# ============================================================

FROM python:3.13-slim AS builder

WORKDIR /build

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY requirements.txt .

RUN pip install \
    --no-cache-dir \
    --prefix=/install \
    -r requirements.txt


# ============================================================
# Production stage
# ============================================================

FROM python:3.13-slim

LABEL org.opencontainers.image.source="https://github.com/hasan92mari/clusterscope"

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY --from=builder /install /usr/local

COPY app ./app

RUN useradd \
    --create-home \
    --uid 1000 \
    appuser

USER 1000:1000

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
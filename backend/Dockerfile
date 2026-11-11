FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ARG GIT_COMMIT=dev
ENV GIT_COMMIT=${GIT_COMMIT}
RUN useradd -m app && mkdir -p /app/media && chown -R app /app/media
USER app
EXPOSE 8000
# Migrations run on start (forward-only, idempotent); then the API with its in-process worker.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers"]

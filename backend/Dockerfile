FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# .dockerignore keeps .env, .venv, tests, media and logs out of the image.
COPY . .
# Empty unless the build passes it (CI does); then the app falls back to Render's RENDER_GIT_COMMIT at runtime.
ARG GIT_COMMIT=
ENV GIT_COMMIT=${GIT_COMMIT}
RUN useradd -m app && mkdir -p /app/media && chown -R app /app/media
USER app
EXPOSE 8000
# One process: the background worker (outbox, expiry jobs, location flush) runs inside it, so more workers would
# run every job twice. Migrations run on start only when RUN_MIGRATIONS=true (docker-compose sets it; on Render they
# are run deliberately, see docs/RENDER_DEPLOYMENT_GUIDE.md). Render supplies $PORT; it sits behind Render's proxy.
CMD ["sh", "-c", "if [ \"$RUN_MIGRATIONS\" = true ]; then alembic upgrade head || exit 1; fi; exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*' --no-server-header --timeout-graceful-shutdown 20"]

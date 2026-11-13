#!/usr/bin/env bash
# Part E load test end to end against a LOCAL benchmark database (never Neon).
# Usage (from delco-chefs/backend): PGBIN=/path/to/postgres/bin bash ../loadtest/run_part_e.sh [seconds]
# Needs a local PostgreSQL on :55432 with user delco (password delco).
set -euo pipefail
SECS=${1:-60}
DB=postgresql://delco:delco@localhost:55432/delco_load
export DATABASE_URL=$DB DIRECT_URL=$DB ENVIRONMENT=development DEBUG=false LOG_FILE= DB_POOL_SIZE=5 DB_MAX_OVERFLOW=5
PY=${PY:-.venv/Scripts/python}
"$PGBIN/psql" -h localhost -p 55432 -U delco -d postgres -qc "drop database if exists delco_load with (force)" -c "create database delco_load"
RUN_WORKERS=false "$PY" -m alembic upgrade head >/dev/null
RUN_WORKERS=false "$PY" ../loadtest/location_ingest.py seed > ../loadtest/part_e_tokens.json   # access tokens live 15 min
"$PY" - <<'EOF'
import json
d = json.load(open("../loadtest/part_e_tokens.json"))
for k in range(4):  # 4 driver processes x 250 chefs: one Python driver alone cannot offer 200 req/s on time
    json.dump({"chefs": d["chefs"][k * 250:(k + 1) * 250], "customers": d["customers"][k * 12:(k + 1) * 12 + (2 if k == 3 else 0)]},
              open(f"../loadtest/part_e_tokens_{k}.json", "w"))
EOF
RUN_WORKERS=true "$PY" -m uvicorn app.main:app --port 8001 --log-level warning --no-access-log >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true' EXIT
for _ in $(seq 1 30); do curl -sf -m 2 http://localhost:8001/api/v1/health >/dev/null && break; sleep 1; done
DRIVERS=()
for k in 0 1 2 3; do
  "$PY" ../loadtest/location_ingest.py run http://localhost:8001/api/v1 ../loadtest/part_e_tokens_$k.json "$SECS" ../loadtest/.raw_$k.json >/dev/null &
  DRIVERS+=($!)
done
wait "${DRIVERS[@]}"
"$PY" ../loadtest/location_ingest.py merge ../loadtest/.raw_0.json ../loadtest/.raw_1.json ../loadtest/.raw_2.json ../loadtest/.raw_3.json
sleep 3  # let the 2 s flusher write the tail of the buffer
"$PGBIN/psql" -h localhost -p 55432 -U delco -d delco_load -tAc "select 'location_points rows: ' || count(*) from location_points"
kill $SERVER; wait $SERVER 2>/dev/null || true
RUN_WORKERS=false "$PY" ../loadtest/location_ingest.py flushbench

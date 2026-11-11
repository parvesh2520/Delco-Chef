// Part I2: 50 virtual users for 2 minutes per endpoint group.
//   docker run --rm -i --network host -v "%cd%/loadtest:/lt" grafana/k6 run -e BASE=http://localhost:8000/api/v1 /lt/k6.js --summary-export /lt/results.json
// tokens.json comes from `python -m scripts.bench_tokens` (benchmark DB only).
import http from 'k6/http';
import { check } from 'k6';

const T = JSON.parse(open('./tokens.json'));
const BASE = __ENV.BASE || 'http://localhost:8000/api/v1';
const auth = (t) => ({ headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' } });
const scenario = (exec, start) => ({ executor: 'constant-vus', vus: 50, duration: '2m', exec, startTime: start });

export const options = {
  scenarios: {
    history: scenario('history', '0s'),
    suggestions: scenario('suggestions', '2m10s'),
    ingest: scenario('ingest', '4m20s'),
    queue: scenario('queue', '6m30s'),
    summary: scenario('summary', '8m40s'),
  },
  thresholds: {
    'http_req_duration{scenario:history}': ['p(95)<300'],
    'http_req_duration{scenario:queue}': ['p(95)<300'],
    'http_req_duration{scenario:summary}': ['p(95)<300'],
    'http_req_duration{scenario:suggestions}': ['p(95)<500'],
    'http_req_duration{scenario:ingest}': ['p(95)<200'],
  },
  summaryTrendStats: ['p(50)', 'p(95)', 'p(99)', 'avg', 'max'],
};

export function history() {
  check(http.get(`${BASE}/customers/me/history?limit=20`, auth(T.customer)), { ok: (r) => r.status === 200 });
}
export function suggestions() {
  check(http.get(`${BASE}/admin/requests/${T.requestId}/suggestions?date=2026-12-01`, auth(T.admin)), { ok: (r) => r.status === 200 });
}
export function ingest() {
  const body = JSON.stringify({ points: [{ lat: 12.97 + Math.random() / 100, lng: 77.64, accuracy: 8 }] });
  check(http.post(`${BASE}/visits/${T.visitId}/location`, body, auth(T.chef)), { ok: (r) => r.status === 200 });
}
export function queue() {
  check(http.get(`${BASE}/admin/requests?status=closed&service=custom_time&limit=50`, auth(T.admin)), { ok: (r) => r.status === 200 });
}
export function summary() {
  check(http.get(`${BASE}/admin/stage-summary`, auth(T.admin)), { ok: (r) => r.status === 200 });
}

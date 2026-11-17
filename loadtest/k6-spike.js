// Part I3 spike test: traffic ramps in steps until the setup breaks. Mixed like the TV-advert scenario:
//   customers opening the app (history + upcoming visits), chefs sending location (1,000 chefs every 5 s = 200 req/s),
//   and admins ranking chefs for the popular evening slot.
//   docker run --rm --network delco-bench-net -v "<repo>/loadtest:/lt" -w /lt grafana/k6:0.54.0 run \
//     -e BASE=http://delco-api-bench:8000/api/v1 --out json=/lt/results-i3-spike-raw.json.gz /lt/k6-spike.js
// The run stops itself once more than 5% of requests fail or p95 passes 3 s (the "broken" point), so the last stage
// reached is where it broke. Per-10-second numbers come from the raw file (summarise_spike.py).
import http from 'k6/http';
import { check } from 'k6';

const T = JSON.parse(open('./tokens.json'));
const BASE = __ENV.BASE || 'http://localhost:8000/api/v1';
const auth = (t) => ({ headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' } });

// Requests per second offered at each step (30 s per step, after a 15 s ramp to it).
const STEPS = (__ENV.STEPS || '50,100,200,300,400,600,800,1000,1300,1600').split(',').map(Number);
const stages = STEPS.flatMap((r) => [{ target: r, duration: '15s' }, { target: r, duration: '30s' }]);
const flow = (exec, share) => ({
  executor: 'ramping-arrival-rate', exec, startRate: 0, timeUnit: '1s',
  preAllocatedVUs: 200, maxVUs: 3000,
  stages: stages.map((s) => ({ target: Math.max(1, Math.round(s.target * share)), duration: s.duration })),
});

export const options = {
  scenarios: {
    customers: flow('customer', 0.6),
    chefs: flow('chef', 0.35),
    admins: flow('admin', 0.05),
  },
  thresholds: {
    http_req_failed: [{ threshold: 'rate<0.05', abortOnFail: true, delayAbortEval: '20s' }],
    http_req_duration: [{ threshold: 'p(95)<3000', abortOnFail: true, delayAbortEval: '20s' }],
  },
  summaryTrendStats: ['p(50)', 'p(95)', 'p(99)', 'max'],
};

export function customer() {
  const r = Math.random() < 0.5
    ? http.get(`${BASE}/customers/me/history?limit=20`, auth(T.customer))
    : http.get(`${BASE}/visits?scope=upcoming`, auth(T.customer));
  check(r, { ok: (x) => x.status === 200 });
}
export function chef() {
  const body = JSON.stringify({ points: [{ lat: 12.97 + Math.random() / 100, lng: 77.64, accuracy: 8 }] });
  check(http.post(`${BASE}/visits/${T.visitId}/location`, body, auth(T.chef)), { ok: (x) => x.status === 200 });
}
export function admin() {
  check(http.get(`${BASE}/admin/requests/${T.requestId}/suggestions?date=2026-12-01`, auth(T.admin)), { ok: (x) => x.status === 200 });
}

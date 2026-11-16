/// <reference types="node" />
/**
 * Persistent-session behaviour of the real API client (src/services/api.ts, session.ts, auth.service.ts) against a fake
 * backend. Run: npm run test:auth
 */
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import axios, { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { api, apiClient, ApiError } from '../src/services/api';
import { authService } from '../src/services/auth.service';
import { useAuthStore } from '../src/store';
import type { UserRole } from '../src/types';

const BASE = 'http://api.test/api/v1';
const RT = 'delco.refreshToken';
const PROFILE = 'delco.sessionProfile';
const keystore = (globalThis as unknown as { __secureStore: Map<string, string> }).__secureStore;

type Mode = 'ok' | 'offline' | 'down' | 'revoked';
const server = { mode: 'ok' as Mode, refreshCalls: 0, n: 0, refresh: 'r0', access: new Set<string>(), role: 'customer' as UserRole, logouts: [] as unknown[] };

function reply(config: InternalAxiosRequestConfig, status: number, data: unknown): AxiosResponse {
  const res = { data, status, statusText: '', headers: {}, config } as AxiosResponse;
  if (status >= 400) throw new AxiosError('HTTP ' + status, 'ERR_BAD_RESPONSE', config, null, res);
  return res;
}

async function backend(config: InternalAxiosRequestConfig): Promise<AxiosResponse> {
  await new Promise((r) => setTimeout(r, 10)); // real latency so concurrent calls overlap
  if (server.mode === 'offline') throw new AxiosError('Network Error', 'ERR_NETWORK', config);
  const url = (config.url ?? '').replace(BASE, '');
  const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
  if (url === '/auth/refresh') {
    server.refreshCalls++;
    if (server.mode === 'down') return reply(config, 503, { error: { code: 'UNAVAILABLE' } });
    if (server.mode === 'revoked' || body.refreshToken !== server.refresh) {
      return reply(config, 401, { error: { code: 'REFRESH_REVOKED', message: 'Session expired.' } });
    }
    server.n++;
    server.refresh = `r${server.n}`;
    server.access.add(`a${server.n}`);
    return reply(config, 200, { user: { id: '1', role: server.role }, token: `a${server.n}`, refreshToken: server.refresh, expiresIn: 900, onboarded: true });
  }
  const auth = String(config.headers?.Authorization ?? '');
  if (!server.access.has(auth.replace('Bearer ', ''))) return reply(config, 401, { error: { code: 'TOKEN_EXPIRED' } });
  if (url === '/auth/logout') server.logouts.push(body);
  return reply(config, 200, { ok: true, auth });
}

axios.defaults.adapter = backend;
apiClient.defaults.adapter = backend;

/** A signed-in phone: refresh token in the keystore, access token in memory. */
function signedIn(opts: { accessValid?: boolean; expiresIn?: number } = {}) {
  keystore.set(RT, server.refresh);
  server.access.add('a0');
  if (opts.accessValid === false) server.access.clear();
  useAuthStore.getState().signIn({ user: { id: '1', role: server.role } as never, token: 'a0', expiresIn: opts.expiresIn ?? 900 });
}

beforeEach(() => {
  keystore.clear();
  useAuthStore.setState({ session: null, sessionExpired: false });
  Object.assign(server, { mode: 'ok', refreshCalls: 0, n: 0, refresh: 'r0', access: new Set<string>(), role: 'customer', logouts: [] });
});

describe('app start (session restore)', () => {
  it('restores the session after the app is closed and reopened, with no OTP', async () => {
    keystore.set(RT, 'r0');
    await authService.restore();
    const s = useAuthStore.getState().session;
    assert.equal(s?.token, 'a1');
    assert.equal(s?.user.role, 'customer');
    assert.equal(keystore.get(RT), 'r1', 'rotated refresh token is persisted');
    assert.ok(!keystore.get(PROFILE)?.includes('a1'), 'saved profile holds no token');
  });

  for (const role of ['customer', 'chef', 'ops_admin', 'super_admin'] as UserRole[]) {
    it(`restores the right role: ${role}`, async () => {
      server.role = role;
      keystore.set(RT, 'r0');
      await authService.restore();
      assert.equal(useAuthStore.getState().session?.user.role, role);
    });
  }

  it('stays signed out (no network call) when nothing is stored', async () => {
    await authService.restore();
    assert.equal(useAuthStore.getState().session, null);
    assert.equal(server.refreshCalls, 0);
  });

  it('opens from the saved profile when offline, keeps credentials, and recovers when back online', async () => {
    keystore.set(RT, 'r0');
    keystore.set(PROFILE, JSON.stringify({ user: { id: '1', role: 'chef' }, chefStatus: 'approved' }));
    server.mode = 'offline';
    await authService.restore();
    assert.equal(useAuthStore.getState().session?.user.role, 'chef');
    assert.equal(useAuthStore.getState().sessionExpired, false);
    assert.equal(keystore.get(RT), 'r0');
    await assert.rejects(api.get('/data'), (e: ApiError) => e.code === 'NETWORK');
    assert.equal(useAuthStore.getState().session?.user.role, 'chef', 'offline request does not sign out');
    server.mode = 'ok';
    const r = await api.get<{ auth: string }>('/data');
    assert.equal(r.auth, 'Bearer a1');
  });

  it('keeps credentials when the backend is temporarily down (503) at start', async () => {
    keystore.set(RT, 'r0');
    server.mode = 'down';
    await authService.restore();
    assert.equal(keystore.get(RT), 'r0');
    assert.equal(useAuthStore.getState().sessionExpired, false);
  });

  it('a genuinely ended session clears credentials and shows "session expired"', async () => {
    keystore.set(RT, 'r0');
    keystore.set(PROFILE, '{}');
    server.mode = 'revoked';
    await authService.restore();
    assert.equal(useAuthStore.getState().session, null);
    assert.equal(useAuthStore.getState().sessionExpired, true);
    assert.equal(keystore.size, 0);
  });
});

describe('access-token expiry while using the app', () => {
  it('renews an about-to-expire token before the request (no 401 round-trip)', async () => {
    signedIn({ expiresIn: 30 });
    const r = await api.get<{ auth: string }>('/data');
    assert.equal(r.auth, 'Bearer a1');
    assert.equal(server.refreshCalls, 1);
  });

  it('on 401 refreshes silently and retries the original request once', async () => {
    signedIn({ accessValid: false });
    const r = await api.get<{ auth: string }>('/data');
    assert.equal(r.auth, 'Bearer a1');
    assert.equal(server.refreshCalls, 1);
    assert.equal(keystore.get(RT), 'r1');
  });

  it('ten simultaneous 401s trigger exactly one refresh', async () => {
    signedIn({ accessValid: false });
    const all = await Promise.all(Array.from({ length: 10 }, () => api.get<{ auth: string }>('/data')));
    assert.equal(server.refreshCalls, 1);
    assert.ok(all.every((r) => r.auth === 'Bearer a1'));
  });

  it('does not loop when the retried request is rejected again', async () => {
    signedIn({ accessValid: false });
    const orig = server.access.add.bind(server.access);
    server.access.add = () => server.access; // the new token is also refused
    try {
      await assert.rejects(api.get('/data'), (e: ApiError) => e.status === 401);
      assert.equal(server.refreshCalls, 1);
    } finally {
      server.access.add = orig;
    }
  });

  it('a network failure during refresh keeps the user signed in', async () => {
    signedIn({ accessValid: false });
    server.mode = 'offline';
    await assert.rejects(api.get('/data'), (e: ApiError) => e.code === 'NETWORK');
    assert.ok(useAuthStore.getState().session);
    assert.equal(keystore.get(RT), 'r0');
  });

  it('a 5xx from refresh keeps credentials', async () => {
    signedIn({ accessValid: false });
    server.mode = 'down';
    await assert.rejects(api.get('/data'));
    assert.ok(useAuthStore.getState().session);
    assert.equal(keystore.get(RT), 'r0');
  });

  it('a revoked session (e.g. signed out elsewhere) ends cleanly', async () => {
    signedIn({ accessValid: false });
    server.mode = 'revoked';
    await assert.rejects(api.get('/data'), (e: ApiError) => e.status === 401);
    assert.equal(useAuthStore.getState().session, null);
    assert.equal(useAuthStore.getState().sessionExpired, true);
    assert.equal(keystore.get(RT), undefined);
  });
});

describe('logout', () => {
  it('revokes on the server (refreshing an expired access token first) and clears the keystore', async () => {
    signedIn({ accessValid: false });
    await authService.logout();
    assert.deepEqual(server.logouts, [{ refreshToken: 'r0' }]); // the server maps any token of the session to it
    assert.equal(keystore.size, 0);
  });
});

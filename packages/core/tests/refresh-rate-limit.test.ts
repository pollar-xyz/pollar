// A 429 or 5xx from /auth/refresh keeps the session and retries after
// Retry-After; only an answer about the refresh token itself logs the user out.
// Guards the event case: many phones behind one IP renewing at once were all
// logged out by the rate limit and sent to log in again.
// Run with `npm test` in packages/core.
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { PollarClient } from '../src/index';

type Probe = {
  _session: unknown;
  _sessionGeneration: number;
  _refreshTimer: ReturnType<typeof setTimeout> | null;
  _refreshRetryAt: number;
  _api: { POST: (...args: unknown[]) => Promise<unknown> };
  _clearSession: () => Promise<boolean>;
  refresh: () => Promise<void>;
};

const clients: Probe[] = [];

afterEach(() => {
  for (const c of clients.splice(0)) {
    if (c._refreshTimer) clearTimeout(c._refreshTimer);
  }
});

function clientAnswering(status: number, headers: Record<string, string> = {}) {
  const c = new PollarClient({ apiKey: 'pub_testnet_probe' } as never) as unknown as Probe;
  clients.push(c);
  c._session = {
    clientSessionId: 's1',
    token: { accessToken: 'at', refreshToken: 'rt', expiresAt: Math.floor(Date.now() / 1000) - 1 },
    wallet: { type: 'internal' },
  };
  let calls = 0;
  c._api = {
    POST: async () => {
      calls++;
      return {
        data: undefined,
        error: { code: status === 429 ? 'RATE_LIMITED' : 'SDK_AUTH_INVALID', success: false },
        response: new Response(null, { status, headers }),
      };
    },
  };
  let cleared = 0;
  c._clearSession = async () => {
    cleared++;
    c._session = null;
    return true;
  };
  return { c, calls: () => calls, cleared: () => cleared };
}

test('a 429 keeps the session and arms a retry from Retry-After', async () => {
  const { c, cleared } = clientAnswering(429, { 'Retry-After': '30' });
  const before = Date.now();
  await assert.rejects(c.refresh(), /Refresh deferred \(429\)/);
  assert.equal(cleared(), 0);
  assert.ok(c._session, 'the session is kept');
  assert.ok(c._refreshTimer, 'a retry is armed');
  const delay = c._refreshRetryAt - before;
  assert.ok(delay >= 30_000 && delay <= 40_100, `retry in 30s plus jitter, got ${delay}ms`);
});

test('a refresh during the deferral does not call the server again', async () => {
  const { c, calls } = clientAnswering(429, { 'Retry-After': '30' });
  await assert.rejects(c.refresh());
  await assert.rejects(c.refresh(), /Refresh deferred: /);
  assert.equal(calls(), 1);
});

test('a 503 keeps the session too', async () => {
  const { c, cleared } = clientAnswering(503);
  await assert.rejects(c.refresh(), /Refresh deferred \(503\)/);
  assert.equal(cleared(), 0);
  assert.ok(c._session);
});

test('a 401 still logs the user out', async () => {
  const { c, cleared } = clientAnswering(401);
  await assert.rejects(c.refresh(), /Refresh failed/);
  assert.equal(cleared(), 1);
  assert.equal(c._session, null);
});

test('a refresh with no answer (a dropped connection) keeps the session and retries soon', async () => {
  const { c, cleared } = clientAnswering(200);
  c._api = {
    POST: async () => {
      throw new TypeError('Failed to fetch');
    },
  };
  const before = Date.now();
  await assert.rejects(c.refresh(), TypeError);
  assert.equal(cleared(), 0);
  assert.ok(c._session);
  // Inside the 30s the server still accepts a token it already rotated.
  assert.ok(c._refreshRetryAt - before <= 2_100, `retries within 2s, got ${c._refreshRetryAt - before}ms`);
});

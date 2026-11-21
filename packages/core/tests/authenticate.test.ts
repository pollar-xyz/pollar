// authenticate turns a refused POST /auth/login into an error state that carries
// the backend code, so the login modals can say why in their language instead of
// a generic "Failed to load session".
// Run with `npm test` in packages/core.
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { authenticate } from '../src/client/auth/authenticate';
import type { FlowDeps } from '../src/client/auth/deps';
import { APP_UNAVAILABLE_MESSAGE } from '../src/lib/tx-error-messages';
import { AUTH_ERROR_CODES, type AuthState } from '../src/types';

const realFetch = globalThis.fetch;

beforeEach(() => {
  // The session-status poll answers READY at once, so the flow reaches POST /auth/login.
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ success: true, content: { status: 'READY' } }), { status: 200 })) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

async function stateAfter(response: { data?: unknown; error?: unknown }): Promise<AuthState> {
  const states: AuthState[] = [];
  const deps = {
    api: { POST: async () => response },
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    basePath: 'https://sdk.api.test/v3',
    useStreaming: false,
    loginTimeoutMs: 30_000,
    signal: new AbortController().signal,
    setAuthState: (state: AuthState) => states.push(state),
    storeSession: async () => {},
    clearSession: async () => {},
    getPublicJwk: async () => ({ kty: 'EC', crv: 'P-256', x: 'x', y: 'y' }),
  } as unknown as FlowDeps;
  await authenticate('session-1', deps);
  return states[states.length - 1]!;
}

test('an app out of credits or with an overdue bill reads as unavailable, with the backend code', async () => {
  for (const code of ['SDK_CREDITS_INSUFFICIENT', 'SDK_BILLING_OVERDUE']) {
    const state = await stateAfter({ error: { code, success: false } });
    assert.equal(state.step, 'error');
    if (state.step !== 'error') return;
    assert.equal(state.errorCode, AUTH_ERROR_CODES.AUTH_FAILED);
    assert.equal(state.code, code);
    assert.equal(state.message, APP_UNAVAILABLE_MESSAGE);
  }
});

test('a code the catalog does not know stays the generic session failure', async () => {
  const state = await stateAfter({ error: { code: 'INTERNAL_ERROR', success: false } });
  assert.equal(state.step, 'error');
  if (state.step !== 'error') return;
  assert.equal(state.errorCode, AUTH_ERROR_CODES.AUTH_FAILED);
  assert.equal(state.message, 'Failed to load session');
  assert.equal(state.code, 'INTERNAL_ERROR');
});

test('a failure without a code stays the generic session failure', async () => {
  const state = await stateAfter({ error: undefined, data: undefined });
  assert.equal(state.step, 'error');
  if (state.step !== 'error') return;
  assert.equal(state.message, 'Failed to load session');
  assert.equal(state.code, undefined);
});

// sendEmailCode turns sdk-api's refusal of an address into its own error state,
// carrying the backend code so the login modals can say why in their language.
// Run with `npm test` in packages/core.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sendEmailCode } from '../src/client/auth/emailFlow';
import { AUTH_ERROR_CODES, type AuthProviderContext, type AuthState } from '../src/types';

async function stateAfter(response: { data?: unknown; error?: unknown }): Promise<AuthState> {
  const states: AuthState[] = [];
  const ctx = {
    api: { POST: async () => response },
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    signal: new AbortController().signal,
    setAuthState: (state: AuthState) => states.push(state),
  } as unknown as AuthProviderContext;
  await sendEmailCode('someone@fldubai.com', 'session-1', ctx);
  return states[states.length - 1]!;
}

test('a disposable or blocklisted address ends in EMAIL_NOT_ALLOWED with the backend code', async () => {
  for (const code of ['EMAIL_DISPOSABLE_NOT_ALLOWED', 'EMAIL_BLOCKED']) {
    const state = await stateAfter({ error: { code, success: false } });
    assert.equal(state.step, 'error');
    if (state.step !== 'error') return;
    assert.equal(state.errorCode, AUTH_ERROR_CODES.EMAIL_NOT_ALLOWED);
    assert.equal(state.code, code);
    assert.notEqual(state.message, 'Failed to send code');
  }
});

test('any other failure stays a retryable send failure', async () => {
  const state = await stateAfter({ error: { code: 'RATE_LIMITED', success: false } });
  assert.equal(state.step, 'error');
  if (state.step !== 'error') return;
  assert.equal(state.errorCode, AUTH_ERROR_CODES.EMAIL_SEND_FAILED);
  assert.equal(state.message, 'Failed to send code');
  assert.equal(state.code, 'RATE_LIMITED');
});

test('a code goes out, the flow moves on to entering it', async () => {
  const state = await stateAfter({ data: { success: true } });
  assert.equal(state.step, 'entering_code');
});

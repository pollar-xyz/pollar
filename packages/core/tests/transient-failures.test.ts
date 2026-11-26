// The helpers that tell "try again later" from "no", and the poll that backs
// off on the first: many clients behind one IP must not keep a rate limit hit.
// Run with `npm test` in packages/core.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PollarApiError, isTransientApiError, isTransientFailure, PollarNetworkError } from '../src/types';
import { startBackoffPoll } from '../src/lib/backoff-poll';
import { pollUntilFound } from '../src/client/stream';

test('a rate limit or a 5xx is transient; a refusal is not', () => {
  assert.equal(isTransientApiError(new PollarApiError('RATE_LIMITED')), true);
  assert.equal(isTransientApiError(new PollarApiError('SDK_COSIGN_UPSTREAM_ERROR', { httpStatus: 503 })), true);
  assert.equal(isTransientApiError(new PollarApiError('SDK_COSIGN_TURNKEY_REJECTED', { httpStatus: 429 })), true);
  assert.equal(isTransientApiError(new PollarApiError('SDK_COSIGN_VERIFICATION_FAILED', { httpStatus: 400 })), false);
  assert.equal(isTransientApiError(new PollarApiError('SDK_COSIGN_REQUEST_NOT_PENDING')), false);
  assert.equal(isTransientFailure(new TypeError('Failed to fetch')), true);
  assert.equal(isTransientFailure(new PollarNetworkError('timed out')), true);
  assert.equal(isTransientFailure(new Error('boom')), false);
});

test('the poll backs off while its tick fails and returns to its pace after a success', async () => {
  const at: number[] = [];
  let calls = 0;
  const stop = startBackoffPoll(
    async () => {
      at.push(Date.now());
      calls++;
      if (calls <= 2) throw new Error('429');
    },
    20,
    { isPaused: () => false },
  );
  await new Promise((r) => setTimeout(r, 400));
  stop();
  const gaps = at.slice(1).map((t, i) => t - at[i]!);
  // 20ms, then doubled twice after the two failures (~40, ~80), then back to ~20.
  assert.ok(gaps[0]! >= 30, `first wait after a failure backs off, got ${gaps[0]}`);
  assert.ok(gaps[1]! >= 60, `second failure backs off further, got ${gaps[1]}`);
  assert.ok(gaps[2]! < 60, `a success returns to the pace, got ${gaps[2]}`);
});

test('a stopped poll never ticks again, and a paused one sends nothing', async () => {
  let calls = 0;
  const stop = startBackoffPoll(async () => void calls++, 10, { isPaused: () => true });
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(calls, 0);
  stop();
  const stop2 = startBackoffPoll(async () => void calls++, 10, { isPaused: () => false });
  stop2();
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(calls, 0);
});

test('the login status poll waits out a 429 instead of going back to its pace', async () => {
  const realFetch = globalThis.fetch;
  const at: number[] = [];
  globalThis.fetch = (async () => {
    at.push(Date.now());
    if (at.length === 1)
      return new Response(JSON.stringify({ code: 'RATE_LIMITED', success: false }), {
        status: 429,
        headers: { 'Retry-After': '1' },
      });
    return new Response(JSON.stringify({ success: true, content: { status: 'READY' } }), { status: 200 });
  }) as typeof fetch;
  try {
    const found = await pollUntilFound('https://example.test', 'cs-1', (d) => d.status === 'READY', 10);
    assert.equal(found.status, 'READY');
    assert.ok(at[1]! - at[0]! >= 1_000, `waited for Retry-After, got ${at[1]! - at[0]!}ms`);
  } finally {
    globalThis.fetch = realFetch;
  }
});

// A card terms acceptance from a user on IPv6: the server refuses it naming its
// IPv4-only host, the SDK gets the user's IPv4 attested there and sends the
// acceptance once more with it. The server side is played by a fake fetch.
// Run with `npm test` in packages/core (or `npm run test:unit` at the root).
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createApiClient } from '../src/api/client';
import { submitCardKyc, submitCardProviderRegistration } from '../src/api/endpoints/cards';
import { isPollarApiError } from '../src/types';

const API = 'https://sdk.api.example/v3';
const IPV4 = 'https://ip4.api.example/v3';
const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const refused = (extra: Record<string, unknown> = { ipv4BaseUrl: IPV4 }) =>
  json(422, { code: 'SDK_CARDS_IP_NOT_SUPPORTED', success: false, ...extra });

/** Answers each request with the next reply, and records what was asked. */
function serve(replies: Array<(request: Request) => Response>) {
  const seen: Array<{ method: string; url: string; attestation: string | null }> = [];
  globalThis.fetch = (async (input: Request) => {
    seen.push({ method: input.method, url: input.url, attestation: input.headers.get('x-pollar-ip-attestation') });
    const reply = replies.shift();
    if (!reply) throw new Error(`unexpected ${input.method} ${input.url}`);
    return reply(input);
  }) as typeof fetch;
  return seen;
}

const attested = () =>
  json(200, {
    code: 'SDK_CLIENT_IP_ATTESTED',
    success: true,
    content: { token: 'tok-1', ip: '203.0.113.9', expiresAt: '2026-11-07T12:02:00.000Z' },
  });

test('a refused registration is attested on the IPv4 host and sent again with the token', async () => {
  const seen = serve([
    () => refused(),
    attested,
    () =>
      json(200, {
        code: 'SDK_REQUIREMENT_CARD_REGISTRATION_SUBMITTED',
        success: true,
        content: { cardProviderId: 'prov', status: 'registered' },
      }),
  ]);
  const result = await submitCardProviderRegistration(createApiClient(API, { retry: { attempts: 1 } }), 'prov');
  assert.deepEqual(result, { cardProviderId: 'prov', status: 'registered' });
  assert.deepEqual(seen, [
    { method: 'POST', url: `${API}/requirements/card-registration/prov`, attestation: null },
    { method: 'GET', url: `${IPV4}/client-ip/attest`, attestation: null },
    { method: 'POST', url: `${API}/requirements/card-registration/prov`, attestation: 'tok-1' },
  ]);
});

test('the card KYC submit takes the same retry', async () => {
  const holder = { id: 'h1' };
  const seen = serve([
    () => refused(),
    attested,
    () => json(201, { code: 'SDK_CARDS_KYC_SUBMITTED', success: true, content: { holder } }),
  ]);
  const body = { termsAccepted: true, kyc: {} as never };
  assert.deepEqual(await submitCardKyc(createApiClient(API, { retry: { attempts: 1 } }), body), { holder });
  assert.equal(seen[2]?.attestation, 'tok-1');
});

test('when the IPv4 host cannot be reached, the first refusal stands', async () => {
  const seen = serve([
    () => refused(),
    () => {
      throw new TypeError('Network request failed');
    },
  ]);
  await assert.rejects(submitCardProviderRegistration(createApiClient(API, { retry: { attempts: 1 } }), 'prov'), (err) => {
    return isPollarApiError(err) && err.code === 'SDK_CARDS_IP_NOT_SUPPORTED';
  });
  assert.equal(seen.length, 2);
});

test('a refusal without an IPv4 host, or another error, is not retried', async () => {
  const seen = serve([() => refused({})]);
  await assert.rejects(submitCardProviderRegistration(createApiClient(API, { retry: { attempts: 1 } }), 'prov'));
  assert.equal(seen.length, 1);
  const again = serve([() => json(409, { code: 'KYC_REGISTRATION_STEPS_PENDING', success: false, ipv4BaseUrl: IPV4 })]);
  await assert.rejects(submitCardProviderRegistration(createApiClient(API, { retry: { attempts: 1 } }), 'prov'));
  assert.equal(again.length, 1);
});

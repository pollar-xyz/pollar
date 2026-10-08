const assert = require('node:assert/strict');
const {
  resolveKyc,
  getKycProviders,
  getKycStatus,
  pollKycStatus,
  pollKycDecision,
  isPollarApiError,
} = require('../packages/core/dist/index.js');

(async () => {
  let sent;
  const api = {
    GET: async () => ({ data: { content: { status: 'none' } } }),
    POST: async (_path, { body }) => {
      sent = body;
      return { data: { content: { sessionId: 'local-session', kycUrl: 'https://example.invalid' } } };
    },
  };
  await resolveKyc(api, 'provider', 'basic', ' bo ');
  assert.deepEqual(sent, { providerId: 'provider', level: 'basic', country: 'BO' });
  await resolveKyc(api, 'provider', 'basic');
  assert.deepEqual(sent, { providerId: 'provider', level: 'basic' });
  await resolveKyc(api, 'provider', 'basic', 'BO', undefined, 'retry-key');
  assert.equal(sent.idempotencyKey, 'retry-key');
  sent = undefined;
  api.GET = async () => ({ data: { content: { status: 'approved' } } });
  await resolveKyc(api, 'provider', 'basic', 'BO');
  assert.equal(sent, undefined);
  let query;
  api.GET = async (_path, options) => {
    query = options.params.query;
    return { data: { content: { status: 'none', providers: [] } } };
  };
  await resolveKyc(api, 'provider', 'basic', 'BO', 'corridor-a');
  assert.deepEqual(query, { providerId: 'provider', corridorId: 'corridor-a' });
  assert.equal(sent.corridorId, 'corridor-a');
  await getKycProviders(api, 'BO', 'corridor-a');
  assert.deepEqual(query, { country: 'BO', corridorId: 'corridor-a' });

  // An approval that lands between the status read and the start is still an approval.
  const startError = (code) => async () => ({ error: { code, success: false } });
  api.POST = startError('SDK_KYC_ALREADY_APPROVED');
  assert.deepEqual(await resolveKyc(api, 'provider', 'basic', 'BO'), { alreadyApproved: true });
  for (const code of ['SDK_KYC_PROVIDER_ERROR', 'SDK_KYC_SESSION_EXPIRED', 'SDK_KYC_NOT_CONFIGURED']) {
    api.POST = startError(code);
    await assert.rejects(resolveKyc(api, 'provider', 'basic', 'BO'), (e) => isPollarApiError(e) && e.code === code);
  }
  api.GET = async () => ({ error: { code: 'SDK_KYC_NOT_CONFIGURED', success: false } });
  await assert.rejects(getKycStatus(api, 'provider'), (e) => isPollarApiError(e) && e.code === 'SDK_KYC_NOT_CONFIGURED');
  await assert.rejects(getKycProviders(api, 'BO'), (e) => isPollarApiError(e) && e.code === 'SDK_KYC_NOT_CONFIGURED');

  // Route polling reads by corridor only, so an approval of any accepted option answers.
  api.GET = async (_path, options) => {
    query = options.params.query;
    return { data: { content: { status: 'approved' } } };
  };
  assert.equal(await pollKycStatus(api, 'provider', { corridorId: 'corridor-a' }), 'approved');
  assert.deepEqual(query, { corridorId: 'corridor-a' });

  // Polling stops on every settled answer and keeps going through plain pending.
  const sequence = (...reads) => {
    let calls = 0;
    api.GET = async () => ({ data: { content: reads[Math.min(calls++, reads.length - 1)] } });
    return () => calls;
  };
  const opts = { intervalMs: 1, timeoutMs: 1000 };
  let calls = sequence({ status: 'pending', decisionStatus: 'pending' }, { status: 'rejected', decisionStatus: 'rejected' });
  assert.equal(await pollKycStatus(api, 'provider', opts), 'rejected');
  assert.equal(calls(), 2);
  sequence({ status: 'expired', decisionStatus: 'expired' });
  assert.equal(await pollKycStatus(api, 'provider', opts), 'expired');
  sequence({ status: 'none', decisionStatus: 'expired' });
  assert.equal(await pollKycStatus(api, 'provider', opts), 'expired');
  // An approval the vendor gave while Pollar still records it settles on its own:
  // another read seconds later does not change it, so the modal shows that state.
  calls = sequence({ status: 'pending', decisionStatus: 'approved' }, { status: 'approved' });
  const recording = await pollKycDecision(api, 'provider', opts);
  assert.equal(recording.status, 'pending');
  assert.equal(recording.decisionStatus, 'approved');
  assert.equal(calls(), 1);
  calls = sequence(
    { status: 'pending', decisionStatus: 'pending' },
    {
      status: 'pending',
      decisionStatus: 'manual_review',
      reviewReason: 'DUPLICATE_DOCUMENT',
    },
  );
  const held = await pollKycDecision(api, 'provider', opts);
  assert.equal(held.reviewReason, 'DUPLICATE_DOCUMENT');
  assert.equal(calls(), 2);
  sequence({ status: 'pending', decisionStatus: 'manual_review' });
  assert.equal(await pollKycStatus(api, 'provider', opts), 'pending');
  sequence({ status: 'pending', decisionStatus: 'pending' });
  await assert.rejects(pollKycStatus(api, 'provider', { intervalMs: 1, timeoutMs: 20 }), /timed out/);
  api.GET = async () => {
    throw new TypeError('fetch failed');
  };
  await assert.rejects(pollKycDecision(api, 'provider', opts), /fetch failed/);

  console.log('KYC forwarding, typed errors, already-approved starts and settled polling passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

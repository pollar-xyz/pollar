const assert = require('node:assert/strict');
const { resolveKyc, getKycProviders, pollKycStatus } = require('../packages/core/dist/index.js');

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
  api.GET = async (_path, options) => {
    query = options.params.query;
    return { data: { content: { status: 'approved' } } };
  };
  assert.equal(await pollKycStatus(api, 'provider', { corridorId: 'corridor-a' }), 'approved');
  assert.deepEqual(query, { providerId: 'provider', corridorId: 'corridor-a' });
  console.log('KYC country forwarding and approval short-circuit passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

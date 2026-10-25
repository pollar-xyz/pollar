// @pollar smoke test: Turnkey co-signed wallets from the client's side.
//
// Run with `node tests/smoke-cosign.cjs` after the build. Mocks `fetch`,
// `window` and `localStorage`, so no network is needed. Covers: the device key
// lives apart from the DPoP key and survives a logout; the X-Stamp a device
// produces verifies as a DER ECDSA signature; the Stellar transaction hash is
// recomputed from the envelope without a parser (unsigned and sponsor-signed);
// under `cosignManual` a 202 SDK_COSIGN_PENDING becomes a cosign_pending
// outcome and an awaiting_cosign tx state, approve verifies the payload,
// proposes the Turnkey request built from it with the request id and moves the
// tx state to the submit outcome; reject closes the request; by default the
// client settles the vote itself and signing calls end as they do for a
// custodial wallet, recognized setup is approved at login without a prompt and
// a mismatching payload is rejected; `confirmation: 'prompt'` asks before any
// signature; the setup recognizer reads the XDR field by field.

const path = require('node:path');
const crypto = require('node:crypto');

globalThis.window = {
  location: { origin: 'https://x.test', href: 'https://x.test/' },
  addEventListener: () => {},
  removeEventListener: () => {},
};
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

const sdk = require(path.resolve(__dirname, '../packages/core/dist/index.js'));
const rn = require(path.resolve(__dirname, '../packages/core/dist/index.rn.js'));

let pass = 0;
let fail = 0;
function check(label, ok, extra) {
  if (ok) {
    pass++;
    console.log(`  OK    ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}`, extra ?? '');
  }
}

// A testnet payment from SOURCE, as `@stellar/stellar-sdk` builds it, with and
// without the sponsor's signature, and the hash the account signs.
const SOURCE = 'GDVEU3DD4KOFECV66VIHWEZOYX4ZKR3WV27L464SIIPOU2IUI3JCZA57';
const UNSIGNED_XDR =
  'AAAAAgAAAADqSmxj4pxSCr71UHsTLsX5lUd2rr6+e5JCHuppFEbSLAAAAGQAAAAAAAAwOgAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAQAAAAD9FyQ4WqDHW2T7eM1gL6HZkf3r92sTxY7XAurINen2GAAAAAAAAAAAAOThwAAAAAAAAAAA';
const ONE_SIG_XDR =
  'AAAAAgAAAADqSmxj4pxSCr71UHsTLsX5lUd2rr6+e5JCHuppFEbSLAAAAGQAAAAAAAAwOgAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAQAAAAD9FyQ4WqDHW2T7eM1gL6HZkf3r92sTxY7XAurINen2GAAAAAAAAAAAAOThwAAAAAAAAAABNen2GAAAAED7r9F6PCr/GYCllw0ozw6NFfLDR6ppk+EdM/kcVomZvly6pX4RjkQvkfZj2kwIqFk+19LQ53n9ptmo/yk6ojAH';
const HASH = 'e4cc94b9663d79110f5478a7c19703d6507f5d8b08cfe6c11f0e698524151355';
const TESTNET = 'Test SDF Network ; September 2015';

// Setup transactions as sdk-api composes them for SOURCE (the user), with
// SPONSOR paying the reserves: account creation, a sponsored USDC trustline, a
// self-paid trustline on a 12-character asset; and two that must not pass as
// setup: a sponsored payment, and the creation of another account.
const OTHER = 'GBTL47RTFR5EKMZSXWOQU735WBK7LRPPDIDK3JTNTCZZ7NUBBRDTVSK2';
const CREATE_XDR =
  'AAAAAgAAAAD9FyQ4WqDHW2T7eM1gL6HZkf3r92sTxY7XAurINen2GAAAASwAAAAAAAAACwAAAAEAAAAAAAAAAAAAAABqzRtIAAAAAAAAAAMAAAAAAAAAEAAAAADqSmxj4pxSCr71UHsTLsX5lUd2rr6+e5JCHuppFEbSLAAAAAAAAAAAAAAAAOpKbGPinFIKvvVQexMuxfmVR3auvr57kkIe6mkURtIsAAAAAAAAAAAAAAABAAAAAOpKbGPinFIKvvVQexMuxfmVR3auvr57kkIe6mkURtIsAAAAEQAAAAAAAAABNen2GAAAAEBt3SKhjmrNkP8ukT+YhcvRd2gTi7dDpgiMy4nG8/S3yFs9EEQOBqk+ifNCDfsBLpRypbzdexR9pBv5ScCEXvME';
const TRUST_XDR =
  'AAAAAgAAAAD9FyQ4WqDHW2T7eM1gL6HZkf3r92sTxY7XAurINen2GAAAASwAAAAAAAAADAAAAAEAAAAAAAAAAAAAAABqzRtIAAAAAAAAAAMAAAAAAAAAEAAAAADqSmxj4pxSCr71UHsTLsX5lUd2rr6+e5JCHuppFEbSLAAAAAEAAAAA6kpsY+KcUgq+9VB7Ey7F+ZVHdq6+vnuSQh7qaRRG0iwAAAAGAAAAAVVTREMAAAAAZr5+Myx6RTMyvZ0Kf32wVfXF7xoGraZtmLOftoEMRzp//////////wAAAAEAAAAA6kpsY+KcUgq+9VB7Ey7F+ZVHdq6+vnuSQh7qaRRG0iwAAAARAAAAAAAAAAE16fYYAAAAQFjusQ6hBDCry1PoMqJDnAuHPO4E2tr0Xc9COwQ5I2fCxqsbgTLvfxfJflqpDMk6JrHp00rXUoGD1zvfeTN9bwc=';
const SELF_TRUST_XDR =
  'AAAAAgAAAADqSmxj4pxSCr71UHsTLsX5lUd2rr6+e5JCHuppFEbSLAAAAGQAAAAAAAAADQAAAAEAAAAAAAAAAAAAAABqzRtIAAAAAAAAAAEAAAAAAAAABgAAAAJFVVJDREVNTzEyAAAAAAAAZr5+Myx6RTMyvZ0Kf32wVfXF7xoGraZtmLOftoEMRzp//////////wAAAAAAAAAA';
const SPONSORED_PAYMENT_XDR =
  'AAAAAgAAAAD9FyQ4WqDHW2T7eM1gL6HZkf3r92sTxY7XAurINen2GAAAASwAAAAAAAAADgAAAAEAAAAAAAAAAAAAAABqzRtIAAAAAAAAAAMAAAAAAAAAEAAAAADqSmxj4pxSCr71UHsTLsX5lUd2rr6+e5JCHuppFEbSLAAAAAEAAAAA6kpsY+KcUgq+9VB7Ey7F+ZVHdq6+vnuSQh7qaRRG0iwAAAABAAAAAGa+fjMsekUzMr2dCn99sFX1xe8aBq2mbZizn7aBDEc6AAAAAAAAAAAC+vCAAAAAAQAAAADqSmxj4pxSCr71UHsTLsX5lUd2rr6+e5JCHuppFEbSLAAAABEAAAAAAAAAAA==';
const CREATE_OTHER_XDR =
  'AAAAAgAAAAD9FyQ4WqDHW2T7eM1gL6HZkf3r92sTxY7XAurINen2GAAAAGQAAAAAAAAADwAAAAEAAAAAAAAAAAAAAABqzRtIAAAAAAAAAAEAAAAAAAAAAAAAAABmvn4zLHpFMzK9nQp/fbBV9cXvGgatpm2Ys5+2gQxHOgAAAAAAmJaAAAAAAAAAAAA=';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(predicate, ms = 3_000) {
  const until = Date.now() + ms;
  while (!predicate() && Date.now() < until) await sleep(20);
  return predicate();
}

function request(overrides = {}) {
  return {
    id: 'req-1',
    kind: 'TX',
    network: 'STELLAR',
    status: 'PENDING',
    subOrgId: 'sub-org-1',
    activityId: null,
    fingerprint: null,
    signWith: SOURCE,
    unsignedPayload: UNSIGNED_XDR,
    payloadHash: HASH,
    intent: 'sign_and_send',
    refreshable: false,
    operation: 'payment',
    summary: 'Send 1.5 XLM',
    details: { amount: '1.5', destination: 'GD6RO...' },
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    createdAt: new Date().toISOString(),
    resolvedAt: null,
    ...overrides,
  };
}

(async () => {
  // 1. Pure helpers.
  check('stellarTransactionHashHex: unsigned envelope', (await sdk.stellarTransactionHashHex(UNSIGNED_XDR, TESTNET)) === HASH);
  check(
    'stellarTransactionHashHex: envelope with one signature',
    (await sdk.stellarTransactionHashHex(ONE_SIG_XDR, TESTNET)) === HASH,
  );
  check(
    'stellarTransactionHashHex: another network gives another hash',
    (await sdk.stellarTransactionHashHex(UNSIGNED_XDR, 'Public Global Stellar Network ; September 2015')) !== HASH,
  );

  // 2. Device key: its own namespace, survives the DPoP reset of a logout.
  const storage = rn.createMemoryAdapter();
  const dpop = new rn.NobleKeyManager(storage, 'pk_smoke_cosign');
  const device = new rn.NobleKeyManager(storage, 'pk_smoke_cosign', { namespace: 'cosign' });
  await dpop.init();
  await device.init();
  const deviceJwk = await device.getPublicJwk();
  check('device key differs from the DPoP key', (await dpop.getThumbprint()) !== (await device.getThumbprint()));
  await dpop.reset();
  const deviceAgain = new rn.NobleKeyManager(storage, 'pk_smoke_cosign', { namespace: 'cosign' });
  await deviceAgain.init();
  check('device key survives the DPoP reset', (await deviceAgain.getThumbprint()) === (await device.getThumbprint()));

  // 3. Stamp: compressed public key + DER signature that node verifies.
  const publicKeyHex = sdk.compressedPublicKeyHex(deviceJwk);
  check('compressed public key is 33 bytes with a 02/03 prefix', /^0[23][0-9a-f]{64}$/.test(publicKeyHex));
  const body = JSON.stringify({
    organizationId: 'sub-org-1',
    type: 'ACTIVITY_TYPE_APPROVE_ACTIVITY',
    parameters: { fingerprint: 'fp-1' },
  });
  const raw = await device.sign(new TextEncoder().encode(body));
  const der = sdk.rawSignatureToDer(raw);
  const keyObject = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: deviceJwk.x, y: deviceJwk.y }, format: 'jwk' });
  check(
    'raw r||s converts to a DER signature node verifies',
    crypto.verify('sha256', Buffer.from(body), { key: keyObject, dsaEncoding: 'der' }, Buffer.from(der)),
  );
  const stamp = JSON.parse(
    Buffer.from(
      sdk.encodeStamp({
        publicKey: publicKeyHex,
        scheme: 'SIGNATURE_SCHEME_TK_API_P256',
        signature: Buffer.from(der).toString('hex'),
      }),
      'base64url',
    ).toString(),
  );
  check(
    'encodeStamp is base64url JSON with publicKey, scheme and signature',
    stamp.publicKey === publicKeyHex && stamp.scheme === 'SIGNATURE_SCHEME_TK_API_P256' && typeof stamp.signature === 'string',
  );

  // 4. The client against a mocked sdk-api.
  const apiKey = 'pk_smoke_cosign_client';
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(apiKey));
  const apiKeyHash = Array.from(new Uint8Array(digest).slice(0, 16))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const SESSION = JSON.stringify({
    clientSessionId: 'cs',
    userId: 'u',
    status: 'CONSUMED',
    token: { accessToken: 'AT', refreshToken: 'RT', expiresAt: Math.floor(Date.now() / 1000) + 600 },
    user: { ready: true },
    wallet: { type: 'internal', provider: 'email', address: SOURCE, chain: 'STELLAR', provisioning: 'READY' },
    wallets: [{ type: 'internal', provider: 'email', address: SOURCE, chain: 'STELLAR' }],
    data: {
      mail: 'u@x.test',
      first_name: '',
      last_name: '',
      avatar: '',
      providers: { email: { address: 'u@x.test' }, google: null, github: null, wallet: null },
    },
  });
  async function makeClient(extra) {
    const storage = sdk.createMemoryAdapter();
    await storage.set(`pollar:${apiKeyHash}:session`, SESSION);
    const c = new sdk.PollarClient({
      apiKey,
      storage,
      baseUrl: 'https://x.test',
      stellarNetwork: 'testnet',
      logLevel: 'silent',
      ...extra,
    });
    await c.ready();
    return c;
  }

  const calls = [];
  let approveCalls = 0;
  let rejectCalls = 0;
  let pendingList = [request()];
  let relayStampPublicKey = null;
  // Every proposal the device relayed: the Turnkey path, the parsed body and the request id.
  const proposals = [];
  const PROPOSAL_PATHS = [
    '/public/v1/submit/sign_raw_payload',
    '/public/v1/submit/sign_transaction',
    '/public/v1/submit/create_wallet_accounts',
  ];
  // What sdk-api answers a signing call with; a test swaps it for a tampered request.
  let signingRequest = (overrides) => request(overrides);
  const SOLANA_FROM = 'HUwbU1P7nxJvACyYMYChUCUZ1tCQqCyjWeT27gPYYSaU';
  const SOLANA_TO = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
  // A v0 message moving 0.25 SOL (250000000 lamports) from SOLANA_FROM to SOLANA_TO,
  // fee paid by the sender: the device decodes it and compares it with `details`.
  const SOLANA_UNSIGNED =
    '01000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008001000103f4e3670e7fc3b4421922d9820007b1f3066b368eb34f6e710be324c3e663' +
    '9f617e8c088760bfde1dddcf32c17f209b8242ee52aaf131facd88d0ea2c6d0b06f20000000000000000000000000000000000000000000000000000000000000000070707070707070707070707070707070707070707070707070707070707070701020200010c0200000080b2e60e0000000000';
  const ACCOUNT_PAYLOAD = {
    walletId: 'wallet-tk',
    accounts: [
      {
        curve: 'CURVE_ED25519',
        pathFormat: 'PATH_FORMAT_BIP32',
        path: "m/44'/501'/0'/0'",
        addressFormat: 'ADDRESS_FORMAT_SOLANA',
        name: 'SOLANA',
      },
    ],
  };
  // What `/wallet/state` lists: the session's wallets, plus any derived after the login.
  let stateWallets = [{ type: 'internal', address: SOURCE, publicKey: SOURCE, chain: 'STELLAR' }];
  let refreshCalls = 0;
  let refreshedRequest = null;
  const quorumReports = [];
  let quorumThreshold = 2;
  // The custody /cosign/devices reports and the root users Turnkey lists: 2-of-2
  // for a co-signed wallet, the user alone for a self-custody one.
  let mockCustody = 'COSIGNED';
  let mockRootUserIds = ['tk-user', 'tk-approver'];
  const deletedApiKeys = [];
  let mockDeviceKeyHex = null;
  const deviceKeyHexForMock = () => mockDeviceKeyHex ?? '02' + 'ff'.repeat(32);
  let approvedRequest = request({
    status: 'APPROVED',
    signedXdr: ONE_SIG_XDR,
    submit: { hash: 'abc123', status: 'SUCCESS' },
    resolvedAt: new Date().toISOString(),
  });

  // A vote whose call drops before answering, though the activity landed upstream.
  let dropVoteRelay = false;
  globalThis.fetch = async (req) => {
    const url = new URL(req.url);
    const method = req.method ?? 'GET';
    calls.push(`${method} ${url.pathname}`);
    const json = (status, body) =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    // The app's dashboard signs without asking; section 6 sets 'prompt' in code, the stricter policy.
    if (url.pathname === '/v3/applications/config')
      return json(200, {
        success: true,
        content: { application: { signConfirmation: { mode: 'AUTO', windowSeconds: 0, maxUsd: '0' } } },
      });
    if (url.pathname === '/v3/auth/session/resume')
      return json(200, {
        success: true,
        code: 'SDK_SESSION_RESUMED',
        content: {
          mail: 'u@x.test',
          first_name: '',
          last_name: '',
          avatar: '',
          providers: { email: { address: 'u@x.test' }, google: null, github: null, wallet: null },
        },
      });
    if (url.pathname === '/v3/tx/sign') {
      return json(202, {
        success: true,
        code: 'SDK_COSIGN_PENDING',
        content: { pendingSignature: { kind: 'cosign', request: signingRequest({ intent: 'sign' }) } },
      });
    }
    if (url.pathname === '/v3/tx/sign-and-send') {
      return json(202, {
        success: true,
        code: 'SDK_COSIGN_PENDING',
        content: { pendingSignature: { kind: 'cosign', request: signingRequest() } },
      });
    }
    // A co-signed wallet's auth entry (an x402 payment) is a request its device approves too.
    if (url.pathname === '/v3/tx/sign-auth-entry') {
      return json(202, {
        success: true,
        code: 'SDK_COSIGN_PENDING',
        content: {
          pendingSignature: {
            kind: 'cosign',
            request: request({ id: 'req-auth', kind: 'AUTH_ENTRY', intent: 'sign', operation: 'soroban_auth' }),
          },
        },
      });
    }
    // A co-signed wallet's trustline is the request its device approves, never a custodial signature.
    if (url.pathname === '/v3/wallet/assets/trustline') {
      return json(202, {
        success: true,
        code: 'SDK_COSIGN_PENDING',
        content: { pendingSignature: { kind: 'cosign', request: signingRequest() } },
      });
    }
    if (url.pathname === '/v3/cosign/requests')
      return json(200, { success: true, code: 'SDK_COSIGN_REQUEST', content: { requests: pendingList } });
    if (url.pathname === '/v3/cosign/devices') {
      return json(200, {
        success: true,
        code: 'SDK_COSIGN_DEVICES',
        content: {
          subOrgId: 'sub-org-1',
          endUserId: 'tk-user',
          custody: mockCustody,
          quorumState: mockCustody === 'SELF_CUSTODY' ? 'ACTIVE_1_OF_1' : 'ACTIVE_2_OF_2',
          devices: [
            {
              id: 'dev-1',
              publicKey: deviceKeyHexForMock(),
              tkApiKeyId: 'tk-key-1',
              label: 'onboarding device',
              enrolledVia: 'ONBOARDING',
              lastSeenAt: null,
              createdAt: new Date().toISOString(),
            },
            {
              id: 'dev-2',
              publicKey: '02' + 'ee'.repeat(32),
              tkApiKeyId: 'tk-key-2',
              label: 'laptop',
              enrolledVia: 'DEVICE',
              lastSeenAt: null,
              createdAt: new Date().toISOString(),
            },
          ],
        },
      });
    }
    if (url.pathname === '/v3/wallet/state') {
      return json(200, {
        success: true,
        code: 'SDK_WALLET_STATE',
        content: {
          address: SOURCE,
          chain: 'STELLAR',
          provisioning: 'READY',
          existsOnStellar: true,
          wallets: stateWallets,
        },
      });
    }
    if (url.pathname === '/v3/cosign/quorum/verify') {
      quorumReports.push(JSON.parse(await req.text()));
      return json(200, {
        success: true,
        code: 'SDK_COSIGN_VERIFIED',
        content: { quorumState: quorumReports[quorumReports.length - 1].ok ? 'VERIFIED' : 'BROKEN' },
      });
    }
    const cancel = url.pathname.match(/^\/v3\/cosign\/requests\/([^/]+)\/cancel$/);
    if (cancel) {
      rejectCalls++;
      pendingList = pendingList.filter((r) => r.id !== cancel[1]);
      return json(200, {
        success: true,
        code: 'SDK_COSIGN_REJECTED',
        content: {
          request: request({
            id: cancel[1],
            status: 'REJECTED',
            failureReason: 'rejected by the user',
            resolvedAt: new Date().toISOString(),
          }),
        },
      });
    }
    if (url.pathname === '/v3/cosign/requests/req-1/refresh') {
      refreshCalls++;
      return json(200, { success: true, code: 'SDK_COSIGN_REQUEST', content: { request: refreshedRequest ?? request() } });
    }
    if (url.pathname === '/v3/cosign/relay') {
      const body = JSON.parse(await req.text());
      const stampJson = JSON.parse(Buffer.from(body.stamp, 'base64url').toString());
      relayStampPublicKey = stampJson.publicKey;
      const inner = JSON.parse(body.body);
      if (body.path === '/public/v1/query/get_organization') {
        return json(200, {
          success: true,
          code: 'SDK_COSIGN_REQUEST',
          content: {
            status: 200,
            body: {
              organizationData: {
                rootQuorum: { threshold: quorumThreshold, userIds: mockRootUserIds },
                users: [
                  { userId: 'tk-user', apiKeys: [{ credential: { publicKey: relayStampPublicKey } }] },
                  { userId: 'tk-approver', apiKeys: [{ credential: { publicKey: '02' + 'aa'.repeat(32) } }] },
                ].filter((u) => mockRootUserIds.includes(u.userId)),
              },
            },
          },
        });
      }
      if (body.path === '/public/v1/submit/delete_api_keys') {
        deletedApiKeys.push(inner.parameters.apiKeyIds);
        return json(200, {
          success: true,
          code: 'SDK_COSIGN_REQUEST',
          content: { status: 200, body: { activity: { status: 'ACTIVITY_STATUS_COMPLETED' } } },
        });
      }
      if (PROPOSAL_PATHS.includes(body.path)) {
        approveCalls++;
        if (dropVoteRelay) {
          pendingList = pendingList.filter((r) => r.id !== body.requestId);
          throw new TypeError('Failed to fetch');
        }
        proposals.push({ path: body.path, body: inner, requestId: body.requestId });
        // Pollar's approver votes second and the activity completes, so the
        // list no longer carries the request; the answer names it.
        const proposed = pendingList.find((r) => r.id === body.requestId);
        pendingList = pendingList.filter((r) => r.id !== body.requestId);
        return json(200, {
          success: true,
          code: 'SDK_COSIGN_APPROVED',
          content: {
            status: 200,
            body: {},
            approvedByApprover: true,
            request: { ...approvedRequest, id: proposed?.id ?? body.requestId ?? approvedRequest.id },
          },
        });
      }
      return json(400, { success: false, code: 'VALIDATION_ERROR' });
    }
    const one = url.pathname.match(/^\/v3\/cosign\/requests\/([^/]+)$/);
    if (one && method === 'GET') {
      const id = one[1];
      const current = dropVoteRelay
        ? { ...approvedRequest, id }
        : (pendingList.find((r) => r.id === id) ?? signingRequest({ id }));
      return json(200, { success: true, code: 'SDK_COSIGN_REQUEST', content: { request: current } });
    }
    return json(404, { success: false, code: 'NOT_FOUND', path: url.pathname });
  };

  // `cosignManual`: the raw flow, where the app votes through `client.cosign`.
  const client = await makeClient({ cosignManual: true });
  check('session restored with a wallet', client.getWallet()?.address === SOURCE);
  check('a manual client does not read the pending requests at login', !calls.includes('GET /v3/cosign/requests'));

  const txStates = [];
  client.onTransactionStateChange((s) => txStates.push(s.step));
  const cosignStates = [];
  client.onCosignStateChange((s) => cosignStates.push(s.pending.length));

  const signOutcome = await client.signTx(UNSIGNED_XDR);
  check(
    'signTx answers cosign_pending with the request',
    signOutcome.status === 'cosign_pending' && signOutcome.request.id === 'req-1',
  );
  check('tx state is awaiting_cosign', txStates.includes('awaiting_cosign'));
  check('cosign store lists the pending request', client.getCosignState().pending.length === 1);

  const sendOutcome = await client.signAndSubmitTx(UNSIGNED_XDR);
  check('signAndSubmitTx answers cosign_pending too', sendOutcome.status === 'cosign_pending');

  // A client of its own: the request it opens stays pending in that client's store.
  const authClient = await makeClient({ cosignManual: true });
  const authOutcome = await authClient.signAuthEntry('AAAA', { validUntilLedger: 1100 });
  check(
    'signAuthEntry on a co-signed wallet answers cosign_pending with the AUTH_ENTRY request',
    authOutcome.status === 'cosign_pending' && authOutcome.request.kind === 'AUTH_ENTRY',
    authOutcome,
  );

  const trustOutcome = await client.setTrustline({ code: 'USDC', issuer: SOURCE });
  check(
    'setTrustline on a co-signed wallet answers cosign_pending with the request, not a success',
    trustOutcome.status === 'cosign_pending' && trustOutcome.request.id === 'req-1',
    trustOutcome,
  );

  const relaysBeforeVerify = calls.filter((c) => c === 'POST /v3/cosign/relay').length;
  const verification = await client.cosign.verify(request());
  check(
    'verify: the recomputed hash equals the Pollar hash',
    verification.ok === true && verification.localHash === HASH,
    verification,
  );
  check(
    'verify builds the sign_raw_payload proposal from the recomputed hash',
    verification.ok === true &&
      verification.proposal.path === '/public/v1/submit/sign_raw_payload' &&
      verification.proposal.body.type === 'ACTIVITY_TYPE_SIGN_RAW_PAYLOAD_V2' &&
      verification.proposal.body.organizationId === 'sub-org-1' &&
      verification.proposal.body.parameters.payload === HASH &&
      verification.proposal.body.parameters.signWith === SOURCE,
    verification,
  );
  check(
    'verify reads nothing from the network',
    calls.filter((c) => c === 'POST /v3/cosign/relay').length === relaysBeforeVerify,
  );

  const tampered = await client.cosign.verify(request({ payloadHash: '00'.repeat(32) }));
  check('verify refuses a request whose hash does not match the transaction', tampered.ok === false);

  let threw = null;
  try {
    await client.cosign.approve(request({ payloadHash: '00'.repeat(32) }));
  } catch (err) {
    threw = err;
  }
  check(
    'approve throws SDK_COSIGN_VERIFICATION_FAILED instead of voting on a mismatch',
    threw && threw.code === 'SDK_COSIGN_VERIFICATION_FAILED',
  );
  check('nothing was proposed for the mismatch', proposals.length === 0);

  const approved = await client.cosign.approve(request());
  check(
    'approve proposes the activity and returns the resolved request',
    approved.status === 'APPROVED' && approved.submit?.hash === 'abc123',
  );
  check(
    'the proposal carries the request id and the verified payload',
    proposals.length === 1 &&
      proposals[0].requestId === 'req-1' &&
      proposals[0].path === '/public/v1/submit/sign_raw_payload' &&
      proposals[0].body.parameters.payload === HASH,
    proposals,
  );
  const deviceKeyHex = await client.cosign.publicKeyHex();
  check('the proposal was stamped with the device key', relayStampPublicKey === deviceKeyHex);
  check('tx state reached success from the approved submit', txStates[txStates.length - 1] === 'success');
  check(
    'cosign store dropped the resolved request',
    client.getCosignState().pending.length === 0 && client.getCosignState().lastResolved?.id === 'req-1',
  );

  // Refresh: a request Pollar composed is rebuilt right before the vote; one the
  // client composed is not.
  check('approve did not refresh a request the client composed', refreshCalls === 0);
  refreshedRequest = request({ refreshable: true });
  await client.signAndSubmitTx(UNSIGNED_XDR);
  const approvedAfterRefresh = await client.cosign.approve(request({ refreshable: true }));
  check('approve refreshes a refreshable request first', refreshCalls === 1);
  check('approve then verified and proposed the refreshed payload', approvedAfterRefresh.status === 'APPROVED');
  refreshedRequest = null;

  // A request already proposed is not proposed again; sdk-api reads it back.
  const proposalsBeforeProposed = proposals.length;
  await client.cosign.approve(request({ activityId: 'act-9', fingerprint: 'fp-9' })).catch(() => undefined);
  check('approve on a request already proposed proposes nothing', proposals.length === proposalsBeforeProposed);

  // Solana: the device decodes the unsigned transaction and proposes it byte for byte.
  const solanaRequest = request({
    id: 'req-sol',
    network: 'SOLANA',
    signWith: SOLANA_FROM,
    unsignedPayload: SOLANA_UNSIGNED,
    payloadHash: crypto.createHash('sha256').update(SOLANA_UNSIGNED).digest('hex'),
    operation: 'transfer',
    details: { destination: SOLANA_TO, amount: '250000000', mint: null },
    refreshable: true,
  });
  const solanaOk = await client.cosign.verify(solanaRequest);
  check(
    'verify proposes a Solana transfer as the unsigned transaction it decoded',
    solanaOk.ok === true &&
      solanaOk.proposal.path === '/public/v1/submit/sign_transaction' &&
      solanaOk.proposal.body.parameters.unsignedTransaction === SOLANA_UNSIGNED &&
      solanaOk.proposal.body.parameters.type === 'TRANSACTION_TYPE_SOLANA' &&
      solanaOk.proposal.body.parameters.signWith === SOLANA_FROM,
    solanaOk,
  );
  const solanaBad = await client.cosign.verify({
    ...solanaRequest,
    details: { ...solanaRequest.details, amount: '1' },
  });
  check('verify refuses a Solana transaction that moves another amount than the request says', solanaBad.ok === false);
  const solanaWrongSigner = await client.cosign.verify({
    ...solanaRequest,
    signWith: 'SomeoneElse111111111111111111111111111111111',
  });
  check('verify refuses a Solana request signed by another account', solanaWrongSigner.ok === false);

  // ACCOUNT: the device proposes the wallet id and the derivation parameters only.
  const accountRequest = request({
    id: 'req-acc',
    kind: 'ACCOUNT',
    network: 'SOLANA',
    intent: 'add_accounts',
    signWith: 'wallet-tk',
    unsignedPayload: JSON.stringify(ACCOUNT_PAYLOAD),
    payloadHash: crypto.createHash('sha256').update(JSON.stringify(ACCOUNT_PAYLOAD)).digest('hex'),
    refreshable: true,
  });
  const accountOk = await client.cosign.verify(accountRequest);
  const { name: _label, ...derivation } = ACCOUNT_PAYLOAD.accounts[0];
  check(
    'verify proposes create_wallet_accounts with the derivation fields alone',
    accountOk.ok === true &&
      accountOk.proposal.path === '/public/v1/submit/create_wallet_accounts' &&
      accountOk.proposal.body.parameters.walletId === 'wallet-tk' &&
      JSON.stringify(accountOk.proposal.body.parameters.accounts) === JSON.stringify([derivation]),
    accountOk,
  );
  const accountBad = await client.cosign.verify({
    ...accountRequest,
    unsignedPayload: JSON.stringify({ walletId: 'wallet-tk' }),
  });
  check('verify refuses an account derivation it cannot read', accountBad.ok === false);

  // An approved derivation reaches the session: the client reads /wallet/state
  // and adds the wallet the login did not list.
  const POLYGON_ADDRESS = '0xAae901C9cC8A88611C041BB4C1EEE81a895CB943';
  stateWallets = [
    ...stateWallets,
    { type: 'internal', address: POLYGON_ADDRESS, publicKey: POLYGON_ADDRESS, chain: 'POLYGON' },
  ];
  const approvedBefore = approvedRequest;
  approvedRequest = { ...accountRequest, status: 'APPROVED', resolvedAt: new Date().toISOString() };
  check('the session holds no Polygon wallet before the derivation', !client.getWallets().some((w) => w.chain === 'POLYGON'));
  await client.cosign.approve({ ...accountRequest, refreshable: false });
  const derived = await waitFor(() => client.getWallets().some((w) => w.chain === 'POLYGON' && w.address === POLYGON_ADDRESS));
  check('an approved account derivation adds the new chain wallet to the session', derived, client.getWallets());
  check(
    'the wallets the session already held are kept once',
    client.getWallets().filter((w) => w.chain === 'STELLAR' && w.address === SOURCE).length === 1,
    client.getWallets(),
  );
  approvedRequest = approvedBefore;

  // Quorum: read from Turnkey with the device key and recorded server-side.
  mockDeviceKeyHex = await client.cosign.publicKeyHex();
  const quorum = await client.cosign.inspectQuorum();
  check(
    'inspectQuorum sees the 2-of-2 with this device registered',
    quorum.ok === true && quorum.deviceRegistered === true,
    quorum,
  );
  check('inspectQuorum recorded the reading as VERIFIED', quorumReports.length === 1 && quorumReports[0].ok === true);
  quorumThreshold = 1;
  const brokenQuorum = await client.cosign.inspectQuorum();
  check('inspectQuorum reports a threshold other than 2 as broken', brokenQuorum.ok === false && brokenQuorum.threshold === 1);
  check('the broken reading was recorded too', quorumReports.length === 2 && quorumReports[1].ok === false);
  quorumThreshold = 2;
  check('a co-signed report names its custody', quorum.custody === 'COSIGNED', quorum);

  // Self-custody: the same device key, a sub-org with the user as its only root user.
  mockCustody = 'SELF_CUSTODY';
  mockRootUserIds = ['tk-user'];
  quorumThreshold = 1;
  const selfQuorum = await client.cosign.inspectQuorum();
  check(
    'inspectQuorum accepts the 1-of-1 of a self-custody wallet with this device registered',
    selfQuorum.ok === true && selfQuorum.custody === 'SELF_CUSTODY' && selfQuorum.threshold === 1 && selfQuorum.rootUsers === 1,
    selfQuorum,
  );
  check('the self-custody reading was recorded as VERIFIED', quorumReports.length === 3 && quorumReports[2].ok === true);
  mockRootUserIds = ['tk-user', 'tk-approver'];
  const selfWithApprover = await client.cosign.inspectQuorum();
  check(
    'a self-custody wallet with a second root user is broken',
    selfWithApprover.ok === false && /1-of-1/.test(selfWithApprover.reason),
    selfWithApprover,
  );
  mockCustody = 'COSIGNED';
  quorumThreshold = 2;

  // Devices: another device is revoked through this device's own vote; this one needs force.
  const afterRevoke = await client.cosign.revokeDevice('dev-2');
  check(
    'revokeDevice relayed delete_api_keys for the other device',
    deletedApiKeys.length === 1 && deletedApiKeys[0][0] === 'tk-key-2',
  );
  check('revokeDevice returns the device list', Array.isArray(afterRevoke.devices));
  let selfRevoke = null;
  try {
    await client.cosign.revokeDevice('dev-1');
  } catch (err) {
    selfRevoke = err;
  }
  check(
    'revoking the current device is refused without force',
    selfRevoke && selfRevoke.code === 'SDK_COSIGN_DEVICE_NOT_ENROLLED',
  );
  check('no delete_api_keys was relayed for the refused self-revoke', deletedApiKeys.length === 1);

  // A rejected vote ends the tx with an error state.
  approvedRequest = request({ status: 'REJECTED', failureReason: 'user said no', resolvedAt: new Date().toISOString() });
  await client.signAndSubmitTx(UNSIGNED_XDR);
  await client.cosign.approve(request());
  check('a rejected request moves the tx state to error', txStates[txStates.length - 1] === 'error');

  // reject closes the request through sdk-api; the device stamps nothing.
  const relaysBeforeReject = calls.filter((c) => c === 'POST /v3/cosign/relay').length;
  const rejected = await client.cosign.reject(request({ id: 'req-no' }));
  check(
    'reject closes the request through cancel without a relay',
    rejected.status === 'REJECTED' &&
      calls.includes('POST /v3/cosign/requests/req-no/cancel') &&
      calls.filter((c) => c === 'POST /v3/cosign/relay').length === relaysBeforeReject,
  );
  rejectCalls = 0;
  client.destroy();

  // 5. The dashboard signs without asking: the device settles its own vote on
  // a signature, so a co-signed wallet answers the way a custodial one does.
  // Wallet setup is not a signature the app made: the user votes on it.
  const CREATE_HASH = await sdk.stellarTransactionHashHex(CREATE_XDR, TESTNET);
  const setupRequest = request({
    id: 'req-setup',
    fingerprint: 'fp-setup',
    intent: 'account_create',
    operation: 'create_account',
    unsignedPayload: CREATE_XDR,
    payloadHash: CREATE_HASH,
    summary: 'Create your account',
    details: {},
  });
  pendingList = [setupRequest];
  const approvesBeforeLogin = approveCalls;
  const auto = await makeClient({});
  const autoPending = [];
  auto.onCosignStateChange((s) => autoPending.push(s.pending.map((r) => r.id)));
  const setupListed = await waitFor(() => auto.getCosignState().pending.some((r) => r.id === 'req-setup'));
  check('login lists the setup request for the user', setupListed, autoPending);
  check('the setup request is not approved without the user', approveCalls === approvesBeforeLogin);
  approvedRequest = request({
    id: 'req-setup',
    fingerprint: 'fp-setup',
    status: 'APPROVED',
    intent: 'account_create',
    operation: 'create_account',
    resolvedAt: new Date().toISOString(),
  });
  pendingList = [];
  await auto.cosign.approve(setupRequest);
  check('the user approves the setup request', approveCalls === approvesBeforeLogin + 1);
  check('the approved setup request leaves the pending list', auto.getCosignState().pending.length === 0);
  pendingList = [request()];
  await auto.cosign.pending();
  check(
    'a pending payment is not approved on its own',
    approveCalls === approvesBeforeLogin + 1 && auto.getCosignState().pending.length === 1,
  );
  pendingList = [];
  await auto.cosign.pending();

  const autoStates = [];
  auto.onTransactionStateChange((s) => autoStates.push(s.step));
  // A `sign` request comes back with the signature only; the app submits.
  approvedRequest = request({
    status: 'APPROVED',
    intent: 'sign',
    signedXdr: ONE_SIG_XDR,
    resolvedAt: new Date().toISOString(),
  });
  autoPending.length = 0;
  const autoSign = await auto.signTx(UNSIGNED_XDR);
  check(
    'signTx on a co-signed wallet returns signed, as a custodial one does',
    autoSign.status === 'signed' && autoSign.signedXdr === ONE_SIG_XDR,
    autoSign,
  );
  check(
    'the tx state passed through awaiting_cosign and ended signed',
    autoStates.includes('awaiting_cosign') && autoStates[autoStates.length - 1] === 'signed',
    autoStates,
  );
  check(
    'the settled request never reached the pending list',
    autoPending.every((ids) => ids.length <= 1) && auto.getCosignState().pending.length === 0,
    autoPending,
  );
  approvedRequest = request({
    status: 'APPROVED',
    signedXdr: ONE_SIG_XDR,
    submit: { hash: 'abc123', status: 'SUCCESS' },
    resolvedAt: new Date().toISOString(),
  });
  const autoSend = await auto.signAndSubmitTx(UNSIGNED_XDR);
  check('signAndSubmitTx returns success with the hash', autoSend.status === 'success' && autoSend.hash === 'abc123', autoSend);
  check('the tx state ended in success', autoStates[autoStates.length - 1] === 'success');

  // The vote's call drops, but Turnkey signed and the transaction went out: the
  // request is read back and reported as it stands, and nothing is rejected.
  dropVoteRelay = true;
  const rejectsBeforeDrop = rejectCalls;
  const dropped = await auto.signAndSubmitTx(UNSIGNED_XDR);
  check(
    'a vote call that drops reads the request back and reports the send that landed',
    dropped.status === 'success' && dropped.hash === 'abc123',
    dropped,
  );
  check('a dropped vote call rejects nothing', rejectCalls === rejectsBeforeDrop);
  // A pending copy of a request that settled meanwhile: reject reads it and cancels nothing.
  let staleRefused = false;
  try {
    await auto.cosign.reject(request());
  } catch (err) {
    staleRefused = err.code === 'SDK_COSIGN_REQUEST_NOT_PENDING';
  }
  check(
    'reject on a stale pending copy reads the request and cancels nothing',
    staleRefused && rejectCalls === rejectsBeforeDrop,
  );
  dropVoteRelay = false;

  // Two reads at once (provider + modal, or strict mode) list the request once and vote on nothing.
  const setupRequest2 = request({
    id: 'req-setup-2',
    fingerprint: 'fp-setup-2',
    intent: 'account_create',
    operation: 'create_account',
    unsignedPayload: CREATE_XDR,
    payloadHash: CREATE_HASH,
    summary: 'Create your account',
    details: {},
  });
  pendingList = [setupRequest2];
  const approvesBeforeConcurrent = approveCalls;
  await Promise.all([auto.cosign.pending(), auto.cosign.pending(), auto.cosign.pending()]);
  check('three concurrent pending() reads vote on nothing', approveCalls === approvesBeforeConcurrent);
  check(
    'the setup request is listed once after the concurrent reads',
    auto.getCosignState().pending.filter((r) => r.id === 'req-setup-2').length === 1,
  );
  approvedRequest = request({
    id: 'req-setup-2',
    fingerprint: 'fp-setup-2',
    status: 'APPROVED',
    intent: 'account_create',
    operation: 'create_account',
    resolvedAt: new Date().toISOString(),
  });
  pendingList = [];
  await auto.cosign.approve(setupRequest2);
  check('nothing is left pending once the user approves it', auto.getCosignState().pending.length === 0);
  // A pending copy of a request already seen final (a late refresh, a stale
  // list) must not reopen the prompt.
  pendingList = [request({ id: 'req-setup-2', fingerprint: 'fp-setup-2' })];
  await auto.cosign.pending();
  check('a stale pending copy of a settled request never reaches the store', auto.getCosignState().pending.length === 0);
  pendingList = [];
  approvedRequest = request({
    status: 'APPROVED',
    signedXdr: ONE_SIG_XDR,
    submit: { hash: 'abc123', status: 'SUCCESS' },
    resolvedAt: new Date().toISOString(),
  });

  // sdk-api claims a hash the transaction does not have.
  signingRequest = (overrides) => request({ payloadHash: 'ff'.repeat(32), ...overrides });
  const mismatch = await auto.signTx(UNSIGNED_XDR);
  check(
    'a payload that does not hash to what Pollar claims ends as an error, not a signature',
    mismatch.status === 'error' && mismatch.code === 'SDK_COSIGN_VERIFICATION_FAILED',
    mismatch,
  );
  check('the mismatching request was rejected by the device', rejectCalls === 1);
  check('the tx state ended in error', autoStates[autoStates.length - 1] === 'error');
  signingRequest = (overrides) => request(overrides);
  auto.destroy();

  // 6. `confirmation: 'prompt'`: the user is asked before any signature.
  const prompt = await makeClient({ confirmation: 'prompt' });
  const unavailable = await prompt.signTx(UNSIGNED_XDR);
  check(
    'prompt without a subscriber refuses to sign',
    unavailable.status === 'error' && unavailable.code === 'SDK_CONFIRMATION_UNAVAILABLE',
    unavailable,
  );
  const seen = [];
  let answer = 'confirm';
  const unsubscribe = prompt.onConfirmationRequest((list) => {
    for (const c of list) {
      seen.push(c);
      c[answer]();
    }
  });
  const confirmedSign = await prompt.signTx(UNSIGNED_XDR);
  check('prompt: a confirmed signTx goes on to sign', confirmedSign.status === 'signed', confirmedSign);
  check(
    'the confirmation carried the kind, network and envelope',
    seen[0]?.kind === 'sign' && seen[0]?.network === 'STELLAR' && seen[0]?.unsignedXdr === UNSIGNED_XDR,
  );
  answer = 'reject';
  const callsBeforeDecline = calls.length;
  const declined = await prompt.signAndSubmitTx(UNSIGNED_XDR);
  check(
    'prompt: a declined call returns SDK_CONFIRMATION_DECLINED',
    declined.status === 'error' && declined.code === 'SDK_CONFIRMATION_DECLINED' && seen[1]?.kind === 'sign_and_send',
    declined,
  );
  const declinedRun = await prompt.buildAndSignAndSubmitTx('payment', { destination: OTHER, amount: '1' });
  check(
    'prompt: build-sign-submit asks before any request leaves',
    declinedRun.status === 'error' && seen[2]?.kind === 'build_sign_submit' && seen[2]?.operation === 'payment',
    declinedRun,
  );
  check('nothing was sent for the declined calls', calls.length === callsBeforeDecline);
  check('no confirmation is left pending', prompt.getPendingConfirmations().length === 0);
  unsubscribe();
  prompt.destroy();

  // 7. The setup recognizer: what the device approves on its own.
  const setup = (overrides) => request({ intent: 'account_create', operation: 'create_account', ...overrides });
  const created = sdk.recognizedSetupRequest(setup({ unsignedPayload: CREATE_XDR }));
  check('recognizes the sponsored creation of this account', created.ok === true && created.kind === 'account_create', created);
  const trust = sdk.recognizedSetupRequest(
    setup({ intent: 'sign_and_send', operation: 'change_trust', unsignedPayload: TRUST_XDR }),
  );
  check('recognizes a sponsored trustline on this account', trust.ok === true && trust.kind === 'change_trust', trust);
  const selfTrust = sdk.recognizedSetupRequest(
    setup({ intent: 'sign_and_send', operation: 'change_trust', unsignedPayload: SELF_TRUST_XDR }),
  );
  check('recognizes a self-paid trustline with a 12-character asset', selfTrust.ok === true, selfTrust);
  const payment = sdk.recognizedSetupRequest(
    setup({ intent: 'sign_and_send', operation: 'change_trust', unsignedPayload: SPONSORED_PAYMENT_XDR }),
  );
  check('refuses a payment announced as a trustline', payment.ok === false, payment);
  const other = sdk.recognizedSetupRequest(setup({ unsignedPayload: CREATE_OTHER_XDR }));
  check('refuses the creation of another account', other.ok === false && /another account/.test(other.reason), other);
  const asSomeoneElse = sdk.recognizedSetupRequest(setup({ unsignedPayload: CREATE_XDR, signWith: OTHER }));
  check('refuses setup signed by an account the transaction does not set up', asSomeoneElse.ok === false, asSomeoneElse);
  check('refuses a plain payment request', sdk.recognizedSetupRequest(request()).ok === false);
  check(
    'recognizes an account derivation request',
    sdk.recognizedSetupRequest(request({ kind: 'ACCOUNT', intent: 'add_accounts' })).ok === true,
  );
  check(
    'refuses a resolved request',
    sdk.recognizedSetupRequest(setup({ unsignedPayload: CREATE_XDR, status: 'APPROVED' })).ok === false,
  );
  check('stellarAccountBytes decodes a G-address to 32 bytes', sdk.stellarAccountBytes(SOURCE)?.length === 32);
  check('stellarAccountBytes refuses a broken checksum', sdk.stellarAccountBytes(SOURCE.slice(0, -1) + 'A') === null);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

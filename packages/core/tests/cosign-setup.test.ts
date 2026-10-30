// Wallet setup is recognized from the transaction, and still never voted
// without the user. Pure: the manager's pending read runs against a stubbed
// API and a stubbed vote.
// Run with `npm test` in packages/core (or `npm run test:unit` at the root).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CosignManager } from '../src/cosign/manager';
import { recognizedSetupRequest } from '../src/cosign/recognize';
import type { CosignRequest } from '../src/types';

// A ramp leg: the swap of a co-signed Stereum on-ramp, on Polygon.
const rampStep = {
  id: 'ramp-swap',
  status: 'PENDING',
  kind: 'TX',
  network: 'POLYGON',
  intent: 'sign_and_send',
  operation: 'contract_call',
  stepKey: 'stereum:t1:swap',
  signWith: '0x2222222222222222222222222222222222222222',
  unsignedPayload: '02e281898001028252089444444444444444444444444444444444444444448203e880c0',
} as unknown as CosignRequest;

// Wallet setup the device recognizes: deriving the account of a chain the app enabled.
const setup = {
  id: 'add-solana',
  status: 'PENDING',
  kind: 'ACCOUNT',
  network: 'SOLANA',
  intent: 'add_accounts',
  signWith: 'x',
  unsignedPayload: '',
} as unknown as CosignRequest;

test('wallet setup is recognized; a ramp step is not', () => {
  assert.equal(recognizedSetupRequest(rampStep).ok, false);
  assert.equal(recognizedSetupRequest(setup).ok, true);
});

test('the pending read votes nothing: setup and ramp steps both wait for the user', async () => {
  const shown: string[] = [];
  const voted: string[] = [];
  const manager = new CosignManager({
    api: { GET: async () => ({ data: { content: { requests: [rampStep, setup] } } }) } as never,
    keyManager: {} as never,
    logger: { warn: () => undefined, info: () => undefined, error: () => undefined, debug: () => undefined } as never,
    networkPassphrase: () => 'Test SDF Network ; September 2015',
    onRequest: (request) => shown.push(request.id),
  });
  (manager as unknown as { approve: (r: CosignRequest) => Promise<CosignRequest> }).approve = async (request) => {
    voted.push(request.id);
    return { ...request, status: 'APPROVED' } as CosignRequest;
  };

  const remaining = await manager.pending();

  assert.deepEqual(voted, []);
  assert.deepEqual(
    remaining.map((r) => r.id),
    ['ramp-swap', 'add-solana'],
  );
  assert.deepEqual(shown, ['ramp-swap', 'add-solana']);
});

// A sponsored trustline on account A, for a wallet that moved from Pollar's
// custody: the Turnkey key K only signs for A.
const MOVED_ACCOUNT = 'GCFIRY65OQE7DFP5KLNS2PF2LVZMUZYJX4OZIEQ36N2IQANUB5XVYOJR';
const TURNKEY_KEY = 'GCATS5YOVB6ROX2WUNKGNQ2MP3GMXDMKSG2O4N5CLX3A6W4PZGZZI55U';
const trustline = {
  id: 'trust-usdc',
  status: 'PENDING',
  kind: 'TX',
  network: 'STELLAR',
  intent: 'sign_and_send',
  operation: 'change_trust',
  unsignedPayload:
    'AAAAAgAAAADtSSjGKNHCxurpAziQWZVhKVknOlxj+TY2wUYUrIc30QAAASwAAAAAAAAAAgAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAAAAAAAAAEAAAAACKiOPddAnxlf1S2y08ul1yymcJvx2UEhvzdIgBtA9vXAAAAAEAAAAAiojj3XQJ8ZX9UtstPLpdcspnCb8dlBIb83SIAbQPb1wAAAAGAAAAAVVTREMAAAAAO5kROA7+mIugqJAOsc/kTzZvfb6Ua+0HckD39iTfFcV//////////wAAAAEAAAAAiojj3XQJ8ZX9UtstPLpdcspnCb8dlBIb83SIAbQPb1wAAAARAAAAAAAAAAA=',
};

test("a moved wallet's trustline is recognized on its own account, not on the Turnkey key", () => {
  const moved = { ...trustline, signWith: TURNKEY_KEY, account: MOVED_ACCOUNT } as unknown as CosignRequest;
  assert.equal(recognizedSetupRequest(moved).ok, true);
  // Without the account, the trustline looks like one on somebody else's account.
  const keyOnly = { ...trustline, signWith: TURNKEY_KEY } as unknown as CosignRequest;
  assert.equal(recognizedSetupRequest(keyOnly).ok, false);
});

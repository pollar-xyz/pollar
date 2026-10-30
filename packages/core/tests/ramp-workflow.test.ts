import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  describeRampAction,
  rampFieldError,
  rampFieldValid,
  rampLegNote,
  rampLegStatus,
  rampLegTimeLeft,
  rampNextApproval,
  rampStepStatusText,
  rampStepTitle,
  rampNoRouteText,
  rampOrderReceive,
  rampOrderResolutionText,
  rampOrderStopped,
  rampWalletStep,
} from '../src/ramps/workflow';

const usdc = { kind: 'asset' as const, code: 'USDC', identifier: 'GA5Z', chain: 'STELLAR' as const };
const bob = { kind: 'fiat' as const, currency: 'BOB', rail: 'QR', country: 'BO' };

test('a leg retrying on its own is active; only a leg that stopped is failed', () => {
  const failure = { code: 'RPC_UNAVAILABLE', retryable: true, resolutionOwner: 'POLLAR', resolutionAction: 'automatic_retry' };
  assert.equal(rampLegStatus({ status: 'ACTIVE', failure } as never), 'active');
  assert.equal(rampLegStatus({ status: 'HELD', failure } as never), 'failed');
  assert.equal(rampLegStatus({ status: 'FAILED', failure: null } as never), 'failed');
  assert.equal(rampLegStatus({ status: 'COMPLETED', failure: null } as never), 'done');
  assert.equal(rampLegStatus({ status: 'PENDING', failure: null } as never), 'pending');
});

test('what the user receives is the last leg, as received once it is, else as planned and marked estimated', () => {
  const leg = (amountOutActual: string | null) => ({ to: usdc, amountOutPlanned: '14.2', amountOutActual });
  assert.deepEqual(rampOrderReceive({ legs: [leg(null)] } as never), { amount: '14.2', unit: 'USDC', estimated: true });
  assert.deepEqual(rampOrderReceive({ legs: [leg('14.19')] } as never), { amount: '14.19', unit: 'USDC', estimated: false });
  assert.deepEqual(rampOrderReceive({ legs: [{ to: bob, amountOutPlanned: '100', amountOutActual: null }] } as never), {
    amount: '100',
    unit: 'BOB',
    estimated: true,
  });
  assert.equal(rampOrderReceive({ legs: [] } as never), null);
});

test('an order stops moving on its own once final, or held with no next read', () => {
  assert.equal(rampOrderStopped({ state: 'processing', nextPollAfter: '2026-10-23T12:00:00Z' }), false);
  assert.equal(rampOrderStopped({ state: 'processing', nextPollAfter: null }), true);
  assert.equal(rampOrderStopped({ state: 'completed', nextPollAfter: null }), true);
});

test('a field is complete when filled and, for an email, well-formed; an optional one may stay blank', () => {
  assert.equal(rampFieldValid({ type: 'text' }, ' '), false);
  assert.equal(rampFieldValid({ type: 'text', optional: true }, ''), true);
  assert.equal(rampFieldValid({ type: 'email' }, 'ana@pollar.xyz'), true);
  assert.equal(rampFieldValid({ type: 'email', optional: true }, 'not-an-email'), false);
  for (const bad of [
    '@pollar.xyz',
    'ana@',
    'ana@pollar',
    'ana@.xyz',
    'ana@pollar.',
    'a@b@pollar.xyz',
    'ana maria@pollar.xyz',
  ]) {
    assert.equal(rampFieldValid({ type: 'email' }, bad), false, bad);
  }
  assert.equal(rampFieldValid({ type: 'email' }, 'ana.maria+ramps@mail.pollar.xyz'), true);
  // Linear on a long hostile input (the pattern CodeQL flagged: "!@!." then many "!.").
  const started = Date.now();
  rampFieldValid({ type: 'email' }, '!@!.' + '!.'.repeat(50_000));
  assert.ok(Date.now() - started < 100);
});

test('a field with a pattern is complete only when the whole value matches it; one this runtime cannot read checks nothing', () => {
  const account = { type: 'text' as const, pattern: '\\d{5,20}' };
  assert.equal(rampFieldValid(account, '1234567890'), true);
  assert.equal(rampFieldValid(account, ' 12345 '), true, 'trimmed first');
  assert.equal(rampFieldValid(account, '1234'), false, 'too short');
  assert.equal(rampFieldValid(account, '12345a'), false, 'the whole value, not a part of it');
  assert.equal(rampFieldValid({ ...account, optional: true }, ''), true);
  assert.equal(rampFieldValid({ type: 'text', pattern: '(' }, 'x'), true);

  const field = { ...account, label: 'Bank account number', hint: 'Digits only, 5 to 20.' };
  assert.equal(rampFieldError(field, ''), null, 'blank is incomplete, not wrong');
  assert.equal(rampFieldError(field, '123456'), null);
  assert.equal(rampFieldError(field, '12-34'), 'Check the bank account number: Digits only, 5 to 20.');
  assert.equal(rampFieldError({ type: 'email', label: 'Email' }, 'nope'), 'Enter a valid email address.');
});

test("a payment's window is part of how the action is shown", () => {
  const order = {
    state: 'awaiting_payment',
    pendingAction: {
      kind: 'FIAT_PAYMENT',
      actionId: 'pay',
      legIndex: 0,
      expiresAt: '2026-10-23T12:10:00.000Z',
      instructions: { kind: 'qr', payload: 'QR', amount: '20', currency: 'BOB' },
    },
  };
  assert.equal(describeRampAction(order as never).expiresAt, '2026-10-23T12:10:00.000Z');
  assert.equal(describeRampAction({ state: 'processing', pendingAction: null } as never).expiresAt, null);
});

test('a QR payment without its rendered code says the code is missing; one with it does not', () => {
  const pay = (instructions: Record<string, unknown>) => ({
    state: 'awaiting_payment',
    pendingAction: { kind: 'FIAT_PAYMENT', actionId: 'pay', legIndex: 0, expiresAt: null, instructions },
  });
  const qr = { kind: 'qr', payload: '/9j/4AAQ', amount: '18', currency: 'BOB' };
  const image = { mediaType: 'image/jpeg', encoding: 'base64', data: '/9j/4AAQ', inlineSafe: false };
  const scannable = { kind: 'opaque', payload: null, payloadLabel: null, image };
  assert.equal(describeRampAction(pay(qr) as never).codeMissing, true);
  assert.equal(describeRampAction(pay({ ...qr, scannable }) as never).codeMissing, false);
  const bank = { kind: 'bank_transfer', amount: '18', currency: 'MXN', details: [], reference: null };
  assert.equal(describeRampAction(pay(bank) as never).codeMissing, false, 'a bank transfer has no code to miss');
});

test("a payment's own page is offered beside its code or account, and is the payment when it is all there is", () => {
  const pay = (instructions: Record<string, unknown>, expiresAt: string | null = null) => ({
    state: 'awaiting_payment',
    pendingAction: { kind: 'FIAT_PAYMENT', actionId: 'pay', legIndex: 0, expiresAt, instructions },
  });
  const page = 'https://pay.example/o/1';
  const qr = describeRampAction(pay({ kind: 'qr', payload: 'x', amount: '18', currency: 'BOB', link: page }) as never);
  assert.deepEqual([qr.link, qr.linkLabel, qr.codeMissing], [page, 'Open payment page', false], 'the page is a way to pay');
  const bank = describeRampAction(
    pay({ kind: 'bank_transfer', amount: '1000', currency: 'MXN', details: [], reference: null, link: page }) as never,
  );
  assert.deepEqual([bank.link, bank.linkLabel], [page, 'Open status page']);
  const hosted = describeRampAction(pay({ kind: 'hosted', url: page, amount: '18', currency: 'BOB' }) as never);
  assert.deepEqual([hosted.title, hosted.link, hosted.linkLabel], ['Pay 18 BOB', page, 'Pay on the provider page']);
  const unsafe = describeRampAction(
    pay({ kind: 'hosted', url: 'javascript:alert(1)', amount: '18', currency: 'BOB' }) as never,
  );
  assert.deepEqual([unsafe.link, unsafe.codeMissing], [null, true], 'a page that is not https is never opened');
});

test('a payment past its window shows neither its code, its account nor its page', () => {
  const image = { mediaType: 'image/png', encoding: 'base64', data: 'iVBORw0KGgo', inlineSafe: false };
  const scannable = { kind: 'opaque', payload: null, payloadLabel: null, image };
  const view = describeRampAction({
    state: 'awaiting_payment',
    pendingAction: {
      kind: 'FIAT_PAYMENT',
      actionId: 'pay',
      legIndex: 0,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
      instructions: { kind: 'qr', payload: 'x', amount: '18', currency: 'BOB', scannable, link: 'https://pay.example/o/1' },
    },
  } as never);
  assert.deepEqual([view.paymentClosed, view.scannable, view.link, view.codeMissing], [true, null, null, false]);
});

test('a verification with nothing to open says what the provider asks for, only for the steps still on the user', () => {
  const kyc = (steps: unknown, url: string | null = null) =>
    describeRampAction({
      state: 'awaiting_payment',
      pendingAction: { kind: 'KYC', actionId: 'k', legIndex: 0, steps, url },
    } as never);
  const abroad = kyc([
    { stepId: 'abroad-kyc', status: 'required', url: null, instructions: 'Complete verification directly with Abroad.' },
  ]);
  assert.deepEqual([abroad.link, abroad.note], [null, 'Complete verification directly with Abroad.']);
  assert.equal(kyc([{ status: 'awaiting_provider', instructions: 'We are reviewing.' }]).note, null, 'waiting is not a task');
  assert.equal(kyc([{ purpose: 'verification' }]).note, null);
  const hosted = kyc([], 'https://kyc.example/start');
  assert.deepEqual([hosted.linkLabel, hosted.note], ['Complete verification', null]);
});

test('an expired provider order reads differently once the funds moved: the user tries again, nothing is lost', () => {
  const failure = {
    code: 'PROVIDER_ORDER_EXPIRED',
    retryable: false,
    resolutionOwner: 'END_USER',
    resolutionAction: 'start_again',
  };
  const failed = rampOrderResolutionText({ failure, legs: [{ status: 'FAILED' }] } as never);
  const held = rampOrderResolutionText({ failure, legs: [{ status: 'COMPLETED' }, { status: 'HELD' }] } as never);
  assert.match(failed!, /nothing was charged/);
  assert.match(held!, /funds are safe in your wallet: try again/);
  assert.equal(rampOrderResolutionText({ failure: null, legs: [] } as never), null);
  const other = { ...failure, resolutionAction: 'contact_pollar' };
  assert.equal(
    rampOrderResolutionText({ failure: other, legs: [{ status: 'HELD' }] } as never),
    rampOrderResolutionText({ failure: other, legs: [{ status: 'FAILED' }] } as never),
  );
});

test('a dropped route that needs a wallet names the step and, to set one up, its chain', () => {
  const failure = (resolutionAction: string, detail?: string) =>
    ({ failure: { code: 'X', legIndex: 0, retryable: false, resolutionOwner: 'END_USER', resolutionAction, detail } }) as never;
  assert.deepEqual(rampWalletStep(failure('set_up_wallet', 'POLYGON')), {
    action: 'set_up_wallet',
    chain: 'POLYGON',
    label: 'Set up wallet',
    busyLabel: 'Setting up…',
  });
  assert.equal(rampWalletStep(failure('set_up_wallet', 'STELLAR')), null, 'never a Stellar wallet');
  assert.equal(rampWalletStep(failure('set_up_wallet')), null);
  assert.equal(rampWalletStep(failure('migrate_custody'))!.label, 'Move wallet');
  assert.equal(rampWalletStep(failure('create_wallet'))!.label, 'Create wallet');
  assert.equal(rampWalletStep(failure('add_trustline')), null);
});

test('a wallet with no way to be recovered asks for recovery, on a dropped route and on a held order', () => {
  const failure = {
    code: 'WALLET_RECOVERY_REQUIRED',
    legIndex: 1,
    retryable: false,
    resolutionOwner: 'END_USER',
    resolutionAction: 'set_up_recovery',
  } as never;
  assert.deepEqual(rampWalletStep({ failure }), {
    action: 'set_up_recovery',
    chain: null,
    label: 'Set up recovery',
    busyLabel: 'Opening…',
  });
  assert.match(rampOrderResolutionText({ failure, legs: [{ status: 'HELD' }] } as never)!, /recovered/);
});

test('a provider leg that paid out a substitute says so, and why the next step converts it', () => {
  const usdcPolygon = { kind: 'asset' as const, code: 'USDC', identifier: '0x3c49', chain: 'POLYGON' as const };
  const funds = (asset: string) => ({ chain: 'POLYGON', address: '0x8FD8', asset, amount: '1.98' });
  const leg = (kind: string, fundsLocation: unknown) => ({ kind, to: usdcPolygon, fundsLocation }) as never;
  assert.match(rampLegNote(leg('PROVIDER_ONRAMP', funds('USDT')))!, /sent USDT instead of USDC.*nothing is lost/);
  assert.equal(rampLegNote(leg('PROVIDER_ONRAMP', funds('USDC'))), null);
  assert.equal(rampLegNote(leg('PROVIDER_ONRAMP', null)), null);
  assert.equal(rampLegNote(leg('SWAP', funds('USDT'))), null);
});

test('no route: a verification the user cannot act on says it waits, never asks to verify', () => {
  const failure = { resolutionAction: 'complete_verification' };
  const kyc = (status: string, reviewReason?: string) =>
    ({ failure, requirement: { type: 'KYC', status, ...(reviewReason ? { reviewReason } : {}) } }) as never;
  const verify = 'Complete the identity verification to continue.';
  const review = 'Your verification is under review. You do not need to do anything; refresh later to check again.';

  assert.equal(rampNoRouteText([kyc('pending', 'DUPLICATE_DOCUMENT'), kyc('pending', 'DUPLICATE_DOCUMENT')]), review);
  assert.equal(rampNoRouteText([kyc('pending', 'DUPLICATE_DOCUMENT'), kyc('rejected')]), review);
  assert.equal(
    rampNoRouteText([kyc('rejected'), kyc('rejected')]),
    'Your identity verification was not approved, so no route is available.',
  );
  assert.equal(rampNoRouteText([kyc('none'), kyc('pending', 'DUPLICATE_DOCUMENT')]), verify);
  assert.equal(rampNoRouteText([{ failure } as never]), verify);
});

test('no route the app must fix never sends the user to support with an order id that does not exist', () => {
  for (const resolutionAction of ['fund_gas_wallet', 'enable_signing_mode']) {
    const text = rampNoRouteText([{ failure: { resolutionAction } } as never]);
    assert.match(text, /not available/);
    assert.doesNotMatch(text, /support|order id/);
  }
});

const usdtPolygon = { kind: 'asset' as const, code: 'USDT', identifier: '0xc213', chain: 'POLYGON' as const };
const usdcOnPolygon = { kind: 'asset' as const, code: 'USDC', identifier: '0x3c49', chain: 'POLYGON' as const };
const step = (kind: string, status: string, signs = true) => ({ kind, status, signs, hash: null });

test('the next approval is the next step the user signs, else the next leg that signs', () => {
  const swap = {
    kind: 'SWAP',
    status: 'AWAITING_ACTION',
    from: usdtPolygon,
    to: usdcOnPolygon,
    signingMode: 'COSIGNED',
    steps: [step('approve', 'awaiting_approval'), step('swap', 'pending')],
  };
  const bridge = { kind: 'BRIDGE', status: 'PENDING', from: usdcOnPolygon, to: usdc, signingMode: 'COSIGNED', steps: [] };
  const provider = { kind: 'PROVIDER_ONRAMP', status: 'COMPLETED', from: bob, to: usdtPolygon, signingMode: null, steps: [] };
  assert.equal(rampNextApproval({ legs: [provider, swap, bridge] } as never), 'Swap USDT to USDC');
  const swapping = { ...swap, steps: [step('approve', 'done'), step('swap', 'awaiting_approval')] };
  assert.equal(rampNextApproval({ legs: [provider, swapping, bridge] } as never), 'Send to Stellar');
  const burning = {
    ...bridge,
    status: 'AWAITING_ACTION',
    steps: [step('burn', 'awaiting_approval'), step('attestation', 'pending', false), step('mint', 'pending', false)],
  };
  assert.equal(rampNextApproval({ legs: [provider, { ...swap, status: 'COMPLETED' }, burning] } as never), null);
});

test('a chain step reads in the user terms, with what it is doing now', () => {
  const leg = { from: usdcOnPolygon, to: usdc };
  assert.equal(rampStepTitle({ kind: 'burn' }, leg as never), 'Send from Polygon');
  assert.equal(rampStepTitle({ kind: 'mint' }, leg as never), 'Arrives on Stellar');
  assert.equal(rampStepStatusText({ status: 'awaiting_approval', signs: true }), 'Waiting for your approval');
  assert.equal(rampStepStatusText({ status: 'confirming', signs: false }), 'In progress');
});

test('a running leg counts down its quoted time and stops at zero once late', () => {
  const startedAt = '2026-10-24T13:43:00.000Z';
  const at = (seconds: number) => Date.parse(startedAt) + seconds * 1000;
  assert.equal(rampLegTimeLeft({ etaSeconds: 30, startedAt }, at(12)), 18);
  assert.equal(rampLegTimeLeft({ etaSeconds: 30, startedAt }, at(45)), 0);
  assert.equal(rampLegTimeLeft({ etaSeconds: null, startedAt }, at(1)), null);
});

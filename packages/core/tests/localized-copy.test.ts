// The sentences core writes for the modals, in English, Spanish and Portuguese.
// English stays the default, so a caller that passes no language reads what it always did.
// Run with `npm test` in packages/core (or `npm run test:unit` at the root).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authErrorMessage, resolveAuthError } from '../src/client/auth/errorMessages';
import {
  APP_UNAVAILABLE_MESSAGE,
  appUnavailableMessage,
  cosignRefusalMessage,
  transactionErrorMessage,
} from '../src/lib/tx-error-messages';
import {
  describeRampAction,
  rampFieldError,
  rampLegNote,
  rampLegTitle,
  rampNoRouteText,
  rampOrderResolutionText,
  rampRequirementCopy,
  rampResolutionText,
  rampStepStatusText,
  rampStepTitle,
  rampTrustlineErrorText,
  rampWalletStep,
} from '../src/ramps/workflow';

const usdcOnStellar = { kind: 'asset', code: 'USDC', chain: 'STELLAR' } as const;

test('transaction errors read in each language, English by default', () => {
  assert.equal(transactionErrorMessage('TX_TOO_LATE'), 'The transaction expired before it was sent. Please try again.');
  assert.equal(
    transactionErrorMessage('TX_TOO_LATE', null, 'es'),
    'La transacción venció antes de enviarse. Intenta de nuevo.',
  );
  assert.equal(
    transactionErrorMessage('TX_TOO_LATE', null, 'pt'),
    'A transação expirou antes de ser enviada. Tente novamente.',
  );
  assert.equal(
    transactionErrorMessage('op_underfunded', null, 'pt'),
    transactionErrorMessage('TX_INSUFFICIENT_BALANCE', null, 'pt'),
  );
  assert.equal(transactionErrorMessage('UNKNOWN_CODE', null, 'es'), 'Algo salió mal. Intenta de nuevo.');
  assert.equal(transactionErrorMessage('UNKNOWN_CODE', 'A backend sentence.', 'pt'), 'A backend sentence.');
});

test('the app-unavailable text keeps its English constant and has es and pt versions', () => {
  const error = { code: 'SDK_BILLING_OVERDUE' };
  assert.equal(appUnavailableMessage(error), APP_UNAVAILABLE_MESSAGE);
  assert.match(appUnavailableMessage(error, 'es')!, /^Esto no está disponible/);
  assert.match(appUnavailableMessage(error, 'pt')!, /^Isto não está disponível/);
  assert.equal(transactionErrorMessage('SDK_CREDITS_INSUFFICIENT', null, 'es'), appUnavailableMessage(error, 'es'));
  assert.equal(appUnavailableMessage({ code: 'OTHER' }, 'es'), null);
});

test('a wallet provider refusal names its reason in the language asked', () => {
  const error = { code: 'SDK_COSIGN_TURNKEY_REJECTED', body: { message: 'Turnkey error 3: policy denied' } };
  assert.equal(cosignRefusalMessage(error), 'The wallet provider refused the request: policy denied.');
  assert.equal(cosignRefusalMessage(error, 'es'), 'El proveedor de la billetera rechazó la solicitud: policy denied.');
  assert.equal(
    cosignRefusalMessage({ code: 'SDK_COSIGN_TURNKEY_REJECTED' }, 'pt'),
    transactionErrorMessage('SDK_COSIGN_TURNKEY_REJECTED', null, 'pt'),
  );
});

test('auth errors resolve in each language, and authErrorMessage re-translates a known code', () => {
  assert.equal(
    resolveAuthError('PASSKEY_VERIFICATION_FAILED', 'x').message,
    "We couldn't verify your passkey. Please try again.",
  );
  assert.equal(
    resolveAuthError('PASSKEY_VERIFICATION_FAILED', 'x', 'es').message,
    'No pudimos verificar tu passkey. Intenta de nuevo.',
  );
  assert.equal(resolveAuthError('UNKNOWN', 'fallback', 'pt').message, 'fallback');
  assert.equal(authErrorMessage('PASSKEY_CHALLENGE_MISSING', 'pt'), 'Sua sessão de passkey expirou. Comece de novo.');
  assert.equal(
    authErrorMessage('SDK_CREDITS_INSUFFICIENT', 'es'),
    appUnavailableMessage({ code: 'SDK_CREDITS_INSUFFICIENT' }, 'es'),
  );
  assert.equal(authErrorMessage('UNKNOWN', 'es'), null);
  assert.equal(authErrorMessage(undefined, 'en'), null);
});

test('ramp legs and steps read in each language and keep asset and chain names', () => {
  const leg = { kind: 'PROVIDER_ONRAMP', from: { kind: 'fiat', currency: 'BOB' }, to: usdcOnStellar } as never;
  assert.equal(rampLegTitle(leg), 'Buy USDC on Stellar');
  assert.equal(rampLegTitle(leg, 'es'), 'Comprar USDC en Stellar');
  assert.equal(rampLegTitle(leg, 'pt'), 'Comprar USDC na Stellar');
  const substituted = { ...(leg as object), fundsLocation: { asset: 'USDT' } } as never;
  assert.match(rampLegNote(substituted)!, /^The provider sent USDT instead of USDC/);
  assert.match(rampLegNote(substituted, 'es')!, /^El proveedor envió USDT en lugar de USDC/);
  const swap = { from: { kind: 'asset', code: 'USDT', chain: 'POLYGON' }, to: usdcOnStellar } as never;
  assert.equal(rampStepTitle({ kind: 'swap' }, swap), 'Swap USDT to USDC');
  assert.equal(rampStepTitle({ kind: 'swap' }, swap, 'pt'), 'Trocar USDT por USDC');
  assert.equal(rampStepTitle({ kind: 'burn' }, swap, 'es'), 'Enviar desde Polygon');
  assert.equal(rampStepStatusText({ status: 'done', signs: true } as never), 'Done');
  assert.equal(rampStepStatusText({ status: 'done', signs: true } as never, 'pt'), 'Concluído');
});

test('ramp resolutions, limits and trustlines read in each language', () => {
  assert.equal(rampResolutionText({ resolutionAction: 'sign_again' }), 'The signature expired. Sign the step again.');
  assert.equal(rampResolutionText({ resolutionAction: 'sign_again' }, 'es'), 'La firma venció. Firma el paso otra vez.');
  assert.equal(
    rampResolutionText({ resolutionAction: 'nope' }, 'pt'),
    rampResolutionText({ resolutionAction: 'contact_pollar' }, 'pt'),
  );
  const limit = { side: 'in', min: '14500.5', max: null, currency: 'BOB' } as never;
  const below = { resolutionAction: 'change_amount', code: 'LIMIT_BELOW_MINIMUM', limit };
  assert.equal(rampResolutionText(below), 'This route takes at least 14,500.5 BOB. Try a larger amount.');
  assert.equal(rampResolutionText(below, 'es'), 'Esta ruta acepta al menos 14,500.5 BOB. Prueba con un monto mayor.');
  assert.equal(rampResolutionText(below, 'pt'), 'Esta rota aceita no mínimo 14.500,5 BOB. Tente um valor maior.');
  const order = { failure: { resolutionAction: 'start_again' }, legs: [{ status: 'HELD' }] } as never;
  assert.match(rampOrderResolutionText(order)!, /^The provider order expired/);
  assert.match(rampOrderResolutionText(order, 'pt')!, /^A ordem do provedor expirou/);
  assert.equal(rampTrustlineErrorText({}, 'USDC'), 'Could not add the USDC trustline. Please try again.');
  assert.equal(rampTrustlineErrorText({}, 'USDC', 'es'), 'No se pudo agregar la trustline de USDC. Intenta de nuevo.');
  assert.equal(rampNoRouteText([]), 'There is no route for this currency and asset right now. Choose another one.');
  assert.equal(rampNoRouteText([], 'pt'), 'Não há rota para esta moeda e este ativo no momento. Escolha outra.');
});

test('ramp requirements, wallet steps and field errors read in each language', () => {
  assert.deepEqual(rampRequirementCopy({ type: 'KYC', status: 'expired' } as never), {
    message: 'Your verification expired',
    action: 'Verify again',
  });
  assert.deepEqual(rampRequirementCopy({ type: 'KYC', status: 'expired' } as never, 'es'), {
    message: 'Tu verificación venció',
    action: 'Verificar de nuevo',
  });
  const rejection = { failure: { resolutionAction: 'set_up_wallet', detail: 'POLYGON' } } as never;
  assert.deepEqual(rampWalletStep(rejection), {
    action: 'set_up_wallet',
    chain: 'POLYGON',
    label: 'Set up wallet',
    busyLabel: 'Setting up…',
  });
  assert.equal(rampWalletStep(rejection, 'pt')!.label, 'Configurar carteira');
  assert.equal(rampFieldError({ type: 'email', label: 'Email' }, 'bad'), 'Enter a valid email address.');
  assert.equal(rampFieldError({ type: 'email', label: 'Email' }, 'bad', 'es'), 'Ingresa un email válido.');
  assert.equal(rampFieldError({ type: 'text', label: 'CLABE', pattern: '\\d{18}' }, '12', 'pt'), 'Verifique o campo clabe.');
});

test('the pending action screen reads in each language', () => {
  const order = {
    state: 'awaiting_user',
    pendingAction: {
      kind: 'FIAT_PAYMENT',
      instructions: { kind: 'bank', amount: '100', currency: 'MXN', details: [], reference: 'R1' },
    },
  } as never;
  const en = describeRampAction(order);
  assert.equal(en.title, 'Pay 100 MXN');
  assert.deepEqual(en.details, [{ label: 'Reference', value: 'R1' }]);
  const es = describeRampAction(order, 'es');
  assert.equal(es.title, 'Paga 100 MXN');
  assert.deepEqual(es.details, [{ label: 'Referencia', value: 'R1' }]);
  assert.equal(describeRampAction({ state: 'completed', pendingAction: null } as never, 'pt').title, 'Transferência concluída');
});

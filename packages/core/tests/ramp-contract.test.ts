import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  defineRampAdapter,
  defineRampAdapterRegistration,
  isRampAdapterError,
  RampAdapterError,
  type RampAdapter,
} from '../src/ramps/index';

test('adapter definition preserves server class methods and rejects incomplete boundaries', () => {
  class Provider implements RampAdapter {
    readonly adapterId = 'custom-provider';
    private readonly identity = 'bound';
    async capabilities() {
      assert.equal(this.identity, 'bound');
      return {
        routes: [],
        callbacks: false,
        polling: true,
        providerIdempotency: false,
        operationLookup: false,
        fiatPayoutEvidence: false,
        keyRetentionSeconds: null,
      };
    }
    async quote(): ReturnType<RampAdapter['quote']> {
      throw new RampAdapterError('UNSUPPORTED_ROUTE', 'correct_input');
    }
    async create(): ReturnType<RampAdapter['create']> {
      return { outcome: 'unknown', error: new RampAdapterError('OUTCOME_UNKNOWN', 'reconcile') };
    }
    async status(): ReturnType<RampAdapter['status']> {
      throw new RampAdapterError('PROVIDER_UNAVAILABLE', 'retry_read');
    }
    async reconcile() {
      return null;
    }
  }
  const instance = new Provider();
  assert.equal(defineRampAdapter(instance), instance);
  assert.throws(() => defineRampAdapter({ adapterId: 'incomplete' } as RampAdapter), isRampAdapterError);
  assert.throws(() => defineRampAdapter({ ...instance, adapterId: ' ' } as RampAdapter), isRampAdapterError);
});

test('server registration keeps the configuration resolver and typed factory paired', async () => {
  const transport = { account: 'server-account' };
  const registration = defineRampAdapterRegistration('custom-provider', {
    defaultChain: 'STELLAR',
    async resolveConfiguration(scope) {
      return {
        configurationId: `${scope.applicationId}:revision`,
        client: transport,
        timeoutMs: 1000,
        clock: () => new Date(),
        logger: { warn() {} },
      };
    },
    factory(dependencies) {
      assert.equal(dependencies.client.account, transport.account);
      return {} as RampAdapter;
    },
  });
  const configured = await registration.resolveConfiguration({
    applicationId: 'app',
    providerId: 'provider',
    network: 'testnet',
  });
  registration.factory(configured);
  assert.equal(configured.configurationId, 'app:revision');
  assert.throws(() => defineRampAdapterRegistration('', registration), isRampAdapterError);
  assert.throws(
    () => defineRampAdapterRegistration('bad', { ...registration, defaultChain: 'UNKNOWN' as 'STELLAR' }),
    isRampAdapterError,
  );
});

test('public error guard checks branded codes and recovery without accepting arbitrary error messages', () => {
  assert.equal(isRampAdapterError(new RampAdapterError('OUTCOME_UNKNOWN', 'reconcile')), true);
  assert.equal(isRampAdapterError(new Error('provider-secret')), false);
  assert.equal(isRampAdapterError({ code: 'OUTCOME_UNKNOWN', recovery: 'reconcile' }), false);
  assert.equal(isRampAdapterError(new RampAdapterError('INVALID_INPUT', 'correct_input', 999)), false);
});

test('contract version 2 is additive: a version 1 registration still resolves and reports version 1', () => {
  const base = {
    defaultChain: 'STELLAR' as const,
    async resolveConfiguration() {
      return { configurationId: 'c', client: {}, timeoutMs: 1000, clock: () => new Date(), logger: { warn() {} } };
    },
    factory() {
      return {} as RampAdapter;
    },
  };
  assert.equal(defineRampAdapterRegistration('legacy', base).contractVersion, 1);
  assert.equal(defineRampAdapterRegistration('current', { ...base, contractVersion: 2 }).contractVersion, 2);
  assert.throws(() => defineRampAdapterRegistration('future', { ...base, contractVersion: 3 as 2 }), isRampAdapterError);
});

test('a version 2 registration reports a rotating revision under a stable configuration identity', async () => {
  let key = 'key-1';
  const registration = defineRampAdapterRegistration('rotating', {
    defaultChain: 'STELLAR',
    contractVersion: 2,
    async resolveConfiguration(scope) {
      return {
        configurationId: `app:${scope.applicationId}`,
        configurationRevision: `credentials:${key}`,
        client: {},
        timeoutMs: 1000,
        clock: () => new Date(),
        logger: { warn() {} },
      };
    },
    factory() {
      return {} as RampAdapter;
    },
  });
  const scope = { applicationId: 'app', providerId: 'provider', network: 'testnet' as const };
  const before = await registration.resolveConfiguration(scope);
  key = 'key-2';
  const after = await registration.resolveConfiguration(scope);
  assert.equal(after.configurationId, before.configurationId);
  assert.notEqual(after.configurationRevision, before.configurationRevision);
});

test('a version 2 error carries the provider code and detail without changing the public guard', () => {
  const error = new RampAdapterError('PROVIDER_REJECTED', 'operator', 422, {
    providerCode: 'ORDER_CANCELLED',
    detail: 'expired',
  });
  assert.equal(error.providerCode, 'ORDER_CANCELLED');
  assert.equal(error.detail, 'expired');
  assert.equal(isRampAdapterError(error), true);
  assert.equal('providerCode' in new RampAdapterError('QUOTE_EXPIRED', 'requote'), false);
});

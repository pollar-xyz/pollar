# Build a ramp provider with core and run it in Pollar

Applications use this path:

`Application -> @pollar/core -> authenticated Pollar API -> registered server adapter -> provider`

`@pollar/core/ramps` exports the server adapter contract and registration factory. A provider package implements this contract and is installed in Pollar's backend. The backend owns configuration, credentials, application/user scope, persisted quotes, the seven-state lifecycle, durable operations and reconciliation. Applications keep using the existing `PollarClient` methods.

These APIs ship in `@pollar/core` 0.12.0 as the `@pollar/core/ramps` subpath. Registering an adapter does not enable a real provider for an app; that is backend configuration.

## Implement a server adapter

Create a server package that exports a factory. Inject the authenticated provider transport from Pollar's configuration resolver. `MyProviderClient` below represents the transport you implement; it must map provider responses into the exported core types.

```ts
import { defineRampAdapter, type RampAdapter, type RampAdapterAttemptRecorder } from '@pollar/core/ramps';

export function createMyRamp(provider: MyProviderClient, recorder?: RampAdapterAttemptRecorder): RampAdapter {
  return defineRampAdapter({
    adapterId: 'my-provider',
    validity: {
      source: 'provider_quote',
      beforeFundsMove: 'requote',
      afterFundsMove: 'hold',
      description: 'The provider quote is firm until it expires; an order placed after it is quoted again.',
    },
    capabilities: (user) => provider.capabilities(user),
    quote: (input) => provider.quote(input),
    create: (input) => provider.create(input),
    status: (input) => provider.status(input),
    reconcile: (input) => provider.reconcile(input),
  });
}
```

This code runs in the Pollar server. `provider` calls the external provider; the application does not construct it. The full [example adapter](../../examples/custom-ramp/adapter.ts) shows protocol translation rather than assuming that the external API already returns core's types, and wraps each provider call with `recorder` (see [Contract version 2](#contract-version-2)).

Required methods are `capabilities`, `quote`, `create`, `status` and `reconcile`. Optional methods support preparation, action validation, input mapping, quote comparison, continuation, callback verification, refunds, notification and an independent authenticated fiat receipt reader (`verifySettlement`). Provider status reports and hashes alone cannot establish completion.

Use exact decimal strings in all amounts and terms. Chain identifiers follow `STELLAR`, `POLYGON` and `SOLANA`; rails follow the backend catalog (`SPEI`, `PIX`, `PSE`, `ACH`, `BREB`, `QR`, `BANK_TRANSFER`, `CASH`, `CARD`, `HOSTED`; `HOSTED` when the user picks the method inside the provider's flow). Additional chains or rails require backend/schema support. Advertise only routes for which the provider account, user wallet, chain executor and independent evidence readers are available.

## Export the server registration

```ts
import { defineRampAdapterRegistration } from '@pollar/core/ramps';

export const registration = defineRampAdapterRegistration('my-provider', {
  defaultChain: 'STELLAR',
  contractVersion: 2,
  async resolveConfiguration(scope) {
    // Implement on the server using Pollar's configured provider account.
    const configured = await resolveProviderAccount(scope);
    return {
      configurationId: configured.accountId, // stable: the account the credentials belong to
      configurationRevision: configured.credentialHash, // what rotates under it
      client: configured.authenticatedClient,
      timeoutMs: 15000,
      clock: () => new Date(),
      logger: redactingLogger,
    };
  },
  factory: (dependencies) => createMyRamp(dependencies.client, dependencies.recorder),
});
```

`resolveProviderAccount` and `redactingLogger` are server integrations. Keep API keys, signing keys and callback secrets there. `configurationId` names the account the provider is configured under, not the secret itself. Pollar saves it with every transaction and compares it on each later call, so it must not change when credentials rotate or a corridor list is synced: a value that changes on rotation strands the transactions in flight. Put what rotates (a credential hash, a corridor snapshot) in `configurationRevision`, which Pollar logs next to the identity and never rejects a transaction over. The [server example](../../examples/custom-ramp/server.ts) exposes an injected resolver so the backend can supply its actual credential store/transport without embedding secrets in the SDK.

## Contract version 2

`RAMP_ADAPTER_CONTRACT_VERSION` is `2`. A registration declares the version it was written for in `contractVersion` (`1` or `2`; `1` when absent), and Pollar reads the version 2 fields only from adapters that declare it. Every version 2 field is optional, so a version 1 adapter keeps compiling. Version 2 adds:

- **User context.** `user.actor` is `{ kind: 'SDK_USER', applicationId, sdkUserId }` for a user with a Pollar session or `{ kind: 'APP_USER', applicationId, externalUserId }` for a user the application's backend manages; `user.sdkUserId` stays set for both. `user.wallet.signingMode` (`COSIGNED`, `SELF_CUSTODY`, `EXTERNAL`, `APP_CUSTODY`) is the exact signing mode, of which `custody` is the coarse projection.
- **Attempt recorder.** `dependencies.recorder.record({ step, request, response?, sensitive?, httpStatus?, latencyMs?, errorCode? })` around each provider call; Pollar stores it as an attempt of the leg. `request` and `response` are what the operator sees, redacted; personal data goes only in `sensitive`, which is encrypted at rest. `recorder` is absent on a host that speaks version 1.
- **Provider-built payloads.** A `RampAdapterPayment` can carry `prebuiltPayload: { encoding, value, expiresAt }` when the provider builds the transaction itself (a Stellar XDR, an EVM transaction). The chain executor validates it and has it signed instead of building its own, and asks the adapter for a fresh one if it expires before the signature arrives.
- **Payment deadline.** `RampAdapterPayment.expiresAt` is when the provider stops taking the payment (an off-ramp order's deposit window). Pollar neither asks the user to sign nor sends a payment past it; `null` or absent when the provider sets no limit.
- **Provider codes on errors.** `new RampAdapterError(code, recovery, status?, { providerCode, detail })`: `providerCode` is the provider's own code, for the failure catalog and the operator; `detail` is operator detail, never personal data or a raw body. `isRampAdapterError` recognizes the error across every package entry point.
- **Fee breakdown.** `offer.fees` lists `RampAdapterLegFee` lines (`beneficiary`, `payer`, `settlement`, `basis`, `basisAmount`, `basisCurrency`, `amount`, `currency`, `usdValue`) that break down `terms.feeAmount`; the total stays in `terms`.
- **Validity.** `adapter.validity: { source, beforeFundsMove, afterFundsMove, description }` declares where an order's expiry comes from (`provider_quote`, `provider_order`, `signature`, `operational_timeout`, `none`) and what Pollar does when it lapses: before funds move it requotes, rebuilds or cancels; after funds move it holds them or retries.

`capabilities().routes` of a version 2 adapter are the provider's native rails: the asset and chain the provider itself delivers or takes, not what the end user receives. Pollar's planner adds the swap and bridge legs around them.

## Install in Pollar's backend

During trusted SDK API startup, import the installed provider package and register it:

```ts
// pollar-platform/apps/sdk-api/src/ramps/bootstrap.ts
import { registration } from '@your-org/pollar-ramp-my-provider';
import { registerCoreRampAdapter } from './registry.js';

registerCoreRampAdapter(registration);
```

The backend pairs the configuration resolver with the factory, validates the returned adapter identity and uses it through the existing orchestrator. There is no browser-side provider registration, uploaded JavaScript or remote module loading endpoint.

Configure the provider catalog row with `adapter = GENERIC` and `adapter_key = my-provider`, its supported/enabled corridors and matching network. Link/enable it for the application using the existing provider administration flow. Enroll the provider through the existing adapter-provider configuration (`SDK_RAMP_ADAPTER_PROVIDERS`); keep chain, wallet and trusted fiat verification gates enabled. Installing the package alone does not bypass these operational checks.

The public contract is authored in core. Until a published core release contains it, the companion backend consumes a generated, revision/hash-pinned source snapshot in its private `@pollar/ramp-adapter-contract` workspace package. Its synchronization check prevents editing a separate handwritten backend contract. New SDK changes must regenerate that snapshot; no sibling checkout or unpublished npm version is required in production installs.

## Consume it from an application

Use an existing authenticated client. Core sends each request to Pollar's `/v3` ramps API; the backend plans routes across the enabled registered providers, quotes each leg and persists the order.

```ts
import { rampQuoteFields } from '@pollar/core';

const { routes } = await client.getRampRoutes('ONRAMP');
// Show the fiat and asset pairs and let the user select one.
const { quotes, rejected } = await client.quoteRamp({
  direction: 'ONRAMP',
  fiat: { currency: route.fiat.currency, rail: route.fiat.rail, country: route.fiat.country },
  asset: { code: route.asset.code, identifier: route.asset.identifier, chain: route.asset.chain },
  amount: { value: '100', denomination: 'in' },
});

// Show the chosen quote (best first) and collect the values its rampQuoteFields(quote) ask for.
// After the user accepts it, before its expiresAt:
const order = await client.createRampOrder({ quoteId: quote.quoteId, payee });
const saved = await client.getRampOrder(order.id);
```

An adapter's `requiredFields` reach the application as the quote leg's `requiredFields`, and the values come back to `create` as `payee`. A missing or wrong value answers `400 VALIDATION_ERROR` before anything moves.

The order carries what it waits for in `order.pendingAction`: `FIAT_PAYMENT` (instructions to pay), `SIGNATURE`, `COSIGN_APPROVAL` or `KYC`. Render it with `describeRampAction(order)` and follow the order with `pollRampOrder(order.id, { onUpdate, signal })`. Call `signRampLeg(order.id, actionId)` only after explicit user interaction, through a signer registered with `registerRampSigningHandler(chain, encoding, handler)`; the backend binds the action ID and controls submission. Resume the same order ID after a reload or timeout (`listRampOrders({ pending: 'true' })` lists the ones waiting on the user). Do not create a replacement order to refresh its status.

Applications have no local `client.rampAdapters` executor or `registerRampAdapter` method: every ramp transaction goes through Pollar's orchestration.

See the type-checked [application example](../../examples/custom-ramp/client.ts). To validate this SDK checkout:

```sh
npm run build --workspace @pollar/core
npm run test:custom-ramp-example
node tests/smoke-custom-ramp.cjs
```

The companion backend integration tests exercise the actual SDK methods through its HTTP controllers and disposable PostgreSQL, including persisted quote/transaction/operation identities, ownership, replay and unknown-outcome recovery. They use injected observations and never create live payments.

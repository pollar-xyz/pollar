# DEV-8 — Generic Ramp Adapter and User Experience Design

- **Status:** Proposed — written design only; not a released feature or accepted implementation specification.
- **Date:** 2026-09-29.
- **Audience:** adapter contributors, backend and frontend developers, and operations reviewers.
- **Tracking:** [DEV-8](https://plane.pollar.dev/pollar-dev/browse/DEV-8/).
- **Foundations:** [DEV-6 proposed ADR](../adr/0001-ramp-api-and-lifecycle.md) and [DEV-7 lifecycle work](https://plane.pollar.dev/pollar-dev/browse/DEV-7/).
- **Review:** backend, frontend, and operations walkthroughs pending; no reviewer feedback has been recorded.

For concrete contracts and payloads, start with [shared interfaces](#7-revised-shared-interfaces) and [worked examples](#8-worked-interface-and-payload-examples). The earlier sections explain the product behavior and ownership behind those contracts.

## 1. Purpose and scope

Define how developers can connect new ramp providers to Pollar while applications offer a consistent deposit and withdrawal experience. “Generic” means a shared contribution contract and reusable user actions; it does not mean every provider has the same workflow or can be integrated through configuration alone.

This deliverable is a written design document. It does not implement adapters, frontend screens, API changes, database migrations, or activate providers. The local DEV-7 foundation supplies lifecycle enforcement; its presence does not establish deployment or readiness for provider enrollment. DEV-6 remains Proposed pending its audit and reviews.

Success means:

- Contributors understand what an adapter must provide.
- Frontend developers can build reusable payment components.
- Backend developers know which decisions belong to shared orchestration.
- Adding a provider generally requires an adapter and configuration, without changing shared transaction logic.

The shared contract supports any declared fiat currency or token, including same-asset routes, native assets on the closed `RampChain` catalog (`STELLAR`, `POLYGON`, `SOLANA`). Each provider/chain/verification integration must be available and tested before a route is executable. Abroad initially migrates verified Stellar-USDC withdrawals; the synthetic reference covers both directions. Examples are fixtures, not certified provider capabilities.

## 2. How the system works

Pollar separates presentation, coordination, provider communication, and verification.

| Layer                      | Responsibility                                                                                                  | Boundary                                                                                      |
| -------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Frontend                   | Collect information, display offers, guide user actions, and show saved transaction progress                    | Does not infer payment success from browser navigation, a local timer, or a wallet response   |
| Shared backend             | Authorize requests, select eligible routes, preserve accepted terms, coordinate operations, and manage recovery | Owns durable transaction and operation identity                                               |
| Provider adapter           | Translate provider requests, responses, payment instructions, and status observations                           | Does not write shared lifecycle state or independently declare a Pollar transaction completed |
| Verification and lifecycle | Verify financial obligations and apply DEV-7's permitted state transitions                                      | Distinguishes provider claims from sufficient settlement evidence                             |

The frontend receives structured information from Pollar. Providers do not control arbitrary frontend screens or supply executable UI content. Pollar owns presentation, wording, validation boundaries, and which actions may be offered.

### Provider capability profile

Each adapter describes complete supported combinations of country, fiat currency, direction, payment rail, asset, and network. Independent lists must not accidentally imply unsupported combinations.

Its profile also describes:

- Amount limits, their denomination, and supported precision.
- Required customer and payout information.
- Available user actions, such as QR payment, bank transfer, hosted interaction, or wallet signature.
- Quote guarantees, provider validity, and indicative versus executable offers.
- Authenticated status polling, callbacks, and reconciliation mechanisms.
- Provider idempotency and operation-lookup support.
- Refund availability through an API, a manual process, or neither.

A route becomes available only when implementation support, verified provider availability, configuration, and application policy all permit it. Configuration may narrow capabilities; it cannot invent them. Disabling new orders must not prevent Pollar from tracking existing transactions or accessing their required provider configuration.

### Adapter responsibilities in plain language

| Operation                                   | Expected contribution                                                                                                                                |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Discover capabilities                       | Explain what this configured provider can support                                                                                                    |
| Request a quote                             | Translate a requested route and exact amount into an offer with terms, expiry, and required inputs                                                   |
| Create an order                             | Submit an already authorized, durably identified operation and report accepted, definitively rejected, or unknown outcome                            |
| Read status                                 | Retrieve a provider observation without creating orders or moving funds                                                                              |
| Reconcile                                   | Use saved identities and references to investigate an uncertain outcome; inability to find an order is not automatically proof it was never accepted |
| Continue a workflow, when supported         | Resume the same saved action, such as a signature challenge, rather than starting a second transaction                                               |
| Handle callbacks or refunds, when supported | Normalize authenticated observations or execute separately authorized refund operations                                                              |

Credentials and provider configuration are injected on the server. They are not frontend fields. Provider-specific response formats stay inside the adapter; normalized instructions and stable Pollar identifiers cross the boundary.

## 3. Frontend experience

### Reusable components

| Component                  | What it shows or collects                                                             |
| -------------------------- | ------------------------------------------------------------------------------------- |
| Amount and route selection | Deposit/withdrawal direction, amount, currency, and eligible payment methods          |
| Quote comparison           | Total paid, total received, disclosed fees, estimated duration, and expiry            |
| Required-information form  | Validated customer or payout fields for the selected route                            |
| Verification step          | Explanation and entry point for the separate verification flow                        |
| Payment instructions       | QR, bank details, exact amount, reference, and validity                               |
| Wallet authorization       | The requested signature or transfer and its purpose                                   |
| Transaction progress       | Verified milestones, outstanding action, and latest status check                      |
| Receipt and support        | Final amounts, masked destination, transaction reference, and relevant evidence links |

Pollar owns component layout and wording. Adapters provide structured requirements and instructions. Provider-specific fields may change the contents of a form. A genuinely new action type requires a reviewed addition to the shared action catalog, rather than arbitrary provider markup.

For example, a PIX destination and a bank-account payout may require different fields, while sharing the same form, review, validation, and confirmation components. Exact QR payment payloads and references must be preserved rather than reconstructed from their displayed text.

The initial action catalog covers collecting information, completing hosted verification, accepting a quote, paying by QR, making a bank transfer, funding a Stellar destination, signing a transaction, and waiting for processing. A funding instruction is validated and authorized by Pollar before any shared settlement worker executes it.

Show financial amounts from the accepted terms. Do not calculate a different credit or debit from a displayed exchange rate. Fees are disclosed components already included in the quoted totals, not an extra amount the frontend adds. Estimated duration is an estimate, not a guarantee.

### Progress and next action are separate

The transaction state explains where processing stands. The next action explains what the user must do. An `awaiting_payment` transaction could require scanning a QR, transferring money, or authorizing a wallet transaction. Collecting information or verification may also happen before a transaction is reserved; those screens do not imply money movement.

| Situation supported by saved evidence                   | Example user-facing message                                                                   |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Payment instructions issued, source funds not confirmed | “Waiting for your payment.”                                                                   |
| Fiat receipt verified, conversion underway              | “Payment received. Your transfer is processing.”                                              |
| Final chain settlement underway                         | “Sending USDC to your wallet.”                                                                |
| Withdrawal funding verified, payout outstanding         | “USDC received. Bank payout is processing.”                                                   |
| Submission or settlement outcome uncertain              | “We're checking your transfer. You don't need to start again.”                                |
| All required obligations verified                       | “Transfer completed.”                                                                         |
| Confirmed failure                                       | Explain the confirmed issue and the appropriate next action; do not imply funds were returned |
| Refund requested but unverified                         | “Refund requested. We're waiting for confirmation.”                                           |
| Return of funds verified                                | “Refund confirmed.”                                                                           |

DEV-7's seven canonical states remain `created`, `awaiting_payment`, `processing`, `settling_onchain`, `completed`, `failed`, and `refunded`. Uncertainty is a reconciliation condition alongside the last supported state, not a fabricated eighth lifecycle state. A refund request is also not a new terminal state.

Do not display invented intermediate milestones or force a fixed numbered progress ladder. Different providers may skip stages, and withdrawals may complete their chain leg before fiat payout. A settlement mismatch should remain visible even if one milestone was previously successful.

### Resume behavior

The backend saves the transaction and outstanding actions. Refreshing, closing the browser, or returning on another device restores the existing transaction after authentication. A wallet action may still require reconnecting the appropriate wallet; resuming the screen must not automatically repeat the signature or transfer.

Use authenticated polling initially. Background processing continues independently of an open browser. A failed frontend poll shows that status could not be refreshed, retains the last known progress and check time, and does not classify the payment as failed. Signing and continuation actions stay bound to their transaction and server-issued action identity.

## 4. End-to-end journeys

### Deposit: fiat to USDC

1. The user enters the amount and payment preferences.
2. Pollar requests offers from eligible adapters.
3. The frontend presents the exact payment and expected credit, fees, and expiry.
4. The user selects an offer, supplies its required information, and confirms the financial terms.
5. Pollar validates the accepted offer and durably reserves the transaction before external submission.
6. The adapter returns the provider reference and next action, or an explicit rejected/unknown outcome.
7. The frontend displays payment instructions or a hosted interaction when available.
8. Pollar receives or retrieves provider observations and verifies settlement.
9. Completion appears only when the required fiat and Stellar obligations are satisfied.

For a QR-based journey, the QR screen can change into a processing screen after verified receipt, then a receipt after verified USDC delivery. Closing the QR screen does not cancel or restart the backend workflow. An intermediary swap or bridge hash is not proof of final Stellar delivery.

### Withdrawal: USDC to fiat

1. The user chooses an amount and payout method.
2. The frontend collects and confirms the destination.
3. The user reviews the exact crypto debit and fiat payout, including fees and expiry.
4. Pollar reserves the transaction and coordinates the required funding action.
5. The frontend requests wallet authorization when needed, explaining authentication signatures separately from payment signatures.
6. Pollar tracks chain funding and fiat payout separately.
7. The transaction completes after both required obligations are verified.

A successful wallet transfer may lead to “Bank payout is processing”; it does not itself establish withdrawal completion. Chain verification must match the expected network, asset, amount, destination, memo where required, and successful transaction.

### Verification and quote renewal

Pollar's verification policy determines eligibility. An adapter may identify a provider requirement or hosted verification action, but KYC decisions and tiers remain in the separate verification model. Returning from a hosted page alone does not establish verification approval or payment completion.

After verification, Pollar rechecks eligibility and refreshes the provider offer when needed. Public quotes remain valid for 15 minutes; provider expiry is informational. Firm/indicative stays internal and published clients keep their quote/create flow. An explicit policy per route/direction determines permitted changes before final exact terms are saved. Abroad permits no financial drift; Stereum retains its existing crypto-fixed behavior on its legacy path until migration. Changes outside authorization require a fresh accepted quote. Saved operations cannot be repriced.

Once an operation has already been accepted and reserved, returning to it retrieves the same transaction; quote expiry must not cause a duplicate create.

## 5. Backend coordination and exceptional cases

The backend owns transaction identity, accepted financial terms, durable operations, scheduling, and recovery. Adapters translate provider protocols and return normalized observations. Shared orchestration constructs trusted lifecycle commands only after authentication and the required verification.

| Situation                            | Backend behavior                                                                                     | Frontend behavior                                                       |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Quote expires before acceptance      | Reject new execution and request a fresh quote                                                       | Show the refreshed offer for confirmation                               |
| Financial terms change               | Require fresh acceptance before money moves                                                          | Clearly present changed amounts or fees                                 |
| User submits twice                   | Resolve matching requests to the same transaction; changed requests under the same key conflict      | Continue showing the existing transaction or explain the input conflict |
| Provider submission times out        | Preserve the operation and reconcile its outcome; do not blindly resubmit                            | Explain that Pollar is checking; discourage starting again              |
| Provider definitively rejects        | Record supported failure information and remaining obligations                                       | Show an actionable explanation without claiming a refund                |
| Provider reports success             | Verify the relevant financial evidence                                                               | Continue processing until obligations are verified                      |
| Events repeat or arrive out of order | Deduplicate and evaluate through DEV-7; retain unsupported contradictions for reconciliation         | Display the current saved state                                         |
| Settlement is partial or mismatched  | Flag reconciliation and retain verified evidence                                                     | Explain that the transfer needs checking                                |
| Refund is requested                  | Track the request separately from returned funds                                                     | Show that the refund is pending                                         |
| Refund is verified                   | Apply the permitted refunded state when return and remaining obligations satisfy the lifecycle rules | Show confirmed return details                                           |
| A new-order route is disabled        | Stop new orders while continuing existing-order reconciliation                                       | Remove the new-order choice but preserve existing transaction access    |

The backend must not silently switch providers after acceptance, repeat uncertain money-moving operations, or treat a hash as proof of settlement. Timeouts are not evidence of failure. Partial refunds do not establish full `refunded` completion.

### Operational visibility

An internal transaction view should show:

- Pollar state and provider status separately.
- Accepted terms and masked destination.
- Timeline of observations and verified milestones.
- Outstanding user actions.
- Fiat and chain evidence separately, including intermediary references where relevant.
- Last provider check and reconciliation reason.

Recovery actions must have specific purposes, such as “Check provider again” or “Request settlement verification.” Avoid an unrestricted “Retry payment” action. Refunds and other money-moving recovery operations require their own authorization and durable identity; operator controls do not bypass DEV-7's evidence rules.

## 6. Contributor experience and delivery boundaries

The eventual adapter development kit should provide a documented responsibility contract, capability-profile template, fixture-backed example provider, normalized action and observation catalog, configuration and credential-injection guidance, initial contract checks, and an onboarding guide.

A contributor should be able to describe supported routes, implement provider translation, supply sanitized fixtures, register the adapter, and run shared checks. Shared handlers should not acquire provider-specific branches. Unsupported directions must remain explicit gaps rather than placeholder implementations advertised as available.

Anclap, Abroad, and Stereum are integration inputs for later validation, not proof that one fixed sequence fits all providers. DEV-6 identifies hosted/signature interaction, payout and memo matching, and intermediary bridge steps as differences the design must accommodate. Each real migration must verify actual support and final settlement obligations.

### Worked design acceptance scenarios

These are future walkthrough and implementation criteria, not tests executed by this documentation change. Use fictional fixtures so a successful demonstration does not imply certification of a real provider.

| Scenario                         | Walkthrough                                                                                                       | Expected result                                                                                                                 |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Two providers, shared components | Fixture A returns a QR deposit; fixture B returns bank instructions for the same kind of deposit                  | The same quote, instructions, progress, and receipt components handle both without provider-specific handler branches           |
| Different direction ordering     | Fixture A verifies fiat receipt before Stellar delivery; fixture B verifies withdrawal funding before fiat payout | Progress follows the recorded milestones; neither reaches completed with only one required leg verified                         |
| Changed quote                    | A user returns from verification after the offer expires and a new offer has different fees                       | New terms are displayed and require confirmation; the old acceptance does not authorize them                                    |
| Uncertain submission             | The provider accepts a create but its response is lost                                                            | Pollar retains one transaction, looks up the existing operation, and shows checking progress without another payment submission |
| Resumed session                  | The user closes a payment screen and returns after processing advances                                            | Authentication restores the saved transaction and current action rather than recreating it                                      |
| Duplicate request and event      | The user double-clicks confirm and a provider repeats its notification                                            | Matching submissions converge on one transaction; the event does not duplicate settlement or history                            |
| Partial settlement and refund    | Funding is observed but the amount mismatches; a refund is requested and later verified                           | Reconciliation remains visible; requesting the refund does not produce a refunded receipt before sufficient return evidence     |
| Isolation and disabled route     | Another user requests the transaction; separately, operations disables new orders on its route                    | Unauthorized access is denied; the owner can still track and reconcile the existing transaction                                 |

### Ownership of subsequent implementation

| Work                                                            | Owning scope |
| --------------------------------------------------------------- | ------------ |
| API and lifecycle decisions                                     | DEV-6        |
| Durable lifecycle enforcement                                   | DEV-7        |
| Adapter foundation, registry, example, and contributor guidance | DEV-8        |
| Real-provider migrations                                        | DEV-9/10/11  |
| Endpoint and durable idempotency integration                    | DEV-12       |
| Provider event ingestion                                        | DEV-13       |
| App event delivery                                              | DEV-14       |
| External settlement verification                                | DEV-15       |
| Full adapter conformance suite                                  | DEV-16       |

Frontend components and operational screens are specified as consumers of the adapter contract. Their implementation must be assigned explicitly rather than assumed to be included in DEV-8. This written phase does not complete the adapter implementation scope of DEV-8 or change any ticket's status.

## 7. Revised shared interfaces

These declarations match the local DEV-8/DEV-10 framework. This is not a published release or a claim that all providers are migrated. Internal provider observations and credentials are not frontend authority. `RampAction`, `RampTerms`, `RampRoute` and continuation types in the public library are generated from the matching backend OpenAPI schema.

```ts
// Separate from WalletNetwork. Adding a chain requires a backend enum migration.
type RampChain = 'STELLAR' | 'POLYGON' | 'SOLANA';
// WalletNetwork remains an independent database enum.
type WalletNetwork = 'STELLAR' | 'POLYGON' | 'SOLANA';

type LifecycleTerms = {
  fiatCurrency: string;
  fiatAmount: string;
  cryptoAmount: string;
  feeAmount: string;
  feeCurrency: string;
  assetCode: string;
  assetChain: RampChain;
  assetIssuer: string | null;
};

/** Internal contracts. Existing SDK responses remain compatibility projections. */
export type Decimal = string;
export type Route = {
  routeId: string;
  direction: 'onramp' | 'offramp';
  country: string;
  fiatCurrency: string;
  rail: string;
  asset: { code: string; identifier: string | null; chain: RampChain; network: string; precision: number };
  limits: { denomination: 'fiat' | 'crypto'; min: Decimal | null; max: Decimal | null };
};
export type UserContext = {
  applicationId: string;
  sdkUserId: string;
  providerId: string;
  configurationId: string;
  wallet: { address: string; chain: WalletNetwork; network: 'testnet' | 'mainnet'; custody: 'custodial' | 'external' };
};
export type RequiredField = {
  key: string;
  label: string;
  type: 'text' | 'email' | 'tel' | 'select';
  optional?: boolean;
  bankType?: string;
  options?: Array<{ value: string; label: string; placeholder?: string }>;
  placeholder?: string;
  placeholderFrom?: string;
  hint?: string;
};
export type Action =
  | { kind: 'collect_information'; fields: RequiredField[] }
  | { kind: 'hosted_redirect'; purpose: 'verification' | 'payment'; url: string; expiresAt: string | null }
  | { kind: 'qr_payment'; payload: string; amount: Decimal; currency: string; expiresAt: string | null }
  | {
      kind: 'bank_transfer';
      amount: Decimal;
      currency: string;
      details: Array<{ label: string; value: string }>;
      reference: string | null;
      expiresAt: string | null;
    }
  | { kind: 'user_ready'; purpose: 'create_order' | 'withdrawal_payment' | 'onramp_claim' }
  | {
      kind: 'verification';
      steps: Array<{
        stepId: string;
        purpose: 'verification' | 'terms';
        status: 'required' | 'awaiting_provider' | 'completed';
        url: string | null;
        instructions: string;
      }>;
      order: 'parallel' | 'sequential';
    }
  | {
      kind: 'chain_transfer';
      chain: RampChain;
      network: string;
      asset: Route['asset'];
      amount: Decimal;
      destination: string;
      memo: { type: string; value: string } | null;
    }
  | {
      kind: 'sign_transaction';
      purpose: 'authentication' | 'withdrawal_payment' | 'onramp_claim';
      chain: RampChain;
      network: string;
      challengeRef: string;
      payload: { encoding: string; value: string };
      expiresAt: string;
    }
  | { kind: 'wait'; reason: 'verification_pending' | 'provider_processing' | 'settlement_verification' | 'reconciliation' };
export type PublicAction = Action & { actionId: string };
export type QuoteRequest = { route: Route; amount: { value: Decimal; denomination: 'fiat' | 'crypto' }; user: UserContext };
export type Offer = {
  providerQuoteRef: string | null;
  providerExpiresAt: string | null;
  terms: LifecycleTerms;
  requiredFields: RequiredField[];
  availableAmount: Decimal | null;
  kind?: 'firm' | 'indicative';
};
export type OperationIdentity = {
  operationId: string;
  idempotencyKey: string;
  transactionId: string;
  providerOrderRef: string | null;
};
export type AdapterErrorCode =
  | 'INVALID_INPUT'
  | 'UNSUPPORTED_ROUTE'
  | 'QUOTE_CHANGED'
  | 'QUOTE_EXPIRED'
  | 'VERIFICATION_REQUIRED'
  | 'RATE_LIMITED'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_REJECTED'
  | 'AUTH_CONFIGURATION_ERROR'
  | 'OUTCOME_UNKNOWN';
export class AdapterError extends Error {
  constructor(
    readonly code: AdapterErrorCode,
    readonly recovery: 'correct_input' | 'requote' | 'retry_read' | 'reconcile' | 'operator',
    readonly status?: number,
  ) {
    super(code);
  }
}
export type Payment = {
  chain: RampChain;
  network: string;
  assetCode: string;
  identifier: string | null;
  precision?: number;
  amount: Decimal;
  destination: string;
  memo: string | { type: string; value: string } | null;
  notifyEndpoint: string | null;
};
export type ProviderFact =
  | { kind: 'provider_processing' }
  | { kind: 'fiat_receipt_reported' | 'fiat_payout_reported'; reference: string | null }
  | { kind: 'chain_transaction_reported'; chain: RampChain; hash: string; leg: 'source' | 'intermediate' | 'destination' }
  | { kind: 'provider_rejection_reported' };
export type Observation = {
  providerOrderRef: string | null;
  identity: string;
  rawStatus: string; // Audit only; shared orchestration never switches on this.
  facts: ProviderFact[];
  proposedActions: Action[];
  verificationRequired: boolean;
  payment: Payment | null;
};
export type Submission =
  | { outcome: 'accepted'; observation: Observation }
  | { outcome: 'rejected'; error: AdapterError }
  | { outcome: 'unknown'; error: AdapterError; providerOrderRef?: string };
export type Capabilities = {
  routes: Route[];
  callbacks: boolean;
  polling: boolean;
  providerIdempotency: boolean;
  operationLookup: boolean;
  fiatPayoutEvidence: boolean;
  keyRetentionSeconds: number | null;
  refunds?: 'api' | 'manual' | 'unsupported';
  continuations?: Array<'user_ready' | 'signed_payload' | 'funding_verified'>;
};
export interface RampAdapter {
  readonly adapterId: string;
  capabilities(user: UserContext): Promise<Capabilities>;
  quote(input: QuoteRequest): Promise<Offer>;
  create(input: {
    operation: OperationIdentity;
    user: UserContext;
    route: Route;
    offer: Offer;
    payee: Record<string, string>;
  }): Promise<Submission>;
  status(input: { providerOrderRef: string; user: UserContext }): Promise<Observation>;
  validateAction?(input: {
    action: Action;
    user: UserContext;
    route: Route;
    offer: Offer;
    signedPayload?: string;
  }): Promise<void>;
  prepare?(input: { user: UserContext; route: Route; offer: Offer }): Promise<Action | null>;
  mapInputs?(input: Record<string, unknown>): Record<string, string>;
  quotePolicy?(input: { route: Route; saved: Offer; refreshed: Offer }): boolean;
  continue?(input: {
    operation: OperationIdentity;
    action: PublicAction;
    user: UserContext;
    signedPayload?: string;
    fields?: Record<string, string>;
  }): Promise<Submission>;
  verifyAndNormalizeCallback?(input: {
    rawBody: Uint8Array;
    headers: Record<string, string>;
    user: UserContext;
  }): Promise<Observation>;
  refund?(input: {
    operation: OperationIdentity;
    user: UserContext;
    authorizationRef: string;
    amount: Decimal;
    currency: string;
  }): Promise<Submission>;
  notify?(input: { providerOrderRef: string; user: UserContext; hash: string; endpoint: string }): Promise<void>;
  reconcile(input: { operation: OperationIdentity; user: UserContext }): Promise<Observation | null>;
}
```

`bootstrap.ts` registers factories from stable adapter IDs; server-only dependencies include authenticated HTTP client, configuration revision, timeout, clock and redacting logger. Wallet, chain and independent receipt readers have separate registries. The reusable adapter factory, reference fixtures and initial contract check live in the platform's `src/ramps/providers/template` and `src/ramps/testing`; DEV-16 extends the harness.

Pollar reserves operation identity before every write. Legacy operations retain their exact old keys or finish on the old path; Bridge virtual-account and bank-account keys remain separate resource identities. No uncertain write is repeated automatically, including after provider key retention expires. Reconciliation cannot use an empty search as proof of non-submission.

Verification is a saved group of parallel/sequential steps with optional links; readiness does not establish payment evidence. Each authentication/trustline/claim step reserves its own saved action identity. Provider signing actions require payload/challenge validation before display. Public action changes advance transaction version; both widgets ignore older responses and sign only after explicit interaction.

The public view adds exact terms, route, lifecycle state, transaction version, reconciliation flag, next action, verified milestones and last successful provider check. Compatibility fields remain projected from saved state; no legacy milestones are fabricated. `/complete` retains its empty body, `/signature` retains Stellar compatibility, and `/continue` accepts `{ actionId, transactionVersion, signedPayload?, fields? }`.

## 8. Worked interface and payload examples

All identifiers, provider names, payment payloads, addresses, and financial terms here are fixtures. Angle-bracket values are placeholders, not usable addresses, QR codes, or signatures. No example makes a real payment.

### Example 1: one adapter quote and its frontend summary

An internal `quote` call selects the fictional Fixture QR adapter, a configured Bolivia/BOB/deposit/Stellar-USDC route, and `amount = { value: "70.00", denomination: "fiat" }` with authenticated user/wallet context. At 12:00 UTC the adapter returns:

```json
{
  "providerQuoteRef": "fixture-quote-101",
  "requiredFields": [],
  "kind": "firm",
  "terms": {
    "fiatAmount": "70.00",
    "cryptoAmount": "10.0000000",
    "fiatCurrency": "BOB",
    "assetCode": "USDC",
    "assetIssuer": "<testnet USDC issuer>",
    "feeAmount": "1.00",
    "feeCurrency": "BOB",
    "assetChain": "STELLAR"
  },
  "providerExpiresAt": "2026-09-29T12:02:00Z",
  "availableAmount": null
}
```

Pollar stores owned quote `q_demo_101`, binds the selected wallet and route, and sets its public expiry to 12:15; provider expiry at 12:02 remains informational. The user sees **“Pay 70.00 BOB · Receive 10 USDC · Includes 1.00 BOB fee · Estimated minutes.”** Pollar does not add the fee again. Firm/indicative remains internal. At creation the backend refreshes or resolves the provider offer using the saved inputs; changes outside route authorization require fresh acceptance before any order/payment write.

For the public quote list, Pollar projects this offer into the existing `SDK_RAMPS_QUOTES` envelope and the additive DEV-6 terms. Full compatible quote/create examples remain in the [ADR's API examples](../adr/0001-ramp-api-and-lifecycle.md). The adapter itself never issues the public quote ID.

### Example 2: QR instructions in a transaction response

The user accepts `q_demo_101`. The backend first reserves `tx_demo_101` and operation `op_create_101`, then dispatches one create. After the provider order is accepted and instructions are recorded, an illustrative **response excerpt** is:

```json
{
  "code": "SDK_RAMPS_TX_STATUS",
  "success": true,
  "content": {
    "txId": "tx_demo_101",
    "direction": "onramp",
    "status": "pending",
    "lifecycleState": "awaiting_payment",
    "transactionVersion": 2,
    "reconciliationRequired": false,
    "nextAction": {
      "actionId": "act_pay_101",
      "kind": "qr_payment",
      "payload": "<exact provider QR payload>",
      "amount": "70.00",
      "currency": "BOB",
      "expiresAt": "2026-09-29T12:10:00Z"
    },
    "milestones": [],
    "lastCheckedAt": "2026-09-29T12:00:15Z",
    "provider": "Fixture QR"
  }
}
```

Existing legacy response fields are omitted only to focus the excerpt; they remain in an actual compatible response. The payment-instruction deadline is separate from the quote-acceptance deadline: the public quote can be accepted before 12:15 after safe provider refresh; in this example the order was accepted at 12:00 and its provider instructions remain valid until 12:10. Expiring instructions still do not prove whether funds arrived.

The frontend selects the QR component using `nextAction.kind`, renders the exact payload and amount, and polls the same transaction. It does not call create again to refresh progress. A second adapter returning `bank_transfer` selects the bank-instructions component without changing the quote or lifecycle flow.

### Example 3: a provider report is not a completion command

Later, authenticated provider polling returns:

```json
{
  "providerOrderRef": "fixture-order-101",
  "rawStatus": "SUCCESS",
  "facts": [
    {
      "kind": "fiat_receipt_reported",
      "reference": "fixture-receipt-101"
    },
    {
      "kind": "chain_transaction_reported",
      "chain": "STELLAR",
      "leg": "destination",
      "hash": "<reported transaction hash>"
    }
  ],
  "proposedActions": [],
  "identity": "fixture-event-103",
  "verificationRequired": false,
  "payment": {
    "chain": "STELLAR",
    "network": "testnet",
    "assetCode": "USDC",
    "identifier": "<testnet USDC issuer>",
    "precision": 7,
    "amount": "10.0000000",
    "destination": "<authenticated user wallet>",
    "memo": null,
    "notifyEndpoint": null
  }
}
```

The backend authenticates and links the receipt, checks the accepted terms, and independently verifies the reported Stellar transaction. A wrong issuer, wrong destination, unsuccessful transaction, or partial amount leads to reconciliation rather than completion. Only after matching obligations does DEV-7 permit `completed`. The frontend then shows verified `fiat_received` and `destination_chain_verified` milestones and clears the payment action.

### Example 4: withdrawal, signing, and bank payout

For a fictional 10-USDC withdrawal paying 50 BRL, the frontend collects a PIX destination and shows both exact totals before confirmation. A proposed saved action is:

```json
{
  "actionId": "act_sign_202",
  "kind": "sign_transaction",
  "purpose": "withdrawal_payment",
  "network": "testnet",
  "challengeRef": "challenge_202",
  "chain": "STELLAR",
  "payload": {
    "encoding": "xdr",
    "value": "<server-validated payment XDR>"
  },
  "expiresAt": "2026-09-29T13:02:00Z"
}
```

The wallet-authorization component describes the debit and requests signing. The existing signature endpoint remains a compatibility entrypoint; the additive `/transaction/{txId}/continue` binds action ID and transaction version; Pollar resolves the saved action/challenge and checks the signed payload's binding. Authentication and onramp claim continuations receive separate durable step keys; withdrawal payment retains its own saved payment key. A client cannot change the accepted payout or assert that funding has been verified.

| Moment                                                  | Backend snapshot                                   | Frontend                                    |
| ------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------- |
| Signature requested                                     | `awaiting_payment`; saved signing action           | “Authorize the 10 USDC transfer.”           |
| Chain submission underway                               | `settling_onchain`; wait action                    | “Confirming your USDC transfer.”            |
| Stellar source leg verified, provider processing payout | `processing`; `source_chain_verified` milestone    | “USDC received. Bank payout is processing.” |
| Exact fiat payout also verified                         | `completed`; source-chain and fiat-paid milestones | Receipt for the 50 BRL payout               |

This ordering is different from a deposit. The generic frontend renders the current action and verified milestones rather than imposing deposit order on withdrawals.

### Example 5: lost response and resume without a second payment

The provider may accept `op_create_303` while its response times out. The adapter returns:

```json
{
  "outcome": "unknown",
  "error": {
    "code": "OUTCOME_UNKNOWN",
    "recovery": "reconcile"
  }
}
```

This internal result is not exposed verbatim. Pollar retains the last supported lifecycle state, sets `reconciliationRequired`, and exposes a saved `wait` action with reason `reconciliation`. The frontend shows **“We're checking your transfer. You don't need to start again.”** Returning on another device loads `tx_demo_303` after ownership authorization.

The backend invokes `reconcile` with the original operation identity. If it locates the accepted order, it stores that reference and continues the same transaction. If evidence remains inconclusive, the transaction stays under reconciliation for further checks/operator resolution. It does not regenerate the key or create another order merely because time passed.

## 9. Review checkpoint and open decisions

Backend, frontend, and operations reviewers should walk through one deposit, one withdrawal, and one uncertain payment using this design. Record actual feedback and unresolved decisions before treating the design as accepted.

| Review     | Focus                                                                             | Status  | Recorded feedback |
| ---------- | --------------------------------------------------------------------------------- | ------- | ----------------- |
| Backend    | Adapter boundaries, durable operations, and evidence handoff to DEV-7             | Pending | None recorded     |
| Frontend   | Reusable actions, amount presentation, resume behavior, and uncertainty messaging | Pending | None recorded     |
| Operations | Evidence visibility, masking, reconciliation, and authorized recovery actions     | Pending | None recorded     |

Before implementation planning is finalized, assign owners/tickets for frontend and operations screens, validate provider capabilities against the audit, and review the proposed interfaces and payloads in sections 7–8, including the full API compatibility projection. Polling cadence, final UI layouts/copy, and operational permissions belong to those implementation specifications. The concrete examples above are proposals for review, not evidence of agreement or deployed behavior.

The later DEV-8 resolutions replace the original fixed Stellar/USDC types and shortened-expiry proposal. The ADR has been aligned with those resolutions; its compatibility and evidence rules still apply. The [core package reference](../../packages/core/README.md#ramps-sep-24) continues to describe the existing SDK interface.

## Implementation and enrollment notes (2026-10-06)

The local shared framework connects the platform HTTP API to `@pollar/core`, React and React Native. Abroad is its first adapter; other providers remain on their existing handlers. The reference provider demonstrates BOB/PEN/MXN, both directions, a Polygon fixture and twelve-decimal native assets through registration. Real execution initially includes Stellar only.

Before migration: pin current behavior in fixtures, implement adapter, connect background reconciliation and independent settlement checks, test ownership/cutover, then enroll each provider/direction. Anclap expired SEP-10 authentication requires authorized custodial renewal or a saved external signing action resuming the same anchor order. External routes need unattended observation or a documented recovery/escalation process before enrollment. No replacement order or failure/refund is inferred from token expiry.

Rollback stops new enrollment while preserving accepted operation keys, terms, payloads, ownership and reconciliation. Production Abroad fiat payout evidence and Abroad deposit support remain acceptance gaps. The platform `RAMP-FRAMEWORK.md` describes registration, migrations, tests and release order.

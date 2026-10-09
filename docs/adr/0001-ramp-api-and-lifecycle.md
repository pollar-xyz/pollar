# ADR 0001: Ramp API, adapter contract, and transaction lifecycle

- **Status:** Proposed — not a description of released functionality.
- **Date:** 2026-09-28. **Owner:** Developer A (DEV-6 assignee: Addis).
- **Reviewers:** Developer B and DevOps; reviews pending.
- **Decision inputs:** completed DEV-5 audit, informed by DEV-3 product requirements. Early findings support drafting; final agreement requires the completed audit.
- **Checkpoint:** 2026-10-02; estimate: three total focused person-days.
- **Tracking:** [DEV-6](https://plane.pollar.dev/pollar-dev/browse/DEV-6/).

## 1. Context and implementation boundary

Applications need one integration for local currencies and supported tokens in both directions. Asset/chain identifiers are open strings; native assets may have no issuer, contract or mint identifier. The initial providers are Anclap in Argentina, Abroad in Brazil, and Stereum in Bolivia. Future providers must fit the same contract without branches in API handlers.

Inspected local baselines: public SDK `46f62ac`, platform `1a52525`. These observations do not establish deployed behavior, provider certification, or completion of DEV-5. The platform already has ramp routes, provider services, normalized instructions, quote persistence, and four transaction statuses. Reuse them where suitable.

| Observed baseline                                                                                                                                          | Decision in this ADR                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public `status` is `pending`, `processing`, `completed`, or `failed`. SDK polling stops on the last two.                                                   | Preserve this field; add canonical lifecycle and evidence without changing its enum.                                                                                                   |
| The matching backend schema now declares quote expiry/amount fields, generic routes/actions and `txHash`/`chain`; DEV-10 regenerates the local SDK schema. | Keep generated SDK types aligned with the deployed backend; backend/database support ships before SDK/UI.                                                                              |
| Quotes use numeric amounts, a 15-minute Pollar lifetime, and provider-dependent refresh behavior.                                                          | Add exact terms and explicit quote validity; apply the declared route policy before final terms are frozen.                                                                            |
| Quote-based replay exists, but quote rows lack application/user ownership and transaction-per-quote uniqueness.                                            | Bind ownership, atomically reserve one transaction, and record submission outcomes durably.                                                                                            |
| Provider dispatch and reconciliation are implemented in provider-specific service branches.                                                                | Introduce a registry and common adapter boundary; move progression to shared orchestration.                                                                                            |
| Anclap code supports same-asset SEP-24 flows; Abroad declares withdrawals only; Stereum includes intermediary-chain bridge legs.                           | Verify each declared direction and its agreed final asset/chain settlement. Same-asset routes are supported; an intermediary hash or code presence alone never establishes completion. |

The local DEV-10 implementation now supplies the common runtime, registry, additive API/schema, database support and SDK/UI consumers. Provider-specific migrations, production evidence readers, deployment and application event delivery remain separate gates. Sections describing application webhooks and client idempotency headers remain future delivery requirements.

## 2. Public API and quote contract

### Existing routes and compatibility

Paths below are relative to the existing SDK API base. Keep application API-key and user authentication, response envelopes, route names, and existing helper endpoints. The server resolves wallet ownership; a client `walletAddress` cannot override it.

| Operation               | Existing endpoint                          | Meaning under this contract                                                                                |
| ----------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Quote                   | `GET /ramps/quote`                         | List enabled, eligible provider offers for the authenticated application/user/network.                     |
| Create deposit          | `POST /ramps/onramp`                       | Reserve one transaction from a valid deposit quote, then start its workflow.                               |
| Create withdrawal       | `POST /ramps/offramp`                      | Reserve one transaction from a valid withdrawal quote, including validated payout details.                 |
| Status                  | `GET /ramps/transaction/{txId}`            | Read that durable transaction; never create another order or submit funds. Background workers progress it. |
| External signature      | `POST /ramps/transaction/{txId}/signature` | Resume the same operation with the existing `sep10` or `withdraw_payment` action.                          |
| Withdrawal continuation | `POST /ramps/transaction/{txId}/complete`  | Resume the existing withdrawal; the name does not establish end-to-end completion.                         |

Success remains `{ "code": "SDK_RAMPS_…", "success": true, "content": … }`, with the existing operation-specific codes and HTTP 200. SDK wrappers return `content`, not the envelope. Errors retain `success: false` and `code`. The new error fields described below are additive. Existing `kycUrl`, `kycRequired`, `tosUrl`, `pendingSignature`, and `depositInstructions` remain usable; none proves receipt or settlement.

### Eligibility, exact terms, and expiration

- Eligibility is the intersection of implemented adapter capabilities, verified provider availability, application configuration, environment/network, country, fiat currency, direction, rail, settlement asset, and route limits. Disabled routes cannot create new orders, but disabling a route must not stop reconciliation of existing transactions.
- Preserve `amount`, `currency`, and their route-specific legacy meaning. For the REST examples below they express fiat paid on deposit or fiat received on withdrawal. Existing same-asset anchor inputs are not silently reinterpreted as USDC quotes. Add `amountExact` as an optional exact representation of the same requested amount; if both forms are supplied they must agree at the route's supported precision. Legacy `amount` remains required during compatibility rollout.
- `GET /ramps/routes` returns executable route identities and typed provider capabilities. Quotes add `route` and exact `terms`; `provider` remains a display name. A route identifies country, fiat currency, direction, rail, nullable token identity, chain/network and precision. Firm/indicative classification remains internal.
- `terms` contains `fiatCurrency`, `assetCode`, `assetIssuer`, `assetChain`, `fiatAmount`, `cryptoAmount`, `feeAmount` and `feeCurrency`. Amounts are exact decimal strings. `assetIssuer` is a nullable token identifier: Stellar issuer, chain-specific token reference, or null for native assets. Route/action metadata supplies network and precision. Currency, asset, chain and rail identifiers are open strings.
- `terms.fiatAmount` is the total fiat paid/received; `terms.cryptoAmount` is the total crypto credited/debited, according to direction. `feeAmount` is a separately disclosed component already accounted for in those totals, never an additional client-side charge. The numeric compatibility `rate` is informational, computed from the saved totals. Do not reconstruct totals from the rate. Unknown fee breakdowns make an offer indicative; do not invent zero fees.
- Preserve numeric quote fields (`fee`, `rate`, `fiatAmount`, `cryptoAmount`, and limits) as compatibility projections. In particular, legacy `cryptoAmount` remains null on deposits; the new `terms.cryptoAmount` expresses the credit. Use decimal/integer arithmetic and exact storage. Totals must respect the declared route/provider precision; Stellar execution supports its seven-decimal amounts; reject unsupported precision instead of silently rounding an accepted payment.
- Snapshot ownership, route, resolved wallet, requested amount, exact accepted terms, and expiry on the quote. Never trust a route ID or altered amount from create to replace this snapshot. New quotes must not be shared across users or applications.
- Every public quote expires at creation + 15 minutes. `providerExpiresAt` is nullable and informational. Firm/indicative is internal; shorter provider validity never shortens the user countdown. `estimatedTime` remains a display estimate, not a settlement guarantee.
- Reject unreserved creation at or after public expiry. Refresh or resolve the provider offer using saved user/wallet/route/amount inputs before dispatch. Apply an explicit route/direction policy; no global percentage is invented. Abroad requires unchanged totals. Stereum retains its existing crypto-fixed behavior on the legacy path until its migration pins the actual tolerance in tests. Changes outside authorization return a compatible QUOTE_CHANGED response and require fresh acceptance through the existing quote/create flow. Save final exact terms before dispatch; a reserved operation is never repriced. Providers without pre-quotes keep their published flow without a new mandatory accept_quote action.
- Isolate provider quote failures. Return surviving offers; add optional `unavailableRoutes` entries containing only `providerId`, `routeId`, and canonical error code. No eligible capability yields an empty list; eligible providers all failing yields `SDK_RAMPS_PROVIDER_UNAVAILABLE`, rather than presenting an outage as unsupported geography.

### Idempotency and ambiguous outcomes

Accept an optional `Idempotency-Key` header (1–128 printable ASCII characters). Scope it by application ID, user ID, environment/network, and operation (`onramp`, `offramp`, `signature`, or `complete`); continuation operations also include transaction ID and signature action. Legacy creates derive their key from quote ID; legacy continuations derive it from transaction/action and the server-issued challenge or settlement-leg identity.

Persist a canonical request fingerprint, including quote, resolved wallet, direction, amounts, and payout/collected fields. Normalize JSON key order and equivalent decimal representations, not meaningful bank/QR contents. Store a keyed digest of sensitive fields rather than those fields in logs. Same scoped key and fingerprint returns the same transaction's current snapshot. A changed fingerprint returns 409. A different key with an already-reserved quote must resolve to the same transaction when its fingerprint matches, or conflict otherwise. Authorize ownership before looking up replay results.

Inside one database transaction, reserve the quote, enforce transaction-per-quote and scoped-key uniqueness, persist `created`, and enqueue work. Only then call a provider. Concurrent requests converge on that reservation. Check for a matching replay before expiry checks, so an accepted operation remains retrievable after its quote expires. Unreserved expired quotes cannot start operations.

Record a stable operation/leg key and submission intent before each money-moving request. Propagate provider idempotency when available. After timeout/crash, query using the persisted reference/key and reconcile chain evidence. Retry a write only when provider deduplication guarantees the same operation or authoritative evidence proves the first was never accepted. Otherwise hold for reconciliation/operator resolution. Lease expiry alone is not permission to send again. Resume external signing from the same transaction with validated challenge/XDR binding; an expired authentication challenge may be refreshed without repeating settlement.

Retain key/fingerprint/reservation records for the transaction's retained lifetime, including failed and refunded transactions. Data archiving must preserve a non-sensitive deduplication tombstone; time-based key expiry must never permit another charge. Persist validation/repricing rejections against a supplied key as well; a changed request uses a new key and, for changed terms, a new quote.

### Error vocabulary

`retryable` means the caller can safely retry the **same request/key**, not that a provider write will be repeated. Add optional `retryable`, `txId`, and `details` with allowlisted public values. Never expose credentials, bank details, or raw upstream errors. Existing authentication/rate-limit errors remain unchanged.

| Code                                                                                                                                         | HTTP | Client action                                                                                                | Origin                       |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| `VALIDATION_ERROR`                                                                                                                           | 400  | Correct invalid fields; no submission.                                                                       | Existing                     |
| `FORBIDDEN`                                                                                                                                  | 403  | Stop; ownership check failed.                                                                                | Existing                     |
| `SDK_RAMPS_QUOTE_NOT_FOUND`, `SDK_RAMPS_TX_NOT_FOUND`, `SDK_RAMPS_PROVIDER_NOT_FOUND`                                                        | 404  | Check the scoped identifier; do not infer a payment failed.                                                  | Existing                     |
| `SDK_RAMPS_QUOTE_EXPIRED`                                                                                                                    | 400  | Request and accept a new quote, unless replay resolves an existing transaction.                              | Existing                     |
| `SDK_RAMPS_AMOUNT_OUT_OF_RANGE`, `SDK_RAMPS_INSUFFICIENT_BALANCE`, `SDK_RAMPS_ASSET_NOT_ENABLED`, `SDK_RAMPS_WALLET_UNSUPPORTED`             | 400  | Correct funding/route/input; existing transaction may still require resolution.                              | Existing                     |
| `SDK_RAMPS_KYC_REQUIRED`                                                                                                                     | 409  | Complete the separate verification flow; never infer funds moved.                                            | Existing                     |
| `SDK_RAMPS_PROVIDER_NOT_CONFIGURED`                                                                                                          | 424  | Route requires operator configuration.                                                                       | Existing                     |
| `SDK_RAMPS_ONCHAIN_SUBMIT_FAILED`                                                                                                            | 422  | Inspect the recorded rejected leg; shared recovery decides whether a new attempt is safe.                    | Existing                     |
| `SDK_RAMPS_ANCHOR_ERROR`, `SDK_RAMPS_BRIDGE_ERROR`, `SDK_RAMPS_ETHERFUSE_ERROR`, `SDK_RAMPS_PAGFINANCE_ERROR`, `SDK_RAMPS_MESADEPAGOS_ERROR` | 502  | Preserve for existing integrations; never blanket-retry writes.                                              | Existing compatibility codes |
| `SDK_RAMPS_IDEMPOTENCY_CONFLICT`, `SDK_RAMPS_QUOTE_MISMATCH`                                                                                 | 409  | Same key/quote cannot authorize changed inputs.                                                              | Proposed                     |
| `SDK_RAMPS_QUOTE_CHANGED`, `SDK_RAMPS_QUOTE_NOT_FIRM`                                                                                        | 409  | Fetch, display, and explicitly accept a fresh firm quote; no funds moved.                                    | Proposed                     |
| `SDK_RAMPS_ROUTE_UNAVAILABLE`                                                                                                                | 409  | Request another route; resolve any existing transaction first.                                               | Proposed                     |
| `SDK_RAMPS_PROVIDER_UNAVAILABLE`                                                                                                             | 503  | Retry safe reads with backoff; no provider write has started for this rejection.                             | Proposed                     |
| `SDK_RAMPS_OUTCOME_UNKNOWN`                                                                                                                  | 503  | `retryable: true`, `txId` required; poll or replay the same request/key, never start a replacement transfer. | Proposed                     |
| `INTERNAL_SERVER_ERROR`                                                                                                                      | 500  | Outcome may be unknown; retry only with the same identity or inspect status.                                 | Existing                     |

After durable acceptance, prefer HTTP 200 with the transaction snapshot and additive `reconciliationRequired: true` for unknown outcomes; retain the last evidence-supported state. The explicit outcome-unknown error is for cases where an accepted operation cannot return its normal snapshot. Normalize new adapter errors internally; legacy routes retain existing codes during provider migration.

## 3. Generic adapter boundary

Use a typed interface and capability composition. The orchestrator owns durable identity, idempotency, allowed transitions, scheduling, settlement verification, and outbox delivery. Adapters translate provider protocols and return observations/actions; they cannot directly mark a transaction completed, write shared lifecycle tables, or bypass settlement verification.

| Adapter operation                         | Input → normalized output                                                                                                                               | Side-effect boundary                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `capabilities`                            | Configuration/environment → supported corridor tuples, instruction types, quote guarantees, callback/poll/refund support                                | No money movement; discovery may read provider metadata.                          |
| `quote`                                   | Authorized corridor + exact requested amount → firm/indicative offer with terms, expiry, required fields                                                | May create an upstream quote; cannot debit or create a payment order.             |
| `create`                                  | Durable Pollar transaction ID, accepted quote, operation key, validated collection/payout data → provider reference, instructions/next action, evidence | Order creation; only invoked through the durable orchestrator operation.          |
| `status`                                  | Provider reference + scoped context → observation/evidence                                                                                              | Authenticated read; no order creation or payment.                                 |
| `reconcile`                               | Persisted operation identity/references + evidence → resolved or still-unknown observation                                                              | Read-only recovery, including lookup after a lost create response.                |
| `verifyAndNormalizeCallback` (capability) | Original body bytes + headers + injected verification config → authenticated normalized event                                                           | No persistence or money movement. Reject unverifiable callbacks.                  |
| `refund` (capability)                     | Approved refund operation, amount, original reference, stable key → refund reference/evidence                                                           | Explicit money-moving operation; never automatically called because of a timeout. |

Capabilities explicitly include country, fiat, direction, rail, asset code/issuer, settlement chain/network, normalized instruction kinds, whether callbacks/polling are available, provider idempotency support, and refund mode (`api`, `manual`, or `unsupported`). Unsupported methods are absent and guarded by capabilities. Public transaction identity always stays Pollar's; provider references are evidence, not public state.

Normalized observations carry provider ID, provider event/reference ID, observed/received timestamps, raw-status label, normalized event kind, and evidence references. Candidate progress from an adapter is validated by the shared lifecycle engine. Raw HTTP bodies remain inside the adapter boundary; retain only minimized, redacted audit evidence. Configuration/secret lookup and HTTP clients are injected. Default request timeout is 10 seconds; providers may configure a documented override. Retry reads on transient failures with bounded backoff; write retries obey section 2 regardless of transport defaults.

**Layout for DEV-8 in the existing platform repository:** `apps/sdk-api/src/ramps/` contains `contracts.ts`, `schemas.ts`, `registry.ts`, `orchestrator.ts`, `lifecycle.ts`, and `errors.ts`. `providers/<adapter-id>/` contains `client.ts`, `adapter.ts`, `mapping.ts`, `config.ts`, and `fixtures/`. Common contract cases and the fixture-backed reference adapter live in `apps/sdk-api/tests/ramps/`. Database access stays in the existing `packages/db-main` repository layer. Workers reach shared progression through the existing internal-service boundary; they must not import an HTTP handler. No new microservice/package is required by this decision.

Register implementations by stable adapter ID; resolve provider record ID to that adapter and injected configuration. Multiple SEP-24 providers can share an adapter implementation. A new provider adds a registration, configuration, and capability data, not branches to quote/create/status handlers. DEV-8 supplies a skeleton, a fixture-backed reference, and an onboarding/test guide; DEV-9/10/11 migrate the real adapters.

| Provider | Differences to keep inside its adapter                                                                                                     | Evidence/gap to retain                                                                                                                                                                                                         |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Anclap   | SEP-10 authentication, SEP-24 hosted interaction, existing external/custodial signature continuation; SEP-12 data exchange where supported | Verify same-asset SEP-24 routes and their exact fiat receipt/payout and agreed token settlement. Expired SEP-10 external authentication requires user re-signing and a documented observation/recovery gate before enrollment. |
| Abroad   | REST quotes/order references, payout inputs, Stellar funding destination and memo matching                                                 | BRL withdrawal is represented locally; deposit remains an unresolved requirement. Verify payout and matched Stellar funding separately.                                                                                        |
| Stereum  | BOB bank QR/payout instructions and intermediary swap/bridge steps                                                                         | Record intermediary hashes separately. Deposit requires final Stellar USDC delivery; withdrawal requires matched Stellar source leg and confirmed BOB payout.                                                                  |

Pag Finance, Etherfuse, Dynerox, and Mesa de Pagos will use the same capability model. Existing non-Stellar paths do not satisfy this project's Stellar settlement requirement. This ADR neither certifies those routes nor expands the initial implementation scope.

## 4. Lifecycle and evidence specification

Public additive fields on create/status responses are `providerId`, `lifecycleState` (seven states or null for unresolved legacy records), `transactionVersion` (monotonically increasing integer, starting at 1), and `reconciliationRequired` (boolean). Add optional `pendingSignature` to status using the existing create-response shape so a lost create response can resume external signing. Preserve provider references and `stellarTxHash`; `txHash` with `chain` can describe another leg but never substitutes for required Stellar evidence. KYC decisions and tiers 0/1/2 remain separate; waiting for identity/signature action does not introduce another ramp state.

| Canonical state    | Entry meaning                                                                                              | Legacy `status` |
| ------------------ | ---------------------------------------------------------------------------------------------------------- | --------------- |
| `created`          | Pollar accepted and durably reserved the transaction; source payment is not yet confirmed.                 | `pending`       |
| `awaiting_payment` | Actionable funding instructions exist and required source fiat/crypto is outstanding.                      | `pending`       |
| `processing`       | Provider conversion/payment operations are underway, including fiat payout after a withdrawal's chain leg. | `processing`    |
| `settling_onchain` | The required chain leg is underway and not yet verified as settled.                                        | `processing`    |
| `completed`        | Every required fiat and Stellar obligation is verified.                                                    | `completed`     |
| `failed`           | A confirmed unsuccessful outcome requires resolution; does not assert funds were returned.                 | `failed`        |
| `refunded`         | The complete required return of funds is verified, including explicitly disclosed refund fees.             | `failed`        |

**Evidence rules:** an authenticated provider observation establishes a claim about fiat receipt/payout; an independent chain read establishes settlement. Verify chain/network, successful final ledger inclusion, operation, asset issuer/code, amount, destination, and memo/reference where required. Persist provider receipt/reference alongside the matching Stellar transaction and operation index. Multiple/intermediary legs remain distinct. Do not match on amount alone or accept a broadcast hash as settlement. Partial/mismatched/late evidence sets `reconciliationRequired`; it cannot independently establish completion or full refund.

### Allowed transitions

`active` below means `created`, `awaiting_payment`, `processing`, or `settling_onchain`. Only listed moves are legal. A provider profile may remove unsupported paths; it cannot weaken evidence requirements. The lifecycle engine is the sole committing actor; “actor” identifies the trusted trigger. Missing prerequisites quarantine the observation for reconciliation instead of forcing a transition or dropping evidence.

| From → to                                                          | Direction/provider applicability                 | Actor and required evidence                                                                                                                             | Invalid or stale handling                                                                                        |
| ------------------------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| none → `created`                                                   | Both; all                                        | Create handler: authorized quote reservation and operation identity committed before submission                                                         | Uniqueness conflict resolves to replay; changed fingerprint rejects.                                             |
| `created` → `awaiting_payment`                                     | Both; any route waiting for funds                | Orchestrator: valid instructions/required amount, source funds not confirmed                                                                            | Missing instructions or already-funded stale observation cannot cause this move.                                 |
| `created` / `awaiting_payment` → `processing`                      | Both; all capable routes                         | Verified callback or authenticated poll: provider accepted work and required prerequisites for that phase are satisfied                                 | An unverified payment claim or older pending event cannot advance/regress state.                                 |
| `created` / `awaiting_payment` / `processing` → `settling_onchain` | Both; all with a required Stellar leg            | Settlement worker/verified observation: durable Stellar leg intent or provider settlement reference and required source/prior-leg evidence              | No second submit after unknown outcome; retain state and reconcile.                                              |
| `settling_onchain` → `processing`                                  | Withdrawal; fiat payout follows chain settlement | Reconciler: required Stellar leg verified, provider payout still underway                                                                               | This is phase progression, not a generic backward move; forbidden for stale deposit events.                      |
| any active → `completed`                                           | Both; all                                        | Reconciler: complete matched fiat + declared chain evidence, including payout for withdrawal                                                            | Partial evidence/hash alone rejected. Skipped observed stages are allowed without fabricated historical entries. |
| any active → `failed`                                              | Both; all                                        | Verified provider rejection or reconciler: definitive unsuccessful outcome, with funds-at-risk/remaining obligations recorded                           | Timeout, local quote expiry after acceptance, or unknown chain outcome cannot establish failure.                 |
| any active / `failed` → `refunded`                                 | Both; supported refund/recovery paths            | Reconciler: full required return verified by fiat receipt or correct chain return and outstanding obligations resolved                                  | Refund requested, partial return, or unknown return remains reconciliation work.                                 |
| `failed` → `processing` / `settling_onchain` / `completed`         | Both; audited recovery only                      | Authorized recovery worker/operator: new verified evidence, correction reason, original operation references; completion still requires all obligations | No blind restart. Ordinary stale callbacks cannot reopen a failed transaction.                                   |
| `completed` → `refunded`                                           | Both; confirmed post-completion reversal         | Reconciler: linked authorized reversal/refund operation and verified complete return                                                                    | An unrelated transfer or reversal request is not evidence.                                                       |
| same state → same state                                            | Both; all                                        | Evidence collector: genuinely new evidence attached; increment version if durable public/evidence state changes                                         | Exact duplicate is a no-op: no version increment, transition, or new app event.                                  |

Deposit illustration: `created → awaiting_payment → processing → settling_onchain → completed`. Withdrawal illustration: `created → awaiting_payment → settling_onchain → processing → completed`. Provider execution may omit waits, combine observations, or report completion late; only evidence, not arrival order, authorizes skipping a stage. Do not order the seven states by a numeric rank.

`refunded` has no automatic outgoing transition; `completed` cannot regress to an active state or `failed`. Contradictory evidence after either state opens an audited reconciliation incident, retaining the published state until a separately reviewed correction is authorized. A partial refund records a separate recovery obligation and keeps `reconciliationRequired: true`; it is not full `refunded`. Do not restart a refunded transaction to initiate a new payment.

## 5. Durable storage, migration, and rollback

DEV-7 adds nullable canonical state, version, reconciliation flag, and ownership snapshot to existing transaction storage; retain the four-status column. Store exact financial terms in decimal-capable storage, never floating-point calculation. Add normalized evidence/settlement-leg records and append-only transitions containing transaction ID, old/new state, version, actor, reason, event/evidence references, observed time, and committed time. Use received time/version for concurrency, not provider timestamps alone.

Enforce unique scoped idempotency keys, quote reservation, and provider event identities. DEV-12 implements reservation/fingerprint behavior; before adding a unique constraint, audit duplicate historical quote references and quarantine ambiguous groups without deleting/merging financial records. Preserve old identities; use a reservation table with a unique quote ID for new workflows if historical duplicates prevent a direct constraint.

Commit evidence, validated state/legacy projection, compare-and-swap version increment, transition, processed-event marker, and outbox record in the same database transaction. Competing workers reread and reevaluate after a version conflict. Outbox storage is part of the transaction boundary; delivery/retry workers belong to DEV-14. Operation intents/attempt records survive crashes independently of worker leases.

Roll out in stages:

1. Add nullable fields/tables without dropping or renaming legacy columns. Existing readers/writers continue until a route is explicitly enrolled in the new workflow.
2. Inventory in-flight transactions, duplicates, exact-amount provenance, and outstanding provider/chain submissions. Record unresolved cases; do not replay their creates. Retire unowned outstanding legacy quotes for new creates and require a fresh bound quote; existing accepted transactions remain accessible.
3. Backfill canonical state only from sufficient evidence. Legacy `PENDING`/`PROCESSING` cannot identify an exact stage; even `COMPLETED`/`FAILED` alone cannot prove canonical completion/failure/refund. Keep `lifecycleState: null` and existing legacy status until reconciled. Initialize version at 1 with a migration observation, never invented prior transitions or timestamps. Unknown exact historical amounts remain unknown pending source evidence.
4. Enable one provider/direction at a time with shared writes, reservation, background reconciliation, and atomic outbox. Gate old provider writers for enrolled transactions so they cannot overwrite the lifecycle projection. Reconcile in-flight rows before transferring ownership; an in-flight legacy row without sufficient evidence stays under monitored legacy handling.
5. Publish additive OpenAPI/SDK fields and examples through DEV-18. Legacy polling still stops on `completed`/`failed`; clients needing later refund/recovery updates use status reads/webhooks. Explain this limitation explicitly.

Rollback disables new creates for affected routes and stops enrollment. Keep the additive schema, deduplication records, outbox, and a compatible worker running for accepted transactions. Roll back to a release that reads the additive model; do not run old mutating reconcilers against enrolled rows, delete history, reverse funds, or reopen consumed quotes. Do not equate code rollback with transaction rollback.

## 6. Normalized events and delivery

**Ingress:** verify provider signatures on original bytes using the provider's documented algorithm and injected secrets; enforce signed timestamp freshness where supported. Scope durable event identity by provider configuration/account and network plus provider event ID. When no stable ID exists, use an adapter-defined stable fingerprint of authenticated event content/reference; do not use arrival time. A repeated ID with different content is quarantined. Timestamp checks alone do not deduplicate.

Normalize authenticated callbacks and authenticated polling observations into the same evidence-processing path. Reject unauthenticated callbacks; providers without verifiable callbacks use authenticated background polling, independent of an open UI. When callback evidence is incomplete, fetch authoritative provider status. Persist ingestion before returning 2xx; return an error on storage failure so the provider can retry. Out-of-order observations may contribute evidence without regressing lifecycle. No callback directly submits a payment.

**App event contract (proposed):** emit `ramp.transaction.updated` from the durable outbox for each accepted public/evidence update. `schemaVersion` versions payload shape; `transactionVersion` orders a transaction. Event ID and serialized body stay unchanged across delivery retries. Only send to that transaction's application. Payloads omit bank details, KYC documents, raw provider bodies, access tokens, and hosted session URLs.

```json
{
  "schemaVersion": 1,
  "eventId": "evt_demo_1",
  "type": "ramp.transaction.updated",
  "occurredAt": "2026-09-28T12:05:00Z",
  "applicationId": "app_demo",
  "data": {
    "txId": "tx_deposit_demo",
    "direction": "onramp",
    "network": "TESTNET",
    "status": "completed",
    "lifecycleState": "completed",
    "transactionVersion": 5,
    "reconciliationRequired": false,
    "settlement": {
      "chain": "STELLAR",
      "txHash": "DEMO_STELLAR_HASH",
      "evidenceId": "ev_demo_1"
    }
  }
}
```

**Signing:** propose `Pollar-Event-Id`, `Pollar-Timestamp` (Unix seconds), `Pollar-Key-Id`, and `Pollar-Signature: v1=<lowercase hex>`. Sign the byte concatenation `timestamp + "." + exact UTF-8 request body` with HMAC-SHA256 and the destination application's webhook secret. Receivers select a trusted key by key ID, verify in constant time, require timestamp within ±300 seconds, ensure the event-ID header equals the authenticated body's ID, and durably deduplicate before side effects. A retry uses a fresh timestamp/signature but the same event/body. Retain event deduplication for the consumer's transaction-record lifetime; an old signed request is not a permitted manual replay.

**Delivery:** at least once, with no global ordering guarantee. Receivers durably accept then return 2xx; ignore already-processed event IDs and older transaction versions, and use authenticated status reads to resolve gaps. Use a 10-second request timeout; retry network errors and non-2xx responses with exponential delay starting at 30 seconds, capped at one hour, with 0.5–1.5 jitter. Honor a valid `Retry-After` within that cap. Do not follow redirects. Stop automatic attempts after 24 hours, retain a dead-letter record, and alert the operator. Access-controlled replay uses the same event ID/body and records operator/reason; it never re-executes the ramp. Secret rotation allows current and previous key IDs during the delivery window, while revoked keys are never accepted. Endpoint failure affects delivery health, not payment state.

## 7. API examples (proposed contract, synthetic values)

These examples are **illustrations, not live quotes, receipts, valid hashes, or proof of sandbox support**. `testnet` describes the hypothetical application context. Real routes require verified support. Examples use the additive local route/terms/action/lifecycle fields. Client idempotency headers and application webhook delivery remain future work; current creation converges on the owned quote and saved operation keys. Placeholder issuer/hash values cannot be submitted to Stellar.

The local DEV-10 implementation regenerates the SDK schema from the matching backend. Quote expiry, exact terms, route capabilities, chain/encoding actions, lifecycle/version, reconciliation and verified milestones now have generated types. Worked examples retain legacy fields as compatibility projections; release the additive backend/database changes before updated clients.

### Deposit: quote, create, status

`GET /ramps/quote?country=BO&amount=70&currency=BOB&direction=onramp`

```json
{
  "code": "SDK_RAMPS_QUOTES",
  "success": true,
  "content": {
    "quotes": [
      {
        "quoteId": "q_deposit_demo",
        "provider": "Fixture QR",
        "fee": 0,
        "feeCurrency": "BOB",
        "rate": 7,
        "rail": "QR",
        "protocol": "REST",
        "estimatedTime": "~10 min",
        "recommended": true,
        "requiredFields": [],
        "expiresAt": "2026-09-28T12:15:00Z",
        "providerExpiresAt": "2026-09-28T12:01:00Z",
        "fiatAmount": 70,
        "cryptoAmount": null,
        "availableAmount": null,
        "terms": {
          "fiatCurrency": "BOB",
          "assetCode": "USDC",
          "assetIssuer": "DEMO_USDC_ISSUER",
          "fiatAmount": "70.00",
          "cryptoAmount": "10.0000000",
          "feeAmount": "0.00",
          "feeCurrency": "BOB",
          "assetChain": "STELLAR"
        },
        "route": {
          "routeId": "route_bo_deposit_demo",
          "direction": "onramp",
          "country": "BO",
          "fiatCurrency": "BOB",
          "rail": "QR",
          "asset": {
            "code": "USDC",
            "identifier": "DEMO_USDC_ISSUER",
            "chain": "STELLAR",
            "network": "testnet",
            "precision": 7
          },
          "limits": {
            "denomination": "fiat",
            "min": null,
            "max": null
          }
        }
      }
    ]
  }
}
```

At 12:00:30, `POST /ramps/onramp` (quote replay preserves the same saved operation):

```json
{
  "quoteId": "q_deposit_demo",
  "amount": 70,
  "currency": "BOB",
  "country": "BO"
}
```

```json
{
  "code": "SDK_RAMPS_ONRAMP_CREATED",
  "success": true,
  "content": {
    "txId": "tx_deposit_demo",
    "provider": "Fixture QR",
    "status": "pending",
    "lifecycleState": "awaiting_payment",
    "transactionVersion": 2,
    "reconciliationRequired": false,
    "depositInstructions": {
      "fields": [
        {
          "key": "amount",
          "label": "Amount",
          "value": "70.00",
          "type": "amount",
          "copyable": false
        },
        {
          "key": "currency",
          "label": "Currency",
          "value": "BOB",
          "type": "text",
          "copyable": false
        },
        {
          "key": "status_page",
          "label": "Payment page",
          "value": "https://payments.example.invalid/deposit-demo",
          "type": "url",
          "copyable": false
        }
      ]
    }
  }
}
```

The instruction example uses a synthetic hosted payment page; a real QR route also returns the existing normalized `scannable` object when available, never a provider-specific QR field. Generic adapters publish QR, hosted or bank instructions as a saved `nextAction`; legacy providers retain normalized `depositInstructions`. A response may still be `created` before instructions are obtained. Status returns the saved snapshot.

`GET /ramps/transaction/tx_deposit_demo`, after independently matching fiat receipt and final Stellar USDC credit:

```json
{
  "code": "SDK_RAMPS_TX_STATUS",
  "success": true,
  "content": {
    "txId": "tx_deposit_demo",
    "provider": "Fixture QR",
    "status": "completed",
    "lifecycleState": "completed",
    "transactionVersion": 5,
    "reconciliationRequired": false,
    "direction": "onramp",
    "amount": 70,
    "currency": "BOB",
    "stellarTxHash": "DEMO_STELLAR_HASH",
    "txHash": "DEMO_STELLAR_HASH",
    "chain": "STELLAR",
    "updatedAt": "2026-09-28T12:05:00Z"
  }
}
```

### Withdrawal: quote, create, status

`GET /ramps/quote?country=BR&amount=50&currency=BRL&direction=offramp`

```json
{
  "code": "SDK_RAMPS_QUOTES",
  "success": true,
  "content": {
    "quotes": [
      {
        "quoteId": "q_withdrawal_demo",
        "provider": "Abroad",
        "fee": 0,
        "feeCurrency": "BRL",
        "rate": 5,
        "rail": "PIX",
        "protocol": "REST",
        "estimatedTime": "~minutes",
        "recommended": true,
        "requiredFields": [
          {
            "key": "account",
            "label": "Pix key",
            "type": "text",
            "bankType": "PIX"
          }
        ],
        "expiresAt": "2026-09-28T12:15:00Z",
        "providerExpiresAt": "2026-09-28T12:02:00Z",
        "fiatAmount": 50,
        "cryptoAmount": 10,
        "availableAmount": 100,
        "terms": {
          "fiatCurrency": "BRL",
          "assetCode": "USDC",
          "assetIssuer": "DEMO_USDC_ISSUER",
          "fiatAmount": "50.00",
          "cryptoAmount": "10.0000000",
          "feeAmount": "0.00",
          "feeCurrency": "BRL",
          "assetChain": "STELLAR"
        },
        "route": {
          "routeId": "route_br_withdrawal_demo",
          "direction": "offramp",
          "country": "BR",
          "fiatCurrency": "BRL",
          "rail": "PIX",
          "asset": {
            "code": "USDC",
            "identifier": "DEMO_USDC_ISSUER",
            "chain": "STELLAR",
            "network": "testnet",
            "precision": 7
          },
          "limits": {
            "denomination": "fiat",
            "min": null,
            "max": null
          }
        }
      }
    ]
  }
}
```

At 12:00:30, `POST /ramps/offramp` (quote replay preserves the same saved operation):

```json
{
  "quoteId": "q_withdrawal_demo",
  "amount": 50,
  "currency": "BRL",
  "country": "BR",
  "bankDetails": {
    "type": "PIX",
    "value": "recipient@example.invalid"
  }
}
```

```json
{
  "code": "SDK_RAMPS_OFFRAMP_CREATED",
  "success": true,
  "content": {
    "txId": "tx_withdrawal_demo",
    "provider": "Abroad",
    "status": "processing",
    "lifecycleState": "settling_onchain",
    "transactionVersion": 3,
    "reconciliationRequired": false
  }
}
```

`GET /ramps/transaction/tx_withdrawal_demo`, after Stellar funding is verified **but before fiat payout**:

```json
{
  "code": "SDK_RAMPS_TX_STATUS",
  "success": true,
  "content": {
    "txId": "tx_withdrawal_demo",
    "provider": "Abroad",
    "status": "processing",
    "lifecycleState": "processing",
    "transactionVersion": 4,
    "reconciliationRequired": false,
    "direction": "offramp",
    "amount": 50,
    "currency": "BRL",
    "stellarTxHash": "DEMO_WITHDRAWAL_HASH",
    "txHash": "DEMO_WITHDRAWAL_HASH",
    "chain": "STELLAR",
    "updatedAt": "2026-09-28T12:03:00Z"
  }
}
```

Only verified payout of 50.00 BRL linked to that transaction permits version 5 with both states `completed`. Anclap uses these same envelopes but can return `kycUrl`/`anchorTransactionId` or `pendingSignature`; its real route must establish its declared asset/chain settlement capability before enrollment.

Example proposed reprice rejection (HTTP 409, before submission):

```json
{
  "success": false,
  "code": "SDK_RAMPS_QUOTE_CHANGED",
  "message": "Request and accept a fresh quote before starting this transfer.",
  "retryable": false
}
```

## 8. Acceptance scenarios and task handoff

These are specifications for downstream tests, not claims of tests run against providers.

| Scenario                                                                                | Expected result                                                                                                                             |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Deposit receipt arrives before final Stellar credit                                     | Progress remains active; complete only after matching issuer, amount, destination, memo where required, and final ledger success.           |
| Withdrawal's Stellar hash arrives before payout                                         | `settling_onchain → processing`; no completion until verified fiat payout.                                                                  |
| Provider reports final completion without intermediate callbacks                        | Fetch/verify all required evidence, permit direct completion from active state, record one actual transition without fabricated history.    |
| Same create sent concurrently under same/different keys for one quote                   | One reservation/transaction/provider operation; matching callers receive its ID, changed payload conflicts.                                 |
| Same key changes amount, direction, or recipient                                        | Fingerprint conflict within the scoped operation; changing operation scope cannot bypass the quote's direction/reservation. No new payment. |
| Another application/user submits or polls a known quote/transaction                     | Authorization fails before replay, evidence, or instructions are exposed.                                                                   |
| Quote expires or changes price while user fills a form                                  | Unreserved create rejects before money movement; a completed reservation still replays after expiry. Fresh terms require new acceptance.    |
| Indicative/disabled/unsupported route is selected                                       | Reject creation; no silent provider substitution. Abroad deposit remains an explicit missing capability.                                    |
| Worker crashes after provider accepted the request                                      | Durable intent survives; reconcile using stable references/key. No resubmission based solely on timeout or lease expiry.                    |
| Forged signature, stale signed callback, duplicate, or changed body under same event ID | Reject forged/stale input; exact duplicate has no effects; conflicting identity/content is quarantined.                                     |
| Older processing callback arrives after completion                                      | Preserve completion; add only genuinely new evidence, not another transition/payment.                                                       |
| Settlement succeeds to wrong destination/issuer or only partly settles                  | No completion; reconciliation incident identifies missing/mismatched obligation.                                                            |
| Failure followed by partial, then full verified return                                  | Partial return records recovery evidence; full verified return permits `refunded`.                                                          |
| Definitive failure later receives verified recovery evidence                            | Audited recovery reuses original operation identity and checks for prior settlement; never blindly restarts the payment.                    |
| Existing record says `COMPLETED` without matching evidence                              | Preserve legacy status and null canonical lifecycle pending reconciliation; do not invent proof.                                            |
| Two event processors update the same version                                            | One atomic commit/outbox event; loser rereads, deduplicates, and reevaluates evidence.                                                      |
| App endpoint fails or receives events out of order                                      | Payment unchanged; durable retries/dead letter, same event ID, consumer deduplication/version checks.                                       |
| Add a fixture-backed future provider                                                    | Registry/configuration change only; API handlers remain provider-neutral.                                                                   |
| Rollback during an in-flight payment                                                    | Disable new creates; keep compatible reconciliation/delivery and deduplication records running.                                             |

| Task                     | Implementation/evidence owned there                                                                                          |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| DEV-6                    | This ADR, API examples, transition specification, and recorded review.                                                       |
| DEV-7                    | Additive lifecycle/evidence persistence, transition enforcement, migration and rollback tests.                               |
| DEV-8                    | Typed contracts, registry/layout, injected configuration, adapter skeleton/reference, onboarding and example contract tests. |
| DEV-9 / DEV-10 / DEV-11  | Anclap / Abroad / Stereum migrations and verified direction/settlement mappings.                                             |
| DEV-12                   | Endpoint behavior, scoped ownership, quote acceptance, durable reservations, idempotency and continuation semantics.         |
| DEV-13 / DEV-14 / DEV-15 | Authenticated ingress / durable app delivery / reconciliation ledger and settlement verification.                            |
| DEV-16                   | Shared conformance harness covering these scenarios, including future adapters.                                              |
| DEV-18                   | Released OpenAPI/SDK types and user documentation aligned with implemented behavior.                                         |

### Review and acceptance record

Author validation on 2026-09-28: all 10 JSON blocks parse; eight request/response projections and both quote queries validate against the inspected platform schemas. The eight shared-field projections typecheck against generated SDK paths after excluding the documented baseline drift and proposed fields. Example amounts, legacy-state projections, and local documentation links were checked. This is documentation validation, not validation of the proposed runtime, provider behavior, or settlement evidence.

| Required input/review                                                     | Status  | Evidence                                                   |
| ------------------------------------------------------------------------- | ------- | ---------------------------------------------------------- |
| DEV-5 completed audit, informed by DEV-3                                  | Pending | Local code observations above are preliminary inputs only. |
| Developer B: adapter feasibility, both directions, client compatibility   | Pending | No reviewer feedback recorded yet.                         |
| DevOps: persistence rollout, secrets, worker recovery, webhook operations | Pending | No reviewer feedback recorded yet.                         |
| Final owner agreement                                                     | Pending | Keep ADR Proposed until inputs and reviews are recorded.   |

Record review date, reviewer, feedback, and resolution here when actually received. Missing provider access, unsupported directions, or uncertain settlement evidence remain visible delivery gaps. Do not mark DEV-6 accepted on the strength of examples or fixtures alone.

## 9. Consequences and alternatives

Additive evolution preserves installed clients but temporarily carries two state representations and requires controlled ownership of writes. A new v2-only API was rejected for this phase because it would force client migration before the common orchestration is usable. A universal sequential state ladder was rejected because withdrawal settlement may precede fiat payout. Provider-specific handler branches and a mandatory adapter base class were rejected in favor of capability-based interfaces and shared orchestration. Silent repricing was rejected because displayed terms must authorize the payment actually executed.

Source locations inspected in the platform baseline: `apps/sdk-api/src/schemas/ramps.schemas.ts`, `routes/v1/ramps.routes.ts`, `controllers/ramps.controller.ts`, `services/ramps.service.ts`, provider services, `packages/shared/src/lib/ramp-capabilities.ts`, and `packages/db-main` schema/repository. Public SDK references: [generated API types](../../packages/core/src/api/schema.d.ts), [ramp type aliases](../../packages/core/src/types.ts), and [endpoint wrappers](../../packages/core/src/api/endpoints/ramps.ts). The public [Ramps API reference](../../packages/core/README.md#ramps-sep-24) remains the reference for currently exposed methods.

## DEV-8 implementation alignment (2026-10-06)

Later DEV-8 comments supersede the original fixed-asset and provider-shortened expiry proposal. The local shared runtime uses provider, wallet, chain and settlement registries; Abroad is the first adapter and others remain legacy until their own migration gates pass. The SDK schema has now been regenerated from the matching local backend. The additive action API binds `{ actionId, transactionVersion, signedPayload?, fields? }`; empty-body complete and Stellar signature endpoints remain compatible. Shared web/native action interpretation shows exact totals and requires explicit signing.

Legacy keys are persisted exactly or drained on the legacy path, including orders created before a transaction exists. Bridge resource keys remain separate. Each continuation step keeps its own saved operation/key; key expiry and lost responses require reconciliation. Characterization tests, worker/evidence support and tested ownership cutover precede enrollment. Anclap external authentication cannot be renewed silently; unavailable unattended observation requires documented recovery/escalation or continued legacy ownership. Rollback never returns enrolled rows to legacy writers.

The production DEV-7 enum decision closes ramp chain identifiers to `RampChain`
(`STELLAR`, `POLYGON`, `SOLANA`), independently of `WalletNetwork`. The SDK's
quote filters, routes, terms, transactions and signing registrations preserve
that catalog. Network stays separate, CAIP-2 identifiers are derived when
needed, and exact amount strings are unchanged. This supersedes earlier
open-chain proposals; adding a chain requires a database enum migration and a
matching SDK contract update.

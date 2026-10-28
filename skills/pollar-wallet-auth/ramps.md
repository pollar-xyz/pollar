# Fiat ramps

Move money between local fiat rails and a wallet. The client never picks a provider: the backend
plans every route between the fiat and the asset, quotes each leg live and returns the quotes best
first. A ramp is an **order** of one or more **legs** (the provider, a swap, a bridge) that Pollar
runs server-side. Which provider serves a corridor, and how many legs a route has, is a fact about
the quote you were handed, not a decision your code makes. Write against the fields the API returns
and the integration survives every provider change.

Everything here needs an authenticated session and `@pollar/core` 0.12.0 (sdk-api `/v3`). If the app
uses `@pollar/react` or `@pollar/react-native`, `openRampModal()` from `usePollar()` opens
`<RampWidget>`, which runs this entire flow with a prebuilt UI; the rest of this file is for driving
it yourself. Upgrading from 0.11.x: see [UPGRADE.md](https://github.com/pollar-xyz/pollar/blob/main/UPGRADE.md#ramps-on-api-v3).

## The shape of a run

```
getRampRoutes(direction)        fiat and asset pairs the app can ramp between; nothing is quoted
rampCountries(routes)           group them by country for a selector
quoteRamp(request)              every route quoted leg by leg, best first; each quote has expiresAt
rampQuoteFields(quote)          what to ask the user for; the answers become `payee`
createRampOrder({ quoteId, payee })   the order, with its first pendingAction already set
order.pendingAction             branch on its kind (below)
pollRampOrder(id, { onUpdate, signal })   at the server's pace until it settles
```

The whole integration is one function that reads `order.pendingAction`:

| `pendingAction.kind` | What the user does                                                                                        |
| -------------------- | --------------------------------------------------------------------------------------------------------- |
| `FIAT_PAYMENT`       | Pays the fiat side: render `instructions` (a QR or bank coordinates)                                      |
| `SIGNATURE`          | Authorizes a leg from a wallet they bring (EXTERNAL) or the app custodies: `signRampLeg(id, actionId)`    |
| `COSIGN_APPROVAL`    | Approves a leg on a co-signed wallet, like any other co-sign request (`cosignRequestId`)                  |
| `KYC`                | Completes the provider's verification at `url`; with `url: null` the provider is reviewing, nothing to do |
| `NONE`               | Nothing; keep polling                                                                                     |

`pendingAction` is `null` while Pollar works on its own. `describeRampAction(order)` turns an order
into what a screen shows: `title`, `canSign`, `canApprove`, `scannable`, `details` and `link` (only
an `https` link is returned).

## Routes and quotes

```ts
import { rampCountries, rampQuoteFields } from '@pollar/core';

const { routes } = await client.getRampRoutes('ONRAMP'); // or 'OFFRAMP'
const countries = rampCountries(routes); // [{ country: 'MX', fiats: [{ kind: 'fiat', currency: 'MXN', rail: 'SPEI', country: 'MX' }] }]

const route = routes[0]; // the user's choice: route.fiat, route.asset, route.legs
const { quotes, rejected } = await client.quoteRamp({
  direction: 'ONRAMP',
  fiat: { currency: route.fiat.currency, rail: route.fiat.rail, country: route.fiat.country },
  asset: { code: route.asset.code, identifier: route.asset.identifier, chain: route.asset.chain },
  amount: { value: '500', denomination: 'in' }, // exact decimal string; 'out' quotes backward from the amount received
});
const quote = quotes[0]; // best first
```

A listed route is not a promise: a pair may still find no liquidity or hit a limit when quoted.
When no route can be quoted at all, `quoteRamp` throws a `PollarApiError` with code
`SDK_RAMPS_NO_ROUTE` (422) and `body.rejected`. `rejected` (in the error body or next to `quotes`)
says why each candidate dropped out: `failure.resolutionAction` is what the user can do about it.
A route waiting on a verification step carries it as `requirement` (`RampQuoteRequirement`: KYC, a
form, a registry check or a provider registration); `rampRequirementCopy(requirement)` gives the
text and the button, and a `null` action means the step is under review or refused. A route dropped
because the Stellar wallet does not trust the asset it delivers (`resolutionAction: 'add_trustline'`)
names it through `rampTrustlineAsset(rejection)` (`{ code, issuer }`): add it with `setTrustline`, then
quote again. A route waiting on the user's wallet (`resolutionAction: 'create_wallet'`) needs
`createWallet()` first (with `{ custody }` for an app in `USER_CHOICE` custody), then a new quote.

| Quote field                                    | Use                                                                                           |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `quoteId`                                      | Pass to `createRampOrder`                                                                     |
| `expiresAt`                                    | The quote is valid until then; after it, quote again                                          |
| `amountIn`, `amountOut`, `etaSeconds`          | Display. Amounts are exact decimal strings                                                    |
| `legs[]`                                       | One per step: `kind` (`PROVIDER_ONRAMP`, `PROVIDER_OFFRAMP`, `SWAP`, `BRIDGE`), `from`, `to`  |
| `legs[].amountIn`, `amountOut`, `providerFees` | Per-leg breakdown; each fee line has `amount`, `currency`, `beneficiary`, `payer`, `usdValue` |
| `legs[].wallet`                                | The wallet a leg runs on (`chain`, `address`, `mode`, `signs`), or `null`                     |
| `legs[].requiredFields`                        | Inputs the leg needs; read them across legs with `rampQuoteFields(quote)`                     |

A rail is one of `SPEI`, `PIX`, `PSE`, `ACH`, `BREB`, `QR`, `BANK_TRANSFER`, `CASH`, `CARD`, `HOSTED`.
`HOSTED` means the user picks the method inside the provider's own flow, so there are no payment
details to show before the provider's page opens. Show a rail with
`rampRailLabel(rail, { language: 'es', provider })`; a rail this SDK version does not know comes back
unchanged. `rampLegTitle(leg)` names a leg in the user's terms ("Buy USDT on Polygon", "Convert USDT
to USDC", "Send to Stellar").

### Required fields

`requiredFields` is why a ramp form cannot be static. `rampQuoteFields(quote)` returns every field
the quote asks for, across its legs, once per key. Each entry has `key`, `label`, `type`
(`'text' | 'email' | 'tel' | 'select'`), and optionally `optional`, `bankType`, `options`,
`placeholder`, `placeholderFrom`, `hint`. Render them from the quote, collect the values, and send
them as `payee`, keyed by each entry's `key`. A form hardcoded for one provider breaks the day a
better quote wins.

## Creating the order

```ts
const payee = Object.fromEntries(
  rampQuoteFields(quote)
    .map((f) => [f.key, (values[f.key] ?? '').trim()])
    .filter(([, value]) => value),
);
const order = await client.createRampOrder({ quoteId: quote.quoteId, ...(Object.keys(payee).length ? { payee } : {}) });
```

`createRampOrder` runs the first leg at once, so the order it returns already carries the first
`pendingAction`. A missing or wrong `payee` value answers `400 VALIDATION_ERROR` with the reason in
`body.message`, before anything moves: send the user back to the form. The same quote always
answers the same order, so retrying a create that timed out is safe and does not open a second one.

| Order field     | Meaning                                                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `id`            | Keep it: resume, poll and sign by it                                                                                          |
| `direction`     | `'ONRAMP' \| 'OFFRAMP'`                                                                                                       |
| `state`         | `created`, `awaiting_payment`, `processing`, `settling_onchain`, `completed`, `failed`, `refunded` (the last three are final) |
| `legs[]`        | `kind`, `status`, `from`, `to`, planned and actual amounts, `onchainTxHash`, `fundsLocation`, `failure`                       |
| `pendingAction` | What the order waits for from the user, or `null`                                                                             |
| `failure`       | Why it stopped: `code`, `legIndex`, `retryable`, `resolutionAction`, `detail`                                                 |
| `nextPollAfter` | When to read it again; `null` once nothing more will change                                                                   |

For a progress list, `rampLegStatus(leg)` reduces a leg to `'pending' | 'active' | 'done' | 'failed'`.
For a failure, `rampResolutionText(order.failure)` gives the sentence to show; an unknown
`resolutionAction` falls back to "contact support".

## Paying the fiat side (`FIAT_PAYMENT`)

```ts
const action = order.pendingAction; // kind 'FIAT_PAYMENT'
action.instructions.kind; // 'qr' | 'bank_transfer'
// qr:            payload, amount, currency, scannable?
// bank_transfer: amount, currency, details: [{ label, value }], reference
action.expiresAt; // string | null
```

`scannable` is the QR already rendered by the server, so no QR encoder is needed:

```ts
type RampScannable = {
  kind: 'pix' | 'stellar' | 'url' | 'opaque';
  payload: string | null; // the copy-and-paste code, when there is one
  payloadLabel: string | null;
  image: { mediaType: 'image/svg+xml' | 'image/png'; encoding: 'utf8' | 'base64'; data: string; inlineSafe: boolean };
};
```

An `inlineSafe` SVG uses `currentColor` and can be injected as markup; anything else goes through
`<img src="data:...">`. Show `payload` as copyable text when `payloadLabel` is set: a phone cannot
scan its own screen. Render bank `details` as a labeled list with a copy button, plus `reference`.
Do not synthesize instructions from the quote; they only exist on the order.

## Signing a leg (`SIGNATURE`)

A `SIGNATURE` action carries `actionId`, `legIndex`, `chain`, `payload: { encoding, value }`,
`summary` and `expiresAt`. Core has no built-in ramp signer, not even for Stellar: register one per
chain and payload encoding, then call `signRampLeg` from the user's explicit Authorize.

```ts
import { assertRampStellarSigner } from '@pollar/core';

const removeSigner = client.registerRampSigningHandler('STELLAR', 'xdr', async (action) => {
  const wallet = client.getWallet();
  if (!wallet) throw new Error('Connect the wallet this step was built for.');
  assertRampStellarSigner(action, wallet.address); // throws unless the XDR spends only from this account
  const outcome = await client.signTx(action.payload.value);
  if (outcome.status !== 'signed') throw new Error('Signing was cancelled.');
  return outcome.signedXdr; // signed, not broadcast
});

// On the user's click, with the action that was on screen:
const action = order.pendingAction;
if (action?.kind === 'SIGNATURE') {
  try {
    order = await client.signRampLeg(order.id, action.actionId);
  } finally {
    removeSigner(); // or keep it registered for the session
  }
}
```

- `signRampLeg` reads the order again and signs only if the pending action is still the one the
  user saw (same `actionId`, not expired); otherwise it throws "The ramp action changed. Refresh
  before signing." An unregistered chain/encoding pair throws before anything is signed.
- A handler must validate the payload against the account, chain and network, reject on
  cancellation, and return the signed payload without broadcasting. Registering the same pair twice
  throws; the returned function removes it.
- `assertRampStellarSigner(action, address)` accepts a payment or contract call only when every
  operation runs as `address` (inside a fee bump too), and a SEP-10 login (`summary:
'authentication'`) only when it is the anchor's challenge with its first data entry from `address`.
- A ramp leg always asks for confirmation, whatever the `confirmation` policy, so a headless app
  must subscribe to `client.onConfirmationRequest()` (the provider's `<ConfirmModal>` does it in React).
- A Solana leg (`SOLANA` / `solana-v0-json`) is signed with `client.signSolanaTransaction(base64)`
  from the external Solana wallet the payload names in `from`.
- Polling never signs. A server answer of `SDK_RAMPS_ACTION_STALE` means the action changed between
  read and submit: read the order and ask again.

`<RampWidget>` lends the connected wallet as the `STELLAR`/`xdr` and `SOLANA`/`solana-v0-json` signer
only while the user authorizes, unless the app registered its own.

## Co-signed and KYC steps

- **`COSIGN_APPROVAL`**: the leg runs on a co-signed wallet and waits for the user's vote. In React,
  `openCosignModal()` opens `<CosignModal>`; headless, approve from a user action with
  `client.cosign.approve(action.cosignRequestId)`.
- **`KYC`**: open `url` in a new tab (prefer `describeRampAction(order).link`, which drops anything
  that is not `https`). With `url: null` the provider is reviewing what the user sent and there is
  nothing to ask for; keep polling.

## Polling and resuming

```ts
const controller = new AbortController();
const settled = await client.pollRampOrder(order.id, {
  signal: controller.signal, // abort rejects with an AbortError
  onUpdate: (o) => render(o), // every read
});
// resolves once the order is completed, failed or refunded, or nextPollAfter is null
```

`pollRampOrder` reads at the pace the server suggests (`nextPollAfter`), retries transport errors,
throws API errors, and accepts `until: (order) => boolean` to stop earlier. An order parked on a
payment or a hosted verification can sit for as long as the user takes: run the poll in the
background with an abort signal and keep the UI on `onUpdate`, not on the promise.

Orders live server-side, so a reload or another device resumes them:

```ts
const { orders, nextCursor } = await client.listRampOrders({ pending: 'true', limit: 5 }); // waiting on the user
const order = await client.getRampOrder(id);
```

`listRampOrders` also filters by `state` and `since`, and pages with `cursor`. Resume the same order
id; never create a new order to refresh an old one.

## Errors

Ramp errors keep every field the API sent, not just the code:

```ts
import { isPollarApiError } from '@pollar/core';
try {
  await client.createRampOrder({ quoteId, payee });
} catch (e) {
  if (isPollarApiError(e)) {
    e.code; // e.g. 'VALIDATION_ERROR', 'SDK_RAMPS_QUOTE_EXPIRED'
    e.body; // the full response: `message` for a refused payee, `rejected` for SDK_RAMPS_NO_ROUTE
  }
}
```

| Code                                                   | What to do                                                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `VALIDATION_ERROR` (400)                               | Show `body.message` on the form and let the user fix the field                              |
| `SDK_RAMPS_NO_ROUTE` (422)                             | Explain `body.rejected[].failure.resolutionAction`; try another amount or route             |
| `SDK_RAMPS_QUOTE_EXPIRED`, `SDK_RAMPS_QUOTE_NOT_FOUND` | Quote again; the amount the user typed is still valid, the price is not                     |
| `SDK_RAMPS_ACTION_STALE`                               | Read the order again and show the new action                                                |
| `SDK_RAMPS_WALLET_NOT_READY`                           | The wallet account is not set up yet (on a co-signed wallet, approve its setup); then retry |

## Gotchas

1. **Hardcoding a form.** Required fields differ per quote and per leg. Render
   `rampQuoteFields(quote)` every time.
2. **Holding a quote past `expiresAt`.** Quote again instead of retrying the create.
3. **Treating `pollRampOrder` as the UI.** It resolves only when the order settles; a hosted
   verification can take a day. Render from `onUpdate` and let the user leave.
4. **Building payment instructions client-side.** They only exist on the order's `FIAT_PAYMENT`
   action.
5. **Signing outside a user action.** Call `signRampLeg` from the Authorize click only, with the
   `actionId` the user saw. Polling must never sign.
6. **Expecting a built-in signer.** Every chain/encoding pair, `STELLAR`/`xdr` included, needs
   `registerRampSigningHandler`; otherwise `signRampLeg` throws.
7. **Assuming the rail from the country.** Read the route's `fiat.rail`. A country can be served by
   more than one rail, and a `HOSTED` rail has no details until the provider's page opens.
8. **Exhaustive switches over rails or states.** Show rails with `rampRailLabel`, which returns an
   unknown rail unchanged, and leg statuses with `rampLegStatus`.
9. **Converting amounts to numbers.** Amounts are exact decimal strings in requests and answers; keep
   them as strings.

# Fiat ramps

Move money between local fiat rails and a Stellar wallet. The client never picks a provider: the
backend ranks the app's enabled anchors by country, amount, fee and availability and returns
quotes. Which anchor serves a corridor, and whether it speaks SEP-24 or REST, is a fact about the
quote you were handed, not a decision your code makes. Write against the fields the API returns and
the integration survives every provider change.

Everything here needs an authenticated session. If the app uses `@pollar/react`, `openRampModal()`
from `usePollar()` runs this entire flow with a prebuilt UI; the rest of this file is for driving it
yourself.

## The shape of a run

```
getRampCountries()            which corridors this app serves, to populate a selector
getRampsQuote(query)          ranked quotes; quotes[0] is the recommendation; quoteId lives 15 min
createOnRamp / createOffRamp  spend the quoteId, get back a RampResult
apply the RampResult          branch on its optional fields (below)
pollRampTransaction(txId)     until 'completed' | 'failed'
```

Every mutating call (`createOnRamp`, `createOffRamp`, `completeWithdraw`, `submitRampSignature`)
returns the same result shape, and the whole integration is one function that reads it:

```ts
type RampResult = {
  txId: string;
  provider: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  pendingSignature?: { unsignedXdr: string; action: 'sep10' | 'withdraw_payment' };
  kycUrl?: string; // hosted identity check to open
  tosUrl?: string; // hosted terms acceptance, when the provider splits it out
  kycRequired?: boolean; // link-less gate: nothing was signed, nothing moved
  depositInstructions?: RampDepositInstructions; // on-ramp payment details as data
  stellarTxHash?: string; // set once the on-chain leg has landed
};
```

Read the fields in this order, because they are not mutually exclusive and the first one that applies
decides what happens next:

1. **`pendingSignature`** is set: the user's wallet has to sign. Sign it, submit it, and read the
   result you get back as a new `RampResult` (it may carry another `pendingSignature`). Only EXTERNAL
   wallets ever see this; custodial wallets sign server-side.
2. **`kycUrl`** (and `tosUrl`) is set: open it in a new tab. The provider hosts the identity check and
   the transaction advances on its own once the user clears it. Keep polling.
3. **`kycRequired: true`** is set: the provider gated the flow on identity and offers no hosted URL.
   Nothing was built or signed and no funds moved. Poll `getRampKycStatus()` until `hasApproved`,
   then **request a fresh quote**; the provider consumed this one when it answered.
4. **`depositInstructions`** is set (on-ramp): render them. This is where the user is told how to pay.
5. Otherwise poll `status`.

## Quotes

```ts
const { countries } = await client.getRampCountries(); // [{ code: 'MX', currency: 'MXN' }, ...]

const { quotes } = await client.getRampsQuote({
  country: 'MX',
  amount: 500,
  currency: 'MXN',
  direction: 'onramp', // or 'offramp'
});
const quote = quotes[0]; // recommended
```

A quote carries what the UI needs to explain it, and one thing the UI must obey:

| Field                                         | Use                                                                                                                                                               |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `quoteId`                                     | Pass to `createOnRamp` / `createOffRamp`. **Valid 15 minutes**, then a fresh quote is needed                                                                      |
| `rate`, `fee`, `feeCurrency`, `estimatedTime` | Display                                                                                                                                                           |
| `rail`                                        | `'SPEI' \| 'PIX' \| 'PSE' \| 'ACH' \| 'BREB' \| 'QR'`                                                                                                             |
| `protocol`                                    | `'SEP-24' \| 'REST'`. Informational; the branching above already covers the difference                                                                            |
| `minAmount`, `maxAmount`                      | Validate before creating; out of range fails with `RAMPS_AMOUNT_OUT_OF_RANGE`                                                                                     |
| `requiredFields`                              | Inputs this route needs the client to collect (name, email, tax id, bank details). **Empty for SEP-24 routes**, which collect everything on their own hosted page |

`requiredFields` is why a ramp form cannot be static. Each entry has `key`, `label`, `type`
(`'text' | 'email' | 'tel' | 'select'`), and optionally `bankType`, `options`, `placeholder`,
`hint`, `optional`. Render them from the quote, collect the values, and send them back under
`fields` on the create call. A form hardcoded for one provider breaks the day a better quote wins.

## On-ramp (fiat in)

```ts
const result = await client.createOnRamp({
  quoteId: quote.quoteId,
  amount: 500,
  currency: 'MXN',
  country: 'MX',
  // only what the quote's requiredFields asked for: named ones as top-level keys,
  // the rest under `fields`, keyed by each entry's `key`
  fullName,
  email,
  fields: collectedFields,
});
```

Then apply the result. For a hosted (SEP-24) route you get `kycUrl` and the user pays on the
anchor's page. For a REST route you get `depositInstructions`:

```ts
type RampDepositInstructions = {
  scannable?: {
    kind: 'pix' | 'stellar' | 'url' | 'opaque';
    payload: string | null; // the copy-and-paste code, when there is one
    payloadLabel: string | null;
    image: { mediaType: 'image/svg+xml' | 'image/png'; encoding: 'utf8' | 'base64'; data: string; inlineSafe: boolean };
  };
  fields: {
    key: string;
    label: string;
    value: string;
    type: 'text' | 'code' | 'amount' | 'datetime' | 'url';
    copyable: boolean;
  }[];
};
```

Render `fields` as a labeled list with a copy button where `copyable` is true, and `scannable` as a
QR when present. The `key` values are stable (`amount`, `reference`, `clabe`, `bank_account`,
`expires_at`, `memo`, ...) so a UI can special-case one without parsing labels. Do not synthesize
instructions from the quote; the reference and expiry only exist on the created transaction.

## Off-ramp (fiat out)

Two steps, because the provider needs to know where to send money before the wallet sends crypto.

```ts
const result = await client.createOffRamp({
  quoteId: quote.quoteId,
  amount: 100,
  currency: 'USDC',
  country: 'BR',
  bankDetails: { type: 'PIX', value: pixKey }, // or CLABE / PSE / ACH / BREB
  taxId, // when required
  fields: collectedFields,
});
// apply the result: KYC gate, hosted URL, or straight to 'processing'

// Once the provider is awaiting the on-chain transfer:
const done = await client.completeWithdraw(result.txId);
// custodial: done.stellarTxHash is set
// external:  done.pendingSignature is set, sign and resume (below)
```

`completeWithdraw` is the moment real funds move. Gate the button on all of: direction is
`offramp`, no `stellarTxHash` yet, and **not** `kycRequired`. On a link-less KYC gate the provider
consumed the quote, so completing would fail or, worse, pay into a deposit it cannot pay out.
Approval clears the gate for the _next_ quote, not for this transaction.

### Paying a Pix QR

For a Brazilian off-ramp against a "copia e cola" code, decode first and send the original payload:

```ts
const { decoded } = await client.decodePixQr(qrCode);
if (!decoded) throw new Error('QR no longer resolves'); // dynamic QRs go stale once used or expired
// quote decoded.amount, then:
await client.createOffRamp({ ...body, qrCode }); // the ORIGINAL payload, not the bare key it decodes to
```

Paying the bare key the QR decodes to is rejected by the payee's bank. Decode immediately before
quoting; a decoded QR does not stay valid while the user reads a confirmation screen.

## External wallets: signing and resuming

Custodial wallets never see `pendingSignature`. For an EXTERNAL wallet (Freighter, Albedo, xBull) the
backend hands back an unsigned XDR at two points: `sep10` to open the anchor session, and
`withdraw_payment` to broadcast the withdrawal. Sign with the session's own signer and resume:

```ts
async function resume(txId: string, ps: NonNullable<RampResult['pendingSignature']>): Promise<RampResult> {
  const outcome = await client.signTx(ps.unsignedXdr);
  if (outcome.status !== 'signed') throw new Error(outcome.message ?? 'signing cancelled');
  const next = await client.submitRampSignature(txId, { signedXdr: outcome.signedXdr, action: ps.action });
  return next.pendingSignature ? resume(next.txId, next.pendingSignature) : next;
}
```

`signTx` dispatches through the wallet adapter for external wallets. Smart (passkey) wallets are not
supported by ramps: `signTx` returns an error outcome for them and there is no server-side path.

## Status and liquidity

```ts
const status = await client.pollRampTransaction(txId, { intervalMs: 5000, timeoutMs: 600_000 });
// resolves 'completed' | 'failed'; throws on timeout

const tx = await client.getRampTransaction(txId); // one read: status, direction, amount, currency, kycUrl, depositInstructions, stellarTxHash, updatedAt
```

`pollRampTransaction` only stops on a terminal status. A transaction parked on a hosted KYC page can
sit in `pending` for as long as the user takes, so give the poll a timeout you are prepared to
recover from, and offer `getRampTransaction` on demand rather than holding the UI on the poll.

Some payout rails publish live liquidity. Check it before _offering_ the corridor, not after quoting:
quoting a dry rail succeeds and then fails downstream, which reads to the user as a bug.

```ts
const { available, liquidity, message } = await client.getRampLiquidity('PIX'); // 'PIX' | 'BREB'
```

Only rails whose provider publishes liquidity answer; the rest return not found, which means "no
signal", not "no liquidity".

## Errors

Ramp errors keep every field the API sent, not just the code, because these are the ones a UI has to
explain: an amount below the minimum, a stale quote, a pending identity check.

```ts
import { PollarApiError } from '@pollar/core';
try {
  await client.createOnRamp(body);
} catch (e) {
  if (e instanceof PollarApiError) {
    e.code; // e.g. 'RAMPS_AMOUNT_OUT_OF_RANGE'
    e.body; // the full response, with whatever the provider added
  }
}
```

A quote that expired (15 minutes) fails the create with a validation error. Do not retry the create;
request a new quote. The amount the user typed is still valid, the price is not.

## Gotchas

1. **Hardcoding a form.** `requiredFields` differ per quote. Render them from the quote every time.
2. **Reusing a quote after `kycRequired`.** The provider consumed it. Wait for `hasApproved`, then
   quote again.
3. **Treating `pollRampTransaction` as the UI.** It only resolves on a terminal state. Hosted KYC can
   take a day. Show `getRampTransaction` state and let the user leave.
4. **Building deposit instructions client-side.** The reference and expiry only exist on the created
   transaction. Use `depositInstructions` from the result.
5. **Sending the decoded Pix key.** Send the original `qrCode` payload. The decoded form is for
   display and for choosing the amount.
6. **Checking liquidity after quoting.** Check before offering the corridor; a quote on a dry rail
   succeeds and fails later.
7. **Expecting smart wallets to ramp.** Passkey C-address sessions have no classic key to sign the
   SEP-10 challenge or the withdraw payment.
8. **Assuming the rail from the country.** Read `quote.rail`. A country can be served by more than one
   rail, and the recommended quote is not always the one you expect.

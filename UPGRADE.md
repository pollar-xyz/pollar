# Upgrade guide

## 0.12.0 -> 0.12.1

0.12.1 adds `client.stellar.authEntrySigner()`, the auth-entry adapter step,
hash memos and swaps on Solana. Upgrade `@pollar/core`, `@pollar/react` and
`@pollar/react-native` together: `@pollar/react@0.12.1` and
`@pollar/react-native@0.12.1` require `@pollar/core@^0.12.1`. The adapters stay
at `0.12.0`.

`signAuthEntry` now passes the signature confirmation, like every other
signature, so an x402 payment asks the user on an app that says to ask. An
agent that pays unattended sets the app to `AUTO` in the dashboard, or
`WINDOW` with a USD cap; a headless client under `'prompt'` with nothing
subscribed to `client.onConfirmationRequest()` gets
`SDK_CONFIRMATION_UNAVAILABLE`. See
[Signature confirmation](#signature-confirmation).

The modals now follow the language set in the dashboard (Branding > Language)
or the browser's. To keep them in the language of your app, pass it as
`locale` when you create the client (`new PollarClient({ apiKey, locale })`); a
language pinned in the dashboard wins over it.

React Native's `AppShell` and `AccountOnboarding` take `'pt'` in
`settings.language`, and `AppShell`'s `label(key, language)` receives it: a
`label` typed as `(key, language: 'en' | 'es') => string` no longer type-checks.
Type the parameter as `PollarLanguage` (from `@pollar/core`).

## 0.11.5 -> 0.12.0

Use `@pollar/core`, `@pollar/react` and `@pollar/react-native` at matching
versions: `@pollar/react@0.12.0` and `@pollar/react-native@0.12.0` require
`@pollar/core@^0.12.0`. A caret range on 0.11.x (`^0.11.5`) does not reach
0.12, so change it by hand.

Upgrade `@pollar/stellar-wallets-kit-adapter` and
`@pollar/solana-wallet-standard-adapter` to `0.12.0` too: their core range is
`^0.11.2 || ^0.12.0`, while the releases before it (`^0.11.2`) refuse core 0.12.
`@pollar/privy-adapter` and `@pollar/accesly-adapter` have no 0.12 release;
their published ranges do not accept core 0.12.

### API v3

Every request goes to `/v3` of sdk-api. `baseUrl` stays an origin
(`https://sdk.api.pollar.xyz`); the SDK appends the version, so a `baseUrl`
that carried `/v2` must drop it. `/v3` serves the endpoints 0.11.x used on
`/v2` with the same handlers, ramps excepted: Pollar v3 redefines the ramps
API, and the ramps entries of this release describe what changed there. A
custom `fetch`, a proxy allow-list or a test mock that matched `/v2/...` paths
must match `/v3/...`.

`@pollar/core` 0.11.x keeps calling `/v1` and `/v2`. sdk-api v1 retires on
2026-11-30 (planned brownouts before that date answer `410`); v2 stays frozen.
A client that receives the `Deprecation` header logs one warning naming the
`Sunset` date and the migration guide, whatever the version it is on.

### Ramps on API v3

The ramp methods of 0.11.x called endpoints `/v3` does not serve, and they are
gone: `getRampsQuote`, `getRampCountries`, `createOnRamp`, `createOffRamp`,
`completeWithdraw`, `submitRampSignature`, `getRampTransaction`,
`retryRampTransaction`, `pollRampTransaction`, `continueRamp`,
`continueRampTransaction`, `signRampAction`, `getRampLiquidity`,
`getRampKycStatus` and `decodePixQr`, with their `Ramps*` types,
`describeRampAction(snapshot)`, `mergeRampSnapshot`, `mergeRampCountries` and
the `RampWorkflow*` types. A ramp is now an order of one or more legs (the
provider, a swap, a bridge) that Pollar runs server-side:

| 0.11.x                                       | 0.12.0                                                                               |
| -------------------------------------------- | ------------------------------------------------------------------------------------ |
| `getRampRoutes()`                            | `getRampRoutes(direction)`: fiat and asset pairs, with the legs of each              |
| `getRampCountries()`                         | `rampCountries(routes)`                                                              |
| `getRampsQuote(query)`                       | `quoteRamp({ direction, fiat, asset, amount: { value, denomination } })`, best first |
| quote `requiredFields`                       | `rampQuoteFields(quote)`; send the answers as `payee`                                |
| `createOnRamp` / `createOffRamp`             | `createRampOrder({ quoteId, payee })`                                                |
| `getRampTransaction` / `pollRampTransaction` | `getRampOrder(id)` / `pollRampOrder(id, { onUpdate, signal })`                       |
| `nextAction`                                 | `order.pendingAction`: `FIAT_PAYMENT`, `SIGNATURE`, `COSIGN_APPROVAL`, `KYC`         |
| `signRampAction(txId, snapshot)`             | `signRampLeg(orderId, actionId)`                                                     |
| saved transactions in session storage        | `listRampOrders({ open: 'true' })`                                                   |

- A payee the provider would refuse answers `400 VALIDATION_ERROR` with the
  reason in `body.message`, before anything moves.
- A `FIAT_PAYMENT` QR carries its code already rendered in
  `instructions.scannable`, as `depositInstructions.scannable` did.
- A co-signed step is a `COSIGN_APPROVAL`: the user votes on it like any other
  co-sign request (`<CosignModal>`).
- A failure carries `resolutionAction`; `rampResolutionText(failure)` says what
  the user can do. `rampLegTitle(leg)` and `rampLegStatus(leg)` describe each
  leg for a progress list.
- Provider registration, Pix decoding, liquidity and provider KYC status are no
  longer ramp calls: what a provider needs from the user reaches the order as
  its `pendingAction`.

The widgets (`<RampWidget>` in React and React Native) are rebuilt on these
calls. `RampWidgetTemplate` takes the order and the quotes instead of the
0.11.x transaction fields, `RouteDisplay` renders a v3 quote,
`RejectedRouteDisplay` shows a route that was dropped, and `RampWorkflow` is
removed. In React Native the saved ramp in `usePollar()` is
`{ direction, order }`.

### Ramp adapter contract version 2

A server adapter built with `@pollar/core/ramps` keeps working as is: every
field version 2 adds is optional, and a registration without `contractVersion`
is treated as version 1. Declare `contractVersion: 2` in
`defineRampAdapterRegistration` to opt in, then:

- Read `user.actor` to tell a session user (`SDK_USER`) from a user the
  application's backend manages (`APP_USER`); `user.sdkUserId` stays set for both.
- Read `user.wallet.signingMode` (`COSIGNED`, `SELF_CUSTODY`, `EXTERNAL`,
  `APP_CUSTODY`) instead of inferring it from `custody`.
- Return `prebuiltPayload` in a `RampAdapterPayment` when the provider builds
  the transaction itself; Pollar validates it, has it signed and asks for a
  fresh one if it expires first.
- Call `dependencies.recorder.record(...)` around each provider call; Pollar
  stores it as an attempt of the leg. Put personal data only in `sensitive`.
- Throw `RampAdapterError` with `{ providerCode, detail }` so the operator sees
  the provider's own code.
- Break `terms.feeAmount` down in `offer.fees` and declare `validity` on the
  adapter.
- Keep `configurationId` to the account the provider is configured under, and
  put what rotates (a credential hash, a corridor snapshot) in
  `configurationRevision`. Pollar saves `configurationId` with every
  transaction and compares it on each later call; a value that changes on
  rotation strands the transactions in flight.

`capabilities().routes` of a version 2 adapter are the provider's native rails:
the asset and chain the provider itself delivers or takes, not what the end user
receives. Pollar's planner adds the swap and bridge legs.

### Native provider and context

- Children render after the provider effect creates its owned client. Put startup
  UI outside the provider if it must display during that initialization.
- Changing client configuration, `platform.storage`, `platform.visibilityProvider`,
  `platform.openAuthUrl` or `privyAdapter` cancels login, destroys the previous client
  and resets provider state before mounting children with the replacement client.
  Equivalent inline scalar configuration does not restart it. Memoize object-valued
  configuration, wallet adapter arrays and platform adapters to avoid restarts.
  Theme, application configuration and clipboard callback updates remain live.
- `buildTx` opens the transaction modal. Other transaction methods operate through
  core state without automatically opening it; call `openTransactionModal()` when
  your flow requires that presentation.
- `refreshBalance(publicKey)` accepts only the connected address (or no argument).
  Use `getClient().getWalletBalance(publicKey)` to look up another address.
- A null or malformed `getAppConfig()` response produces `configStatus: 'error'`
  with `configError` and `retryConfig()` instead of displaying default configuration.
  Supply `appConfig` for an application that does not fetch remote configuration.
- Import the exported `PollarContextValue` for custom native integrations. It now
  includes configuration status/retry, platform clipboard actions and saved ramp
  state, alongside the bound core methods and modal actions. Update manually
  constructed context mocks to match this shape.

### Ramp chain catalog

`RampChain` is a closed enum with `STELLAR`, `POLYGON` and `SOLANA`, exported as
both a type and a runtime constant from `@pollar/core`. It is independent of
`WalletChain` / backend `WalletNetwork`. Quotes, route assets, terms,
transactions and signing handlers use this same catalog. Lowercase values,
typos and CAIP-2 identifiers are rejected rather than normalized, including at
runtime for JavaScript callers and API responses. Network remains a separate
field; derive a CAIP-2 identifier from the chain and network when needed.

Use `RampChain.SOLANA` or the literal `'SOLANA'`. Adding a new chain requires a
backend enum migration and an updated SDK contract. Provider, asset and payload
encoding registration stays extensible within these three chains. Exact amount
strings retain their precision and formatting.

### Ramp rails

`RampAdapterRail` and the v3 `fiat.rail` are the enum `SPEI`, `PIX`, `PSE`,
`ACH`, `BREB`, `QR`, `BANK_TRANSFER`, `CASH`, `CARD`, `HOSTED`. `BANK_TRANSFER`
is a domestic transfer to an account number, `CASH` a payment at a cash point,
`CARD` a card, and `HOSTED` a route whose method the user picks inside the
provider's own flow: Pollar does not know it in advance, so there are no
payment details to show before the provider's page opens.

A `switch` or `Record` over `RampAdapterRail` or `RampFiat['rail']` that is
exhaustive stops compiling until it handles the four new values. Code that
shows a rail can use `rampRailLabel(rail, { language: 'es', provider })`, which
keeps the named schemes as they are, labels the generic ones, and returns any
rail it does not know unchanged.

### Ramp signing

Every chain/encoding pair, including `STELLAR`/`xdr`, requires an explicitly
registered signer through `registerRampSigningHandler(chain, encoding, handler)`.
Remove it with the returned cleanup function. Core has no built-in ramp signer
and includes no XDR library. An unregistered pair fails before signing.

The registered integration must validate the requested payload against the
authorized wallet account, chain and network before signing, reject cancellation,
and return the signed payload without broadcasting. Call `signRampLeg` only
from an explicit user action; it reads the order again, signs only the action
the user saw and delegates to that handler. Polling an order does not sign.

`<RampWidget>` (React and React Native) signs a leg with the user's connected
wallet when the app registered no signer for it, and checks it first:

- A Stellar XDR is read with `assertRampStellarSigner(action, address)`: every
  operation of a payment or contract call must run as the connected account
  (inside the app's fee bump too); a SEP-10 login must be the anchor's challenge
  with its first data entry from that account. The wallet is asked only then,
  through `signTx`.
- A Solana transfer (`solana-v0-json`) must be built from the connected external
  Solana wallet, and is signed through the new `signSolanaTransaction(base64)`.
- If the connected wallet changes while it signs, the signature is not sent.

The widget lends these signers to core only while the user authorizes. An app
signer registered before Authorize is used instead; an app that registers its
own Stellar signer can call `assertRampStellarSigner` in it.

For example, with your application's existing chain-specific wallet integration:

```ts
const removeSigner = client.registerRampSigningHandler('STELLAR', 'xdr', async (action) => {
  await walletIntegration.validateRampAction(action);
  return walletIntegration.signRampAction(action);
});
```

UI helpers exported from core are `describeRampAction(order)`,
`rampCountries`, `rampQuoteFields`, `rampLegTitle`, `rampLegStatus`,
`rampRailLabel`, `rampResolutionText` and `rampNoRouteText(rejected)` (the fix
every rejected route shares, else a change of amount), `rampRequirementCopy`
and `rampTrustlineAsset` for a route the user can unblock, with
`isRampOrderSettled(order)`, the `RampSigningHandler` type, and
`assertRampStellarSigner` for a Stellar signer; registry and URL internals are
private.

### Co-sign approval groups removed

Every co-signed transaction now asks the user for itself, ramp steps included;
a ramp no longer groups its steps under one approval, and the device no longer
votes a later step on a stored consent. Wallet setup (account creation,
trustlines, a new chain) asks the user too: `<CosignModal>` opens for it, and a
headless app approves it through `client.cosign.approve(request)` from a user
action.

`cosignGroupOf`, `cosignStepKeyOf`, `stepInGroup` and the `CosignGroup` type are
no longer exported, and the cosign modal no longer lists a group's steps.
A request's `stepKey` stays on the request itself. A device that stored group
consents under 0.11.5 drops them on its first start with this version.

### Co-signed activity proposed by the device

sdk-api no longer opens the Turnkey activity of a co-signed request: the device
reads the unsigned payload, builds the Turnkey request from the values it
checked and proposes it, and Pollar's approver votes second. The hosted sdk-api
serves this relay. An app that uses the built-in
`<CosignModal>` or `client.cosign.approve(request)` changes nothing. Code that
drives the verification itself:

- `client.cosign.verify(request)` returns `proposal` (the Turnkey request the
  device will relay) instead of `turnkeyPayload`.
- `client.cosign.approve(request)` has no `verify` option: it always verifies.
- `readActivityIntent()` and `readActivityPayload()` are removed; read what the
  user approves from the verification result.
- `client.cosign.reject(request)` closes the request on the server.

### Recovery and custody migration in the provider

No code change is needed, but the provider shows two new screens when the
server asks for them. When sdk-api reports that the user's custodial wallets
must move to Turnkey, `<CustodyMigrationModal>` opens after login, before
anything else, and the user can leave it for later. When the wallet requires a
recovery method and has none, `recoveryLocked` is true: the wallet menu shows
the lock with a way to fix it and the receive modal hides the address until
`<RecoveryModal>` adds one. A headless app reads the same state from
`client.cosign.custodyMigration()` and `client.cosign.recovery.status()`.

### Branding and the wallet button template

In `@pollar/react`, the dashboard's Branding no longer outranks the host page:
a rule the app writes on a Pollar root for a public `--pollar-*` variable wins
over the dashboard, which wins over the theme defaults. An app that relied on
the dashboard overriding its own CSS removes that CSS. `html.dark` switches to
the dark defaults only while Branding leaves the palette unpinned.
`--pollar-font-family` and `--pollar-font-family-mono` set the fonts; without
them the components use the page's font instead of Geist.

A custom wallet button template (`WalletButtonTemplateProps`) receives `theme`,
`accentColor` and `styleOverrides` instead of `dropdownBg`, `dropdownBorder` and
`itemColor`. Pass them to `buildModalCssVars` for the same colors the built-in
template uses.

### Signature confirmation

The default is now `'prompt'`: every signing call waits for the user, whatever
the wallet's custody, unless the app's dashboard says otherwise. From 0.12.1
that includes `signAuthEntry`, and with it every x402 payment. A headless
app with nothing subscribed to `client.onConfirmationRequest()` gets
`SDK_CONFIRMATION_UNAVAILABLE` on every signature: subscribe, or mount the
provider, which renders `<ConfirmModal>`.

The dashboard (Wallet settings → Signature confirmation) sets the app's
policy: always ask, ask once and then sign for a window (5 minutes and 50 USD
by default), or never ask. With `confirmation` unset the SDK follows it. Set,
the stricter of the two applies: `'auto'` in code no longer skips the prompt
unless the dashboard says `AUTO` too.

```ts
confirmation: 'prompt' | 'auto' | { window: { seconds: 300, maxUsd: 50 } };
```

Inside a window, a signature signs without asking while the USD total of the
window stays within `maxUsd`. Only a payment the SDK builds itself
(`sendPayment`, `buildAndSignAndSubmitTx('payment', ...)`) has a value it can
read; any other signature (a raw `signTx`, a swap, a contract call) always asks,
and so does an asset with no price. A ramp leg always asks, whatever the
policy. The window closes on logout.

## 0.11.4 -> 0.11.5

No code change is needed. `@pollar/react@0.11.5` and `@pollar/react-native@0.11.5`
require `@pollar/core@^0.11.5`; if you pin the packages to exact versions, keep
them on the same version. The privy, accesly and stellar-wallets-kit adapters
stay at 0.11.2: their `@pollar/core@^0.11.2` range already accepts 0.11.5.
`@pollar/solana-wallet-standard-adapter` is published for the first time, as
`0.11.5`, with the same `^0.11.2` range.

### Co-signed wallets (Turnkey)

No code change is needed. Under the default `confirmation: 'auto'` a co-signed
wallet's device verifies each request against Turnkey and votes on its own, so
`signTx`, `signAndSubmitTx` and `buildAndSignAndSubmitTx` end in `signed` /
`success` or an error, exactly as for a custodial wallet. A request the device
does not settle (a setup it does not recognize) opens `<CosignModal>`.

Two types still gain a member, so an exhaustive `switch` needs the new case to
compile, although only `cosignManual: true` ever produces it:

- `SignOutcome`, `SubmitOutcome` and `TrustlineOutcome` include
  `{ status: 'cosign_pending', request }`.
- `TransactionState` includes `{ step: 'awaiting_cosign', request }`.

With `cosignManual: true` the app approves through `client.cosign.approve(request)`
from an explicit user action, or waits for `onCosignStateChange`.

A mainnet app switched to `COSIGNED` custody needs an sdk-api that serves the
`/cosign` routes, and its users need this SDK version: the login sends the
device key that becomes their half of the quorum.

### Showing every signature first

`confirmation: 'prompt'` makes every signing call wait for the user, whatever
the wallet's custody. `@pollar/react` and `@pollar/react-native` render the
prompt (`<ConfirmModal>`); a headless app subscribes with
`client.onConfirmationRequest()` and answers each pending confirmation with
`confirm()` or `reject()`. Leave it at `'auto'` to keep today's behaviour.

### Templates

Only for apps that mount the templates themselves: `RampWidgetTemplateProps`
and `SendModalTemplateProps` gain optional props (the settlement chain and
`fundsInTransit` with its retry; the Stellar memo), so a custom template written
before this keeps compiling.

## 0.11.3 -> 0.11.4

No migration steps for an app that uses the built-in components. The wallet
reports where its on-chain Stellar account stands, the client watches it until
the account lands, a DPoP proof rejected over clock skew is re-signed instead of
clearing the session, every request carries an `x-pollar-sdk` build header,
ramp quotes report the requirement steps a route still needs, the wallet
modals follow the new design, apps can offer cards, and an app can create its
users' wallets on demand. `@pollar/react@0.11.4` and
`@pollar/react-native@0.11.4` require `@pollar/core@^0.11.4`; if you pin the
packages to exact versions, keep them on the same version.

**Adapters.** They are not part of this release. On npm,
`@pollar/stellar-wallets-kit-adapter@0.11.2` (`@pollar/core@^0.11.2`) and
`@pollar/privy-adapter@0.11.1` (`^0.11.1`) already accept core 0.11.4.
`@pollar/accesly-adapter@0.10.1` asks for `@pollar/core@^0.10.1`, which does
not: npm 7+ refuses that install unless you pass `--legacy-peer-deps`.

**`@pollar/react-native` joins the SDK's version line,** from `0.1.1` to
`0.11.4`. A `^0.1.1` range does not pick it up: install
`@pollar/react-native@^0.11.4` with `@pollar/core@^0.11.4`.

**License.** From 0.11.4 the packages are licensed under Apache-2.0 (earlier
versions stay MIT). Both are permissive; Apache-2.0 adds an explicit patent
grant and asks that the `NOTICE` file each package now ships travels with
redistributions.

### KYC and ramps

- **`pollKycStatus()` returns when the decision settles.** It used to keep
  polling until `approved` or `rejected`. It now also returns `'pending'` for a
  session held for manual review and `'expired'` for one that expired. If you
  loop on it, treat `'pending'` as "under review, stop polling", and use
  `pollKycDecision()` when you need the `reviewReason`.
- **`KycStatus` includes `'expired'`.** An exhaustive `switch` over it needs the
  new case.
- **KYC endpoints throw `PollarApiError`.** `getKycStatus`, `getKycProviders`
  and `startKyc` throw it with the backend code instead of a plain `Error`. The
  message is still the code; prefer `isPollarApiError(err) && err.code`.
- **A ramp quote may come back with no quotes and a non-empty
  `requirementsRequired`.** If you build your own route list, show those routes
  as locked and open the pending step (`type` and `optionId`); then quote again
  instead of reusing the quote you held. `<RampWidget>` does this for you. This
  needs an sdk-api that serves `/v2/requirements`.

### Wallet modal templates

Only for apps that mount the templates themselves:

| Template                          | Change                                                                                                                                    |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `SendModalTemplateProps`          | new required `onMax`, `onPaste`; `chains`, `walletAddress`, `onSelectChain` optional (pass `chains` + `onSelectChain` to show the picker) |
| `SwapModalTemplateProps`          | new required `onReverse`, `onMax`                                                                                                         |
| `SessionsModalTemplateProps`      | new required `revokeError` (`string \| null`)                                                                                             |
| `RampWidgetTemplateProps`         | new required `kycRequired` (`RampQuoteRequirement[]`), `onVerifyRoute`                                                                    |
| `ReceiveModalTemplateProps`       | `chains`, `onSelectChain` optional (pass both to show the picker)                                                                         |
| `WalletBalanceModalTemplateProps` | `chains`, `onSelectChain` optional (pass both to show the picker); new optional `assetMetadata`                                           |
| `KycModalTemplateProps`           | new optional `reviewReason`, `processing`, `error`, `onStartAgain`                                                                        |

The built-in Send, Receive and Wallet balance modals keep the network picker:
it renders when the app has two or more chains, so a single-chain app shows
none. A template you mount yourself shows it only when you pass both `chains`
and `onSelectChain`.

### Wallet provisioning

**One behaviour change to be aware of even if you change no code.** The platform
now creates the end-user's Stellar account in the background instead of inside
`POST /auth/login`, so a login returns before the account is on the ledger. An
on-chain operation attempted in that window comes back as `SDK_WALLET_NOT_READY`
(409) rather than succeeding. It is a few seconds on a healthy path, and it is
the same window whether or not you upgrade - the SDK is what makes it visible.

If you built your own send/receive UI, gate it:

```ts
import { isWalletNotReady } from '@pollar/core';

// Ask before offering the operation...
const wallet = client.getWallet();
if (wallet?.provisioning === 'CREATING') {
  // show "preparing your account", and wait for the transition below
}

// ...and recognize the server's refusal if one slips through. Wait for
// onWalletStateChange - do NOT retry in a loop.
const outcome = await client.signAndSubmitTx(xdr);
if (isWalletNotReady(outcome)) {
  /* ... */
}

const off = client.onWalletStateChange((provisioning) => {
  if (provisioning === 'READY') enableSending();
  if (provisioning === 'FAILED') showSupportPath();
});
```

`@pollar/react`'s built-in Send, Receive and wallet-button templates already do
this. These provisioning props are optional on a template you mount yourself:
`notReadyReason` on `SendModalTemplateProps` / `ReceiveModalTemplateProps` /
`WalletButtonTemplateProps`, and `onboardingStatus` on
`RampWidgetTemplateProps` (the redesign's required props are listed in the
table above). Render `notReadyReason` when it is
present to phrase the wait the way the built-ins do, or call the exported
`walletNotReadyReason(wallet, chain)` yourself.

`wallet.provisioning` is absent on a session minted before this release, so read
it as "not reported" rather than as a problem - `undefined` is not `CREATING`.

**Server requirement.** `x-pollar-sdk` is a non-safelisted request header, so an
sdk-api that does not list it in its CORS `allowHeaders` fails the preflight and
takes down every browser app on that origin. Pollar's hosted sdk-api allows it.
If you run sdk-api yourself, deploy the allowlist change **before** upgrading
the SDK.

### Wallets created on demand

Nothing changes for an app that creates wallets at login, the default. If you
set wallet creation to **on demand** (or **never**) in the dashboard, a user
signs in without a wallet:

- `WalletProvisioning` includes `'NONE'`. An exhaustive `switch` over it needs
  the new case.
- Signed in means having a session, not having an address: `getWallet()` can be
  `null` for a signed-in user. Check `client.hasWallet()` (or `hasWallet` from
  `usePollar()`), which counts a wallet on any chain.
- Create the wallet with `client.createWallet()` (or `createWallet` from
  `usePollar()`) when your app needs it. `<WalletButton>` offers it on its own.
- A signing call made without a wallet returns `SDK_WALLET_REQUIRED`; recognize
  it with `isWalletRequired()`.

Turn on demand on only once your app runs 0.11.4: an older SDK cannot create
the wallet after the login.

### Cards

Additive: nothing to change unless you enable a card provider in the dashboard.
Then open `<CardModal>` with `openCardModal()` from `usePollar()`, or build your
own flow on the card methods of `PollarClient`. The card number from
`revealCardSecrets()` is decrypted on the device: show it and drop it, never
store or log it.

See the [CHANGELOG](./CHANGELOG.md) for the details.

## 0.11.2 -> 0.11.3

No breaking changes. 0.11.3 is a patch: sessions survive reloads when the DPoP
keypair fails to persist, `logout()` no longer races an in-flight or newer
login, cross-tab session writes are serialized and ownership-gated, and a
consumer-built `PollarClient` passed to `PollarProvider` keeps passkey login.

One packaging change: `@pollar/core` moved from `dependencies` to
`peerDependencies` in `@pollar/react`. The old `dependencies` entry could
install a second, package-local copy of core, which broke `instanceof`, split
the live-client registry, and let two clients share one persisted session row.
On npm 7+ there is nothing to do - peer dependencies install automatically. On
npm 6, Yarn 1, or with `--legacy-peer-deps`, add `@pollar/core` to your own
dependencies. `@pollar/react@0.11.3` requires `@pollar/core@^0.11.3`; if you
pin both packages to exact versions, keep them on the same version.

One type-level removal in `@pollar/react`: `WalletButtonTemplateProps` no
longer carries `walletType`. The default template never rendered it (the
wallet-logo mapping lives in the transaction modal, which derives its own
value). If a custom wallet-button template of yours read `props.walletType`,
reconstruct it from the wallet exposed by `usePollar()`:

```tsx
const { wallet } = usePollar();
const walletType = wallet?.custody === 'external' ? wallet.provider : null;
```

See the [CHANGELOG](./CHANGELOG.md) for the details.

## 0.11.1 -> 0.11.2

No breaking changes and no migration steps. 0.11.2 is additive: the
`client.stellar` namespace (SEP-53 message + SEP-10 challenge ownership
proofs), a multichain Transaction History modal in `@pollar/react`, and the
Freighter adapter migrated to `@stellar/freighter-api` 6.0.0. Existing call
sites compile and behave unchanged. See the [CHANGELOG](./CHANGELOG.md) for
the details.

## 0.11.0 -> 0.11.1

0.11.1 reworks the multichain wallet responses. The wire format moved to a
`chains` envelope and an unreadable chain is now represented explicitly instead
of being flattened away, which changes two public types.

### 1. `balance` and `available` are now `string | null`

`WalletBalanceRecord.balance` and `.available` were `string`. They are now
nullable: `null` means **the chain could not be read** (an unreachable RPC), not
an empty wallet. It is never coerced to `'0'`, precisely so the UI can tell the
two apart.

```ts
// BEFORE (0.11.0) — always a string
const n = parseFloat(record.balance);

// AFTER (0.11.1) — null is "unavailable", not zero
const n = record.balance === null ? null : parseFloat(record.balance);
```

Render `null` as a dash or an "unavailable" state. Rendering it as `0` tells the
user their funds are gone.

### 2. Every chain reports a full asset list

At 0.11.0 the non-Stellar chains reported only their native token. Now every
chain returns its native coin **plus each token the app enabled**, so one loop
handles Stellar, Polygon and Solana alike. If you special-cased "Solana only has
SOL", drop that branch.

### 3. New balance fields

`decimals?: number`, `limit?: string` and `sponsored?: boolean` join the record,
and `type` gained `'token'` alongside the Stellar classic values. Format amounts
against each token's own `decimals` (Stellar stays at 7) rather than assuming 7
everywhere. An exhaustive `switch` on `type` needs a `'token'` arm.

### 4. `@pollar/react`: templates require the chain props

`WalletBalanceModalTemplate`, `EnabledAssetsModalTemplate`, `SendModalTemplate`
and `ReceiveModalTemplate` now take `chains`, `selectedChain` and
`onSelectChain`. If you mount a template yourself, build them with the newly
exported helpers:

```tsx
import type { WalletChain } from '@pollar/core';
import { useEffect, useState } from 'react';
import { ChainSelect, addressForChain, useChains, usePollar } from '@pollar/react';

const { wallets } = usePollar();
// useChains() applies the app's configured chain order from /config; prefer it
// over chainsOf(wallets) alone, which cannot know that order.
const { chains } = useChains();

// Start at null and settle on the first configured chain in an effect - the
// same thing the built-in modals do. Seeding with useState(primaryChain) would
// pin the picker to null forever: /config is still in flight on the first
// render, primaryChain is null until it resolves, and useState only reads its
// argument once.
const [selectedChain, setSelectedChain] = useState<WalletChain | null>(null);
useEffect(() => {
  if (selectedChain === null && chains.length > 0) setSelectedChain(chains[0]!);
}, [chains, selectedChain]);

const walletAddress = addressForChain(wallets, selectedChain);
```

The wrapper components (`<WalletBalanceModal>` and friends) do this for you — no
change needed if you use those.

### 5. `setTrustline` drops the `sponsored` opt-in flag

`setTrustline(asset, { sponsored: true })` no longer type-checks. Who pays is now
decided server-side from the app config, not by a caller flag: embedded wallets
hit `POST /wallet/assets/trustline` (the server sponsors or self-pays, then
submits) and external wallets co-sign whichever XDR the build endpoint returns.
The only knob left is the opt-out `skipSponsorship`, which forces a self-pay
`change_trust` — the same shape as `skipSponsorship` on `signTx` / payments.

```ts
// BEFORE (0.11.0)
await setTrustline(asset, { sponsored: true });

// AFTER (0.11.1) — drop the flag; the app config decides
await setTrustline(asset);
// ...or force the user to pay their own reserve + fee:
await setTrustline(asset, { skipSponsorship: true });
```

### 6. `TxBuildSignSubmitBody` / `TxBuildSignSubmitContent` became unions (types only)

`POST /v2/tx/build-sign-submit` gained a `chain` field (absent = `STELLAR`) and
answers per-chain, so both generated types now carry a non-Stellar member. Reading
a Stellar-only field (`resultCode`, `estimatedFee`, `options`, the `operation`
union) off the bare type no longer compiles — narrow first:

```ts
const resultCode = 'resultCode' in content ? content.resultCode : undefined;
```

No runtime behaviour changed and the request stays backward-compatible (omit
`chain` and the endpoint behaves exactly as before); only the static types are
stricter.

### 7. New exported types

`WalletAssetsContent`, `EnabledAssetRecord`, `PollarPersistedWallet` and
`SendPaymentParams` are now public.

## 0.10.x -> 0.11.0

0.11.0 is the multichain release: Solana joins Stellar, and **every SDK request
moved from `/v1` to `/v2`**.

### 1. The SDK now calls `/v2`

`basePath` is built as `${baseUrl}/v2`. If you pass a custom `baseUrl`, keep
passing the **origin only** (`https://sdk.api.example.com`) — the SDK appends the
version prefix itself. Your backend must serve the `/v2` routes; an sdk-api that
only has `/v1` will 404 across the board.

### 2. Balances are multichain

`WalletBalanceRecord` gained `chain` (`'STELLAR' | 'POLYGON' | 'SOLANA'`), and
the balance response gained `multichain`, set when more than one chain came back.
Records minted before multichain carry no `chain`; treat absent as `'STELLAR'`
rather than as unknown.

### 3. The `WalletAdapter` contract is chain-aware

Adapters may declare `chain`. **Absent means `'STELLAR'`**, so existing Stellar
adapters need no change. A single `walletAdapters` array can now carry Stellar
and Solana adapters side by side. `signTransaction` and `signAuthEntry` became
**optional** on the contract, because non-Stellar adapters do not implement them
— if you consume an adapter directly, guard those calls.

### 4. Sign In With Solana (SIWS)

New types `SolanaSignInInput` / `SolanaSignInOutput` (with a raw `signMessage`
fallback) and `signSolanaTransaction`. An adapter declaring `chain: 'SOLANA'` is
routed through SIWS instead of Stellar's SEP-10 challenge. Connect
user-controlled Solana wallets with `@pollar/solana-wallet-standard-adapter`.

## 0.9.x -> 0.10.0

0.10.0 unifies external wallets into a single `walletAdapters: WalletAdapter[]`
array and removes the old singular `walletAdapter` resolver, the `loginWallet()`
method, and the 0.8-era `ui.renderWallets` slot / `/picker` bundle. The login
modal now renders one login entry per registered adapter automatically.

### 1. `walletAdapter` (singular resolver) -> `walletAdapters` (array)

`PollarClientConfig.walletAdapter` is replaced by `walletAdapters?: WalletAdapter[]`.
Built-in `FreighterAdapter` / `AlbedoAdapter` still auto-register; pass any extra
adapters as array entries (an entry overrides a built-in with the same `type`).

```ts
// BEFORE (0.9.x)
new PollarClient({ apiKey, walletAdapter: stellarWalletsKit({ network }) });

// AFTER (0.10.0)
new PollarClient({ apiKey, walletAdapters: stellarWalletsKitAdapters({ network }) });
```

### 2. `stellarWalletsKit(...)` -> `stellarWalletsKitAdapters(...)`

`@pollar/stellar-wallets-kit-adapter` now exports `stellarWalletsKitAdapters()`,
which returns a `WalletAdapter[]` (one per module) instead of a resolver. It is
also SSR-safe: it returns `[]` when there is no `window` and builds the real list
when it re-runs on the client. Requires `@pollar/core@^0.10.0` /
`@pollar/react@^0.10.0`.

### 3. `loginWallet(id)` -> `login({ provider: id })`

The dedicated wallet-login method is gone. Enter any wallet through the unified
login entry point, using the adapter's `type` as the provider id.

```ts
// BEFORE
client.loginWallet('xbull');
// AFTER
client.login({ provider: 'xbull' });
```

### 4. `ui.renderWallets` / `/picker` bundle removed

The 0.8 `ui.renderWallets` slot and the `@pollar/stellar-wallets-kit-adapter/picker`
bundle (`createStellarWalletsKitBundle`) no longer exist. The login modal builds
the wallet list from the registered `walletAdapters`, so you just pass them:

```tsx
// BEFORE (0.8/0.9)
<PollarProvider
  client={{ apiKey: '…', walletAdapter: bundle.walletAdapter }}
  ui={{ renderWallets: bundle.renderWallets }}
>

// AFTER (0.10.0)
<PollarProvider client={{ apiKey: '…', walletAdapters: stellarWalletsKitAdapters({ network }) }}>
```

### 5. Custom `WalletAdapter` authors

Adapters now carry display metadata: the constructor / factory takes a
`meta: WalletAdapterMeta` (at least `{ label }`) so the adapter can render its own
login entry. For example `new StellarWalletsKitAdapter('freighter', { label: 'Freighter' })`.

### 6. `@pollar/react`: `usePollar().walletAddress` / `walletType` -> `wallet`

The context no longer exposes `walletAddress` or `walletType`. Read the wallet
through `wallet: WalletInfo | null` instead.

```tsx
// BEFORE
const { walletAddress, walletType } = usePollar();
// AFTER
const { wallet } = usePollar();
const address = wallet?.address;
const custody = wallet?.custody; // 'internal' | 'smart' | 'external'
```

### 7. One-time re-login (SDK only)

The local storage namespace was widened (the apiKey hash went from 8 to 32 hex
chars), which orphans sessions persisted by older builds. Every user
re-authenticates once after the host app ships 0.10.0. No backend change, no
migration, no action required.

## 0.8.x → 0.9.0

The SDK surface drops the legacy wallet `publicKey` alias in favor of `address`,
and surfaces the internal wallet type as `'internal'` instead of `'custodial'`.
**The `sdk-api` wire is unchanged** — it still emits `'custodial'` and
`publicKey`, and `@pollar/core` ≥0.9.0 remaps both at the client boundary. So
SDKs ≤0.8.x keep working, sessions persisted by older SDKs are migrated
transparently on read, and no coordinated backend deploy is required.

### Most consumers — no change

If you read the wallet address through `usePollar().walletAddress`
(`@pollar/react`), nothing changes — it's resolved internally from
`session.wallet.address`.

### Required changes

#### 1. Reading the wallet address (headless `@pollar/core`)

`session.wallet.publicKey` is removed; read `session.wallet.address` (it always
held the same value).

```ts
client.onAuthStateChange((s) => {
  if (s.step !== 'authenticated') return;
  // BEFORE (≤0.8.x): s.session.wallet.publicKey
  // AFTER  (0.9.0):  s.session.wallet.address
  const addr = s.session.wallet.address;
});
```

#### 2. `wallet.type` `'custodial'` → `'internal'`

The developer-facing union is now `'internal' | 'smart' | 'external'`. Code
branching on `wallet.type === 'custodial'` must switch to `'internal'`.

#### 3. Custom `WalletAdapter` authors

`ConnectWalletResponse` is now `{ address }` only — drop the duplicate
`publicKey`.

```ts
// BEFORE
async connect(): Promise<ConnectWalletResponse> {
  return { address: pubkey, publicKey: pubkey };
}
// AFTER
async connect(): Promise<ConnectWalletResponse> {
  return { address: pubkey };
}
```

### Deploy ordering

`@pollar/core` 0.9.0 sends `address` (preferred) on `/tx/*` request bodies. The
`sdk-api` accepts **either `address` or `publicKey`** (`address` wins), so ship
the matching `sdk-api` change before/with `@pollar/core` 0.9.0.

### `@pollar/stellar-wallets-kit-adapter`

`connect()` now returns `{ address }` only. Requires `@pollar/core@^0.9.0` /
`@pollar/react@^0.9.0` (peer ranges pinned).

## 0.7.x → 0.8.0

`<PollarProvider>` is reshaped to make the wallet picker pluggable and to give
the consumer explicit control over the remote `/applications/config` fetch.
All changes are mechanical renames; nothing in `@pollar/core` moves.

### Required changes

#### 1. `config` → `client`

The provider's first prop is renamed from `config` to `client`. It now accepts
**either a `PollarClientConfig` (the current shape) or a pre-built
`PollarClient` instance**. The provider constructs the client at first render
in both cases.

```tsx
// BEFORE
<PollarProvider config={{ apiKey: '…', walletAdapter }}>

// AFTER (no behavior change beyond the rename)
<PollarProvider client={{ apiKey: '…', walletAdapter }}>
```

The pre-built form is useful if you want to keep a reference to the client
outside React (tests, server actions, jobs):

```tsx
const client = new PollarClient({ apiKey: '…', walletAdapter });
<PollarProvider client={client}>
```

> **Note**: the client is locked at first render. Changing the prop afterwards
> is ignored. To swap clients, unmount and remount the provider. This already
> matched the 0.7.x behavior — it's just now explicit.

#### 2. `styles` → `appConfig.styles`

The top-level `styles` prop moves under a new `appConfig` block whose shape
mirrors what `/applications/config` returns.

```tsx
// BEFORE
<PollarProvider config={{…}} styles={{ theme: 'dark' }}>

// AFTER
<PollarProvider client={{…}} appConfig={{ styles: { theme: 'dark' } }}>
```

#### 3. The remote-config fetch is now opt-out

If you pass `appConfig` (even as `{}`), the provider **skips** the `GET
/applications/config` call entirely. Missing fields fall back to the defaults
already baked into `LoginModalTemplate` (light theme, Pollar logo, no social
providers, etc.).

If you **don't** pass `appConfig`, the SDK fetches `/applications/config` on
mount exactly like 0.7.x did. The previous 3-level styles merge
(`remote.styles + propStyles + providers merge`) is removed: you now either get
the remote config or your local one, not a hybrid.

```tsx
// Force defaults, no network call:
<PollarProvider client={{…}} appConfig={{}}>

// Keep the existing remote-config behavior:
<PollarProvider client={{…}}>

// Local override of styles, no network call:
<PollarProvider client={{…}} appConfig={{ styles: { theme: 'dark' } }}>
```

#### 4. Remote-config errors now log to `console.error`

Previously, a failed `/applications/config` fetch was silently swallowed. It
now logs via `console.error('[PollarProvider] getAppConfig failed', err)`,
matching how the rest of `@pollar/core` reports unexpected failures.

### New: `renderWallets` slot

> **Removed in 0.10.0.** The `ui.renderWallets` slot and the `/picker` bundle
> below were superseded by the `walletAdapters[]` model. See the 0.9.x -> 0.10.0
> section above. The rest of this section applies only to 0.8.x / 0.9.x.

`<PollarProvider>` accepts a new optional `ui.renderWallets` slot that
replaces the hardcoded Freighter+Albedo list inside the LoginModal wallet
picker. If you don't pass it, the default Freighter+Albedo list is shown
exactly as before.

```tsx
import type { RenderWalletsSlot } from '@pollar/react';

const renderWallets: RenderWalletsSlot = ({ onConnect, authState }) => (
  <MyCustomWalletGrid onPick={onConnect} disabled={authState.step !== 'idle'} />
);

<PollarProvider client={{…}} ui={{ renderWallets }}>
```

For the common case of "drop in the Stellar Wallets Kit picker", the new
`@pollar/stellar-wallets-kit-adapter/picker` subpath ships a ready-made
bundle:

```tsx
import { createStellarWalletsKitBundle } from '@pollar/stellar-wallets-kit-adapter/picker';
import { Networks } from '@creit.tech/stellar-wallets-kit';

const bundle = createStellarWalletsKitBundle({
  network: Networks.PUBLIC,
  picker: { wallets: ['xbull', 'lobstr', 'freighter'] },
});

<PollarProvider
  client={{ apiKey: '…', walletAdapter: bundle.walletAdapter }}
  ui={{ renderWallets: bundle.renderWallets }}
>
```

### `@pollar/stellar-wallets-kit-adapter` — no required changes

If you already consume `stellarWalletsKit({ network })` for `walletAdapter`,
nothing changes. The root export stays the same callable
`WalletAdapterResolver`. React only enters the picture if you import from
`@pollar/stellar-wallets-kit-adapter/picker`, and is declared as an optional
peer dependency — headless consumers don't pull it in.

### Why the breaking change

- The previous `config: PollarClientConfig` prop leaked SDK plumbing
  (`storage`, `keyManager`, …) into the React API. `client` is a cleaner
  contract that also lets you reuse the constructed client outside React.
- The previous 3-way style merge was implicit and hard to reason about
  (props sometimes won, sometimes the remote did). The new "presence =
  opt-out" rule is one line and predictable.
- The wallet picker was hardcoded to Freighter+Albedo, which forced
  `@pollar/react` to bundle wallet-specific logos and labels. The
  `renderWallets` slot decouples the modal from any particular wallet
  ecosystem.

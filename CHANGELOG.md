# Changelog

## Unreleased

> Headline: **Solana custodial wallets can send.** The atomic tx endpoint became
> multichain, and the Send / Receive modals gained the network picker the
> balance and asset modals already had.

### `@pollar/core` — BREAKING (types only)

- **`TxBuildSignSubmitBody` and `TxBuildSignSubmitContent` are now unions.**
  `POST /v2/tx/build-sign-submit` accepts a `chain` (absent = `STELLAR`) and
  answers with a per-chain shape, so both generated types gained a non-Stellar
  member. Any code that reads a Stellar-only field off them — `resultCode`,
  `estimatedFee`, `options`, the `operation` union — must narrow first:

  ```ts
  const resultCode = 'resultCode' in content ? content.resultCode : undefined;
  ```

  Worth calling out because it does not look like a breaking change from the
  API side: nothing was removed, and the request stays backward-compatible
  (omit `chain` and the endpoint behaves exactly as before). But adding a member
  to a union removes guarantees from whoever reads it. This bit the SDK's own
  `buildAndSignAndSubmitTx`, which is how it was found.

  No runtime behaviour changed, and nothing under `/v1` is affected.

### `@pollar/core`

- New `sendPayment(params)` — one entry point for sending on any chain the user
  holds a wallet on. Stellar routes through `buildAndSignAndSubmitTx`, so
  external adapters and passkey wallets keep the split build → sign → submit
  flow; chains whose signature expires (a Solana blockhash lapses in ~60s) do
  the whole thing in one server-side call and are **custodial-only** for now.
  An `idempotencyKey` is minted per call, because a Solana submit is a single
  non-idempotent shot and a transport retry would otherwise transfer twice.
- New `toBaseUnits(amount, decimals)` / `fromBaseUnits(base, decimals)`.
  Balances are reported formatted (`"1.5"`) while base-unit chains take integer
  amounts (`1500000000` lamports), so anything sending to those chains must
  convert. The arithmetic is string + `BigInt`, never float —
  `parseFloat('0.1') * 1e9` is `100000000.00000001`, and at 18 decimals a float
  cannot represent the value at all. More fractional digits than the asset has
  is an error, not a silent truncation, which would send less than was typed.
- New exported type `SendPaymentParams`.
- `getWallets()` is surfaced through `@pollar/react`'s context (see below).

### `@pollar/react`

- `wallets` (one `WalletInfo` per chain) is on the Pollar context, backing every
  network picker.
- `SendModal` and `ReceiveModal` gained the network picker. The address, assets
  and balances all scope to the selected chain, and Send converts the amount on
  base-unit chains and links to that chain's explorer. Polygon is still blocked
  in Send — the backend has no transfer path for it yet.
- `ChainSelect` hides itself when the user holds a wallet on only one chain, so
  a Stellar-only app sees no new control.
- The Assets modal's trustline status pill and Enable/Disable button collapsed
  into a single `Toggle`. Native XLM renders as a locked-on switch: its
  trustline is implicit and cannot be removed.
- Refreshing the Balance and Assets modals no longer blanks the list. The
  previous data stays rendered under a `BusyOverlay` that blocks interaction,
  instead of the list collapsing and reflowing on every refresh.

## 0.11.1

> Stable release. Published under the default `latest` dist-tag
> (`npm i @pollar/core`). This is the promotion of the `0.11.1-rc.*` line
> (rc.0 -> rc.3) plus the per-chain wallet rework.

### Highlights (since 0.11.0)

- **Every chain reports a full asset list.** The v2 wallet responses moved to a
  `chains` envelope, and each chain now returns its native coin plus every token
  the app enabled - so one loop handles Stellar, Polygon and Solana alike. At
  0.11.0 the non-Stellar chains reported only their native token. Balances gained
  `decimals`, `limit` and `sponsored`.
- **A chain that fails to resolve no longer reads as empty.** A chain carrying
  `error` contributes nothing to the flattened list, and an unreadable balance
  stays `null` instead of being coerced to `'0'`, so the UI can tell
  "unavailable" from "zero". `WalletBalanceRecord.balance` is therefore
  `string | null`.
- **Network picker across the asset modals.** New `ChainSelect` in
  `@pollar/react`; the wallet-balance and enabled-assets modals filter by the
  selected network locally (the backend returns every chain in one payload, so
  switching networks costs no request).
- **`skipSponsorship` on `signTx`** and a **login modal that surfaces
  loading / error state** when the app config fails to load.

### `@pollar/core`

- `GET /v2/wallet/balance` and `GET /v2/wallet/assets` are read through the
  `chains` envelope (`_flattenBalances` / new `_flattenAssets`), both collapsing
  the per-chain answer into one chain-tagged list. Only Stellar restates the
  session `network`; the other chains ride the same testnet/mainnet choice.
- `WalletBalanceRecord.balance` and `.available` are now `string | null`
  (`null` = the chain could not be read). Callers that parse the balance need a
  null check.
- New exported types: `WalletAssetsContent`, `EnabledAssetRecord`,
  `PollarPersistedWallet`.
- `signTx` accepts `skipSponsorship`.
- Solana wallet endpoints added to the OpenAPI schema and wired into the client.
- The wallet adapter is disconnected on explicit logout.

### `@pollar/react`

- New `ChainSelect` component; `WalletBalanceModal` and `EnabledAssetsModal`
  render a network picker and scope their rows to the selected chain. Row keys
  are chain-qualified, since the same code + issuer can exist on two chains.
- Balances format against each token's own `decimals` (Stellar keeps 7), and a
  `null` balance renders as a dash rather than `0`.
- Stellar-only affordances (trustlines) are gated on the selected chain being
  Stellar.
- The login modal shows loading / error state when the app config request fails.

## 0.11.0

> Stable release. Published under the default `latest` dist-tag
> (`npm i @pollar/core`). Headline: the SDK goes **multichain** - Solana joins
> Stellar.

### Highlights (since 0.10.1)

- **Multichain balances (Stellar + Solana).** `PollarClient` balances now come
  from the v2 wallet endpoint: each balance is tagged with its `chain`
  (`STELLAR` | `SOLANA` | `POLYGON`) and the response flags `multichain`. Solana
  (SOL) is reported alongside Stellar assets. On non-Stellar chains only the
  native token is reported for now.
- **Sign In With Solana (SIWS) contract in `@pollar/core`.** New SIWS login types
  (`SolanaSignInInput` / `SolanaSignInOutput`, with a raw `signMessage` fallback)
  and `signSolanaTransaction` on the wallet-adapter contract - the Solana
  analogue of Stellar's SEP-10 challenge, for login and sponsored external
  transfers.
- **Chain-aware `WalletAdapter` contract.** The adapter interface is now
  chain-aware, so a single `walletAdapters` array can carry Stellar and Solana
  adapters side by side.
- **New package `@pollar/solana-wallet-standard-adapter` (preview).** Connects
  user-controlled Solana wallets (Phantom, Solflare, Backpack, ...) through the
  Wallet Standard, without bundling a wallet SDK into `@pollar/core`. Phase-0:
  the client-side adapter (discovery, connect, SIWS, message / transaction
  signing) is implemented; full `PollarClient` wiring and the SIWS endpoints
  land next.

### `@pollar/core`

- `WalletChain` type (`STELLAR` | `POLYGON` | `SOLANA`); each balance carries a
  `chain`, and the balance response exposes `multichain` (v2 wallet endpoint).
- SIWS types (`SolanaSignInInput`, `SolanaSignInOutput`,
  `SolanaSignMessageResponse`) and `signSolanaTransaction` on the wallet-adapter
  contract.
- Chain-aware `WalletAdapter` contract: adapters declare their chain so Stellar
  and Solana adapters coexist in one `walletAdapters` array.

### `@pollar/react`

- `WalletBalanceModal` renders multichain balances, tagging each balance with its
  chain. The tag only appears when the app spans more than one chain, so
  single-chain (Stellar-only) apps look unchanged.

### `@pollar/solana-wallet-standard-adapter` (new, preview)

- `solanaWalletStandardAdapters(options?)` discovers every installed Solana wallet
  and returns one `WalletAdapter` each (SSR-safe, returns `[]` without a
  `window`); `SolanaWalletStandardAdapter` for direct use outside `PollarClient`.
- Login uses each wallet's native `solana:signIn` (SIWS). Peer deps:
  `@pollar/core`, the `@wallet-standard/*` packages, and
  `@solana/wallet-standard-features` - no wallet SDK is bundled.

## 0.10.1

> Stable release. Published under the default `latest` dist-tag
> (`npm i @pollar/core`). This is the promotion of the `0.10.1-rc.*` line
> (rc.0 -> rc.12); the per-rc detail is preserved in the sections below.

### Highlights (since 0.10.0)

- **Earn - yield vaults + lending.** New `earn` surface in `@pollar/core`
  (`getEarnProviders` / `getEarnOpportunities` / `getEarnPosition` /
  `earnDeposit` / `earnWithdraw`) unifies DeFindex vaults and Blend pools behind
  one provider-selected API; each opportunity carries its live APY. `@pollar/react`
  ships an `EarnModal` and mirrors the methods on `usePollar()`, with auto-trustline
  on deposit, wallet-balance display and over-spend guards.
- **All swap venues executable.** SDEX and Soroswap builds now run end-to-end
  (`swap()` dispatches on the quote's build shape - a prebuilt XDR goes straight
  to submit, an operation + params quote runs through `runTx`). At 0.10.0 only
  Aquarius was wired. Which venues an app offers is driven by its per-app
  `GET /swap/config`; the `SwapModal` selector enables the available venues and
  supports pasting a custom buy token (code + issuer).
- **Account creation for external wallets.** `createAccount()` builds a sponsored
  `createAccount` (the app sponsor pays the base reserve + fee), the user's own
  wallet adds the new-account signature, and it broadcasts through the submit
  path - so a Freighter / client-side Privy wallet that isn't yet on-chain can be
  funded. The wallet now surfaces `existsOnStellar` + `fundingMode`, and
  `WalletButton` gains a "Create account" action when applicable.
- **Sponsored trustlines for external wallets.** `setTrustline` now routes by the
  asset's `sponsored` flag rather than by wallet type, so external wallets can set
  app-sponsored trustlines (new `POST /wallet/assets/trustline/build`).
- **Bridge (SEP-24) ramp maturation.** The `RampWidget` gained Bridge deposit
  instructions, a ToS step, dynamic required-fields and country lists, a
  country-first input, email + full-name collection, QR-image + expiry rendering,
  and copy / explorer affordances on the transaction.
- **Network derived from the API key.** The SDK no longer sends a `network` field
  on tx / swap / `GET /swap/config` requests; the backend derives it from the API
  key. No caller change required.
- **Async submit + client-side status polling**, a longer per-request timeout for
  the submit-family calls, and a **modal UI/UX standardization** pass (prefixed
  every component class, standardized loading indicators, shared `AssetSelect`,
  copyable address chips, monospace 7-decimal balances).

### `@pollar/core`

- **Earn client methods (Blend + DeFindex).** `getEarnProviders()` returns the
  yield providers this app exposes (empty = Earn disabled); `getEarnOpportunities(provider)`
  lists the vaults/pools with live APY; `getEarnPosition(params)` returns the
  connected wallet's balance + APY and a `withdrawUnit` (asset amount for Blend,
  share count for DeFindex); `earnDeposit` / `earnWithdraw` build the provider's
  XDR server-side, then sign + submit through the `runTx` state machine. Smart
  (passkey) wallets fail fast for now.
- **`createAccount()`** creates an external wallet's classic account on-chain via a
  sponsored `createAccount`; not applicable to custodial (server-created) or smart
  (C-address) wallets.
- **`existsOnStellar` + `fundingMode` surfaced on the wallet.**
- **All swap builds executable.** `swap()` dispatches on the quote build union
  (`invoke_contract | path_payment_strict_send | { unsignedXdr }`); Soroswap XDRs
  submit as-is, Aquarius/SDEX run through `runTx`.
- **Sponsored trustlines** - `setTrustline` routes by the `sponsored` flag; new
  `POST /wallet/assets/trustline/build`.
- **Async submit + client-side tx status polling**, and a longer per-request
  timeout for the submit-family calls (they can outlast the default 10s).
- **`network` dropped from tx / swap / `GET /swap/config` requests** (derived from
  the API key server-side). Request schema decoupled from the internal type.
- OpenAPI types regenerated for the new endpoints.

### `@pollar/react`

- **`EarnModal` + `usePollar()` earn methods** (`getEarnProviders`,
  `getEarnOpportunities`, `getEarnPosition`, `earnDeposit`, `earnWithdraw`,
  `openEarnModal`). Deposits establish the buy-asset trustline automatically (up to
  two signatures); the deposit step shows the wallet balance, guards against
  over-spend, refreshes the balance, and resets tx state when the modal (re)opens.
- **Swap venues enabled in the `SwapModal` route selector** (SDEX + Soroswap +
  Aquarius), paste-a-custom-token (code + issuer), a refresh button, and a shared
  `AssetSelect` used by both the Send and Swap pickers.
- **`RampWidget` (Bridge) maturation** - Bridge deposit instructions and ToS step,
  dynamic `requiredFields` in the contact step, dynamic country list with a
  country-first input, email + full-name collection, QR (`qrBase64`) rendered as an
  image with `expiresAt` as a date/time, copy / explorer on the tx, select fields,
  email validation, and retry re-showing the contact step.
- **"Create account" action in the `WalletButton` dropdown** (shown when the
  external wallet has no on-chain account yet).
- **Tx-history polish** - 3-line rows with a copyable hash and issuer, and Stellar
  addresses rendered as copyable chips.
- **Wallet-balance modal** - copy buttons, issuer, and monospace 7-decimal balances.
- **Modal UI/UX standardization** - every component class is now `pollar-`
  prefixed, loading indicators are standardized (spinner + left-aligned label,
  moved into the asset selects), and modal headers are consistent (X + reload).

### Upgrade notes

- **Additive, non-breaking on top of 0.10.0.** No API removals; existing call
  sites keep working. The `network`-field removal is transparent (the backend
  derives it from the API key).

## 0.10.1-rc.0

> Release candidate. Published under the `next` dist-tag (`npm i @pollar/core@next`).

### `@pollar/core` - features

- **All swap venues wired.** `swap()` now dispatches on the quote's build shape:
  a prebuilt XDR (Soroswap) goes straight to `signAndSubmitTx`, while an
  operation + params quote (Aquarius / SDEX) runs through `runTx`. The swap quote
  build type is a union of `invoke_contract | path_payment_strict_send |
{ unsignedXdr }`. At 0.10.0 only Aquarius was executable.

### `@pollar/react` - features

- **Soroswap + Stellar DEX enabled in the `SwapModal` route selector.** All three
  venues (SDEX, Soroswap, Aquarius) are now selectable. (Soroswap only returns
  quotes when the server has `SOROSWAP_API_KEY` configured.)

### Docs / comments

- **Corrected the "custom auth providers" claim.** The rc.7 note advertised
  registering providers via a `providers: [...]` config field, but no such field
  or registration API exists - `PollarAuthProvider` is an internal contract only.
  Updated the rc.7 CHANGELOG entry and the `PollarAuthProvider` JSDoc
  (`@pollar/core`) accordingly. Custom login still goes through the built-in
  providers and `providerAction(...)`; external wallets through `walletAdapters`.
- **Fixed stale `@pollar/core` JSDoc** that referenced the removed `loginWallet()`
  method and the non-existent `PollarClientConfig.providers` field.
- **`@pollar/privy-adapter` config JSDoc** now states that `redirectUri` is
  reserved / not currently applied, and that `appearance` is web-only (ignored on
  the React Native / Expo entry) - matching the README.

## 0.10.0

> Stable release. Published under the default `latest` dist-tag
> (`npm i @pollar/core`). This is the promotion of the `0.10.0-rc.*` line;
> the per-rc detail is preserved in the sections below.

### Highlights (since 0.9.0)

- **Unified wallet adapters (breaking).** External wallets are now registered as
  a `walletAdapters: WalletAdapter[]` array on `PollarClient`; each adapter
  auto-renders as a login entry and overrides a built-in by its `type`. The old
  singular `walletAdapter` resolver and `loginWallet(id)` method are gone - enter
  any wallet through the unified `login({ provider: id })`. See UPGRADE.md.
- **Multi-venue swaps.** `getSwapQuote()` quotes across SDEX, Soroswap and
  Aquarius and returns routes ranked best-first (`provider: 'auto'`); `swap()`
  sets the buy-asset trustline and executes through the existing `runTx`
  pipeline with on-chain `minReceived` slippage. `@pollar/react` ships a
  `SwapModal` with a venue route selector.
- **SEP-24 on/off-ramps.** New `ramps` endpoints drive the anchor
  deposit/withdraw interactive flow through core, with a `RampWidget` in
  `@pollar/react` (external wallets sign the SEP-24 pending XDR in the widget).
- **Self-driving Privy adapter.** `@pollar/privy-adapter` was reworked from a
  signer skeleton into a full adapter that drives login + embedded-wallet
  creation + signing, on web and React Native / Expo.
- **Network resilience.** Every request now has a client-side timeout (default
  10s) and idempotent-request retry; a refresh timeout no longer logs the user
  out. New typed `PollarNetworkError` + `isPollarNetworkError`.

### New packages

- **`@pollar/accesly-adapter`** - client-side Accesly smart-wallet adapter.
- **`@pollar/privy-server-adapter`** - server-side Privy adapter (formerly named
  `@pollar/privy-adapter` before the client-side rewrite took that name).

### Upgrade notes

- **One-time re-login (SDK only).** The local storage namespace was widened
  (apiKey hash 8 -> 32 hex chars); every user re-authenticates once after the
  host app ships this version. No backend change, no action required.
- See **UPGRADE.md** for migrating off the singular `walletAdapter` / `loginWallet`.

## 0.10.0-rc.10

> Release candidate. Published under the `next` dist-tag (`npm i @pollar/core@next`).
>
> This RC bundles every change since the last published build (`rc.8`): the
> `rc.9` network-timeout/retry work below plus swaps, on/off-ramps, the
> self-driving Privy adapter, and two newly published packages.

### `@pollar/core` - features

- **Multi-venue swaps.** `getSwapQuote(params)` quotes across venues (SDEX,
  Soroswap, Aquarius) and returns `SwapQuote[]` ranked best-first (`provider:
'auto'` picks the best of every available venue); `swap(quote)` establishes
  the buy-asset trustline first (G-address credit assets only) and executes the
  quote through the existing `runTx` transaction state machine, with on-chain
  `minReceived` enforcing slippage.
- **SEP-24 on/off-ramps.** New `ramps` endpoints wire the anchor deposit/withdraw
  interactive flow through core so hosts can drive a ramp from the SDK.

### `@pollar/core` - fixes

- **Swaps fail fast on smart (passkey) wallets.** Smart C-address wallets cannot
  swap yet (the backend smart-account build path only supports `payment`, and the
  AMM router is not yet allowlisted in `SorobanAuthPolicy`), so `swap` now returns
  a clear error instead of the confusing "smart-account build supports only
  payment" from `runTx`.
- **Auth logs surface the real failure.** `redactDeep` now projects an `Error`'s
  non-enumerable `name`/`message`/`stack` (previously it logged `{}` and lost the
  reason) while still redacting enumerable custom props, and the wallet-flow catch
  tags the failing phase (connect/sign/authenticate).

### `@pollar/react` - features

- **`SwapModal`** - a drop-in swap UI over the core swap API, with a route
  selector across venues and a smart-wallet guard. (At 0.10.0 only Aquarius was
  wired; Soroswap and SDEX are enabled in 0.10.1-rc.0.)
- **`RampWidget`** - SEP-24 deposit/withdraw widget wired to the core ramps flow.
- **Self-driving login.** `PrivyLoginSubmodal` and a login-modal refactor that
  renders a login entry per registered wallet adapter and drives interactive
  adapters (e.g. Privy) to completion before running `login({ provider })`.

### `@pollar/privy-adapter` - features

- **Self-driving adapter.** Reworked from a signer skeleton into a full adapter
  that drives email/Google/GitHub login, creates the Stellar embedded wallet, and
  signs via extended-chains `rawSign`. `createPrivyAdapter` + `PrivyAdapterProvider`
  (children optional, for the sibling-mount pattern); a runtime guard throws
  `PrivyAdapterUnsupportedError` on non-React hosts.
- **React Native / Expo support** via `@privy-io/expo` (native entry with in-session
  OAuth), plus a shared factory and dual `tsup` build.
- **Auto-sync + URL cleanup.** The adapter emits its provider auth state so
  `@pollar/react` triggers login on the rising edge (fixes web OAuth redirect and
  persisted Privy sessions); `cleanupOAuthRedirect` strips `privy_oauth_*` params
  from the URL. Gated `[privy-adapter]` debug logger.

### `@pollar/stellar-wallets-kit-adapter` - fixes

- **SSR-safe.** `stellarWalletsKitAdapters()` no longer touches `window` on the
  server (Next.js/Remix); it returns `[]` during SSR and builds the real adapter
  list when the factory re-runs on the client.

### New packages (first publish under `next`)

- **`@pollar/accesly-adapter`** - client-side Accesly smart-wallet adapter
  (single-s naming to match the upstream `@accesly/*` brand).
- **`@pollar/privy-server-adapter`** - server-side Privy adapter (the former
  `@pollar/privy-adapter` before the client-side rewrite took that name).

## 0.10.0-rc.9

> Release candidate. Published under the `next` dist-tag (`npm i @pollar/core@next`).

### `@pollar/core` — fixes

- **HTTP requests can no longer hang forever.** Every SDK call now has a
  client-side request timeout (default **10s**). Previously `fetch` had no
  timeout, so a transient connection stall (a dropped TCP SYN on a flaky mobile
  network at cold start) left `client.refresh()` — and every other call —
  pending indefinitely: it neither resolved nor rejected, trapping callers that
  `await` it (e.g. a returning user stuck on the splash screen). A stalled
  request now rejects with a typed `PollarNetworkError` (`code:
'SDK_NETWORK_TIMEOUT'`) instead.
- **A refresh that times out no longer logs the user out.** A transient network
  timeout during `/auth/refresh` keeps the session intact (the refresh token is
  almost certainly still valid) and rejects with the typed error so the caller
  can fall back to a cached token; the next request or proactive timer refreshes
  once connectivity returns. Genuine refresh failures (4xx/5xx, malformed
  response) still clear the session as before.

### `@pollar/core` — features

- **New `PollarClient` options.** `requestTimeoutMs` (default `10000`; `0`
  disables) tunes the per-attempt timeout, and `retry` (default
  `{ attempts: 2, baseDelayMs: 300 }`) controls automatic backoff retry for
  idempotent, transient-failure requests (token refresh + GETs). Only
  transport-level failures retry — an HTTP response is never retried.
- **Exported `PollarNetworkError` + `isPollarNetworkError`** for programmatic
  handling of timeouts.

## 0.10.0-rc.7

> Release candidate. Published under the `next` dist-tag (`npm i @pollar/core@next`).
>
> **⚠️ One-time re-login on upgrade (SDK only).** The local storage namespace was
> widened — the apiKey hash went from 8 to 32 hex chars (128-bit) — which
> intentionally orphans sessions persisted by older builds. Every user
> re-authenticates ONCE after the host app ships this version; this also flushes
> stale/corrupt session state left by older builds. No migration, no backend
> change, no action required.

### `@pollar/core` — features

- **Custom auth provider contract (`PollarAuthProvider`)** - the extension point
  that backs the built-in Google / GitHub / email flows and `providerAction(...)`.
  Correction (see 0.10.1-rc.0): this shipped as an internal contract only; there
  is no public `providers: [...]` config field to register your own providers.

### `@pollar/core` — fixes

- **React Native token refresh** — the `/auth/refresh` retry after a DPoP
  `use_dpop_nonce` challenge no longer replays an empty body, and a rotated token
  is emitted to `onAuthStateChange` (RN consumers reading
  `getAuthState().session.token` no longer forward a stale access token).
- **DPoP clock-skew compensation** — proofs self-heal a wrong/changed device clock
  from the server `Date` header (bounded, sanitized `iat`) instead of looping on
  `token expired`.
- **Session-lifecycle race hardening** — logout / login / destroy / cross-tab
  events landing mid-flight can no longer resurrect a cleared session, clobber a
  newer one, or write a stale token over it; cancelled logins map cleanly to
  `idle`; reactive read stores reset on logout.
- **External-wallet signing** — SEP-10 challenges are validated before signing
  (including via custom providers); `signAuthEntry` signs on the currently
  configured network; smart-wallet sessions return an explicit error instead of
  hitting the custodial endpoint.
- **Secret redaction** — request/response bodies and error logs no longer print
  access/refresh tokens, the DPoP key, OTPs, or signed XDRs (while keeping
  diagnostic error `code`s).

## 0.9.1-rc.0

> Release candidate. Published under the `next` dist-tag (`npm i @pollar/core@next`).
> No breaking changes since `0.9.0`.

### `@pollar/core` — features

- **All SDK API calls are now logged** — successful requests at `debug`, errors at
  `error` — to aid integration debugging.
- **Backend error codes are mapped to friendly auth messages** so failed logins
  surface human-readable reasons instead of raw codes.

### `@pollar/core` — fixes

- **Native adapter load failures now attach a `cause`**, preserving the original
  error when an Expo / React Native secure-storage adapter fails to load.

### Internal

- Upgraded tooling to TypeScript 6, ESLint 10, and `eslint-plugin-react-hooks` 7,
  plus safe minor dependency bumps.
- Applied Prettier formatting across `core` and `react`.

## 0.9.0

> **⚠️ BREAKING CHANGES (SDK packages only — the SDK API stays backward-compatible).**
>
> - **`session.wallet.type` value `'custodial'` → `'internal'`** in `@pollar/core`.
>   The developer-facing union is now `'internal' | 'smart' | 'external'` (aligns
>   with the DB `SdkUserWalletSource.INTERNAL`). Apps branching on
>   `wallet.type === 'custodial'` must switch to `'internal'`. **The wire is
>   unchanged**: `sdk-api` still emits `'custodial'`, and `@pollar/core` ≥0.9.0
>   remaps it to `'internal'` at the client boundary — so SDKs ≤0.8.x keep
>   working and no coordinated backend deploy is required.
> - The session wallet drops the legacy `publicKey` alias. `session.wallet`
>   now exposes **only `address`** (it always held the same value). Read
>   `session.wallet.address` instead of `session.wallet.publicKey`.
> - The wallet-adapter `ConnectWalletResponse` is now `{ address }` only —
>   `publicKey` is gone. Affects authors implementing a custom `WalletAdapter`.
> - The `sdk-api` `/v1/auth/login` response is **unchanged** and still emits
>   both `publicKey` and `address`, so SDKs ≤0.8.x keep working.
> - `sdk-api` `/tx/*` now accept **either `address` (preferred) or `publicKey`
>   (legacy)** in the request body — `address` wins when both are sent. Old SDKs
>   that send `publicKey` keep working; `@pollar/core` 0.9.0 sends `address`.
>   ⚠️ **Deploy ordering:** ship the `sdk-api` change before/with `@pollar/core`
>   0.9.0, since that core sends `address` and needs a backend that accepts it.
> - Apps consuming `@pollar/react`'s `usePollar().walletAddress` need **no
>   changes** — the field is resolved internally.

### `@pollar/core` — BREAKING

- **`wallet.type` `'custodial'` → `'internal'`.** `PollarPersistedSession.wallet.type`
  and the `isValidSession` check now use `'internal' | 'smart' | 'external'`.
  Code branching on `'custodial'` must switch to `'internal'`. The change is
  **SDK-only**: the `sdk-api` wire still emits `'custodial'`, and core remaps it
  to `'internal'` in `_storeSession` (fresh login) and `readStorage` (legacy
  persisted sessions). The DB enum stays `SdkUserWalletSource.INTERNAL` — no
  migration. This keeps clients ≤0.8.x working while the SDK surface and the DB
  speak one vocabulary.
- **`PollarPersistedSession.wallet.publicKey` removed.** The persisted session
  wallet is now `{ type, address, existsOnStellar?, createdAt?, linkedAt?,
network?, deployTxHash? }`. `address` is the on-chain address for every type
  (G-address internal, C-address smart/passkey, connected pubkey external).
- **`ConnectWalletResponse` is now `{ address: string }`.** The duplicate
  `publicKey` field is gone; the built-in `FreighterAdapter` / `AlbedoAdapter`
  and any custom adapter must return `address` only.

### `@pollar/core` — fixes

- **Login no longer clears the session on every custodial (email/OAuth) login.**
  `authenticate()` validates the raw `/auth/login` wire response with
  `isValidSession()` **before** `_storeSession` remaps `custodial → internal`,
  so the transitional wire value `'custodial'` is tolerated at the guard and the
  flow no longer falls through to the error branch → `clearSession()`
  (`[PollarClient] Session cleared`). Callers still remap it before it reaches
  app code, so the persisted/SDK surface vocabulary is unchanged.

### `@pollar/core` — internal

- **Sessions persisted by older SDKs (≤0.8.x) are migrated transparently.**
  `readStorage` backfills `address` from the legacy `publicKey` key and remaps
  `type: 'custodial'` → `'internal'` before validation, so existing users are
  **not** forced to re-log in on upgrade.
- **`/tx/*` request bodies now send `address`** (was `publicKey`). The backend
  accepts both for backward compat (see the `sdk-api` note above), so this is
  transparent once the matching backend is deployed.
- Removed a dead `smart` local in `_runSmartTx` (assigned, never read).

### Configurable logging — new features (all SDK packages)

- **`logLevel` + `logger` on `PollarClientConfig`.** A new `LogLevel`
  (`silent` < `error` < `warn` < `info` < `debug`, default **`info`**) filters
  SDK logging, and an optional `logger?: PollarLogger` routes logs to a custom
  sink (pino, Sentry breadcrumbs, a test spy…) instead of `console`. Exported
  `createLogger(level, sink?)` and the `LogLevel` / `PollarLogger` types from
  `@pollar/core`. `PollarClient.getLogger()` exposes the configured logger so
  the runtime layer reuses the same level + sink.
- **State-transition chatter is now `debug`.** The per-transition
  `auth:…` / `transaction:…` / `network:…` logs, the session-status retry
  warnings, and "Login cancelled" moved from `info` to `debug`, so the default
  `info` console is much quieter without losing lifecycle logs (Initialized,
  Session stored/restored/cleared, Tokens refreshed). Per-field session
  validation detail dropped to `debug` too.
- **No more double-logged key-manager init failures.** `NobleKeyManager` /
  `WebCryptoKeyManager` no longer `console.error` on init failure — the error
  already propagates to `PollarClient`, which logs it once through the
  configured logger.
- **`@pollar/stellar-wallets-kit-adapter`** gains `logLevel` / `logger` on
  `StellarWalletsKitAdapterOptions` (set once at init — the kit is a global
  singleton). **`@pollar/react`** routes the provider's logs and the modal
  error boundary through the client's logger via `PollarClient.getLogger()`.

### `@pollar/react` — BREAKING

- **`walletAddress` now derives from `session.wallet.address`** instead of
  `session.wallet.publicKey`. The public `usePollar().walletAddress` value is
  identical — no consumer change needed. The internal session-equality check
  compares `wallet.address`.

### `@pollar/stellar-wallets-kit-adapter` — BREAKING

- **`connect()` returns `{ address }` only** (matches the new
  `ConnectWalletResponse`). Requires `@pollar/core@^0.9.0` /
  `@pollar/react@^0.9.0` (peer ranges pinned).

### `@pollar/privy-adapter` — release alignment

- **Version bump to `0.9.0` only — no functional changes.** Republished so all
  `@pollar/*` packages share a single `0.9.0` release line. The adapter API,
  config fields, and error envelope are identical to `0.8.1`.

### Migration

```ts
// Reading the wallet address off the auth state (core, headless):
client.onAuthStateChange((s) => {
  if (s.step !== 'authenticated') return;
  // BEFORE (≤0.8.x): s.session.wallet.publicKey
  // AFTER  (0.9.0):  s.session.wallet.address
  const addr = s.session.wallet.address;
});
```

Custom `WalletAdapter` authors:

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

`@pollar/react` consumers using `usePollar().walletAddress`: **no change**.

## 0.8.3

### `@pollar/core` — new features

- **Session resume on cold start — sessions are revalidated and the profile is
  repopulated after a reload/reopen.** Until now, `_restoreSession()` rehydrated
  the session entirely from storage and went straight to `authenticated` without
  telling the server, so (1) a session revoked elsewhere (logout on another
  device, family revoked) still showed as `authenticated` until the next request
  401'd, and (2) `getUserProfile()` returned `null` after a cold reload because
  PII lives in memory only and was never re-fetched. On restore the client now
  fires `GET /auth/session/resume` in the background (non-blocking — startup
  never waits on it):
  - **200** → the in-memory profile is repopulated (`getUserProfile()` stops
    being `null`) and the session is marked `verified`.
  - **revoked family / 401** → the existing refresh-on-401 path clears the
    session, so the client converges to `idle` instead of showing a stale
    `authenticated`.
  - **offline / network error** → the session is **not** cleared; it stays
    optimistic and is revalidated on the next `visibilitychange` or request.
    Resume goes through the normal authed client, so it coalesces with any
    in-flight refresh and (being a GET) is auto-retried after a token refresh. The
    endpoint never rotates the refresh token or creates a new family.
- **`AuthState.authenticated` now carries `verified: boolean`** — `false` while
  a restored session is still optimistic (pre-revalidation), `true` after a
  fresh login/refresh or a successful resume. Gate sensitive actions on it.

### `@pollar/react` — new features

- **`usePollar().verified`** exposes the new `verified` flag so apps can gate
  sensitive actions (e.g. signing) until the cold-start session is confirmed.

## 0.8.2

### `@pollar/core` — new features

- **`POLLAR_CORE_VERSION` export + version in the init log.** The package version
  is injected at build time (tsup `define`) and exported as
  `POLLAR_CORE_VERSION` (e.g. `'0.8.2'`, `'dev'` when running unbundled). The
  `PollarClient` startup log now includes it:
  `[PollarClient] Initialized v0.8.2 — endpoint: …, network: …`. Named per
  package so it won't collide with a future `POLLAR_REACT_VERSION`, letting apps
  report both in one diagnostics line.

### `@pollar/core` — fixes

- **SHA-256 no longer requires `crypto.subtle` — React Native runs in Expo Go.**
  `sha256` ran on `crypto.subtle.digest('SHA-256')`, which is absent on
  React Native / Hermes unless `react-native-quick-crypto` (a native module that
  forces an Expo **dev build**) is installed. Since SHA-256 is on the hot path
  (DPoP `ath`, API-key namespace hashing, JWK thumbprints, `NobleKeyManager`),
  nothing worked on Expo Go. `sha256` now runs on pure-JS
  [`@noble/hashes`](https://github.com/paulmillr/noble-hashes) (`@noble/hashes/sha2`),
  already present via `@noble/curves`, now a direct dependency. The function keeps
  its `async` signature, so call sites are unchanged. `react-native-quick-crypto`
  becomes optional — install it only to upgrade to non-extractable WebCrypto keys.
- **Drop deprecated `@noble/curves/p256` import.** `NobleKeyManager` imported
  `p256` from `@noble/curves/p256`, deprecated in `@noble/curves` 1.9.x
  (TS6385). Switched to the supported `@noble/curves/nist` entry; the `p256`
  object and its API are identical.
- **Expo SecureStore storage adapter no longer throws on the SDK's namespaced
  keys.** `createSecureStoreAdapter()` passed keys straight to
  `expo-secure-store`, but SecureStore only accepts keys matching
  `[A-Za-z0-9._-]` while the SDK namespaces its keys with `:`
  (`pollar:<apiKeyHash>:session`, `pollar:<apiKeyHash>:walletType`,
  `pollar:dpop-key:<apiKeyHash>`). Every read/write failed with an
  `Invalid key` error on React Native / Expo. The adapter now sanitizes each
  key (disallowed characters → `_`) before calling SecureStore. The transform
  is deterministic and collision-free for the SDK's fixed key templates. No
  migration needed — the adapter never persisted anything under the rejected
  keys. The `react-native-keychain` adapter was unaffected (Keychain `service`
  names allow `:`).

## 0.8.1

### `@pollar/core` — new features

- **React Native / Expo runtime support.** The DPoP path no longer assumes a
  browser-grade runtime, so the SDK now boots on React Native / Hermes once the
  documented polyfills are registered. Three pieces:
  - **`randomUUID()` with a fallback.** Prefers the secure-context
    `crypto.randomUUID`, and falls back to a manual RFC 4122 v4 build via
    `crypto.getRandomValues` for environments where `randomUUID` is missing
    (older RN/Hermes where `react-native-get-random-values` provides
    `getRandomValues` but not `randomUUID`, and insecure HTTP origins). Throws
    only when no secure random source exists at all.
  - **Runtime-agnostic abort helpers.** `abortError()` builds an `AbortError`
    via the native `DOMException` when present and falls back to a plain `Error`
    tagged `name = 'AbortError'` on Hermes (where `DOMException` is not a
    global). `throwIfAborted(signal)` replaces `signal.throwIfAborted()`, which
    is absent on older RN `AbortSignal` polyfills. The
    `error.name === 'AbortError'` contract the rest of the SDK relies on is
    preserved everywhere.
  - **Non-streaming session-status fallback.** A new `waitForSessionReady`
    transport picks the SSE stream on web and one-shot polling of
    `/auth/session/status/{id}/poll` (`pollUntilFound`) on React Native — whose
    `fetch` exposes no readable `response.body` — so login completes without a
    streaming body. Backoff and abort semantics match the SSE path.

- **Terminal session-status handling.** A login session that is invalid or
  expired now resets the flow to an `error` state instead of waiting forever.
  Both transports surface `SessionStatusError` (`INVALID_CLIENT_SESSION_ID` /
  `EXPIRED_CLIENT_ID`, from SSE `error` events or 404/410 on the poll endpoint),
  which the auth flow maps to two new `AUTH_ERROR_CODES`: **`SESSION_EXPIRED`**
  and **`SESSION_INVALID`**. Applies to web and React Native alike.
- The README gains a full **React Native runtime requirements** section listing
  the four Web primitives the DPoP proof needs (`crypto.getRandomValues`,
  `crypto.subtle.digest`, `TextEncoder`/`TextDecoder`, spec-compliant `URL`) and
  the polyfills that provide them (`react-native-get-random-values`,
  `react-native-quick-crypto`, `react-native-polyfill-globals`).

### `@pollar/react` — fixes

- **`onWalletConnect` is now optional on `<LoginModalTemplate>`.** The prop
  changed from required to `onWalletConnect?: (id: WalletId) => void` and
  defaults to a no-op. Consumers that drive the wallet picker entirely through
  `ui.renderWallets` no longer have to thread a handler they don't use.

### `@pollar/privy-adapter` — new features

- **Operation allowlist.** The adapter signs through Privy `rawSign`, so only the
  transaction _hash_ ever reaches Privy and Privy cannot enforce per-operation
  policy — the adapter is the only place that can. Two new optional, fully
  backward-compatible config fields let you cap what `/wallets/sign` will sign:
  - `allowedOperations?: string[]` — explicit allowlist of stellar-sdk operation
    type names (e.g. `['changeTrust', 'payment']`). `undefined` (default) keeps the
    legacy behavior: any non-fee-bump transaction is signed.
  - `restrictToTrustlines?: boolean` — shortcut that allows the trustline preset
    (`changeTrust` + the `beginSponsoringFutureReserves` / `endSponsoringFutureReserves`
    sandwich) **and** additionally requires at least one `changeTrust`. When both
    fields are set, the effective allowlist is the union of the two and the
    changeTrust requirement still applies.

  Validation runs after the transaction is parsed and before any Privy round-trip,
  so a disallowed transaction never reaches signing. The existing fee-bump
  rejection is unchanged.

- **New error code `TX_OPERATION_NOT_ALLOWED` (HTTP 403).** Returned when a
  transaction contains an operation outside the allowlist, or is missing a
  `changeTrust` while `restrictToTrustlines` is on. The response carries a `reason`
  naming the offending operation: `{ "code": "TX_OPERATION_NOT_ALLOWED", "success": false, "reason": "..." }`.

## 0.8.0

> **⚠️ BREAKING CHANGES.**
>
> - `<PollarProvider>` props are reshaped: `config` is now `client` (and accepts
>   either a `PollarClient` instance or a `PollarClientConfig`), `styles` moves
>   under `appConfig.styles`, and the remote `/applications/config` fetch is now
>   opt-out by passing `appConfig` (even `{}`). New `ui.renderWallets` slot lets
>   external picker components replace the default Freighter/Albedo list.
> - `@pollar/stellar-wallets-kit-adapter` now **requires** `network` — the
>   `Networks.TESTNET` default is gone. Per-call `networkPassphrase` overrides
>   are rejected if they don't match init.
> - `@pollar/core` external-wallet `submitTx` no longer hits Horizon directly —
>   all submissions route through `/tx/submit`. The same call may now resolve to
>   `pending` instead of `success` / `error` (previously synchronous-only).

### `@pollar/react` — BREAKING

- **`<PollarProvider>` shape**:
  - `config: PollarClientConfig` → `client: PollarClient | PollarClientConfig`. Pass
    the config inline (provider constructs the client) or a pre-built `PollarClient`
    (testing, reusing the client outside React). The client is locked at first render.
  - `styles?: PollarStyles` → moved under `appConfig.styles`.
  - New `appConfig?: PollarConfig`. Presence is the opt-out switch for the remote
    `/applications/config` fetch: if you pass it (even `{}`), no fetch happens and
    missing fields fall back to the defaults baked into `LoginModalTemplate`. If you
    don't pass it, the SDK fetches `/applications/config` on mount (current behavior).
  - New `ui?: { renderWallets?: RenderWalletsSlot }`.
- **Fetch errors are no longer silenced**. Failures of `getAppConfig()` now log via
  `console.error('[PollarProvider] getAppConfig failed', err)` instead of swallowing.
- **Three-level styles merge removed**. The previous
  `{ ...fetched.styles, ...propStyles, providers: { ...remote, ...local } }` merge is
  gone. Either pass `appConfig` (no remote) or don't (full remote). No silent overlay.

### `@pollar/react` — new features

- **`renderWallets` slot.** New `ui.renderWallets?: RenderWalletsSlot` prop on
  `<PollarProvider>`. When provided, replaces the hardcoded Freighter+Albedo buttons
  in the LoginModal wallet picker. The slot receives `{ onConnect, authState }` and
  is expected to render a list of wallet buttons that call `onConnect(walletId)` on
  click. Default behavior is unchanged when the slot is not provided.
- New public types `RenderWalletsProps`, `RenderWalletsSlot` exported from the
  package root.

### Migration

```tsx
// BEFORE (0.7.x)
<PollarProvider config={{ apiKey, walletAdapter }} styles={{ theme: 'dark' }}>

// AFTER (0.8.0) — common case (no remote-config fetch)
<PollarProvider
  client={{ apiKey, walletAdapter }}
  appConfig={{ styles: { theme: 'dark' } }}
>

// AFTER (0.8.0) — keep the remote /applications/config fetch
<PollarProvider client={{ apiKey, walletAdapter }}>

// AFTER (0.8.0) — power user, pre-built client
const client = new PollarClient({ apiKey, walletAdapter });
<PollarProvider client={client} appConfig={{ styles: { theme: 'dark' } }}>
```

### `@pollar/react` — fixes

- **Provider props are read directly in the context value** instead of via a
  stale ref — `<PollarProvider>` now updates without remounting when callers
  swap `adapters` / `ui` references between renders.
- **Timers cleared on unmount** in `<PollarProvider>` and the session change
  effect uses explicit equality so identical sessions don't trigger spurious
  re-renders.

### `@pollar/stellar-wallets-kit-adapter` — BREAKING

- **`network` is now required** on `StellarWalletsKitAdapterOptions` (and on
  `createStellarWalletsKitBundle`). The previous `Networks.TESTNET` default is
  gone — `ensureInit` throws if `network` is missing on first init. The kit is
  a global singleton so picking the network silently would risk signing
  real-looking transactions on the wrong chain. Pass `Networks.TESTNET` or
  `Networks.PUBLIC` explicitly.
- **Per-call `networkPassphrase` overrides are rejected** when they don't match
  the init network. `signTransaction()` / `signAuthEntry()` throw instead of
  silently signing on the wrong chain.

### `@pollar/stellar-wallets-kit-adapter` — new features

- **`<KitWalletPicker>` and `createStellarWalletsKitBundle`** on the new
  `@pollar/stellar-wallets-kit-adapter/picker` subpath. Drop the bundle into
  `<PollarProvider>`'s new `renderWallets` slot to render the full Stellar
  Wallets Kit wallet list (Albedo, Bitget, CactusLink, Fordefi, Freighter,
  Hana, HotWallet, Klever, Lobstr, OneKey, Rabet, xBull, plus any custom
  modules):

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

- **New `picker?: KitPickerOptions`** on `StellarWalletsKitAdapterOptions`:
  `wallets` (subset to show), `order` (`'as-given' | 'installed-first' | 'alphabetical'`),
  `showInstalledOnly`, `labels` (per-id overrides), `layout` (`'grid' | 'list'`),
  `theme` (`{ accent?, mode? }`). The resolver itself ignores `picker` — only
  `<KitWalletPicker>` reads it.

- **Wallet availability uses `ISupportedWallet.isAvailable` directly** (the
  flag the kit already populates from each module's `isAvailable()` probe).
  No second-pass probing per render.

### `@pollar/stellar-wallets-kit-adapter` — fixes

- **Second-init network mismatch is now flagged.** Calling
  `stellarWalletsKit({ network })` a second time with a different network logs
  a clear warning instead of silently keeping the first init's network.

### `@pollar/stellar-wallets-kit-adapter` — packaging

- React is now an **optional peer dependency**. The root export
  (`stellarWalletsKit`) stays headless — consumers that only need the
  `WalletAdapterResolver` continue to work without installing React.
  Only the `/picker` subpath pulls in `react` / `react-dom` / `@pollar/react`.
- Bumped to `0.8.0`. Existing `stellarWalletsKit({ network })`-only consumers
  do not need to change anything beyond making the `network` argument
  explicit if they were relying on the testnet default.

### `@pollar/core` — BREAKING (behavior)

- **`submitTx` always routes through `/tx/submit`.** External wallets no longer
  submit directly to the public RPC; both custodial and external paths now go
  through sdk-api. Wins:
  - end-to-end `tx_records` persistence with full phase lifecycle so the
    developer dashboard can show every tx at
    `/apps/:id/monitor/transactions`,
  - idempotency tracking via `submissionToken` (returned by `signTx`),
  - one response shape (`SUCCESS` / `PENDING` / `FAILED`) shared by both
    flows. External-wallet callers may now observe `pending` where they
    previously only ever got `success` or `error`.

  Cost: ~50–150 ms extra latency vs. the legacy direct-Horizon path.

### `@pollar/core` — new features

- **Proactive token refresh with a visibility-aware scheduler.** Tokens are
  refreshed before they expire instead of on the first 401. The scheduler
  pauses when the tab is hidden and resumes when it becomes visible again, so
  background tabs don't churn refreshes.
- **`onStorageDegrade` subscription** — opt-in telemetry hook on
  `PollarClientConfig` (mirrored on `<PollarProvider>` config). Fires when the
  client falls back from secure storage (e.g. IndexedDB → in-memory) so apps
  can surface the degradation to users / dashboards.
- **Wallet adapter resolver timeout.** `PollarClient` now times out
  `walletAdapter(id)` resolutions so a stuck resolver can't hang the login
  flow indefinitely. The timeout produces a regular auth error that flows
  through the existing error surface.

### `@pollar/core` — fixes

- **Only idempotent methods retry after a post-refresh 401.** The auto-retry
  path previously re-ran any method that returned 401 after a token refresh;
  it now restricts retries to idempotent verbs (`GET`, `HEAD`, `OPTIONS`,
  `PUT`, `DELETE`) so POST/PATCH calls aren't accidentally double-applied
  server-side.
- **Login abort signal threaded through the wallet resolver.** Cancelling a
  login now also cancels the wallet adapter resolution, instead of leaving
  the resolver running until completion.

### `@pollar/privy-adapter` — fixes

- **Self-heal wallet cache on stale entries.** If a cached wallet id no longer
  exists at Privy, the adapter clears the entry and recreates it on the next
  sign instead of repeatedly hitting Privy with a 404.
- **Per-`userId` mutex on `POST /wallets/create`.** Concurrent wallet-creation
  requests for the same user are serialised so the burst doesn't create
  duplicate wallets at Privy.
- **`PrivyClient` construction is coalesced.** Multiple concurrent first calls
  share one client init instead of racing N parallel constructions.
- **Raw error messages dropped from HTTP responses.** Errors from Privy and
  internal stack traces are replaced with a generic message; the full error
  still goes to the server logs. Package marked `"private": false` but
  **server-side only** — importing in a browser bundle leaks credentials.
- **`@privy-io/node` pinned to `~0.18.0`** to avoid surprise 0.19+ behaviour
  changes mid-release.

## 0.7.2

Adds a per-call outcome API so headless callers can `await` a transaction and
inspect the result instead of subscribing to `onTransactionStateChange`. Adds
split `signTx` / `submitTx` for both wallet types, a one-shot atomic path
for custodial flows, and a richer `TransactionState` vocabulary so modal UIs
can render every phase honestly (including the previously-elided "submitted
to network, waiting for ledger" intermediate state). Existing `0.7.x`
consumers that don't render `TransactionState` themselves keep working
unchanged.

### `@pollar/core` — new features

- **`buildTx` and `signAndSubmitTx` now return outcomes.** Their return types
  changed from `Promise<void>` to `Promise<BuildOutcome>` and
  `Promise<SubmitOutcome>` respectively. The state-machine emissions (used by
  `TransactionModal`, `SendModal`, and any consumer subscribed to
  `onTransactionStateChange`) are preserved exactly as before. Callers that
  previously did `await client.signAndSubmitTx(xdr)` and ignored the resolved
  value keep working.
- **`signTx(unsignedXdr)`** and **`submitTx(signedXdr, { submissionToken? })`** —
  split-flow primitives that return `SignOutcome` / `SubmitOutcome`. External
  wallets sign locally via the adapter and submit directly to Stellar RPC.
  Custodial wallets go through new sdk-api endpoints (`/tx/sign`,
  `/tx/submit`) so the wallet-service tracks the lifecycle and enforces
  idempotency by `submissionToken` (mapped to `idempotencyKey` server-side).
- **`buildAndSignAndSubmitTx(operation, params, options?)`** and its alias
  **`runTx(...)`** — one method that picks the optimal path per wallet type:
  - External wallets: composes `buildTx + signAndSubmitTx` client-side,
    preserving `building → signing → success` state-machine transitions.
  - Custodial wallets: single round-trip to `/tx/build-sign-submit`. The
    signed XDR never leaves the backend. Skips intermediate state-machine
    transitions — if you need granular UI feedback, use `buildTx`, `signTx`,
    `submitTx` separately instead.
- New result types: `BuildOutcome`, `SignOutcome`, `SubmitOutcome`,
  `TxSignBody`, `TxSignContent`, `TxSubmitSignedBody`,
  `TxBuildSignSubmitBody`, `TxBuildSignSubmitContent`. OpenAPI schema
  regenerated against `sdk-api` — adds `/tx/sign`, `/tx/submit`,
  `/tx/build-sign-submit` paths.

### `@pollar/react` — new features

- **Context exposes the new methods.** `usePollar()` now returns `signTx`,
  `submitTx`, `buildAndSignAndSubmitTx`, and `runTx` in addition to the
  existing `buildTx` / `signAndSubmitTx`. Return types match the core SDK.
- **`usePollarAdapter` returns outcomes.** `WrappedAdapter<T>` methods now
  resolve to `Promise<SubmitOutcome>` instead of `Promise<void>`. Adapter
  callers can inspect `result.status` to branch on `success` / `pending` /
  `error` without subscribing to the global state.

### `TransactionState` vocabulary

The `TransactionState` discriminated union grew from 6 step values to 11:

**Added**:

- `signing` (already existed but now emitted by `signTx` directly, not just `signAndSubmitTx`)
- `signed` — signed XDR in hand, waiting for `submitTx`
- `submitting` — pushing signed XDR to the network
- `submitted` — Horizon ack received, ledger confirmation pending (previously misreported as `success`)
- `signing-submitting` — compound state for `signAndSubmitTx` custodial (atomic `/tx/sign-and-send` round-trip — the SDK can't observe the sign/submit boundary inside)
- `building-signing-submitting` — compound state for `runTx` / `buildAndSignAndSubmitTx` custodial (atomic `/tx/build-sign-submit` round-trip)

**Changed**:

- `error` now carries a required `phase: TxErrorPhase` discriminator so modals can offer "retry from this step" and label which phase failed.
- `external?: true` flag removed from the union — it was an internal discriminator that became unnecessary once `buildData` was threaded through every transition. Custom UIs that read `state.external` should branch on the presence of `state.buildData` instead.

### Migration notes

- **No breaking runtime behavior for 0.5 / 0.6 / 0.7.1 consumers.** Existing
  `await client.signAndSubmitTx(xdr)` calls keep working — only the resolved
  value is different (was `void`, is now `SubmitOutcome`), which is fine for
  callers that ignore it.
- If you previously annotated `Promise<void>` explicitly somewhere
  (`const p: Promise<void> = client.signAndSubmitTx(...)`), TypeScript will
  flag it after upgrading. Drop the annotation or update it to
  `Promise<SubmitOutcome>`.
- **If you render `TransactionState` in a custom UI** (not using the built-in
  `TransactionModal` / `SendModal`): your exhaustive `switch (state.step)`
  will produce a TypeScript error after upgrading because it doesn't cover
  the 5 new step values. Add cases for `signed`, `submitting`, `submitted`,
  `signing-submitting`, `building-signing-submitting` — or add a `default`
  branch for forward compatibility. At runtime, an unhandled step just
  means your modal won't render anything for it; no error is thrown.
- **`state.external` removed.** If you keyed UI off it, switch to
  `'buildData' in state ? state.buildData : null` (the same buildData
  threading the SDK uses internally).
- The built-in `TransactionModal` and `SendModal` already handle every new
  state — if you use them as-is, no UI changes needed.

## 0.7.1

Patch release on top of 0.7.0 — adds a distribution-rules surface to `@pollar/core` and
`@pollar/react`, and fixes the auto-retry path that silently broke for any request with
a body (POST/PUT/PATCH) once the original `Request.body` stream had been consumed by
`fetch()`.

### `@pollar/core` — new features

- **Distribution rules.** Two new endpoints on `PollarClient`:
  - `listDistributionRules(): Promise<DistributionRule[]>` — returns the rules visible
    to the calling sdk-user, each decorated with `claimable: boolean` and (when not
    claimable) a `reason` `ErrorCode` the UI maps to a friendly message.
  - `claimDistributionRule({ ruleId }): Promise<DistributionClaimContent>` — claims a
    rule for the authenticated user and returns the Stellar tx hash once the payment
    is submitted.
- New types: `DistributionRule`, `RulePeriod`, `DistributionClaimBody`,
  `DistributionClaimContent`, `DistributionRulesState`.
- OpenAPI schema regenerated against `sdk-api` — adds `/distribution/rules` and
  `/distribution/claim` paths and refreshes the `409` envelope shape on existing
  operations.

### `@pollar/core` — fixes

- **Auto-retry on `401` / DPoP nonce challenge now works for POST/PUT/PATCH.** The
  previous implementation called `originalRequest.clone()` inside `_retryRequest`,
  which throws `Request body is already used` once `fetch()` has consumed the body
  stream — meaning every request with a body silently failed to retry after a refresh
  or a `use_dpop_nonce` challenge. `onRequest` now snapshots the body into a
  `WeakMap<Request, ArrayBuffer>` _before_ `fetch` disturbs it, and `_retryRequest`
  builds a brand-new `Request` with the cached body, fresh headers, and a fresh DPoP
  proof. The `X-Pollar-Retried` header guard was dropped — `openapi-fetch` only runs
  `onResponse` once per request, so it was redundant.
- `buildTx` no longer swallows its catch silently; the underlying error is logged via
  `console.error` before the transaction state flips to `error`.

### `@pollar/react` — new features

- **New: `DistributionRulesModal`.** Drop-in UI that lists every distribution rule
  available to the logged-in user, with a per-row claim button. Handles loading,
  empty / error states, per-row `claiming` spinner, per-row claim errors, and a
  "claimed" badge once a claim succeeds. Available via the new
  `openDistributionRulesModal()` action on `usePollar()`. The pure presentational
  `DistributionRulesModalTemplate` is exported alongside for consumers who want to swap
  the chrome while keeping the wiring.

### Internal infra

- New `stellar-wallets-kit-adapter:publish` script in the root `package.json` so the
  adapter ships through the same `npm publish --access public` path as the other
  packages.
- Removed stale top-level `yalc.lock`.

## 0.7.0

> **⚠️ BREAKING CHANGE.** This release ships sender-constrained tokens via DPoP (RFC 9449). The persisted session shape,
> the storage namespace, the `Authorization` scheme, and the `AuthState.session` type all change. Sessions written by
> 0.6.x are invalidated — every user re-logs in once. The full threat model and residual-risk write-up will live at
> [docs.pollar.xyz](https://docs.pollar.xyz).

### Why

The 0.6.x SDK persisted access + refresh tokens and PII (email, names, avatar, providers) in `localStorage`. Any XSS in
any consumer page meant full account takeover and a 30-day refresh window. 0.7.0 mitigates that by:

1. **Binding tokens to a per-session keypair** (DPoP). A token stolen out of `localStorage` is useless without the
   corresponding private key — which is non-extractable on web and Keychain/Keystore-backed on native.
2. **Removing PII from storage entirely** — held in memory only, fetched after auth.
3. **Rotating refresh tokens single-use** with family revocation on reuse.

We did _not_ move the refresh token to an HttpOnly cookie because that requires `SameSite=None; Secure` cross-domain
cookies, which Safari ITP and Firefox ETP block by default — fatal for an SDK that runs on arbitrary consumer domains.

### Server requirement

This SDK requires `sdk-api` ≥ Phase 5 (DPoP middleware + `cnf.jkt` issuance + `POST /v1/auth/refresh`). Older API
deployments will reject DPoP-bound requests with `401 SDK_AUTH_DPOP_REQUIRED`. Coordinate the API deploy before bumping
the SDK in consumers.

The session-lifecycle endpoints (`POST /v1/auth/logout`, `GET /v1/auth/sessions`,
`DELETE /v1/auth/sessions/{familyId}`) and the stripped SSE payload land in the same server release. Earlier `sdk-api`
deployments return 404 on the new paths; the SDK's `logout()` continues to clear local state even when the server call
fails.

### Breaking changes

- **Persisted session shape** — the `data.{mail,first_name,last_name,avatar,providers}` subtree is no longer written to
  storage. PII now lives in memory on `PollarClient`, accessible via `client.getUserProfile()`. **Old `pollar:session`
  blobs from 0.6.x are invalid against the new validator and are silently dropped — every user re-logs in once.**
- **Storage namespace** — keys moved from `pollar:session` and `pollar:walletType` to `pollar:${apiKeyHash}:session` and
  `pollar:${apiKeyHash}:walletType` so multiple SDK instances on the same origin don't collide.
- **`AuthState.authenticated.session` type** changed from `PollarApplicationConfigContent` to `PollarPersistedSession`.
  Code that read `authState.session.data.mail` (or any other `data.*` field) breaks at compile time. Migrate to
  `client.getUserProfile()`.
- **`Authorization` scheme** changed from `Bearer <AT>` to `DPoP <AT>` for any token issued with `dpopJwk` in the login
  request. Tokens issued without `dpopJwk` keep the legacy `Bearer` path (compat hatch during rollout).
- **HTTPS required** — DPoP needs `SubtleCrypto` and `crypto.randomUUID`, both of which require a secure context. The
  SDK fails fast on HTTP origins. In React Native, import `react-native-get-random-values` at app entry.
- **React Native users must inject storage** — `defaultStorage()` only autodetects `localStorage`. RN apps pass
  `createSecureStoreAdapter()` (Expo) or `createKeychainAdapter()` (`react-native-keychain`).
- **`PollarClient.logout()` returns `Promise<void>`** (was `void`). Existing fire-and-forget call sites keep working,
  but consumers that want to observe the server-side revocation must now `await` the call.
- **SSE session-status payload trimmed** — `/auth/session/status/{clientSessionId}` no longer emits `user.id` or
  `data.*`. Identity data is delivered exclusively through the authenticated `/auth/login` response. Code that read PII
  from the SSE stream must migrate to `client.getUserProfile()` after login completes.
- **Adapter types renamed** — `EscrowFn` → `AdapterFn` and `EscrowAdapter` → `PollarAdapter` in `@pollar/core`. The
  `PollarAdapters` umbrella type keeps its name but now indexes `PollarAdapter` instead of `EscrowAdapter`. Consumers
  who imported `EscrowFn` / `EscrowAdapter` (introduced in 0.5.3) must rename their imports. The runtime contract is
  unchanged — only the type names move — so the migration is mechanical.

### `@pollar/core` — new features

- **Pluggable `Storage` adapter.** `defaultStorage()` autodetects `localStorage` on web with in-memory fallback for SSR,
  private browsing, sandboxed iframes, and quota errors. New sub-path exports for native:
  - `@pollar/core/adapters/expo` → `createSecureStoreAdapter()` (default
    `keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY` so iCloud Keychain backup can't exfiltrate the key)
  - `@pollar/core/adapters/react-native-keychain` → `createKeychainAdapter()`
- **Pluggable `KeyManager`.** Per-session ECDSA P-256 keypair backing every DPoP proof.
  - `WebCryptoKeyManager` — `subtle.generateKey({extractable: false})`, `CryptoKeyPair` persisted in IndexedDB store
    `pollar-keys`. Private key bytes never leave the browser's crypto context.
  - `NobleKeyManager` — `@noble/curves` p256 + `@noble/hashes` sha256. Private scalar (32 bytes) stored through the
    injected `Storage` adapter.
  - `defaultKeyManager(storage, apiKeyHash)` — picks WebCrypto if `subtle.generateKey` exists, else Noble.
- **DPoP proof builder.** `buildProof({htm, htu, accessToken?, nonce?}, keyManager)` produces a compact JWS that
  consumers can attach to outgoing requests. Cross-validated against `jose` 5.x.
- **`normalizeHtu(url)`** — RFC 9449 §4.3 + RFC 3986 §6.2 canonicalization (lowercase scheme/host, default port elision,
  trailing slash preserved, query/fragment/userinfo stripped, IPv6 brackets preserved).
- **`computeJwkThumbprint(jwk)`** — RFC 7638 thumbprint matching `jose.calculateJwkThumbprint`.
- **Race-safe `client.refresh()`** — singleton in-flight promise; concurrent 401 retries coalesce into one
  `/v1/auth/refresh` call.
- **Auto-refresh on 401.** Request middleware retries once after a successful refresh; second 401 propagates and clears
  the session.
- **`DPoP-Nonce` rotation tracking.** Server-issued nonces are captured from response headers and threaded into
  subsequent proofs; `use_dpop_nonce` challenges trigger an automatic retry.
- **`PollarClient.destroy()`** — detaches the cross-tab `storage` listener and aborts in-flight logins. Fixes a
  long-standing memory leak.
- **`getUserProfile()`** — returns the in-memory `PollarUserProfile` (email, names, avatar, providers). `null` until
  `/auth/login` completes; never written to storage.
- **`onStorageDegrade` callback** — notified the first time `localStorage` falls back to in-memory mode, for telemetry.
- **Server-side logout.** `PollarClient.logout({ everywhere? })` now calls `POST /v1/auth/logout` to revoke the
  refresh-token family on the server before clearing local storage. Server revocation is best-effort: a failed POST
  still clears local state, the orphan refresh token then sits unused until its natural expiry. Pass `everywhere: true`
  to revoke every active session for the user; the `logoutEverywhere()` shorthand wraps that case.
- **Sessions list + revoke.** `PollarClient.listSessions()` returns `SessionInfo[]` (one entry per active refresh-token
  family) and `PollarClient.revokeSession(familyId)` revokes a specific one. Each row carries `familyId`, `createdAt`,
  `lastUsedAt`, `userAgent`, `ipHash`, `deviceLabel`, `expiresAt`, plus a `current: boolean` flag identifying the local
  session. Revoking the current family does not immediately clear local state — the next 401 will trigger an automatic
  refresh, which fails (family revoked) and clears the session.
- **`PollarClientConfig.deviceLabel`** — optional UI-friendly label sent at `/auth/login` time and recorded on the
  server-side refresh-token row so the sessions list can show "iPhone — Safari" instead of the raw user agent.
- **OAuth popup hardening** — `loginOAuth` severs `window.opener` after opening the popup and after each navigation;
  the popup-blocked fallback uses `noopener,noreferrer`. Cross-origin pages opened by the popup can no longer
  navigate back into the parent.
- **Exponential backoff on the session-status SSE stream** — `streamUntilFound` doubles its retry delay on consecutive
  failures (200 ms → 5 s) and resets the floor on any successful chunk. The happy path is unchanged.
- **Pluggable wallet-adapter resolver.** `PollarClientConfig.walletAdapter?: WalletAdapterResolver` lets consumers
  inject external wallet implementations (Stellar Wallets Kit, custom modules, hardware wallets) without bundling
  them into `@pollar/core`. The resolver is invoked lazily on connect with the requested wallet id and returns a
  `WalletAdapter` (sync or `Promise`). When omitted, only the built-in `freighter` / `albedo` adapters are reachable.
- **New `WalletId` type.** `WalletId = WalletType | (string & {})` widens the accepted wallet identifier from the
  internal enum to any opaque string id (e.g. `'xbull'`, `'lobstr'`, `'walletconnect'`) used by external adapter
  packages, while keeping autocomplete on the enum values. `WalletAdapter.type` was widened from `WalletType` to
  `WalletId` accordingly — relevant only to consumers who implement custom adapters.
- New exports: `Storage`, `KeyManager`, `PublicEcJwk`, `PollarPersistedSession`, `PollarUserProfile`,
  `OnStorageDegrade`, `BuildProofArgs`, `SessionInfo`, `WalletId`, `WalletAdapterResolver`.

### `@pollar/core` — fixes

- **Drop `userId` from `[PollarClient] Session stored` log** — leaked user identity to console / DevTools.
- **Cross-tab `storage` event listener** is now removed in `destroy()`. Previously leaked one closure per `PollarClient`
  instance.
- **`signAndSubmitTx` no longer reads `data.providers.wallet.address`** — that field is identical to `wallet.publicKey`
  for external wallets, and the latter is now the single source of truth.

### `@pollar/react`

- **`PollarClientConfig` extension threads through `PollarProvider`** — `storage`, `keyManager`, and `onStorageDegrade`
  can be passed via the provider's `config` prop.
- **`sessionState` type narrowed** — context value's session is now `PollarPersistedSession | null`. Consumers reading
  `sessionState.data.*` need to migrate to `pollarClient.getUserProfile()`.
- **`walletAddress` simplified** — for both external and custodial wallets, derived from
  `sessionState.wallet.publicKey`.
- **New: `SessionsModal`** — drop-in active-sessions UI. Lists every refresh-token family for the current user with
  device metadata, marks the local session, and offers per-row revoke + a "Sign out everywhere" button. Available via
  the new `openSessionsModal()` action on `usePollar()`. The pure presentational `SessionsModalTemplate` is exported
  for consumers who want to swap the chrome while keeping the wiring.

### `@pollar/privy-adapter` — new package

Stateless HTTP proxy that lets `sdk-api` sign Stellar transactions through a Privy server-wallet account without the
Privy app secret leaving the integrator's infrastructure. Runs as a sidecar to `sdk-api`; Privy is treated as a remote
signer reached over an authenticated localhost-style channel rather than a client-side dependency.

- `createPollarPrivyAdapter(config)` boots a Hono server (default port `3001`) exposing
  `POST /wallets/create`, `POST /wallets/sign`, `GET /wallets/:userId/address`, and `GET /health`. Returns `{ start, stop }`
  for lifecycle control.
- Bearer auth via `pollarApiSecret` on every `/wallets/*` route; configurable body-size cap (`maxBodyBytes`, default
  64 KiB) and per-request timeout (`requestTimeoutMs`, default 10 s).
- Per-userId wallet-address LRU cache (1 000 entries, 10 min TTL) so repeated sign calls don't hit Privy on the hot path.
- Maps Pollar `userId` → Privy DID through `custom_auth` linked accounts so wallets are namespaced per Pollar tenant.
- Stable error envelope: discriminated `SuccessCode` / `ErrorCode` enums (`VALIDATION_ERROR`,
  `INTERNAL_SERVER_ERROR`, …), shared response middleware, optional `onError(error, ctx)` hook for upstream telemetry.
- Dependencies: `@privy-io/node`, `@stellar/stellar-sdk@^15`, `hono`, `@hono/node-server`, `lru-cache`, `zod`. Node ≥ 20.

### `@pollar/stellar-wallets-kit-adapter` — new package

Plugs [Stellar Wallets Kit](https://stellarwalletskit.dev) into Pollar so additional wallet modules (xBull, Lobstr,
Rabet, Albedo, Freighter, Hana, Klever, Bitget, CactusLink, Fordefi, HotWallet, OneKey, and opt-in Ledger / Trezor /
WalletConnect) become reachable through Pollar's `WalletAdapter` contract without bundling the kit into `@pollar/core`.

- `stellarWalletsKit(options?): WalletAdapterResolver` — factory you hand to `PollarClientConfig.walletAdapter`.
  Options: `network` (defaults to `Networks.TESTNET`) and `modules` (defaults to the 12 zero-setup modules; pass an
  explicit list to add Ledger / Trezor / WalletConnect, which need extra wiring).
- `StellarWalletsKitAdapter` class — direct `WalletAdapter` implementation that delegates `connect` / `signTransaction` /
  `signAuthEntry` to the kit, calling `setWallet(id)` before each operation so a single `StellarWalletsKit.init(...)`
  can drive many modules.
- One-shot lazy `init` — the kit is initialised the first time the resolver is invoked, so importing the package has
  no startup cost.
- Peer deps: `@creit.tech/stellar-wallets-kit@^2.0.0` and `@pollar/core@*`. The kit is **not** bundled; consumers bring
  the version they want.

### Internal infra

- New direct dep in `@pollar/core`: `@noble/curves@~1.9.7` (pinned to patch range; supply-chain-conscious — the
  package publishes npm provenance / sigstore signatures). `@noble/hashes@1.8.0` is pulled transitively through
  `@noble/curves` and used by the Noble key-manager / DPoP proof builder.
- New optional peer deps: `expo-secure-store >=12`, `react-native-keychain >=8`. Both marked
  `peerDependenciesMeta.optional=true`; web users never see them.
- `tsup` build now produces three entries: `dist/index`, `dist/adapters/expo-secure-store`,
  `dist/adapters/react-native-keychain`. Adapters are dynamic-imported so web bundlers strip the RN deps entirely.

### Migration guide

**Web (most consumers):**

```ts
// 0.6.x
import { PollarClient } from '@pollar/core';

const client = new PollarClient({ apiKey });

// 0.7.x — same code; storage and keyManager autodetect on web.
const client = new PollarClient({ apiKey });
```

If you read PII off the session, switch to:

```ts
// before
const email = pollarClient.session?.data?.mail;

// after
const email = pollarClient.getUserProfile()?.mail;
```

**React Native (Expo):**

```ts
import { PollarClient } from '@pollar/core';
import { createSecureStoreAdapter } from '@pollar/core/adapters/expo';
import 'react-native-get-random-values'; // at app entry

const storage = await createSecureStoreAdapter();
const client = new PollarClient({ apiKey, storage });
```

**React Native (`react-native-keychain`):**

```ts
import { createKeychainAdapter } from '@pollar/core/adapters/react-native-keychain';

const storage = await createKeychainAdapter();
const client = new PollarClient({ apiKey, storage });
```

### Known limitations

- The in-memory `jti` replay cache is per-process. Multi-pod API deployments need a Redis-backed cache before any
  meaningful traffic — under load with N pods, a captured proof is replayable up to N times within the `iat` window.
- Native key material is bytes-in-Keychain, not Secure-Enclave/StrongBox-bound. A device-level compromise (jailbreak /
  root) can still exfiltrate the key. A hardware-backed `KeyManager` is on the roadmap for a future release.
- The in-flight access token survives until its natural TTL (≤10 min for DPoP-bound tokens) after `logout()`. A
  Redis-backed jti denylist on `sdk-api` would invalidate it instantly; until that's wired up, the refresh-token
  revocation alone closes the long-tail window.
- Refresh-token cleanup is not automated — expired rows accumulate in `refresh_tokens`. A scheduled
  `DELETE FROM refresh_tokens WHERE expires_at < now()` job is recommended; trivial to write but intentionally left to
  deploy operations to schedule.

## 0.6.0

### `@pollar/react`

#### New features

- **New:** `SendModal` — full send flow within a single modal: asset picker (grouped by app-enabled vs. other), amount
  input with available balance hint, destination address, and inline transaction status (build → sign → success/error)
  without opening a secondary modal
- **New:** `ReceiveModal` — displays the connected wallet address as a QR code with copy-to-clipboard support; no
  external QR dependency required for consumers
- **New:** `TxStatusView` — shared transaction status component extracted from `TransactionModal` and reused by
  `SendModal`; renders the full build/sign/success/error lifecycle with XDR toggle, hash copy, and explorer link
- **New:** `WalletButton` dropdown now includes **Send** and **Receive** actions that open the respective modals
  directly
- **New:** Inline transaction spinner in `WalletButton` — a small animated arc appears to the right of the wallet
  address during in-progress transactions; button width and layout are unaffected
- **New:** `TxHistoryModal` auto-fetches transaction history on open (first page, offset 0)
- **New:** ESLint configuration (`eslint.config.mjs`) with `typescript-eslint` and `eslint-plugin-react-hooks` — covers
  both TypeScript and React hooks rules across the package

#### Breaking changes — context API renames

The following names exported from `usePollar()` have been renamed for consistency and clarity:

| Before                 | After                  |
| ---------------------- | ---------------------- |
| `transaction`          | `tx`                   |
| `openTransactionModal` | `openTxModal`          |
| `config`               | `appConfig`            |
| `openRampWidget`       | `openRampModal`        |
| `refreshBalance`       | `refreshWalletBalance` |

#### Improvements

- **Perf:** `getClient` and `refreshWalletBalance` are now wrapped in `useCallback` with stable deps — consumers can
  safely include them in `useEffect` dependency arrays without triggering unnecessary re-runs
- **Perf:** `adapters` prop uses a `useRef` pattern inside the provider — prevents `useMemo` from recomputing the
  context value when the consumer passes an unstable `adapters` reference
- **Refactor:** Context value object reorganized by domain (session, auth, transactions, wallet balance, network, KYC,
  ramp, config) with inline comments
- **Fix:** `TransactionModal` no longer auto-opens when transaction state changes — call `openTxModal()` explicitly when
  needed
- **Fix:** QR code rendering does not require consumers to install any additional package — `qr.js` is bundled and the
  `react-qr-code` source is vendored internally

## 0.5.3

### `@pollar/core`

- **New:** `EscrowFn`, `EscrowAdapter`, and `PollarAdapters` types — generic adapter contract for wrapping external
  signing functions (e.g. Trustless Work SDK)

### `@pollar/react`

- **New:** `adapters` prop on `PollarProvider` — accepts any named set of adapters; adapter functions receive params,
  return an unsigned XDR, and Pollar handles signing and submission automatically
- **New:** `createPollarAdapterHook(key)` — factory that generates a fully-typed hook (e.g. `usePollarEscrow`) mirroring
  the adapter's API with automatic XDR signing built in
- **New:** Explorer link on each row in `TxHistoryModal` — opens the transaction on `stellar.expert` with the correct
  network (testnet/mainnet)
- **Fix:** Unified CSS variables and base class across all modals via `shared.css` — eliminates duplicated style
  declarations
- **Fix:** Transaction explorer URL in `TransactionModal` now correctly resolves network from
  `buildData.summary.network` before falling back to context network

## 0.5.2

### `@pollar/core`

- **Refactor:** `client.ts` — internal improvements and minor API adjustments
- **New:** Additional type exports in `types.ts`
- **Fix:** `schema.d.ts` updated to reflect latest API spec

### `@pollar/react`

- **Refactor:** `WalletButton` split into logic and template layers — `WalletButton.tsx` handles state and behavior,
  `WalletButtonTemplate.tsx` handles rendering only
- **Refactor:** `WalletBalanceModal` split into logic and template layers — `WalletBalanceModalTemplate.tsx` added as a
  pure presentational component
- **Refactor:** `TransactionModal` and `TransactionModalTemplate` updated
- **Fix:** `tsup.config.ts` — replaced `import pkg from './package.json'` with `readFileSync` to resolve `TS2732` error;
  replaced unsupported `jsx` option with `esbuildOptions`
- **Fix:** `tsconfig.json` — added `resolveJsonModule: true`
- **Refactor:** `context.tsx` and `index.ts` updated to export new template components and types
- **New:** `WalletBalanceModalTemplate`, `WalletButtonTemplate` exported from `@pollar/react`

### Docs

- **New:** `docs/1 Pollar react.md` — full API reference for `@pollar/react`: `PollarProvider`, `usePollar()`, all modal
  entry points, components, and template components
- **New:** `docs/2 Pollar core.md` — full API reference for `@pollar/core`: `PollarClient` constructor, auth flows,
  transactions, wallet balance, tx history, KYC, ramps, and all exported types

## 0.5.1

### `@pollar/core`

- **New:** External wallet support (Freighter, Albedo, etc.) — users can now sign and submit transactions directly from
  their own wallet without Pollar holding the keys
- **Refactor:** `signAndSubmitTx()` now handles both custodial (social/email login) and external wallet flows —
  `signAndSubmitExternalTx()` removed
- **Fix:** Connecting with an external wallet no longer triggers custodial wallet creation on the backend

### `@pollar/react`

- **Refactor:** `TransactionModal` UI updates — design improvements to the modal layout and styles
- **Refactor:** `signAndSubmitExternalTx` removed from context; consumers use `signAndSubmitTx` for all flows

## 0.5.0

### `@pollar/core`

- **New:** `getKycProviders(country)` — fetches available KYC providers for a given country _(not yet implemented on
  backend)_
- **New:** `resolveKyc(providerId, level)` — starts a KYC session or returns `alreadyApproved` if the user is already
  verified _(not yet implemented on backend)_
- **New:** `pollKycStatus(providerId, options)` — polls KYC verification result with configurable interval and timeout
  _(not yet implemented on backend)_
- **New:** `getRampsQuote(params)` — fetches on/off-ramp quotes from available providers _(not yet implemented on
  backend)_
- **New:** `createOnRamp(body)` — initiates an on-ramp transaction and returns payment instructions _(not yet
  implemented on backend)_
- **New:** `fetchTxHistory(params)` — fetches paginated transaction history for the authenticated user
- **New:** `getBalance()` — fetches Stellar account balances via `StellarClient`
- **New:** Types: `KycProvider`, `KycStatus`, `KycStartResponse`, `RampDirection`, `RampQuote`, `PaymentInstructions`,
  `RampsOnrampBody`, `TxHistoryRecord`, `TxHistoryState`, `WalletBalanceRecord`, `WalletBalanceContent`
- **Refactor:** `transaction` and `txHistory` state now managed inside `PollarClient` and exposed via `onStateChange` —
  consumers no longer need to track these externally
- **Refactor:** `helpers.ts` removed; logic inlined into `client.ts`

### `@pollar/react`

- **New:** `KycModal` — full identity verification flow: provider selection, iframe/form verification, status polling,
  and result display with `KycStatus` badge _(UI only — backend not yet implemented, uses mock data)_
- **New:** `RampWidget` — buy/sell crypto UI: direction tabs, amount/currency/country inputs, provider route selection,
  and payment instructions display _(UI only — backend not yet implemented, uses mock data)_
- **New:** `TxHistoryModal` — paginated transaction history with refresh and prev/next pagination
- **New:** `WalletBalanceModal` — displays Stellar account balances with refresh support
- **New:** `shared.css` — single source of truth for shared modal styles: `@keyframes`, `.pollar-overlay`, header
  layout, close button, refresh button, primary/secondary buttons, spinner, empty/error states, footer, and status
  banner — eliminates duplicate CSS across all modals
- **Refactor:** `context.tsx` exposes `txHistory`, `transaction`, `getBalance`, and `walletAddress` directly from the
  provider — no more redundant state in consuming components
- **Refactor:** All modal CSS files cleaned up to remove duplicates; each modal only defines styles unique to it
- **Fix:** `PollarModalFooter` and `ModalStatusBanner` now reliably styled in any modal, independent of whether
  `LoginModal` CSS is loaded

## 0.4.5

### `@pollar/core`

- **Refactor:** Auth flow functions extracted from `client.ts` into `src/client/auth/` folder (`authenticate.ts`,
  `emailFlow.ts`, `oauthFlow.ts`, `walletFlow.ts`, `deps.ts`)
- **New:** `AUTH_ERROR_CODES` constant and `AuthErrorCode` type exported from `@pollar/core` — covers
  `SESSION_CREATE_FAILED`, `EMAIL_SEND_FAILED`, `EMAIL_VERIFY_FAILED`, `EMAIL_CODE_EXPIRED`, `EMAIL_CODE_INVALID`,
  `AUTH_FAILED`, `WALLET_CONNECT_FAILED`, `WALLET_AUTH_FAILED`, `UNEXPECTED_ERROR`
- **New:** `AuthState` error step now includes `errorCode: AuthErrorCode` and optional `clientSessionId`/`email` for
  retryable email code errors
- **New:** `login(options: PollarLoginOptions)` unified entry point on `PollarClient` — routes to email, OAuth, or
  wallet flow
- **Fix:** `cancelLogin()` now always resets auth state to `idle`, making back navigation reliable from any step
- **Fix:** `verifyEmailCode()` now works from `error` state when `errorCode` is `EMAIL_CODE_INVALID` or
  `EMAIL_CODE_EXPIRED`, enabling retries without restarting the flow
- **Fix:** Email code verification correctly extracts error codes from 4xx response bodies (`error.error`) in addition
  to 200 response bodies
- **New:** `initOAuthSession()` split from `loginOAuth()` — session creation is now a separate callable step (mirrors
  `initEmailSession`)

### `@pollar/react`

- **Change:** `beginEmailLogin()` no longer called on modal open — session is created on email submit instead, reducing
  unnecessary API calls
- **New:** Back button (←) on the email code input screen — cancels the flow and returns to the main login screen
- **Fix:** `EMAIL_CODE_INVALID` and `EMAIL_CODE_EXPIRED` errors keep the code input visible so the user can retry
  without dismissing the modal
- **Fix:** Retry button hidden when error is `EMAIL_CODE_INVALID` or `EMAIL_CODE_EXPIRED` (user retries inline)
- **Fix:** Code input fields are cleared automatically on `EMAIL_CODE_INVALID` so the user can enter a new code

## 0.4.4

- Fix OAuth popup blocked on Safari/Brave iOS: `window.open` is now called before any `await` to preserve the user
  gesture context

## 0.4.3

- Authentication via Google, GitHub, Email OTP, Stellar wallets
- PollarClient with transaction building and submission
- StellarClient for Horizon queries
- React provider, hook, and WalletButton component
- Typed event system for state management

## 0.3.x

- Initial SDK structure and Pollar API integration
- Basic authentication flows

## 0.2.x

- Monorepo setup with Turborepo
- Core package scaffolding

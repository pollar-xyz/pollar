# Upgrade guide

## 0.11.4 -> 0.12.0

Use `@pollar/core`, `@pollar/react` and `@pollar/react-native` at matching versions.
The candidate is `0.12.0-rc.1`; install prerelease versions explicitly. Upgrade
client adapter packages to their matching 0.12 candidates when using this core
version. Their peer ranges accept both 0.11.x and 0.12; older adapter releases
with a core peer range of only `^0.11.2` cannot be used with core 0.12.

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

### Ramp templates and signing

`RampWidgetTemplateProps.bankType` (and native template-derived props) accepts a
`string` instead of the previous fixed bank-type union. Backend routes can add
bank types. Custom templates should handle unknown strings and retain known-type
formatting where applicable; exhaustive switches need a fallback.

Supported ramp chains register a signer with `registerRampSigningHandler(chain, encoding,
handler)` and remove it with the returned cleanup function. Call `signRampAction`
only from an explicit user action. Its built-in Stellar signer verifies the wallet
account from the transaction source, or the first SEP-10 manageData operation for
an authentication challenge. It also verifies chain and network. Restoring or
polling a workflow does not sign. UI workflow helpers exported from core are
`describeRampAction`, `mergeRampSnapshot` and `mergeRampCountries`, with
`RampSnapshot` and `RampSigningHandler` types; registry and URL internals are private.

## 0.11.3 -> 0.11.4

No migration steps for an app that uses the built-in components. The wallet
reports where its on-chain Stellar account stands, the client watches it until
the account lands, a DPoP proof rejected over clock skew is re-signed instead of
clearing the session, every request carries an `x-pollar-sdk` build header,
ramp quotes report the requirement steps a route still needs, and the wallet
modals follow the new design. `@pollar/react@0.11.4` requires
`@pollar/core@^0.11.4`; if you pin both packages to exact versions, keep them on
the same version. The four adapters stay at 0.11.2 - their
`@pollar/core@^0.11.2` range already resolves 0.11.4.

**Release candidate.** `0.11.4-rc.1` is published on the `next` tag. A caret
range does not pick up a prerelease, so install it explicitly
(`npm i @pollar/core@next @pollar/react@next`, or `@pollar/react-native@next`);
`@pollar/react@0.11.4-rc.1` and `@pollar/react-native@0.11.4-rc.1` require
`@pollar/core@^0.11.4-rc.1`. `@pollar/react-native` moves from `0.1.1` to the
SDK's version line.

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

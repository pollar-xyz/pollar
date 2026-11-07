# @pollar/react-native

React Native bindings for [Pollar](https://pollar.xyz): a context provider, a hook and pre-built modals for
authentication and transactions in Stellar and Solana mobile applications. Built on top of
[`@pollar/core`](https://github.com/pollar-xyz/pollar/tree/main/packages/core).

## Installation

```bash
npm install @pollar/react-native @pollar/core react-native-safe-area-context react-native-svg
```

**Peer dependencies:** `@pollar/core ^0.12.1`, `react ^18 || ^19`, `react-native >= 0.72`,
`react-native-safe-area-context >= 4` and `react-native-svg >= 13`. QR codes render with `react-native-qrcode-svg`, a
regular dependency.

> **0.12.1** is additive on 0.12.0: every modal in English, Spanish and Portuguese, Solana swaps in `usePollar()`,
> card funding from Solana and copy buttons on the card details, "Change amount" and "Get a new quote" in
> `<RampWidget>`, and adapter hooks that sign a Soroban auth entry. Coming from 0.11.x, read
> [UPGRADE.md](https://github.com/pollar-xyz/pollar/blob/main/UPGRADE.md): on 0.12 `<RampWidget>` runs the v3 ramps API (the saved ramp in `usePollar()` is
> `{ direction, order }`), and the provider asks for the custody choice after sign-in and mounts `<RecoveryModal>` and
> `<CustodyMigrationModal>`. The full list is in the [CHANGELOG](https://github.com/pollar-xyz/pollar/blob/main/CHANGELOG.md).

Add the runtime polyfills and one storage backend:

```bash
# Expo (works in Expo Go)
npx expo install expo-secure-store react-native-get-random-values
npm i react-native-polyfill-globals

# Bare React Native
npm i react-native-keychain react-native-get-random-values react-native-polyfill-globals
```

## Setup

### 1. Polyfills

Every authenticated request carries a DPoP proof, which needs `crypto.getRandomValues`, `TextEncoder` and `URL`.
Hermes does not ship all of them. Import these at the very top of your entry file, before anything imports
`@pollar/core`:

```ts
import 'react-native-get-random-values';
import 'react-native-polyfill-globals/auto';
```

If one is missing, no authenticated request works. See the
[`@pollar/core` README](https://github.com/pollar-xyz/pollar/tree/main/packages/core) for the details.

### 2. Storage

React Native has no `localStorage`. Without a storage adapter the session and the DPoP key live in memory, and the
user is logged out every time the app restarts (the SDK warns about it in the console). The adapters load their
native module lazily, so they are async: create the storage before you render the provider.

```tsx
import { PollarClientConfig } from '@pollar/core';
import { createSecureStoreAdapter } from '@pollar/core/adapters/expo';
// Bare React Native: import { createKeychainAdapter } from '@pollar/core/adapters/react-native-keychain';
import { PollarProvider } from '@pollar/react-native';
import { useEffect, useState } from 'react';

export default function App() {
  const [config, setConfig] = useState<PollarClientConfig | null>(null);

  useEffect(() => {
    createSecureStoreAdapter().then((storage) => setConfig({ apiKey: 'pub_testnet_xxxxxxxx', storage }));
  }, []);

  if (!config) return null;

  return (
    <PollarProvider config={config}>
      <MyApp />
    </PollarProvider>
  );
}
```

`config` is compared key by key on every render. A changed value (another API key, a new storage or adapter object) cancels any login, destroys the client and mounts the children again with a new one; equal inline scalars do not. Keep object values stable (module scope or `useMemo`) so a re-render does not restart the client.

### 3. OAuth (Google, GitHub)

`window.open` does not exist on React Native, so pass an opener and your app's deep link. The SDK polls the auth
session until the backend marks it ready, so the opener only has to show the page:

```ts
import * as WebBrowser from 'expo-web-browser';

const config: PollarClientConfig = {
  apiKey: 'pub_testnet_xxxxxxxx',
  storage,
  oauthRedirectUri: 'myapp://auth',
  openAuthUrl: async ({ getUrl, redirectUri }) => {
    const url = await getUrl();
    if (url) await WebBrowser.openAuthSessionAsync(url, redirectUri);
  },
};
```

Add the same redirect URI to your application in the Pollar dashboard.

### 4. App state (optional)

To refresh the session as soon as the app returns to the foreground, pass an `AppState`-backed visibility provider:

```ts
import { createAppStateVisibilityProvider } from '@pollar/core/adapters/react-native-appstate';

const visibilityProvider = await createAppStateVisibilityProvider();
```

## `<PollarProvider>`

Creates the `PollarClient`, exposes it through `usePollar()` and mounts the login, transaction, signature
confirmation, co-sign, recovery, custody migration, KYC, ramp, card, transaction history and wallet balance modals,
plus the Send, Receive, Swap, Earn, Sessions, enabled assets and distribution rules modals. You do not render the
modals yourself.

| Prop           | Type                     | Required | Description                                                                                                          |
| -------------- | ------------------------ | -------- | -------------------------------------------------------------------------------------------------------------------- |
| `config`       | `PollarClientConfig`     | Yes      | Passed to `new PollarClient(config)`. A changed value replaces the client.                                           |
| `language`     | `string`                 | No       | The modals' language, a BCP 47 tag. Followed on every render without replacing the client. See [Language](#language) |
| `appConfig`    | `PollarConfig`           | No       | An application config to use in place of the one read from the dashboard.                                            |
| `styles`       | `PollarStyles`           | No       | Merged over the styles configured in the dashboard.                                                                  |
| `adapters`     | `PollarAdapters`         | No       | Custom transaction builders, used with `createPollarAdapterHook(key)`.                                               |
| `platform`     | `NativePlatformAdapters` | No       | `storage`, `visibilityProvider`, `openAuthUrl` and `copyText` (clipboard) adapters.                                  |
| `privyAdapter` | `InteractiveAuthAdapter` | No       | An interactive login adapter. Mount its native provider above `PollarProvider`.                                      |

## `usePollar()`

```ts
const {
  // session
  isAuthenticated, // boolean, follows the session: true for a signed-in user without a wallet
  hasWallet, // boolean, a wallet on any chain
  createWallet, // (options?) => Promise<WalletInfo>, for an app that creates wallets on demand
  wallet, // the primary wallet, or null
  wallets, // every wallet of the session, one per chain
  walletAddress, // string, '' when logged out
  walletType, // WalletId | null, the external wallet id when one is connected
  login, // (options: PollarLoginOptions) => void
  logout, // () => Promise<void>
  getClient, // () => PollarClient

  // transactions
  tx, // TransactionState (also as `transaction`)
  buildTx, // (operation, params, options?) => Promise<BuildOutcome>
  signAndSubmitTx, // (unsignedXdr?: string) => Promise<SubmitOutcome>
  sendPayment, // (params: SendPaymentParams) => Promise<SubmitOutcome>

  // swaps: Stellar, and Solana (Jupiter and Titan, mainnet)
  getSwapQuote,
  swap,
  getSolanaSwapConfig,
  getSolanaSwapQuote,
  swapSolana,

  // balances and history
  walletBalance, // WalletBalanceState
  refreshWalletBalance, // () => Promise<void> (also as `refreshBalance`)
  txHistory, // TxHistoryState

  // ramps
  ramp, // { direction, order } | null, the order the ramp widget follows
  getRampRoutes,
  quoteRamp,
  createRampOrder,

  // network and configuration
  network, // StellarNetwork
  setNetwork, // (network: StellarNetwork) => void
  appConfig, // PollarConfig, the application config from the dashboard (also as `config`)
  styles, // PollarStyles, the resolved styles

  // modals
  openLoginModal,
  openTxModal, // also as `openTransactionModal`
  openKycModal, // (options?: { country?, level?, onApproved? }) => void
  openRampModal, // (options?: RampModalOptions) => void, also as `openRampWidget`
  openTxHistoryModal, // (options?: TxHistoryModalOptions) => void
  openWalletBalanceModal,
  openSendModal, // (options?: SendModalOptions) => void
  openReceiveModal, // (options?: ReceiveModalOptions) => void
  openSwapModal, // (options?: SwapModalOptions) => void
  openEarnModal, // (options?: EarnModalOptions) => void
  openCardModal, // (options?: CardModalOptions) => void, the card flow, for an app with a card provider
  openRecoveryModal,
} = usePollar();
```

`buildTx` opens the transaction modal automatically, and the user confirms from there. The context also carries the
co-sign state (`cosign`, `openCosignModal`), the recovery state (`recovery`, `recoveryLocked`), the custody migration
(`custodyMigration`) and the earn, distribution and session methods of `PollarClient`.

### Modal options

The ramp, send, receive, swap, earn, history and card openers take where their modal opens, with the same fields as
`@pollar/react`. The options are a starting point
the user can change. An option that matches nothing the modal offers (a chain without a wallet, an asset code that is
not listed, a provider the app lacks, an amount that is not a plain decimal such as `'100'` or `'12.5'`) is left out
and that field opens on its default; nothing is thrown. An option whose data is still loading applies when it
arrives. Each call starts over: opening again with other options, or with none, drops the earlier ones. Asset codes
match without regard to case. Every options type is exported, and each modal component takes the same options as
`initial` (`<RampWidget initial={...}>`, `<SendModal initial={...}>`).

```ts
openRampModal({ country: 'BR', direction: flow === 'withdraw' ? 'sell' : 'buy' });
openSendModal({ asset: 'USDC', destination: 'G...', amount: '25', onSuccess: ({ hash }) => markPaid(hash) });
openCardModal({ panel: 'fund', amount: '50' });
```

`RampModalOptions`

| Option      | Type              | Description                                                          |
| ----------- | ----------------- | -------------------------------------------------------------------- |
| `direction` | `'buy' \| 'sell'` | Buy (on-ramp) or sell (off-ramp). Defaults to `'buy'`                |
| `country`   | `string`          | ISO 3166-1 alpha-2, e.g. `'BR'`                                      |
| `fiat`      | `string`          | Currency code, e.g. `'BRL'`. Defaults to the country's first fiat    |
| `asset`     | `string`          | Asset code, e.g. `'USDC'`. Defaults to the first asset for that fiat |
| `amount`    | `string`          | A plain decimal                                                      |

A country that does not route in the requested direction opens on the default country, in that direction, without
the fiat, asset or amount. An order the widget keeps from before wins: the widget opens on it and the options are
dropped.

`SendModalOptions`

| Option        | Type                                 | Description                                                        |
| ------------- | ------------------------------------ | ------------------------------------------------------------------ |
| `chain`       | `WalletChain`                        | A chain the user holds a wallet on                                 |
| `asset`       | `string`                             | Code of an asset enabled on that chain; the native asset otherwise |
| `destination` | `string`                             | The address to send to                                             |
| `amount`      | `string`                             | A plain decimal (base units on Solana and Polygon)                 |
| `memo`        | `string`                             | Stellar only: the memo, validated against its type                 |
| `memoType`    | `'text' \| 'id' \| 'hash'`           | The memo's type. Defaults to `'text'`                              |
| `onSuccess`   | `(result: { hash: string }) => void` | Called once for each transaction the modal sends that lands        |

`ReceiveModalOptions`

| Option  | Type          | Description                        |
| ------- | ------------- | ---------------------------------- |
| `chain` | `WalletChain` | A chain the user holds a wallet on |

`SwapModalOptions`

| Option      | Type                                 | Description                                                 |
| ----------- | ------------------------------------ | ----------------------------------------------------------- |
| `chain`     | `'STELLAR' \| 'SOLANA'`              | A network the app has swap venues on; the first otherwise   |
| `sell`      | `string`                             | Code of an asset the wallet holds, e.g. `'XLM'`             |
| `buy`       | `string`                             | Code of an asset the swap can buy, e.g. `'USDC'`            |
| `amount`    | `string`                             | A plain decimal                                             |
| `onSuccess` | `(result: { hash: string }) => void` | Called once for each transaction the modal sends that lands |

`EarnModalOptions`

| Option          | Type                                 | Description                                                    |
| --------------- | ------------------------------------ | -------------------------------------------------------------- |
| `provider`      | `EarnProviderId`                     | A provider the app enables, e.g. `'blend'`                     |
| `opportunityId` | `string`                             | One of that provider's opportunities; its position is read too |
| `tab`           | `'deposit' \| 'withdraw'`            | The operation. Defaults to `'deposit'`                         |
| `amount`        | `string`                             | A plain decimal                                                |
| `onSuccess`     | `(result: { hash: string }) => void` | Called once for each transaction the modal sends that lands    |

`TxHistoryModalOptions`

| Option  | Type          | Description                                                            |
| ------- | ------------- | ---------------------------------------------------------------------- |
| `chain` | `WalletChain` | The network whose transactions it lists; the app's first one otherwise |

`CardModalOptions`

| Option     | Type                             | Description                                                                         |
| ---------- | -------------------------------- | ----------------------------------------------------------------------------------- |
| `panel`    | `'fund'`                         | Opens the funding panel once the user's card loads; a user without a card stays put |
| `amount`   | `string`                         | A plain decimal                                                                     |
| `chain`    | `CardFundingChain`               | A chain the user can fund the card from                                             |
| `onFunded` | `(funding: CardFunding) => void` | Called with each funding the modal creates                                          |

The send modal takes a Stellar memo (text up to 28 bytes, an ID up to 2^64 - 1, or a 32-byte hash as 64 hex
characters) and hides it on other chains. The swap modal swaps on Solana too (Jupiter and Titan, amounts in the
token's decimals, SOL as wrapped SOL), with a network picker when the app has venues on both chains. It sells what the
wallet holds, with **Max** filling what the wallet can spend, and on Stellar buys the app's enabled assets, the curated
catalog and a token the user adds by code and issuer, saying when the swap creates a trustline first. A route picker
quotes with the best price (`auto`) or one venue. The earn modal
has deposit and withdraw tabs. The history has a network picker when the user holds wallets on more than one chain,
and each row opens its own chain's explorer.

### Login options

```ts
login({ provider: 'google' });
login({ provider: 'github' });
login({ provider: 'email', email: 'user@example.com' });
login({ provider: WalletType.FREIGHTER }); // import { WalletType } from '@pollar/core'
```

The login modal also offers Freighter and Albedo when the application enables them. `@pollar/core` ships those two
adapters for the web (browser extension and popup), so on a device they only work if you register adapters with
the same ids through `walletAdapters` in the client config.

## Components

- `<WalletButton>`: opens the login modal when logged out; when logged in, shows the address with a menu for
  balance, transaction history and logout.
- `<KycModal>`, `<KycStatus>`, `<RampWidget>`, `<RouteDisplay>`, `<RejectedRouteDisplay>`, `<WalletBalanceModal>`,
  `<CosignModal>`, `<RecoveryModal>`, `<CustodyMigrationModal>`, `<SendModal>`, `<ReceiveModal>`, `<SwapModal>`,
  `<EarnModal>`, `<SessionsModal>`, `<EnabledAssetsModal>`, `<DistributionRulesModal>`: the modals, for when you want
  to mount one yourself.
- `<CosignModal>`, the confirmation prompt and the transaction status views share one review: the asset and chain
  logos with the sender and recipient, a fee badge when who pays is known, and "Show details" with the addresses,
  network, fee, raw transaction and hash.
- `<RequirementFormModal>`, `<RegistryCheckModal>`, `<ProviderRegistrationModal>`: the requirement steps a ramp route
  can ask for (see below).
- `<CardModal>`: cards from the app's card providers - the provider's steps, sign-up, issuing, the card with its
  balance and movements, funding from the wallet on Stellar or Solana (a network picker when the user holds both), and
  the number, decrypted on the device without WebCrypto. The number, the CVC and the expiry date each have a copy
  button; the number is copied without spaces and the expiry as `MM/YY`.
- `LoginModalTemplate`, `TransactionModalTemplate`, `KycModalTemplate`, `RampWidgetTemplate`,
  `TxHistoryModalTemplate`, `WalletBalanceModalTemplate`, `WalletButtonTemplate`, `CosignModalTemplate`,
  `RecoveryModalTemplate`, `CustodyMigrationModalTemplate`: the presentational layer of each component, to build your
  own container around it.
- `createPollarAdapterHook(key)`: builds a typed hook over an adapter passed to `PollarProvider`. A method whose
  adapter answers `{ unsignedTransaction }` signs and submits that transaction. One that answers
  `{ unsignedAuthEntry, validUntilLedger, complete }` signs the Soroban auth entry, submits nothing, and resolves with
  what `complete` returns.

Components are styled with `StyleSheet`; there is no stylesheet to import. Theme, accent color, logo and login
methods come from the dashboard and can be overridden with the `styles` prop.

## Language

Every modal, template, `FeaturePanel`, `FeatureExample`, `AppShell` and `AccountOnboarding` shows English, Spanish or
Portuguese. The language is the one the app pins in the dashboard (Branding > Language), else the modal's `language`
prop (`<RampWidget>`, `<KycModal>` and the requirement step modals take one), else the `language` prop of
`<PollarProvider>`, else the client's `locale` (`{ apiKey, locale: 'pt-BR' }`, or `client.setLocale(tag)` later, any
BCP 47 tag), else the device language; English when none of them is one of the three. `AppShell`'s language toggle
cycles through `en`, `es` and `pt`.

An app whose language changes at runtime passes it as `<PollarProvider language={i18n.language}>`: open and later
modals follow it without replacing the client, which a changed `config.locale` would do. The ramp widget names each
country in the modal's language, Hermes included: `countryName` from `@pollar/core` reads the engine's
`Intl.DisplayNames` and, where it is missing, a table of every region in English, Spanish and Portuguese.

## Requirement step modals

The app's own requirement steps (`client.getAppRequirements()`) open these modals; they are exported for apps that
drive the steps themselves:

| Component                     | Step                     | Props                                                                                 |
| ----------------------------- | ------------------------ | ------------------------------------------------------------------------------------- |
| `<RequirementFormModal>`      | `FORM`                   | `formId`, `progress?`, `onClose`, `onSubmitted`, `language?`                          |
| `<RegistryCheckModal>`        | `REGISTRY_CHECK` (SEGIP) | `optionId`, `progress?`, `onClose`, `onApproved`, `language?`                         |
| `<ProviderRegistrationModal>` | `PROVIDER_REGISTRATION`  | `corridorId` or `cardProviderId`, `progress?`, `onClose`, `onRegistered`, `language?` |

`progress` is `{ position, total }` from the quote, shown as "Step n of total". The form modal prefills the user's
previous answers; the registry modal prefills the verified identity and lets the user edit only the surname split and the
CI complement; the registration modal lists what the provider receives and sends it on consent. A form field with
`showIf: { key, in }` is shown only while the earlier field it names answers one of those values, and is neither
checked nor sent while hidden.

```tsx
import { RegistryCheckModal } from '@pollar/react-native';

<RegistryCheckModal optionId={step.optionId} progress={{ position: 2, total: 4 }} onClose={close} onApproved={requote} />;
```

## Reusable native screens and ramp workflows

The package also exports `AppShell`, `FeatureCatalog`, `FeaturePanel`, `FeatureExample`, `AccountOnboarding`,
and native panels for payments, assets, history, sessions, swaps, earn, distribution and ramps (`SendPanel`,
`AssetsPanel`, `HistoryPanel`, `SessionsPanel`, `SwapPanel`, `EarnPanel`, `DistributionPanel`, `RampPanel` and the
rest).

`RampWidget` and `RampPanel` run the v3 ramps API: they list the routes (`client.getRampRoutes(direction)`), quote
them leg by leg, ask for the fields a quote needs, create the order and follow it at the pace the server suggests.
The order's pending action is shown as it comes: a payment QR or bank details, Authorize for a signature, the
co-sign approval or a verification link. Signing uses a handler registered for the action's chain and encoding (a
Stellar or Solana leg falls back to the connected wallet) and only runs on a user press; polling never signs. The
widget keeps the order in `usePollar().ramp` while it is closed.

A route refused for its amount names the minimum or maximum it takes, and the widget offers "Change amount". An order
that fails because the provider's price moved before anything was sent offers "Get a new quote", which quotes the same
amount again and shows the routes.

---

## Developing in the monorepo

```bash
npm install
npx turbo build --filter=@pollar/react-native   # builds @pollar/core first
```

To try a local build in an app, publish both packages with [yalc](https://github.com/wclr/yalc)
(`yalc publish` in `packages/core` and `packages/react-native`, then `yalc add @pollar/core @pollar/react-native` in
the app) and restart Metro with `npm start -- -c`. Run `npm test --workspace=@pollar/react-native` for the native
behavior tests.

## License

Apache-2.0

# Changelog

## 0.6.0

### `@pollar/react`

#### New features

- **New:** `SendModal` — full send flow within a single modal: asset picker (grouped by app-enabled vs. other), amount input with available balance hint, destination address, and inline transaction status (build → sign → success/error) without opening a secondary modal
- **New:** `ReceiveModal` — displays the connected wallet address as a QR code with copy-to-clipboard support; no external QR dependency required for consumers
- **New:** `TxStatusView` — shared transaction status component extracted from `TransactionModal` and reused by `SendModal`; renders the full build/sign/success/error lifecycle with XDR toggle, hash copy, and explorer link
- **New:** `WalletButton` dropdown now includes **Send** and **Receive** actions that open the respective modals directly
- **New:** Inline transaction spinner in `WalletButton` — a small animated arc appears to the right of the wallet address during in-progress transactions; button width and layout are unaffected
- **New:** `TxHistoryModal` auto-fetches transaction history on open (first page, offset 0)
- **New:** ESLint configuration (`eslint.config.mjs`) with `typescript-eslint` and `eslint-plugin-react-hooks` — covers both TypeScript and React hooks rules across the package

#### Breaking changes — context API renames

The following names exported from `usePollar()` have been renamed for consistency and clarity:

| Before | After |
|---|---|
| `transaction` | `tx` |
| `openTransactionModal` | `openTxModal` |
| `config` | `appConfig` |
| `openRampWidget` | `openRampModal` |
| `refreshBalance` | `refreshWalletBalance` |

#### Improvements

- **Perf:** `getClient` and `refreshWalletBalance` are now wrapped in `useCallback` with stable deps — consumers can safely include them in `useEffect` dependency arrays without triggering unnecessary re-runs
- **Perf:** `adapters` prop uses a `useRef` pattern inside the provider — prevents `useMemo` from recomputing the context value when the consumer passes an unstable `adapters` reference
- **Refactor:** Context value object reorganized by domain (session, auth, transactions, wallet balance, network, KYC, ramp, config) with inline comments
- **Fix:** `TransactionModal` no longer auto-opens when transaction state changes — call `openTxModal()` explicitly when needed
- **Fix:** QR code rendering does not require consumers to install any additional package — `qr.js` is bundled and the `react-qr-code` source is vendored internally

## 0.5.3

### `@pollar/core`

- **New:** `EscrowFn`, `EscrowAdapter`, and `PollarAdapters` types — generic adapter contract for wrapping external signing functions (e.g. Trustless Work SDK)

### `@pollar/react`

- **New:** `adapters` prop on `PollarProvider` — accepts any named set of adapters; adapter functions receive params, return an unsigned XDR, and Pollar handles signing and submission automatically
- **New:** `createPollarAdapterHook(key)` — factory that generates a fully-typed hook (e.g. `usePollarEscrow`) mirroring the adapter's API with automatic XDR signing built in
- **New:** Explorer link on each row in `TxHistoryModal` — opens the transaction on `stellar.expert` with the correct network (testnet/mainnet)
- **Fix:** Unified CSS variables and base class across all modals via `shared.css` — eliminates duplicated style declarations
- **Fix:** Transaction explorer URL in `TransactionModal` now correctly resolves network from `buildData.summary.network` before falling back to context network

## 0.5.2

### `@pollar/core`

- **Refactor:** `client.ts` — internal improvements and minor API adjustments
- **New:** Additional type exports in `types.ts`
- **Fix:** `schema.d.ts` updated to reflect latest API spec

### `@pollar/react`

- **Refactor:** `WalletButton` split into logic and template layers — `WalletButton.tsx` handles state and behavior, `WalletButtonTemplate.tsx` handles rendering only
- **Refactor:** `WalletBalanceModal` split into logic and template layers — `WalletBalanceModalTemplate.tsx` added as a pure presentational component
- **Refactor:** `TransactionModal` and `TransactionModalTemplate` updated
- **Fix:** `tsup.config.ts` — replaced `import pkg from './package.json'` with `readFileSync` to resolve `TS2732` error; replaced unsupported `jsx` option with `esbuildOptions`
- **Fix:** `tsconfig.json` — added `resolveJsonModule: true`
- **Refactor:** `context.tsx` and `index.ts` updated to export new template components and types
- **New:** `WalletBalanceModalTemplate`, `WalletButtonTemplate` exported from `@pollar/react`

### Docs

- **New:** `docs/1 Pollar react.md` — full API reference for `@pollar/react`: `PollarProvider`, `usePollar()`, all modal entry points, components, and template components
- **New:** `docs/2 Pollar core.md` — full API reference for `@pollar/core`: `PollarClient` constructor, auth flows, transactions, wallet balance, tx history, KYC, ramps, and all exported types

## 0.5.1

### `@pollar/core`

- **New:** External wallet support (Freighter, Albedo, etc.) — users can now sign and submit transactions directly from their own wallet without Pollar holding the keys
- **Refactor:** `signAndSubmitTx()` now handles both custodial (social/email login) and external wallet flows — `signAndSubmitExternalTx()` removed
- **Fix:** Connecting with an external wallet no longer triggers custodial wallet creation on the backend

### `@pollar/react`

- **Refactor:** `TransactionModal` UI updates — design improvements to the modal layout and styles
- **Refactor:** `signAndSubmitExternalTx` removed from context; consumers use `signAndSubmitTx` for all flows

## 0.5.0

### `@pollar/core`

- **New:** `getKycProviders(country)` — fetches available KYC providers for a given country *(not yet implemented on backend)*
- **New:** `resolveKyc(providerId, level)` — starts a KYC session or returns `alreadyApproved` if the user is already verified *(not yet implemented on backend)*
- **New:** `pollKycStatus(providerId, options)` — polls KYC verification result with configurable interval and timeout *(not yet implemented on backend)*
- **New:** `getRampsQuote(params)` — fetches on/off-ramp quotes from available providers *(not yet implemented on backend)*
- **New:** `createOnRamp(body)` — initiates an on-ramp transaction and returns payment instructions *(not yet implemented on backend)*
- **New:** `fetchTxHistory(params)` — fetches paginated transaction history for the authenticated user
- **New:** `getBalance()` — fetches Stellar account balances via `StellarClient`
- **New:** Types: `KycProvider`, `KycStatus`, `KycStartResponse`, `RampDirection`, `RampQuote`, `PaymentInstructions`, `RampsOnrampBody`, `TxHistoryRecord`, `TxHistoryState`, `WalletBalanceRecord`, `WalletBalanceContent`
- **Refactor:** `transaction` and `txHistory` state now managed inside `PollarClient` and exposed via `onStateChange` — consumers no longer need to track these externally
- **Refactor:** `helpers.ts` removed; logic inlined into `client.ts`

### `@pollar/react`

- **New:** `KycModal` — full identity verification flow: provider selection, iframe/form verification, status polling, and result display with `KycStatus` badge *(UI only — backend not yet implemented, uses mock data)*
- **New:** `RampWidget` — buy/sell crypto UI: direction tabs, amount/currency/country inputs, provider route selection, and payment instructions display *(UI only — backend not yet implemented, uses mock data)*
- **New:** `TxHistoryModal` — paginated transaction history with refresh and prev/next pagination
- **New:** `WalletBalanceModal` — displays Stellar account balances with refresh support
- **New:** `shared.css` — single source of truth for shared modal styles: `@keyframes`, `.pollar-overlay`, header layout, close button, refresh button, primary/secondary buttons, spinner, empty/error states, footer, and status banner — eliminates duplicate CSS across all modals
- **Refactor:** `context.tsx` exposes `txHistory`, `transaction`, `getBalance`, and `walletAddress` directly from the provider — no more redundant state in consuming components
- **Refactor:** All modal CSS files cleaned up to remove duplicates; each modal only defines styles unique to it
- **Fix:** `PollarModalFooter` and `ModalStatusBanner` now reliably styled in any modal, independent of whether `LoginModal` CSS is loaded

## 0.4.5

### `@pollar/core`

- **Refactor:** Auth flow functions extracted from `client.ts` into `src/client/auth/` folder (`authenticate.ts`, `emailFlow.ts`, `oauthFlow.ts`, `walletFlow.ts`, `deps.ts`)
- **New:** `AUTH_ERROR_CODES` constant and `AuthErrorCode` type exported from `@pollar/core` — covers `SESSION_CREATE_FAILED`, `EMAIL_SEND_FAILED`, `EMAIL_VERIFY_FAILED`, `EMAIL_CODE_EXPIRED`, `EMAIL_CODE_INVALID`, `AUTH_FAILED`, `WALLET_CONNECT_FAILED`, `WALLET_AUTH_FAILED`, `UNEXPECTED_ERROR`
- **New:** `AuthState` error step now includes `errorCode: AuthErrorCode` and optional `clientSessionId`/`email` for retryable email code errors
- **New:** `login(options: PollarLoginOptions)` unified entry point on `PollarClient` — routes to email, OAuth, or wallet flow
- **Fix:** `cancelLogin()` now always resets auth state to `idle`, making back navigation reliable from any step
- **Fix:** `verifyEmailCode()` now works from `error` state when `errorCode` is `EMAIL_CODE_INVALID` or `EMAIL_CODE_EXPIRED`, enabling retries without restarting the flow
- **Fix:** Email code verification correctly extracts error codes from 4xx response bodies (`error.error`) in addition to 200 response bodies
- **New:** `initOAuthSession()` split from `loginOAuth()` — session creation is now a separate callable step (mirrors `initEmailSession`)

### `@pollar/react`

- **Change:** `beginEmailLogin()` no longer called on modal open — session is created on email submit instead, reducing unnecessary API calls
- **New:** Back button (←) on the email code input screen — cancels the flow and returns to the main login screen
- **Fix:** `EMAIL_CODE_INVALID` and `EMAIL_CODE_EXPIRED` errors keep the code input visible so the user can retry without dismissing the modal
- **Fix:** Retry button hidden when error is `EMAIL_CODE_INVALID` or `EMAIL_CODE_EXPIRED` (user retries inline)
- **Fix:** Code input fields are cleared automatically on `EMAIL_CODE_INVALID` so the user can enter a new code

## 0.4.4
- Fix OAuth popup blocked on Safari/Brave iOS: `window.open` is now called before any `await` to preserve the user gesture context

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

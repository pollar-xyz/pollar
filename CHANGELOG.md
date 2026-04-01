# Changelog

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

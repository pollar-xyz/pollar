# Changelog

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

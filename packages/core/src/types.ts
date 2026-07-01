import { pollarPaths, StellarNetwork } from './index';
import type { PollarApiClient } from './api/client';
import type { KeyManager } from './keys/types';
import type { LogLevel, PollarLogger } from './lib/logger';
import type { OnStorageDegrade, Storage } from './storage/types';
import type { VisibilityProvider } from './visibility/types';
import { WalletAdapter, WalletId } from './wallets';

export type PollarApplicationConfigResponse =
  pollarPaths['/auth/login']['post']['responses'][200]['content']['application/json'];
/** Full `/auth/login` response shape — used in transit but NOT persisted. */
export type PollarApplicationConfigContent = PollarApplicationConfigResponse['content'];

/**
 * What we actually write to `Storage`. Drops the PII subtree (`data.*`)
 * which is held in memory only on `PollarClient._profile` after auth.
 */
export interface PollarPersistedSession {
  clientSessionId: string;
  userId: string | null;
  status: string;
  token: { accessToken: string; refreshToken: string; expiresAt: number };
  user: { id?: string; ready: boolean };
  // The user's on-chain wallet, discriminated by `type`:
  //   - 'internal' → platform-managed (custodial) Stellar account (G-address)
  //   - 'smart'    → Soroban smart-account / passkey (C-address)
  //   - 'external' → user-connected wallet (Freighter/Albedo)
  // `address` is the on-chain address for every type (G-address for internal,
  // C-address for smart/passkey, the connected pubkey for external).
  wallet: {
    type: 'internal' | 'smart' | 'external';
    // The login method, 1:1 with `type` (fixed at account creation server-side):
    //   internal → 'email' | 'google' | 'github' | 'oidc'
    //   smart    → 'passkey'
    //   external → 'wallet'
    // Optional: sessions minted by sdk-api < this change won't carry it. For
    // external wallets the specific on-chain adapter id (freighter/albedo) is
    // exposed separately via `getWallet().provider`, not here.
    provider?: string;
    address: string | null;
    existsOnStellar?: boolean;
    // On-chain creation time (smart = deploy; internal = keypair creation).
    createdAt?: number;
    // When the wallet was first linked to Pollar (our DB record), not on-chain
    // creation. Used for external wallets.
    linkedAt?: number;
    network?: string;
    deployTxHash?: string | null;
  };
}

/**
 * Custodial login methods — the providers that map to an `internal` wallet.
 * Mirrors the backend `AuthProvider` enum minus passkey (→ smart) and
 * wallet/external (→ external).
 */
export type PollarAuthMethod = 'email' | 'google' | 'github' | 'oidc';

/**
 * The authenticated user's wallet, as a discriminated union over `custody`.
 * Every authenticated session has exactly one wallet whose custody is fixed at
 * account creation, so `custody` strictly determines the shape of `provider`:
 *
 *   - `internal` (platform-custodied G-address) → `provider` is the login
 *     method, or `null` if the session predates provider tracking server-side.
 *   - `smart` (passkey Soroban C-address) → `provider` is always `'passkey'`.
 *   - `external` (user-connected wallet) → `provider` is the on-chain adapter
 *     id (`'freighter'`, `'albedo'`, …), or `null` when no adapter is resolved
 *     (e.g. a restored session whose adapter could not be re-attached).
 *
 * Obtained via {@link PollarClient.getWallet}.
 */
export type WalletInfo =
  // `provider` widened with `(string & {})` so a custom provider id (e.g. a
  // `privy` integration) survives instead of being lost to the closed enum,
  // while the known PollarAuthMethod values still autocomplete.
  | { custody: 'internal'; address: string; provider: PollarAuthMethod | (string & {}) | null }
  | { custody: 'smart'; address: string; provider: 'passkey' }
  | { custody: 'external'; address: string; provider: WalletId | (string & {}) | null };

/** In-memory user profile (kept on `PollarClient`, never persisted). */
export interface PollarUserProfile {
  mail: string;
  first_name: string;
  last_name: string;
  avatar: string;
  providers: {
    email: { address: string } | null;
    google: { id: string } | null;
    github: { id: string } | null;
    wallet: { address: string } | null;
  };
}

export interface PollarClientConfig {
  stellarNetwork?: StellarNetwork;
  baseUrl?: string;
  apiKey: string;
  /**
   * Pluggable storage. Defaults to `defaultStorage()` on web (localStorage
   * with memory fallback). On RN you must inject one of the adapters from
   * `@pollar/core/adapters/expo` or `@pollar/core/adapters/react-native-keychain`.
   */
  storage?: Storage;
  /**
   * Max time (ms) a single SDK HTTP attempt waits before aborting and rejecting
   * with a {@link PollarNetworkError} (`code: 'SDK_NETWORK_TIMEOUT'`).
   *
   * `fetch` has no timeout of its own, so without this a transient connection
   * stall (e.g. a dropped TCP SYN on a flaky mobile network at cold start) hangs
   * the request forever — it neither resolves nor rejects, trapping any caller
   * that `await`s it (a returning user stuck on the splash screen). Bounding it
   * lets the request fail fast so the caller can recover (retry, or fall back to
   * a cached token).
   *
   * Defaults to `10000` (10s). Set `0` to disable (NOT recommended — restores
   * the unbounded-hang behavior).
   */
  requestTimeoutMs?: number;
  /**
   * Automatic retry with backoff for idempotent, transient-failure SDK HTTP
   * (token refresh + GETs), to absorb a single dropped request before surfacing
   * an error. Only transport failures retry; an HTTP response is never retried.
   * Defaults to `{ attempts: 2, baseDelayMs: 300 }`. See {@link PollarRetryConfig}.
   */
  retry?: PollarRetryConfig;
  /**
   * Pluggable DPoP key manager. Defaults to `defaultKeyManager(storage,
   * apiKey)`: WebCrypto in browsers, `@noble/curves` in RN.
   */
  keyManager?: KeyManager;
  /**
   * Minimum severity the SDK logs. `silent` disables all SDK logging; the rest
   * emit that level and everything more important (`error` < `warn` < `info` <
   * `debug`). State-transition chatter (auth/tx/network) is at `debug`.
   * Defaults to `'info'`.
   */
  logLevel?: LogLevel;
  /**
   * Sink the SDK writes logs to. Defaults to the global `console`. Inject your
   * own (pino, Sentry breadcrumbs, a test spy…) to route SDK logs anywhere.
   * Filtering by `logLevel` still applies on top of whatever you pass.
   */
  logger?: PollarLogger;
  /**
   * Notified when persistent storage silently degrades to in-memory mode
   * (Safari private browsing quota errors, sandboxed iframes, etc.). Useful
   * for telemetry — the SDK keeps working but sessions won't survive reload.
   */
  onStorageDegrade?: OnStorageDegrade;
  /**
   * Client-side wallet integrations to register. Each renders as its own login
   * button and is reachable via `login({ provider: adapter.type })`. The built-in
   * `FreighterAdapter` / `AlbedoAdapter` are auto-registered; entries here are
   * added on top and override a built-in by reusing its `type`. Import extra
   * adapters from their own packages (`@pollar/stellar-wallets-kit-adapter`,
   * `@pollar/privy-adapter`, …) so their deps stay out of `@pollar/core`'s bundle.
   */
  walletAdapters?: WalletAdapter[];
  /**
   * Optional human-friendly label sent at /auth/login time and recorded on
   * the server-side refresh-token row so the user can identify it in the
   * "active sessions" UI (e.g. "iPhone — Safari", "Mac — Chrome 126").
   * If unset, the server-recorded `user_agent` header is the fallback.
   */
  deviceLabel?: string;
  /**
   * Foreground-detection signal for the silent-refresh scheduler. When the
   * app is hidden / backgrounded, scheduled refreshes are skipped (saves
   * network + sidesteps browser/RN background timer throttling); they run
   * the moment visibility comes back. Defaults to a web provider in the
   * browser (`visibilitychange` + BFCache + focus) and a noop elsewhere.
   * React Native consumers should inject an `AppState`-backed provider —
   * use `createAppStateVisibilityProvider` from
   * `@pollar/core/adapters/react-native-appstate`.
   */
  visibilityProvider?: VisibilityProvider;
  /**
   * If set, the silent-refresh scheduler stops issuing proactive refreshes
   * after this many milliseconds of no client-side HTTP activity. The
   * session is not cleared — the next user action triggers a request that
   * either reuses a still-valid access token or hits 401 → reactive
   * refresh (transparent if the RT is still valid). Defaults to
   * `undefined` = refresh forever as long as the app is visible.
   */
  maxIdleMs?: number;
  /**
   * Strategy for opening the hosted OAuth URL during
   * `login({ provider: 'google' | 'github' })`. Defaults to a browser popup
   * on web. React Native consumers MUST provide one (typically wrapping
   * `expo-web-browser`'s `openAuthSessionAsync`), since `window.open` does
   * not exist there. The SDK still drives the rest of the flow by polling the
   * auth-session status, so the opener only needs to surface the URL — it does
   * NOT need to capture the redirect payload.
   */
  openAuthUrl?: AuthUrlOpener;
  /**
   * Value sent to the backend as `redirect_uri` for hosted OAuth (where the
   * provider returns the user afterwards). Defaults to `window.location.origin`
   * on web. On React Native set this to your app's deep link / scheme — the
   * same URL you pass to `WebBrowser.openAuthSessionAsync`.
   */
  oauthRedirectUri?: string;
  /**
   * The passkey (WebAuthn) ceremony for "Smart Wallet" login, injected by the
   * runtime layer (`@pollar/react` implements it with `@simplewebauthn/browser`).
   * `@pollar/core` stays runtime-agnostic and never touches `navigator.credentials`
   * directly. Required to use `loginSmartWallet()`. Browser-only for now;
   * React Native needs a native passkey provider.
   */
  passkey?: PasskeyCeremony;
  /**
   * Signs smart-account (C-address) transactions with the user's passkey.
   * Required to send from a smart wallet. Injected by `@pollar/react`;
   * browser-only for now.
   */
  passkeySign?: PasskeySigner;
}

/**
 * Runs the device WebAuthn ceremony for a server-issued challenge and returns
 * the result to forward to the backend: a registration response for a new user
 * (`create()`) or an authentication assertion for a returning one (`get()`).
 * `mode` tells the ceremony which to run: `'login'` runs `get()` only (returning
 * user) and `'register'` runs `create()` only (new wallet) — the caller picks via
 * the "Log in" / "Create wallet" buttons, so there's no ambiguous autodetect that
 * could create a wallet when the user merely cancelled a login prompt. `response`
 * is the browser's PublicKeyCredential serialized to JSON — forwarded verbatim to
 * `/auth/passkey/{register,login}`.
 */
export type PasskeyMode = 'login' | 'register';

export type PasskeyCeremony = (ctx: {
  challenge: string;
  mode: PasskeyMode;
}) => Promise<{ kind: 'login'; response: unknown } | { kind: 'register'; response: unknown }>;

/**
 * Signs a smart-account transaction's auth digest with the user's passkey
 * (a WebAuthn `get()` whose challenge is the raw digest). Returns the PUBLIC
 * assertion fields (base64url) for the server to assemble into the Soroban auth
 * entry — no secret leaves the device. Injected by the runtime layer
 * (`@pollar/react`); `@pollar/core` never touches `navigator.credentials`.
 */
export type PasskeySigner = (ctx: {
  /** base64url WebAuthn credential id to sign with. */
  credentialId: string;
  /** hex-encoded auth digest to use as the WebAuthn challenge. */
  challenge: string;
}) => Promise<{ authenticatorData: string; clientDataJSON: string; signature: string }>;

/**
 * Strategy for opening the hosted OAuth URL. The SDK mints the per-login auth
 * session lazily inside `getUrl()` (call it once; the first call creates the
 * `clientSessionId` and returns the full URL, or `null` if session creation
 * failed). Open the resolved URL however the platform allows — a popup on web,
 * `WebBrowser.openAuthSessionAsync(url, redirectUri)` on React Native — and
 * resolve once the user-facing browser step is done or dismissed. You do NOT
 * need to capture the redirect payload: the SDK polls the auth-session status
 * until the backend marks it READY.
 */
export type AuthUrlOpener = (ctx: AuthOpenContext) => void | Promise<void>;

export interface AuthOpenContext {
  provider: 'google' | 'github';
  /**
   * Mints the auth session (once) and returns the full hosted-OAuth URL, or
   * `null` if session creation failed. On web, call it AFTER reserving the
   * popup window so popup blockers (which only honor `window.open` inside the
   * original user-gesture tick) don't swallow it.
   */
  getUrl: () => Promise<string | null>;
  /** The redirect target passed to the backend as `redirect_uri`. */
  redirectUri: string;
  signal: AbortSignal;
}

/**
 * One row in the active-sessions list (returned by `PollarClient.listSessions()`).
 * Mirrors the sdk-api `SessionsListContent` schema.
 */
export interface SessionInfo {
  familyId: string;
  createdAt: string;
  lastUsedAt: string | null;
  userAgent: string | null;
  ipHash: string | null;
  deviceLabel: string | null;
  current: boolean;
  expiresAt: string;
}

/**
 * Observable state for the active-sessions list. Lives on the client (like
 * {@link TxHistoryState} / {@link WalletBalanceState}) so UI layers can
 * subscribe via `onSessionsStateChange` and stay pure readers instead of
 * holding the loading state locally.
 */
export type SessionsState =
  | { step: 'idle' }
  | { step: 'loading' }
  | { step: 'loaded'; sessions: SessionInfo[] }
  | { step: 'error'; message: string };

export type TxBuildBody = NonNullable<pollarPaths['/tx/build']['post']['requestBody']>['content']['application/json'];
export type TxBuildResponse = pollarPaths['/tx/build']['post']['responses'][200]['content']['application/json'];

export type TxSignAndSendBody = NonNullable<
  pollarPaths['/tx/sign-and-send']['post']['requestBody']
>['content']['application/json'];
export type TxSignSendResponse = pollarPaths['/tx/sign-and-send']['post']['responses'][200]['content']['application/json'];

// ─── Split flow (new in v0.7.2) ───────────────────────────────────────────────

export type TxSignBody = NonNullable<pollarPaths['/tx/sign']['post']['requestBody']>['content']['application/json'];
export type TxSignResponse = pollarPaths['/tx/sign']['post']['responses'][200]['content']['application/json'];
export type TxSignContent = TxSignResponse['content'];

export type TxSubmitSignedBody = NonNullable<pollarPaths['/tx/submit']['post']['requestBody']>['content']['application/json'];

export type TxBuildSignSubmitBody = NonNullable<
  pollarPaths['/tx/build-sign-submit']['post']['requestBody']
>['content']['application/json'];
export type TxBuildSignSubmitResponse =
  pollarPaths['/tx/build-sign-submit']['post']['responses'][200]['content']['application/json'];
export type TxBuildSignSubmitContent = TxBuildSignSubmitResponse['content'];

/**
 * Discriminated union of every login the SDK understands. The built-ins
 * (`google`, `github`, `email`) are explicit members; any registered wallet
 * adapter is reached through the catch-all via `login({ provider: adapter.type })`.
 */
export type PollarLoginOptions =
  | { provider: 'google' }
  | { provider: 'github' }
  | { provider: 'email'; email: string }
  // Catch-all for any registered wallet adapter (`login({ provider: adapter.type })`,
  // e.g. 'freighter' | 'albedo' | 'privy' | 'xbull'). `string & {}` keeps the
  // built-in literals autocompleting. Trade-off: this also makes a bare
  // `{ provider: 'email' }` (no `email`) type-check — the email flow still
  // validates `email` at runtime.
  | ({ provider: string & {} } & Record<string, unknown>);

/**
 * Curated, stable facade handed to every {@link PollarAuthProvider}. It exposes
 * only the primitives a login strategy needs — the shared backbone
 * (`createSession` → drive the session READY → `authenticate`) plus a couple of
 * ready-made legs — and deliberately keeps `PollarClient` internals (storage,
 * wallet-adapter resolution, DPoP key manager) private. This is the public
 * contract a third-party provider (e.g. Privy) builds against.
 */
export interface AuthProviderContext {
  /** Aborts when the host calls `cancelLogin()` (or a new login supersedes this one). */
  readonly signal: AbortSignal;
  /** Typed `openapi-fetch` client, already wired with DPoP + refresh middleware. */
  readonly api: PollarApiClient;
  /** API origin + version prefix (e.g. `https://sdk.api.pollar.xyz/v1`). */
  readonly basePath: string;
  readonly apiKey: string;
  readonly logger: PollarLogger;
  /** Drive the SDK's auth state machine (the host's `onAuthStateChange` mirrors it). */
  setAuthState(state: AuthState): void;
  /** `POST /auth/session` → `clientSessionId` (null on failure; error state already set). */
  createSession(): Promise<string | null>;
  /** Poll the session to READY, then `POST /auth/login` and persist the session. The shared backbone. */
  authenticate(clientSessionId: string): Promise<void>;
  /**
   * `POST /auth/wallet/challenge` → the server-signed SEP-10 challenge transaction
   * (XDR) the wallet must counter-sign to prove key control. Returns `null` on
   * failure. Bind the network you sign on to the app's network.
   */
  requestChallenge(clientSessionId: string, walletAddress: string): Promise<string | null>;
  /** Built-in hosted-OAuth dance (popup on web, in-app browser on RN). Backs the google/github providers. */
  startHostedOAuth(provider: 'google' | 'github'): Promise<void>;
}

/**
 * A pluggable login strategy. The built-ins (`google`, `github`, `email`) are
 * seeded internally by `PollarClient`; there is currently no public config field
 * to register additional providers (this contract is reserved for internal use).
 * Note: `wallet` is intentionally NOT a provider - it yields a persistent
 * `WalletAdapter` reused for signing, a concern orthogonal to login, so wallets
 * are registered via `PollarClientConfig.walletAdapters` and entered with
 * `login({ provider: adapter.type })`.
 *
 * - `login` handles the one-shot entry point (`client.login({ provider: id })`).
 * - `actions` exposes extra named steps for multi-step flows (e.g. email's
 *   send-code / verify-code), invoked via `client.providerAction(id, action, payload)`.
 */
export interface PollarAuthProvider {
  /** Matches `PollarLoginOptions.provider` and the key in `providerAction`. */
  readonly id: string;
  login?(ctx: AuthProviderContext, options: PollarLoginOptions): Promise<void>;
  actions?: Record<string, (ctx: AuthProviderContext, payload?: unknown) => Promise<void>>;
}

export type TxBuildContent = TxBuildResponse['content'];

/**
 * Phases the SDK can be in across the build → sign → submit lifecycle.
 *
 * **Granular** steps (`building`, `signing`, `submitting`) are emitted when
 * the SDK can directly observe that phase — i.e. when each is a separate
 * client-driven call (`buildTx`, `signTx`, `submitTx`, external-wallet
 * `signAndSubmitTx`).
 *
 * **Compound** steps (`signing-submitting`, `building-signing-submitting`)
 * are emitted when multiple phases collapse into a single opaque backend
 * round-trip (`signAndSubmitTx` custodial → `/tx/sign-and-send`, and `runTx`
 * / `buildAndSignAndSubmitTx` custodial → `/tx/build-sign-submit`). The SDK
 * can't see when one phase ends and the next begins inside that request, so
 * it honestly reports a single fused state instead of fabricating
 * transitions.
 *
 * **Terminal states** (`success`, `error`) and the post-Horizon-ack pending
 * state (`submitted`) are shared across all paths.
 *
 * On `error`, the `phase` discriminator tells the consumer *where* the
 * failure happened so modal UIs can offer "retry from this step" buttons.
 */
export type TransactionState =
  | { step: 'idle' }
  // ─── Granular phases (observable per-call) ────────────────────────────
  | { step: 'building' }
  | { step: 'built'; buildData: TxBuildContent }
  | { step: 'signing'; buildData?: TxBuildContent }
  | { step: 'signed'; buildData?: TxBuildContent; signedXdr: string; submissionToken?: string }
  | { step: 'submitting'; buildData?: TxBuildContent; signedXdr?: string }
  // ─── Compound phases (custodial-only — backend swallows the boundaries) ──
  | { step: 'signing-submitting'; buildData?: TxBuildContent }
  | { step: 'building-signing-submitting' }
  // ─── Post-Horizon-ack, pre-ledger-confirm (shared) ────────────────────
  | { step: 'submitted'; buildData?: TxBuildContent; hash: string }
  // ─── Terminal success (shared) ────────────────────────────────────────
  | { step: 'success'; buildData?: TxBuildContent; hash: string }
  // ─── Terminal failure with phase context ──────────────────────────────
  | {
      step: 'error';
      phase: TxErrorPhase;
      details?: string;
      code?: string;
      message?: string;
      buildData?: TxBuildContent;
      signedXdr?: string;
    };

/**
 * Identifies which phase failed when `TransactionState.step === 'error'`.
 * Compound phase names (`signing-submitting`, `building-signing-submitting`)
 * appear here when the failure happened inside an atomic backend call where
 * the SDK can't isolate the failing sub-phase.
 */
export type TxErrorPhase = 'building' | 'signing' | 'submitting' | 'signing-submitting' | 'building-signing-submitting';

/**
 * Per-call outcomes returned by `buildTx`, `signTx`, `submitTx`,
 * `signAndSubmitTx`, and `buildAndSignAndSubmitTx`. These are additive to
 * `TransactionState` — the same operations still drive the state machine for
 * modal-style UIs, but headless callers can `await` the method and inspect
 * the returned outcome directly instead of subscribing to state changes.
 */
export type BuildOutcome = { status: 'built'; buildData: TxBuildContent } | { status: 'error'; details?: string };

export type SignOutcome =
  | { status: 'signed'; signedXdr: string; submissionToken?: string; expiresAt?: number }
  | { status: 'error'; details?: string; code?: string; message?: string };

/**
 * Result of {@link PollarClient.signAuthEntry}. `signedAuthEntry` is the base64
 * XDR of the signed `SorobanAuthorizationEntry`, ready to be composed into the
 * caller's transaction envelope (e.g. by a contract that sponsors the gas).
 */
export type SignAuthEntryOutcome = { status: 'signed'; signedAuthEntry: string } | { status: 'error'; details?: string };

export type SubmitOutcome =
  | { status: 'success'; hash: string; buildData?: TxBuildContent }
  | { status: 'pending'; hash: string; buildData?: TxBuildContent }
  | {
      status: 'error';
      hash?: string;
      details?: string;
      resultCode?: string;
      code?: string;
      message?: string;
      buildData?: TxBuildContent;
    };

/**
 * Result of {@link PollarClient.setTrustline}. Like {@link SubmitOutcome} but the
 * `hash` is optional: the sponsored, server-orchestrated path completes without
 * surfacing a transaction hash to the client, whereas the self-paid path returns
 * the underlying submit outcome (hash included).
 */
export type TrustlineOutcome =
  | { status: 'success'; hash?: string }
  | { status: 'pending'; hash?: string }
  | { status: 'error'; details?: string };

export const AUTH_ERROR_CODES = {
  SESSION_CREATE_FAILED: 'SESSION_CREATE_FAILED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  SESSION_INVALID: 'SESSION_INVALID',
  /** The interactive login didn't complete within the overall deadline (e.g. an
   *  abandoned OAuth popup, or the session stuck in a non-terminal state). */
  LOGIN_TIMEOUT: 'LOGIN_TIMEOUT',
  EMAIL_SEND_FAILED: 'EMAIL_SEND_FAILED',
  EMAIL_VERIFY_FAILED: 'EMAIL_VERIFY_FAILED',
  EMAIL_CODE_EXPIRED: 'EMAIL_CODE_EXPIRED',
  EMAIL_CODE_INVALID: 'EMAIL_CODE_INVALID',
  AUTH_FAILED: 'AUTH_FAILED',
  WALLET_CONNECT_FAILED: 'WALLET_CONNECT_FAILED',
  WALLET_AUTH_FAILED: 'WALLET_AUTH_FAILED',
  WALLET_RESOLVER_TIMEOUT: 'WALLET_RESOLVER_TIMEOUT',
  EXTERNAL_AUTH_FAILED: 'EXTERNAL_AUTH_FAILED',
  PASSKEY_FAILED: 'PASSKEY_FAILED',
  // Generic bucket for on-chain transaction failures; the precise reason is the
  // backend `code` (e.g. TX_FEE_LIMIT_EXCEEDED) carried alongside on the outcome.
  TX_FAILED: 'TX_FAILED',
  UNEXPECTED_ERROR: 'UNEXPECTED_ERROR',
} as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES];

export type AuthState =
  | { step: 'idle' }
  | { step: 'creating_session' }
  | { step: 'entering_email'; clientSessionId: string }
  | { step: 'sending_email'; email: string }
  | { step: 'entering_code'; clientSessionId: string; email: string }
  | { step: 'verifying_email_code'; clientSessionId: string; email: string }
  | { step: 'opening_oauth'; provider: 'google' | 'github' }
  | { step: 'connecting_wallet'; walletType: WalletId }
  // SEP-10: the wallet is counter-signing the server challenge to prove key control.
  | { step: 'signing_wallet_challenge'; walletType: WalletId }
  | { step: 'wallet_not_installed'; walletType: WalletId }
  | { step: 'authenticating_wallet' }
  // Passkey (Smart Wallet) login: device ceremony, then (new user) the
  // sponsored on-chain deploy of the C-address.
  | { step: 'creating_passkey' }
  | { step: 'deploying_smart_account' }
  | { step: 'authenticating' }
  | {
      step: 'authenticated';
      session: PollarPersistedSession;
      /**
       * `false` while the session is restored optimistically from storage and
       * not yet revalidated with the server; `true` after a fresh login/refresh
       * or a successful `/auth/session/resume`. Gate sensitive actions on this.
       */
      verified: boolean;
    }
  | {
      step: 'error';
      previousStep: string;
      message: string;
      errorCode: AuthErrorCode;
      clientSessionId?: string;
      email?: string;
    };

export type NetworkState = { step: 'idle' } | { step: 'connected'; network: StellarNetwork };

export class PollarFlowError extends Error {
  readonly code = 'INVALID_FLOW' as const;
  constructor(message: string) {
    super(message);
    this.name = 'PollarFlowError';
  }
}

/**
 * Thrown when an SDK HTTP request is aborted by the client-side request timeout
 * (see `PollarClientConfig.requestTimeoutMs`) before the server responded. The
 * `code` is stable for programmatic handling (e.g. fall back to a cached token
 * on boot); `cause` carries the underlying abort error.
 *
 * This is the difference between "the request failed" and "the request hung
 * forever": without the timeout a stalled connection neither resolves nor
 * rejects, so callers can't recover. With it, `refresh()` (and every other SDK
 * call) settles by rejecting with this error.
 */
export class PollarNetworkError extends Error {
  readonly code = 'SDK_NETWORK_TIMEOUT' as const;
  readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'PollarNetworkError';
    this.cause = cause;
  }
}

/** Type guard for {@link PollarNetworkError} (instanceof is unreliable across
 *  bundle/dual-package boundaries, so match the stable `code` too). */
export function isPollarNetworkError(err: unknown): err is PollarNetworkError {
  return (
    err instanceof PollarNetworkError ||
    (typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'SDK_NETWORK_TIMEOUT')
  );
}

/**
 * Automatic retry for idempotent, transient-failure SDK HTTP (the token refresh
 * and GETs). Only transport-level failures (timeouts, dropped connections)
 * retry — any HTTP response (including 4xx/5xx) is returned as-is and never
 * retried, so a refresh that's genuinely rejected logs out immediately rather
 * than after N pointless attempts.
 */
export interface PollarRetryConfig {
  /**
   * Total attempts, including the first (so `attempts: 2` = one retry, up to two
   * tries). Each attempt is independently bounded by `requestTimeoutMs`. Set
   * `1` to disable retries. Defaults to `2`.
   */
  attempts?: number;
  /**
   * Base backoff delay in ms between attempts; grows exponentially with jitter
   * (`baseDelayMs * 2^(n-1) * [0.5, 1)`). Defaults to `300`.
   */
  baseDelayMs?: number;
}

// ─── Wallet balance types ─────────────────────────────────────────────────────

export type WalletBalanceContent =
  pollarPaths['/wallet/balance']['get']['responses'][200]['content']['application/json']['content'];
export type WalletBalanceRecord = WalletBalanceContent['balances'][number];

export type WalletBalanceState =
  | { step: 'idle' }
  | { step: 'loading' }
  | { step: 'loaded'; data: WalletBalanceContent }
  | { step: 'error'; message: string };

// ─── Enabled-asset types ──────────────────────────────────────────────────────

export type WalletAssetsContent =
  pollarPaths['/wallet/assets']['get']['responses'][200]['content']['application/json']['content'];
export type EnabledAssetRecord = WalletAssetsContent['assets'][number];

export type EnabledAssetsState =
  | { step: 'idle' }
  | { step: 'loading' }
  | { step: 'loaded'; data: WalletAssetsContent }
  | { step: 'error'; message: string };

// ─── Tx history types ─────────────────────────────────────────────────────────

export type TxHistoryRecord =
  pollarPaths['/tx/history']['get']['responses'][200]['content']['application/json']['content']['records'][number];

export type TxHistoryParams = NonNullable<pollarPaths['/tx/history']['get']['parameters']['query']>;

export type TxHistoryContent = pollarPaths['/tx/history']['get']['responses'][200]['content']['application/json']['content'];

export type TxHistoryState =
  | { step: 'idle' }
  | { step: 'loading'; params: TxHistoryParams }
  | { step: 'loaded'; params: TxHistoryParams; data: TxHistoryContent }
  | { step: 'error'; params: TxHistoryParams; message: string };

// ─── KYC types ────────────────────────────────────────────────────────────────

export type KycLevel = 'basic' | 'intermediate' | 'enhanced';
export type KycStatus = 'none' | 'pending' | 'approved' | 'rejected';
export type KycFlow = 'iframe' | 'form' | 'redirect';

export type KycProvider =
  pollarPaths['/kyc/providers']['get']['responses'][200]['content']['application/json']['content']['providers'][number];
export type KycStartBody = NonNullable<pollarPaths['/kyc/start']['post']['requestBody']>['content']['application/json'];
export type KycStartResponse = pollarPaths['/kyc/start']['post']['responses'][200]['content']['application/json']['content'];

// ─── Ramps types ──────────────────────────────────────────────────────────────

export type RampsQuoteQuery = NonNullable<pollarPaths['/ramps/quote']['get']['parameters']['query']>;
export type RampQuote =
  pollarPaths['/ramps/quote']['get']['responses'][200]['content']['application/json']['content']['quotes'][number];
export type RampsQuoteResponse = pollarPaths['/ramps/quote']['get']['responses'][200]['content']['application/json']['content'];

export type RampsOnrampBody = NonNullable<pollarPaths['/ramps/onramp']['post']['requestBody']>['content']['application/json'];
export type RampsOnrampResponse =
  pollarPaths['/ramps/onramp']['post']['responses'][200]['content']['application/json']['content'];

export type RampsOfframpBody = NonNullable<pollarPaths['/ramps/offramp']['post']['requestBody']>['content']['application/json'];
export type RampsOfframpResponse =
  pollarPaths['/ramps/offramp']['post']['responses'][200]['content']['application/json']['content'];

export type RampsTransactionResponse =
  pollarPaths['/ramps/transaction/{txId}']['get']['responses'][200]['content']['application/json']['content'];
export type RampTxStatus = RampsTransactionResponse['status'];
export type RampDirection = RampsTransactionResponse['direction'];

// SEP-24 anchor flow (e.g. Anclap): custodial wallets get a `kycUrl` to open;
// EXTERNAL wallets get a `pendingSignature` to sign and resume.
export type RampsPendingSignature = NonNullable<RampsOnrampResponse['pendingSignature']>;
export type RampsSignatureBody = NonNullable<
  pollarPaths['/ramps/transaction/{txId}/signature']['post']['requestBody']
>['content']['application/json'];
export type RampsSignatureResponse =
  pollarPaths['/ramps/transaction/{txId}/signature']['post']['responses'][200]['content']['application/json']['content'];
export type RampsCompleteResponse =
  pollarPaths['/ramps/transaction/{txId}/complete']['post']['responses'][200]['content']['application/json']['content'];

// ─── Distribution types ───────────────────────────────────────────────────────

export type DistributionRule =
  pollarPaths['/distribution/rules']['get']['responses'][200]['content']['application/json']['content']['rules'][number];

export type RulePeriod = DistributionRule['period'];

export type DistributionClaimBody = NonNullable<
  pollarPaths['/distribution/claim']['post']['requestBody']
>['content']['application/json'];

export type DistributionClaimContent =
  pollarPaths['/distribution/claim']['post']['responses'][200]['content']['application/json']['content'];

export type DistributionRulesState =
  | { step: 'idle' }
  | { step: 'loading' }
  | { step: 'loaded'; rules: DistributionRule[] }
  | { step: 'error'; message: string };

// ─── Swap types (DEX/AMM) ──────────────────────────────────────────────────────

export type SwapQuoteBody = NonNullable<pollarPaths['/swap/quote']['post']['requestBody']>['content']['application/json'];

export type SwapQuoteContent =
  pollarPaths['/swap/quote']['post']['responses'][200]['content']['application/json']['content'];

/** A single priced swap route, including a ready-to-run `build` payload. */
export type SwapQuote = SwapQuoteContent['quotes'][number];

/** Route the caller requests: `auto` (best of every venue) or a concrete venue. */
export type SwapProvider = NonNullable<SwapQuoteBody['provider']>;

/** A concrete venue a returned quote came from (never `auto`). */
export type SwapVenue = SwapQuote['provider'];

/** Input to `client.getSwapQuote` — the request body minus wallet/network, which the client fills. */
export type SwapQuoteParams = {
  sellAsset: SwapQuoteBody['sellAsset'];
  buyAsset: SwapQuoteBody['buyAsset'];
  amount: string;
  provider?: SwapProvider;
  slippageBps?: number;
};

// ─── Adapter types ────────────────────────────────────────────────────────────

export type AdapterFn<TParams = unknown> = (params: TParams) => Promise<{ unsignedTransaction: string }>;

export type PollarAdapter = Record<string, AdapterFn<any>>;

export interface PollarAdapters {
  [key: string]: PollarAdapter;
}

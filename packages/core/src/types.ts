import { pollarPaths, StellarNetwork } from './index';
import type { PollarApiClient } from './api/client';
import type { KeyManager } from './keys/types';
import type { LogLevel, PollarLogger } from './lib/logger';
import type { OnStorageDegrade, Storage } from './storage/types';
import type { VisibilityProvider } from './visibility/types';
import { WalletAdapter, WalletId } from './wallets';
import { stringField } from './api/error-fields';
import type { AuthEntrySignerOptions, Sep43AuthEntrySigner } from './stellar/auth-entry-signer';

export type PollarApplicationConfigResponse =
  pollarPaths['/auth/login']['post']['responses'][200]['content']['application/json'];
/** Full `/auth/login` response shape - used in transit but NOT persisted. */
export type PollarApplicationConfigContent = PollarApplicationConfigResponse['content'];

/**
 * One persisted wallet. Shared by the session's back-compat `wallet` field and
 * every entry of `wallets`, so the two can never drift apart in shape.
 *
 * `type` discriminates custody:
 *   - 'internal' -> platform-managed (embedded) account (G-address, 0x..., ...)
 *   - 'smart'    -> Soroban smart-account / passkey (C-address)
 *   - 'external' -> user-connected wallet (Freighter/Albedo)
 * `address` is the on-chain address for every type.
 */
/**
 * How far along a platform-managed Stellar wallet is in its on-chain setup.
 *
 * Only the ACCOUNT is described. Trustlines are added incrementally over an
 * app's life, so a wallet does not leave READY because a token was enabled
 * yesterday - per-asset state is `getAssets()`.
 */
export type WalletProvisioning = 'READY' | 'CREATING' | 'FAILED' | 'NONE';

export interface PollarPersistedWallet {
  type: 'internal' | 'smart' | 'external';
  // The login method, 1:1 with `type` (fixed at account creation server-side):
  //   internal -> 'email' | 'google' | 'github' | 'oidc'
  //   smart    -> 'passkey'
  //   external -> 'wallet'
  // Optional: sessions minted by sdk-api < this change won't carry it. For
  // external wallets the specific on-chain adapter id (freighter/albedo) is
  // exposed separately via `getWallet().provider`, not here.
  provider?: string;
  address: string | null;
  // The CHAIN this address lives on - NOT testnet-vs-mainnet, which is
  // `network` below. Optional: the back-compat `wallet` field and sessions
  // minted before multi-chain omit it (those are always STELLAR).
  chain?: WalletChain;
  existsOnStellar?: boolean;
  // Where the platform-managed Stellar account stands in its on-chain setup.
  // Present only on that wallet, and only from sdk-api v2 onward.
  //   READY    -> on the ledger; operations are accepted
  //   CREATING -> queued or in flight; operations are refused for now
  //   FAILED   -> retried to exhaustion; the next login or resume tries again
  //   NONE     -> no wallet yet (`address` is null): the app creates wallets on
  //               demand, see PollarClient.createWallet()
  provisioning?: WalletProvisioning;
  // The app's funding policy: IMMEDIATE = Pollar funds/creates the account at
  // onboarding; DEFERRED = left to the app. Lets the UI decide whether to offer
  // on-chain account creation. Optional: older sessions omit it.
  fundingMode?: 'IMMEDIATE' | 'DEFERRED';
  // On-chain creation time (smart = deploy; internal = keypair creation).
  createdAt?: number;
  // When the wallet was first linked to Pollar (our DB record), not on-chain
  // creation. Used for external wallets.
  linkedAt?: number;
  network?: string;
  deployTxHash?: string | null;
}

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
  /**
   * RFC 7638 thumbprint of the DPoP keypair this session's tokens are bound
   * to (`cnf.jkt`), stamped at store time. On restore the client compares it
   * against the currently loaded keypair: a mismatch means the private key
   * was lost (IndexedDB evicted/unavailable, key reset elsewhere) and every
   * proof-bound call - resume and refresh included - is guaranteed to fail,
   * so the session is cleared locally with a precise diagnostic instead of a
   * burst of opaque 401s. Optional: absent on sessions persisted by older
   * SDKs and on Bearer-fallback sessions, which skip the check.
   */
  dpopJkt?: string;
  /**
   * BACK-COMPAT - the user's STELLAR wallet (or their smart account). Always
   * present, always Stellar. Mirrors the entry in `wallets` with
   * `chain: 'STELLAR'` when there is one.
   */
  wallet: PollarPersistedWallet;
  /**
   * Every wallet the user holds, one per chain. Superset of `wallet`.
   *
   * Optional because sessions persisted before this field existed (and logins
   * against an sdk-api that predates `wallets[]`) have none - treat an absent
   * array as "only `wallet` is known", not as "the user has no wallets".
   */
  wallets?: PollarPersistedWallet[];
}

/**
 * Embedded-wallet login methods - the providers that map to an `internal` wallet.
 * Mirrors the backend `AuthProvider` enum minus passkey (-> smart) and
 * wallet/external (-> external).
 */
export type PollarAuthMethod = 'email' | 'google' | 'github' | 'oidc';

/**
 * The authenticated user's wallet, as a discriminated union over `custody`.
 * Every authenticated session has exactly one wallet whose custody is fixed at
 * account creation, so `custody` strictly determines the shape of `provider`:
 *
 *   - `internal` (platform-managed G-address) -> `provider` is the login
 *     method, or `null` if the session predates provider tracking server-side.
 *   - `smart` (passkey Soroban C-address) -> `provider` is always `'passkey'`.
 *   - `external` (user-connected wallet) -> `provider` is the on-chain adapter
 *     id (`'freighter'`, `'albedo'`, ...), or `null` when no adapter is resolved
 *     (e.g. a restored session whose adapter could not be re-attached).
 *
 * Obtained via {@link PollarClient.getWallet} (the Stellar wallet) or
 * {@link PollarClient.getWallets} (every chain).
 */
export type WalletInfo =
  // `provider` widened with `(string & {})` so a custom provider id (e.g. a
  // `privy` integration) survives instead of being lost to the closed enum,
  // while the known PollarAuthMethod values still autocomplete.
  //
  // `existsOnStellar` (is the account created on-chain) and `fundingMode` (the
  // app's funding policy) are wallet-status extras carried on every custody so
  // callers can, e.g., offer on-chain account creation for an external wallet
  // that isn't on Stellar yet. Optional - absent on sessions that predate them.
  //
  // `chain` says which chain `address` lives on - NOT testnet-vs-mainnet.
  // Optional: `getWallet()` omits it (it is always STELLAR by definition), and
  // sessions minted before multi-chain don't carry it either. `getWallets()`
  // sets it whenever the backend reported it.
  | {
      custody: 'internal';
      address: string;
      provider: PollarAuthMethod | (string & {}) | null;
      chain?: WalletChain;
      existsOnStellar?: boolean;
      provisioning?: WalletProvisioning;
      fundingMode?: 'IMMEDIATE' | 'DEFERRED';
    }
  | {
      custody: 'smart';
      address: string;
      provider: 'passkey';
      chain?: WalletChain;
      existsOnStellar?: boolean;
      provisioning?: WalletProvisioning;
      fundingMode?: 'IMMEDIATE' | 'DEFERRED';
    }
  | {
      custody: 'external';
      address: string;
      provider: WalletId | (string & {}) | null;
      chain?: WalletChain;
      existsOnStellar?: boolean;
      provisioning?: WalletProvisioning;
      fundingMode?: 'IMMEDIATE' | 'DEFERRED';
    };

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
   * the request forever - it neither resolves nor rejects, trapping any caller
   * that `await`s it (a returning user stuck on the splash screen). Bounding it
   * lets the request fail fast so the caller can recover (retry, or fall back to
   * a cached token).
   *
   * Defaults to `10000` (10s). Set `0` to disable (NOT recommended - restores
   * the unbounded-hang behavior).
   */
  requestTimeoutMs?: number;
  /**
   * Per-request timeout (ms) applied to the submit-family tx calls
   * (`submitTx`, `signAndSubmitTx`, `buildAndSignAndSubmitTx`) instead of
   * {@link requestTimeoutMs}. These endpoints do real server-side work
   * (embedded build + sign via wallet-service, then a network submit) that can
   * take several seconds, so the default 10s request timeout is too tight and
   * would cut a submit that is actually succeeding. Everything else still uses
   * `requestTimeoutMs`.
   *
   * Defaults to `30000` (30s).
   */
  submitTimeoutMs?: number;
  /**
   * Per-request timeout (ms) for the final `POST /auth/login`, instead of
   * {@link requestTimeoutMs}.
   *
   * That call is where a login does its real server-side work - minting tokens,
   * resolving the wallet, and, for an app whose account creation runs inline,
   * waiting on the Stellar network. The 10s default that protects every other
   * request is far too tight for it: a congested network has pushed it past a
   * minute, and the client aborting mid-flight does not stop the server, so the
   * work completed with nobody left to receive the tokens.
   *
   * Defaults to `45000` (45s). It is a backstop, not a fix - an app whose
   * account creation is asynchronous returns in a couple of seconds.
   */
  loginTimeoutMs?: number;
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
   * own (pino, Sentry breadcrumbs, a test spy...) to route SDK logs anywhere.
   * Filtering by `logLevel` still applies on top of whatever you pass.
   */
  logger?: PollarLogger;
  /**
   * Notified when persistent storage silently degrades to in-memory mode
   * (Safari private browsing quota errors, sandboxed iframes, etc.). Useful
   * for telemetry - the SDK keeps working but sessions won't survive reload.
   */
  onStorageDegrade?: OnStorageDegrade;
  /**
   * Client-side wallet integrations to register. Each renders as its own login
   * button and is reachable via `login({ provider: adapter.type })`. The built-in
   * `FreighterAdapter` / `AlbedoAdapter` are auto-registered; entries here are
   * added on top and override a built-in by reusing its `type`. Import extra
   * adapters from their own packages (`@pollar/stellar-wallets-kit-adapter`,
   * `@pollar/solana-wallet-standard-adapter`, ...) so their deps stay out of `@pollar/core`'s bundle.
   */
  walletAdapters?: WalletAdapter[];
  /**
   * Optional human-friendly label sent at /auth/login time and recorded on
   * the server-side refresh-token row so the user can identify it in the
   * "active sessions" UI (e.g. "iPhone - Safari", "Mac - Chrome 126").
   * If unset, the server-recorded `user_agent` header is the fallback.
   */
  deviceLabel?: string;
  /**
   * Foreground-detection signal for the silent-refresh scheduler. When the
   * app is hidden / backgrounded, scheduled refreshes are skipped (saves
   * network + sidesteps browser/RN background timer throttling); they run
   * the moment visibility comes back. Defaults to a web provider in the
   * browser (`visibilitychange` + BFCache + focus) and a noop elsewhere.
   * React Native consumers should inject an `AppState`-backed provider -
   * use `createAppStateVisibilityProvider` from
   * `@pollar/core/adapters/react-native-appstate`.
   */
  visibilityProvider?: VisibilityProvider;
  /**
   * If set, the silent-refresh scheduler stops issuing proactive refreshes
   * after this many milliseconds of no client-side HTTP activity. The
   * session is not cleared - the next user action triggers a request that
   * either reuses a still-valid access token or hits 401 -> reactive
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
   * auth-session status, so the opener only needs to surface the URL - it does
   * NOT need to capture the redirect payload.
   */
  openAuthUrl?: AuthUrlOpener;
  /**
   * Value sent to the backend as `redirect_uri` for hosted OAuth (where the
   * provider returns the user afterwards). Defaults to `window.location.origin`
   * on web. On React Native set this to your app's deep link / scheme - the
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
  /**
   * The device key of a Turnkey co-signed wallet. Defaults to a second
   * `defaultKeyManager` under the `cosign` namespace, kept across logouts so
   * the user's vote survives signing out. Pass your own to hold it in
   * hardware-backed storage.
   */
  cosignKeyManager?: KeyManager;
  /**
   * The passkey ceremonies a Turnkey wallet's recovery uses (add a passkey,
   * recover with one). Injected by `@pollar/react` with the browser's
   * WebAuthn; a React Native app passes its own, or the passkey methods of
   * `client.cosign.recovery` are unavailable.
   */
  recoveryPasskey?: RecoveryPasskeyCeremony;
  /**
   * How a signing call treats the user, whatever the wallet's custody.
   * `'prompt'` shows the transaction and waits for the user before any
   * signature; `@pollar/react` renders the prompt, a headless app subscribes
   * with `onConfirmationRequest`. `{ window }`: a confirmed signature opens a
   * window of `seconds` in which the next ones, up to `maxUsd` in total, sign
   * without asking; a signature whose USD value the SDK cannot read (anything
   * but a payment it builds) always asks. `'auto'` signs without a prompt.
   *
   * Unset, the app's dashboard setting applies, and that defaults to
   * `'prompt'`. Set, the stricter of this and the dashboard setting applies.
   * A ramp leg always asks, whatever the policy. The same code works on
   * testnet and mainnet.
   */
  confirmation?: ConfirmationPolicy;
  /**
   * Keep the raw co-sign flow: signing calls on a co-signed wallet return
   * `cosign_pending` and the app approves through `client.cosign.*` and its
   * own UI. Off by default: the SDK settles the request itself.
   */
  cosignManual?: boolean;
}

/** See `PollarClientConfig.confirmation`. */
export type ConfirmationPolicy = 'auto' | 'prompt' | { window: { seconds: number; maxUsd: number } };

/** What a signing call is about to do, shown to the user under `confirmation: 'prompt'`. */
export interface ConfirmationRequest {
  id: string;
  kind: 'sign' | 'sign_and_send' | 'build_sign_submit';
  network: 'STELLAR' | 'SOLANA' | 'POLYGON';
  /** The unsigned Stellar envelope, when the call carries one. */
  unsignedXdr?: string;
  /** The build this signature completes, when the client built it. */
  buildData?: TxBuildContent;
  operation?: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

/** A confirmation waiting for the user, with the two ways to answer it. */
export interface PendingConfirmation extends ConfirmationRequest {
  confirm: () => void;
  reject: () => void;
}

// --- Turnkey co-signed wallets (client.cosign.*) --------------------------------

/** A signing activity Pollar opened on the user's co-signed wallet. */
export type CosignRequest =
  pollarPaths['/cosign/requests/{id}']['get']['responses'][200]['content']['application/json']['content']['request'];
export type CosignDevicesContent =
  pollarPaths['/cosign/devices']['get']['responses'][200]['content']['application/json']['content'];
export type CosignDevice = CosignDevicesContent['devices'][number];
export type CosignRelayContent =
  pollarPaths['/cosign/relay']['post']['responses'][200]['content']['application/json']['content'];
export type CosignRelayPath = NonNullable<
  pollarPaths['/cosign/relay']['post']['requestBody']
>['content']['application/json']['path'];
/** The 202 a signing call answers with for a co-signed wallet. */
export type CosignPendingContent = pollarPaths['/tx/sign']['post']['responses'][202]['content']['application/json']['content'];

/**
 * Whether the user's Stellar wallet, one Pollar custodies, has to move to
 * Turnkey because the app's wallets live there, and where the move stands.
 */
export type CustodyMigrationState =
  pollarPaths['/cosign/custody/migration']['get']['responses'][200]['content']['application/json']['content'];

/** A chain whose custodial wallet can move to Turnkey. */
export type CustodyMigrationChain = CustodyMigrationState['wallets'][number]['chain'];

/** Whether the user's Turnkey wallet can be recovered without this device, and the methods it has. */
export type RecoveryState = pollarPaths['/cosign/recovery']['get']['responses'][200]['content']['application/json']['content'];

/**
 * The passkey ceremonies wallet recovery needs, injected by the runtime layer
 * (`@pollar/react` uses `navigator.credentials`). All binary fields are
 * base64url, as WebAuthn's JSON serialization gives them.
 */
export interface RecoveryPasskeyCeremony {
  /** Register a passkey for the wallet; `challenge` goes to `navigator.credentials.create`. */
  create(options: { challenge: string; userName: string }): Promise<{
    credentialId: string;
    clientDataJson: string;
    attestationObject: string;
    transports: string[];
  }>;
  /** Sign `challenge` with one of `allowCredentials`. */
  get(options: { challenge: string; allowCredentials: string[] }): Promise<{
    credentialId: string;
    authenticatorData: string;
    clientDataJson: string;
    signature: string;
  }>;
}

/** The requests waiting for this device's vote, as `client.cosign` knows them. */
export interface CosignState {
  pending: CosignRequest[];
  /** The last request that reached a final state, for a UI to show the outcome. */
  lastResolved?: CosignRequest;
}

/** The Turnkey request a device submits to propose a co-signed request, built from what it verified. */
export interface CosignProposal {
  path: Extract<
    CosignRelayPath,
    '/public/v1/submit/sign_raw_payload' | '/public/v1/submit/sign_transaction' | '/public/v1/submit/create_wallet_accounts'
  >;
  body: { type: string; timestampMs: string; organizationId: string; parameters: Record<string, unknown> };
}

export type CosignVerification =
  | { ok: true; localHash: string; proposal: CosignProposal }
  | { ok: false; reason: string; localHash?: string };

/** The custody of the user's Turnkey wallet: co-signed (2-of-2 with Pollar's approver) or self-custody (1-of-1). */
export type CosignCustody = NonNullable<CosignDevicesContent['custody']>;

export type CosignQuorumReport =
  | { ok: true; custody: CosignCustody; threshold: number; rootUsers: number; deviceRegistered: boolean }
  | {
      ok: false;
      reason: string;
      custody?: CosignCustody;
      threshold?: number;
      rootUsers?: number;
      deviceRegistered?: boolean;
    };

/**
 * Runs the device WebAuthn ceremony for a server-issued challenge and returns
 * the result to forward to the backend: a registration response for a new user
 * (`create()`) or an authentication assertion for a returning one (`get()`).
 * `mode` tells the ceremony which to run: `'login'` runs `get()` only (returning
 * user) and `'register'` runs `create()` only (new wallet) - the caller picks via
 * the "Log in" / "Create wallet" buttons, so there's no ambiguous autodetect that
 * could create a wallet when the user merely cancelled a login prompt. `response`
 * is the browser's PublicKeyCredential serialized to JSON - forwarded verbatim to
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
 * entry - no secret leaves the device. Injected by the runtime layer
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
 * failed). Open the resolved URL however the platform allows - a popup on web,
 * `WebBrowser.openAuthSessionAsync(url, redirectUri)` on React Native - and
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

// The Stellar build body. `/tx/build` also takes a Solana body for an external
// wallet (`chain: 'SOLANA'`), which only `sendPayment` sends and builds itself.
export type TxBuildBody = Exclude<
  NonNullable<pollarPaths['/tx/build']['post']['requestBody']>['content']['application/json'],
  { chain: 'SOLANA' }
>;
export type TxBuildResponse = pollarPaths['/tx/build']['post']['responses'][200]['content']['application/json'];

export type TxSignAndSendBody = NonNullable<
  pollarPaths['/tx/sign-and-send']['post']['requestBody']
>['content']['application/json'];
export type TxSignSendResponse = pollarPaths['/tx/sign-and-send']['post']['responses'][200]['content']['application/json'];

// --- Split flow (new in v0.7.2) -----------------------------------------------

export type TxSignBody = NonNullable<pollarPaths['/tx/sign']['post']['requestBody']>['content']['application/json'];
export type TxSignResponse = pollarPaths['/tx/sign']['post']['responses'][200]['content']['application/json'];
export type TxSignContent = TxSignResponse['content'];

// The Stellar submit body; `/tx/submit` also takes the signed Solana transaction of an external wallet.
export type TxSubmitSignedBody = Exclude<
  NonNullable<pollarPaths['/tx/submit']['post']['requestBody']>['content']['application/json'],
  { chain: 'SOLANA' }
>;

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
  // `{ provider: 'email' }` (no `email`) type-check - the email flow still
  // validates `email` at runtime.
  | ({ provider: string & {} } & Record<string, unknown>);

/**
 * Curated, stable facade handed to every {@link PollarAuthProvider}. It exposes
 * only the primitives a login strategy needs - the shared backbone
 * (`createSession` -> drive the session READY -> `authenticate`) plus a couple of
 * ready-made legs - and deliberately keeps `PollarClient` internals (storage,
 * wallet-adapter resolution, DPoP key manager) private. This is the public
 * contract a third-party provider (e.g. Privy) builds against.
 */
export interface AuthProviderContext {
  /** Aborts when the host calls `cancelLogin()` (or a new login supersedes this one). */
  readonly signal: AbortSignal;
  /** Typed `openapi-fetch` client, already wired with DPoP + refresh middleware. */
  readonly api: PollarApiClient;
  /** API origin + version prefix (e.g. `https://sdk.api.pollar.xyz/v3`). */
  readonly basePath: string;
  readonly apiKey: string;
  readonly logger: PollarLogger;
  /** Drive the SDK's auth state machine (the host's `onAuthStateChange` mirrors it). */
  setAuthState(state: AuthState): void;
  /** `POST /auth/session` -> `clientSessionId` (null on failure; error state already set). */
  createSession(): Promise<string | null>;
  /** Poll the session to READY, then `POST /auth/login` and persist the session. The shared backbone. */
  authenticate(clientSessionId: string): Promise<void>;
  /**
   * `POST /auth/wallet/challenge` -> the server-signed SEP-10 challenge transaction
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

// The Stellar build. `/tx/build` also answers a Solana build for an external
// wallet (`chain: 'SOLANA'`), which only `sendPayment` asks for and reads itself.
export type TxBuildContent = Exclude<TxBuildResponse['content'], { chain: 'SOLANA' }>;

/**
 * Phases the SDK can be in across the build -> sign -> submit lifecycle.
 *
 * **Granular** steps (`building`, `signing`, `submitting`) are emitted when
 * the SDK can directly observe that phase - i.e. when each is a separate
 * client-driven call (`buildTx`, `signTx`, `submitTx`, external-wallet
 * `signAndSubmitTx`).
 *
 * **Compound** steps (`signing-submitting`, `building-signing-submitting`)
 * are emitted when multiple phases collapse into a single opaque backend
 * round-trip (`signAndSubmitTx` embedded -> `/tx/sign-and-send`, and `runTx`
 * / `buildAndSignAndSubmitTx` embedded -> `/tx/build-sign-submit`). The SDK
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
  // --- Granular phases (observable per-call) ----------------------------
  | { step: 'building' }
  | { step: 'built'; buildData: TxBuildContent }
  | { step: 'signing'; buildData?: TxBuildContent }
  | { step: 'signed'; buildData?: TxBuildContent; signedXdr: string; submissionToken?: string }
  | { step: 'submitting'; buildData?: TxBuildContent; signedXdr?: string }
  // --- Compound phases (embedded-only - backend swallows the boundaries) --
  | { step: 'signing-submitting'; buildData?: TxBuildContent }
  | { step: 'building-signing-submitting' }
  // --- Co-signed wallet: waiting for the user's device to vote --------------
  | { step: 'awaiting_cosign'; request: CosignRequest; buildData?: TxBuildContent }
  // --- Post-Horizon-ack, pre-ledger-confirm (shared) --------------------
  | { step: 'submitted'; buildData?: TxBuildContent; hash: string }
  // --- Terminal success (shared) ----------------------------------------
  | { step: 'success'; buildData?: TxBuildContent; hash: string }
  // --- Terminal failure with phase context ------------------------------
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
 * `TransactionState` - the same operations still drive the state machine for
 * modal-style UIs, but headless callers can `await` the method and inspect
 * the returned outcome directly instead of subscribing to state changes.
 */
export type BuildOutcome =
  | { status: 'built'; buildData: TxBuildContent }
  // `code` carries the backend's error code through, the same as SignOutcome:
  // without it `isWalletNotReady(await client.buildTx(...))` cannot see the 409
  // it is documented to recognize on a returned outcome.
  | { status: 'error'; details?: string; code?: string; message?: string };

export type SignOutcome =
  | { status: 'signed'; signedXdr: string; submissionToken?: string; expiresAt?: number; sponsored?: boolean }
  // A co-signed (Turnkey) wallet: no signature exists until the user's device
  // votes. The request is what `client.cosign.approve()` takes.
  | { status: 'cosign_pending'; request: CosignRequest }
  | { status: 'error'; details?: string; code?: string; message?: string };

/**
 * Result of {@link PollarClient.signAuthEntry}. `signedAuthEntry` is the base64
 * XDR of the signed `SorobanAuthorizationEntry`, ready to be composed into the
 * caller's transaction envelope (e.g. by a contract that sponsors the gas).
 */
export type SignAuthEntryOutcome =
  | { status: 'signed'; signedAuthEntry: string }
  // A co-signed (Turnkey) wallet with `cosignManual`, or a vote Turnkey has not
  // settled yet: the request is what `client.cosign.approve()` takes.
  | { status: 'cosign_pending'; request: CosignRequest }
  | { status: 'error'; details?: string; code?: string };

// --- Stellar SEP ownership proofs (client.stellar.*) ----------------------------

/**
 * Result of {@link StellarSepApi.sep53}.signMessage - a SEP-53 message signature.
 * `signature` is base64 ed25519 over SHA-256("Stellar Signed Message:\n" + message),
 * the same digest external wallets (Freighter/SWK) and the embedded signer both
 * produce, so `scheme` is always `sep53`.
 */
export type StellarMessageProof =
  | { status: 'signed'; signature: string; signerAddress: string; scheme: 'sep53' }
  | { status: 'error'; details?: string; code?: string };

/** Input to {@link StellarSepApi.sep10}.sign - a verifier-issued SEP-10 challenge. */
export interface Sep10SignParams {
  /** The SEP-10 challenge transaction (unsigned XDR) built by the verifier. */
  challengeXdr: string;
  /** Verifier home domain(s); when present, the embedded signer runs full SEP-10 validation. */
  homeDomains?: string | string[];
  /** Verifier web-auth domain; enables full SEP-10 validation on the embedded path. */
  webAuthDomain?: string;
}

/** Result of {@link StellarSepApi.sep10}.sign - the challenge with the user's signature. */
export type Sep10Proof =
  | { status: 'signed'; signedXdr: string; signerAddress: string }
  | { status: 'error'; details?: string; code?: string };

/**
 * Stellar Ecosystem Proposal ownership-proof surface, exposed as `client.stellar`.
 * These are Stellar-specific standards, namespaced so the multichain client stays
 * clean. Each method dispatches by wallet type: external wallets sign client-side
 * via their adapter, embedded wallets sign server-side through sdk-api.
 */
export interface StellarSepApi {
  /** SEP-53: sign an arbitrary message (message ownership proof). */
  sep53: { signMessage(message: string): Promise<StellarMessageProof> };
  /** SEP-10: sign a web-auth challenge transaction (transaction ownership proof). */
  sep10: { sign(params: Sep10SignParams): Promise<Sep10Proof> };
  /**
   * A SEP-43 signer over the user's wallet, for libraries that sign Soroban auth
   * entries themselves: stellar-sdk's contract client, x402's `ExactStellarScheme`.
   * Each signature goes through {@link PollarClient.signAuthEntry}, so the app's
   * allowlist, the validity window and a co-signed wallet's vote all apply.
   */
  authEntrySigner(options?: AuthEntrySignerOptions): Sep43AuthEntrySigner;
}

export type { AuthEntrySignerOptions, Sep43AuthEntrySigner };

/**
 * A payment, addressed per chain.
 *
 * The asset is the one part that cannot be unified: Stellar identifies it by
 * code + issuer, Solana by SPL mint, Polygon by ERC-20 contract. Amounts differ
 * too - Stellar takes a decimal string, Solana and Polygon integer base units
 * (lamports / wei / token units), because that is what each chain's signer
 * actually consumes.
 */
export type SendPaymentParams =
  | {
      chain?: 'STELLAR' | undefined;
      destination: string;
      /** Decimal string, e.g. "1.5". */
      amount: string;
      asset: { type: 'native' } | { type: 'credit_alphanum4' | 'credit_alphanum12'; code: string; issuer: string };
      options?: TxBuildBody['options'];
    }
  | {
      chain: 'SOLANA';
      destination: string;
      /** Integer base units: lamports for SOL, the mint's smallest unit for SPL. */
      amount: string;
      /** Omit for native SOL; otherwise the SPL mint to transfer. */
      mint?: string | null;
      options?: undefined;
    }
  | {
      chain: 'POLYGON';
      destination: string;
      /** Integer base units: wei for POL, the token's smallest unit for an ERC-20. */
      amount: string;
      /** Omit for native POL; otherwise the ERC-20 contract to transfer (named `mint` like Solana's). */
      mint?: string | null;
      options?: undefined;
    };

export type SubmitOutcome =
  | { status: 'success'; hash: string; buildData?: TxBuildContent }
  | { status: 'pending'; hash: string; buildData?: TxBuildContent }
  | { status: 'cosign_pending'; request: CosignRequest; buildData?: TxBuildContent }
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
  | { status: 'cosign_pending'; request: CosignRequest; buildData?: TxBuildContent }
  | { status: 'error'; details?: string; code?: string };

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

/**
 * Thrown when the API answers with an error body, keeping everything the
 * server said about WHY instead of collapsing it to a bare code string.
 *
 * `code` is the stable machine-readable one (e.g. `SDK_RAMPS_NO_ROUTE`);
 * `details` is the server's human reason when it sends one; `body` is the whole
 * payload, for the fields a specific error adds on top (a ramp quote with no
 * route carries `rejected`, say).
 */
export class PollarApiError extends Error {
  readonly code: string;
  readonly details?: string;
  readonly body: Record<string, unknown>;
  constructor(code: string, body: Record<string, unknown> = {}) {
    // The message stays the code, so anything that renders `err.message` shows
    // the stable machine-readable code.
    super(code);
    this.name = 'PollarApiError';
    this.code = code;
    this.body = body;
    if (typeof body.details === 'string') this.details = body.details;
  }
}

/** Type guard for {@link PollarApiError} (instanceof is unreliable across
 *  bundle/dual-package boundaries, so match the shape too). */
export function isPollarApiError(err: unknown): err is PollarApiError {
  return (
    err instanceof PollarApiError ||
    (typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'PollarApiError')
  );
}

/**
 * The server's code for "this wallet's Stellar account is not on the ledger yet".
 *
 * Under asynchronous provisioning a login returns before the account exists, so
 * every on-chain operation in that window is refused with this rather than left
 * to fail as `op_no_source_account` on the network.
 */
export const WALLET_NOT_READY_CODE = 'SDK_WALLET_NOT_READY';

/**
 * True when a failure is "the wallet is still being prepared".
 *
 * Accepts either a thrown {@link PollarApiError} or a returned transaction
 * outcome, since the tx methods report failures as a value rather than throwing.
 * The right response is to wait - {@link PollarClient.onWalletStateChange} fires
 * when the account lands - not to retry immediately.
 */
export function isWalletNotReady(errorOrOutcome: unknown): boolean {
  return stringField(errorOrOutcome, 'code') === WALLET_NOT_READY_CODE;
}

/**
 * The server's code for "this user has no wallet". The app creates wallets on
 * demand (or never), and this user's was not created yet.
 */
export const WALLET_REQUIRED_CODE = 'SDK_WALLET_REQUIRED';

/**
 * True when a failure is "the user has no wallet yet". Accepts a thrown
 * {@link PollarApiError} or a returned outcome, like {@link isWalletNotReady}.
 * The fix is {@link PollarClient.createWallet}, not a retry.
 */
export function isWalletRequired(errorOrOutcome: unknown): boolean {
  return stringField(errorOrOutcome, 'code') === WALLET_REQUIRED_CODE;
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
 * retry - any HTTP response (including 4xx/5xx) is returned as-is and never
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

// --- Wallet balance types -----------------------------------------------------

/** A chain a wallet can live on. Mirrors the platform's WalletNetwork enum. */
export type WalletChain = 'STELLAR' | 'POLYGON' | 'SOLANA';

/**
 * One asset the wallet holds, tagged with the chain it lives on. `chain` is
 * populated on the multichain own-wallet balance (`GET /v3/wallet/balance`); the
 * single-wallet lookup (`GET /v3/wallet/{publicKey}/balance`, Stellar-only) omits
 * it.
 *
 * Every chain reports its native coin plus each token the app enabled. `type` is
 * `'token'` for ERC-20 and SPL alike: the alphanum4/12 split is a Stellar XDR
 * encoding detail, so only Stellar uses those two. `limit` and `trustlineRemoved`
 * describe trustlines and stay Stellar-only; `decimals` is carried by Polygon and
 * Solana tokens, which need it to format raw amounts.
 *
 * `balance` is null when the chain could not be read - an unreachable RPC, not an
 * empty wallet. Render it as unavailable rather than as zero.
 */
export interface WalletBalanceRecord {
  chain?: WalletChain;
  type?: 'native' | 'token' | 'credit_alphanum4' | 'credit_alphanum12';
  code: string;
  issuer?: string;
  decimals?: number;
  balance: string | null;
  available: string | null;
  limit?: string;
  enabledInApp?: boolean;
  trustlineRemoved?: boolean;
  /** Solana only: the app fronts this token's transfer fee (`sponsor_transfer`). */
  sponsored?: boolean;
}

/**
 * The authenticated user's balances. v2 is multichain: `balances` is the flat
 * list of assets across every chain the app is provisioned on, each tagged with
 * its `chain`. `multichain` is true when more than one chain is present, which is
 * the signal the UI uses to show a per-asset network tag. `exists` is true when
 * any chain holds an account/balance; `network` / `publicKey` reflect the Stellar
 * wallet (the primary chain).
 */
export interface WalletBalanceContent {
  publicKey: string;
  network: string;
  exists: boolean;
  multichain?: boolean;
  balances: WalletBalanceRecord[];
}

/** `GET /wallet/balance` as v2 answers it: one entry per chain, or an `error` for a chain it could not read. */
export type WalletBalanceAnswer =
  pollarPaths['/wallet/balance']['get']['responses'][200]['content']['application/json']['content'];

/** `GET /wallet/assets` as v2 answers it, per chain like {@link WalletBalanceAnswer}. */
export type WalletAssetsAnswer =
  pollarPaths['/wallet/assets']['get']['responses'][200]['content']['application/json']['content'];

export type WalletBalanceState =
  | { step: 'idle' }
  | { step: 'loading' }
  | { step: 'loaded'; data: WalletBalanceContent }
  | { step: 'error'; message: string };

// --- Enabled-asset types ------------------------------------------------------

/**
 * One asset the app offers, tagged with the chain it lives on.
 *
 * The flat, chain-tagged view of {@link WalletAssetsAnswer}: v2 answers per
 * chain, and the UI reads one list. Mirrors {@link WalletBalanceRecord}.
 *
 * `trustlineEstablished`, `limit` and `sponsored` are Stellar-only - a trustline
 * is a Stellar concept, so an ERC-20 or SPL token needs no per-user opt-in to be
 * held and carries none of them. `decimals` is the mirror case: Polygon and
 * Solana tokens carry it, Stellar does not (every Stellar asset is 7-decimal).
 *
 * This is the app's CATALOG, not the user's holdings - amounts come from
 * {@link WalletBalanceRecord} via `refreshBalance`.
 */
export interface EnabledAssetRecord {
  chain?: WalletChain;
  type?: 'native' | 'token' | 'credit_alphanum4' | 'credit_alphanum12';
  code: string;
  issuer?: string;
  decimals?: number;
  /** The app's display label for this asset, when it set one. */
  name?: string;
  /** Stellar only: does the wallet already hold this trustline? */
  trustlineEstablished?: boolean;
  limit?: string;
  enabledInApp?: boolean;
  /** Stellar only: the app pays this trustline's reserve + fee. */
  sponsored?: boolean;
}

/**
 * The app's enabled assets across every chain it is provisioned on, flattened
 * into one list. `multichain` is true when more than one chain answered - the UI
 * uses it to decide whether to show a per-asset network tag.
 */
export interface WalletAssetsContent {
  publicKey: string;
  network: string;
  exists: boolean;
  multichain?: boolean;
  assets: EnabledAssetRecord[];
}

export type EnabledAssetsState =
  | { step: 'idle' }
  | { step: 'loading' }
  | { step: 'loaded'; data: WalletAssetsContent }
  | { step: 'error'; message: string };

// --- Tx history types ---------------------------------------------------------

export type TxHistoryRecord =
  pollarPaths['/tx/history']['get']['responses'][200]['content']['application/json']['content']['records'][number];

export type TxHistoryParams = NonNullable<pollarPaths['/tx/history']['get']['parameters']['query']>;

export type TxHistoryContent = pollarPaths['/tx/history']['get']['responses'][200]['content']['application/json']['content'];

export type TxHistoryState =
  | { step: 'idle' }
  | { step: 'loading'; params: TxHistoryParams }
  | { step: 'loaded'; params: TxHistoryParams; data: TxHistoryContent }
  | { step: 'error'; params: TxHistoryParams; message: string };

// --- KYC types ----------------------------------------------------------------

export type KycLevel = 'basic' | 'intermediate' | 'enhanced';
export type KycStatus = 'none' | 'pending' | 'approved' | 'rejected' | 'expired';
export type KycDecisionStatus = 'pending' | 'manual_review' | 'approved' | 'rejected' | 'expired';
export type KycFlow = 'iframe' | 'form' | 'redirect';

/** One read of GET /kyc/status. `status` is what gates the user; `decisionStatus`
 *  and `reviewReason` say why a `pending` is pending (e.g. held for manual review). */
export type KycStatusContent = pollarPaths['/kyc/status']['get']['responses'][200]['content']['application/json']['content'];

export type KycProvider =
  pollarPaths['/kyc/providers']['get']['responses'][200]['content']['application/json']['content']['providers'][number];
export type KycStartBody = NonNullable<pollarPaths['/kyc/start']['post']['requestBody']>['content']['application/json'];
export type KycStartResponse = pollarPaths['/kyc/start']['post']['responses'][200]['content']['application/json']['content'];

// --- Ramps types --------------------------------------------------------------

/** Closed ramp chain catalog, independent of wallet networks. */
export const RampChain = Object.freeze({
  STELLAR: 'STELLAR',
  POLYGON: 'POLYGON',
  SOLANA: 'SOLANA',
} as const);
export type RampChain = (typeof RampChain)[keyof typeof RampChain];

type RampsGet<P extends '/ramps/routes' | '/ramps/orders' | '/ramps/orders/{id}'> =
  pollarPaths[P]['get']['responses'][200]['content']['application/json']['content'];

export type RampDirection = NonNullable<pollarPaths['/ramps/routes']['get']['parameters']['query']>['direction'];
/** The fiat and asset pairs the app can ramp between in a direction, each with the legs of its shortest path. */
export type RampRoutesResponse = RampsGet<'/ramps/routes'>;
export type RampRoute = RampRoutesResponse['routes'][number];
export type RampFiat = RampRoute['fiat'];
export type RampAsset = RampRoute['asset'];
export type RampLegKind = RampRoute['legs'][number];

export type RampQuoteRequest = NonNullable<pollarPaths['/ramps/quotes']['post']['requestBody']>['content']['application/json'];
export type RampQuotesResponse =
  pollarPaths['/ramps/quotes']['post']['responses'][200]['content']['application/json']['content'];
/** One route quoted leg by leg; `quotes` come best first. */
export type RampQuote = RampQuotesResponse['quotes'][number];
export type RampQuoteLeg = RampQuote['legs'][number];
/** A value the user fills in before the order; its answer goes in `payee` under `key`. */
export type RampField = RampQuoteLeg['requiredFields'][number];
/** A route that was planned and dropped, with why (`failure.resolutionAction`). */
export type RampQuoteRejection = RampQuotesResponse['rejected'][number];
/** The verification step a dropped route waits on: complete it (KYC, form, registry check, registration), then quote again. */
export type RampQuoteRequirement = NonNullable<RampQuoteRejection['requirement']>;
/**
 * The window a dropped route refused the amount against (`LIMIT_BELOW_MINIMUM` / `LIMIT_ABOVE_MAXIMUM`),
 * in `currency`, on what its leg takes in or pays out (`side`). A null bound is no bound.
 */
export type RampQuoteLimit = NonNullable<RampQuoteRejection['failure']['limit']>;

export type RampOrderRequest = NonNullable<pollarPaths['/ramps/orders']['post']['requestBody']>['content']['application/json'];
/** An order with every leg, what it waits for (`pendingAction`) and when to read it again (`nextPollAfter`). */
export type RampOrder = RampsGet<'/ramps/orders/{id}'>;
export type RampOrderLeg = RampOrder['legs'][number];
export type RampOrderLegStep = RampOrderLeg['steps'][number];
export type RampPendingAction = NonNullable<RampOrder['pendingAction']>;
export type RampSignatureAction = Extract<RampPendingAction, { kind: 'SIGNATURE' }>;
/** How to pay the fiat side: a QR (its code already rendered in `scannable`) or bank coordinates. */
export type RampFiatInstructions = Extract<RampPendingAction, { kind: 'FIAT_PAYMENT' }>['instructions'];
/**
 * A code to scan, rendered by the server so no QR encoder is needed. A Pollar-made
 * SVG (`image.inlineSafe`) uses `currentColor` and can be injected as markup; a
 * provider's bitmap goes through `<img src="data:...">`. Show `payload` as text
 * when `payloadLabel` is set: a phone cannot scan its own screen.
 */
export type RampScannable = NonNullable<Extract<RampFiatInstructions, { kind: 'qr' }>['scannable']>;
export type RampFailure = NonNullable<RampOrder['failure']>;
export type RampOrdersQuery = NonNullable<pollarPaths['/ramps/orders']['get']['parameters']['query']>;
export type RampOrdersPage = RampsGet<'/ramps/orders'>;
/** A chain a route passes through where the user's device sets up their wallet (`set_up_wallet`). */
export type RampWalletSetupChain = pollarPaths['/ramps/wallets/{chain}']['post']['parameters']['path']['chain'];
/** The wallet the device set up; it signs once `recoveryConfigured`. */
export type RampWalletSetup =
  pollarPaths['/ramps/wallets/{chain}']['post']['responses'][200]['content']['application/json']['content'];
/** The order lifecycle; `completed`, `failed` and `refunded` are final. */
export type RampOrderState = NonNullable<RampOrdersQuery['state']>;

/** A form asked by a FORM requirement step, with the user's previous answers. */
export type RequirementForm =
  pollarPaths['/requirements/forms/{formId}']['get']['responses'][200]['content']['application/json']['content'];
export type RequirementFormField = RequirementForm['fields'][number];
export type RequirementFormAnswers = RequirementForm['answers'];
export type RequirementFormSubmitted =
  pollarPaths['/requirements/forms/{formId}']['post']['responses'][200]['content']['application/json']['content'];
/** The app's own KYC steps and the user's progress on them (GET /requirements). */
export type AppRequirements = pollarPaths['/requirements']['get']['responses'][200]['content']['application/json']['content'];
export type AppRequirementStep = NonNullable<AppRequirements['next']>;
/**
 * A REGISTRY_CHECK step (SEGIP): the data that will be checked, read from the user's
 * verified identity, and the user's status on the option. Only the surname split and
 * the CI complement can be changed.
 */
export type RegistryCheck =
  pollarPaths['/requirements/registry/{optionId}']['get']['responses'][200]['content']['application/json']['content'];
export type RegistryCheckPrefill = Extract<RegistryCheck['prefill'], { applies: true }>;
export type RegistryCheckEdit = NonNullable<
  pollarPaths['/requirements/registry/{optionId}']['post']['requestBody']
>['content']['application/json'];
export type RegistryCheckSubmitted =
  pollarPaths['/requirements/registry/{optionId}']['post']['responses'][200]['content']['application/json']['content'];
/** A PROVIDER_REGISTRATION step: whether the user is registered with the ramp, can be now, and what is shared. */
export type ProviderRegistration =
  pollarPaths['/requirements/registration/{corridorId}']['get']['responses'][200]['content']['application/json']['content'];
export type ProviderRegistrationSubmitted =
  pollarPaths['/requirements/registration/{corridorId}']['post']['responses'][200]['content']['application/json']['content'];
/** One field the server refused, from a KYC_FORM_INVALID_ANSWERS error's `body.errors`. */
export type RequirementFormAnswerError = { key: string; code: string };

// --- Distribution types -------------------------------------------------------

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

// --- Swap types (DEX/AMM) ------------------------------------------------------

export type SwapQuoteBody = NonNullable<pollarPaths['/swap/quote']['post']['requestBody']>['content']['application/json'];

export type SwapQuoteContent = pollarPaths['/swap/quote']['post']['responses'][200]['content']['application/json']['content'];

/** A single priced swap route, including a ready-to-run `build` payload. */
export type SwapQuote = SwapQuoteContent['quotes'][number];

/** Route the caller requests: `auto` (best of every venue) or a concrete venue. */
export type SwapProvider = NonNullable<SwapQuoteBody['provider']>;

/** A concrete venue a returned quote came from (never `auto`). */
export type SwapVenue = SwapQuote['provider'];

/** Venues this app exposes to end-users (from GET /swap/config). Empty = disabled. */
export type SwapConfigContent = pollarPaths['/swap/config']['get']['responses'][200]['content']['application/json']['content'];

/** Curated "buy" tokens the app opted into (from GET /swap/tokens). */
export type SwapTokensContent = pollarPaths['/swap/tokens']['get']['responses'][200]['content']['application/json']['content'];

/** A single curated swap buy token. */
export type SwapToken = SwapTokensContent['tokens'][number];

/** Input to `client.getSwapQuote` - the request body minus wallet/network, which the client fills. */
export type SwapQuoteParams = {
  sellAsset: SwapQuoteBody['sellAsset'];
  buyAsset: SwapQuoteBody['buyAsset'];
  amount: string;
  provider?: SwapProvider;
  slippageBps?: number;
};

// --- Cards types ----------------------------------------------------------------
// The public names for the `/cards/*` contents. `api/endpoints/cards.ts` returns
// the generated response types as these, so the compiler flags any drift.

export type CardKycStatus =
  | 'NOT_STARTED'
  | 'PENDING'
  | 'NEEDS_ACTION'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'DENIED'
  | 'LOCKED'
  | 'CANCELED';
export type CardStatus = 'PENDING' | 'ACTIVE' | 'FROZEN' | 'TERMINATED';
export type CardType = 'VIRTUAL' | 'PHYSICAL';
export type CardIncomeRange = '0-1000' | '1000-5000' | '5000-10000' | '10000+';

/** A card provider the app enabled (from GET /cards/providers). Empty = Cards disabled. */
export interface CardProvider {
  id: string;
  name: string;
  /** What the card face says: the app's label from its dashboard, or "<App>'s card". Absent on older servers. */
  cardLabel?: string;
  adapter: string;
  countries: string[];
  cardTypes: CardType[];
  fundingAssets: string[];
  /** The provider's terms the user accepts before KYC; null while the platform has none loaded. */
  termsUrl: string | null;
  supports: { freeze: boolean; terminate: boolean; physical: boolean; revealSecrets: boolean };
  /** The first platform step the user still owes this provider; null when they may proceed. */
  requirement: CardRequirementStep | null;
  /** False when a step the provider requires cannot run (an option gone, KYC off): the provider is closed. */
  available: boolean;
}

/** The user's registration with a card provider. */
export interface CardHolder {
  id: string;
  cardProviderId: string;
  kycStatus: CardKycStatus;
  kycReason: string | null;
  /** Hosted page where the user finishes identity verification; null once KYC is settled. */
  verificationLink: string | null;
  termsAcceptedAt: string | null;
  createdAt: string;
}

export interface CardKycInput {
  firstName: string;
  lastName: string;
  /** YYYY-MM-DD */
  birthDate: string;
  nationalId: string;
  /** ISO 3166-1 alpha-2 of the document. */
  countryOfIssue: string;
  email?: string;
  phoneCountryCode: string;
  phoneNumber: string;
  /** A code from {@link PollarClient.getCardOccupations}. */
  occupation: string;
  annualSalary: CardIncomeRange;
  accountPurpose: string;
  expectedMonthlyVolume: CardIncomeRange;
  address: { line1: string; line2?: string; city: string; region: string; postalCode: string; countryCode: string };
}

export interface CardOccupation {
  code: string;
  label: string;
}

export interface CardInfo {
  id: string;
  type: CardType;
  status: CardStatus;
  last4: string | null;
  expMonth: string | null;
  expYear: string | null;
  nickname: string | null;
  currency: string;
  createdAt: string;
}

/** Credit line as the provider reports it. Cents of USD; `ledgerBalance` in units. */
export interface CardBalance {
  creditLimitCents: number | null;
  spendingPowerCents: number | null;
  balanceDueCents: number | null;
  ledgerBalance: string | null;
  syncedAt: string;
}

export interface CardTransaction {
  id: string;
  cardId: string | null;
  type: string;
  direction: 'debit' | 'credit' | null;
  status: string;
  amount: string;
  fee: string | null;
  currency: string;
  network: string | null;
  txHash: string | null;
  purchaseId: string | null;
  /** The provider's purchase detail (merchant, local amount, FX) for card spends. */
  purchase: Record<string, unknown> | null;
  merchantName: string | null;
  occurredAt: string;
}

export interface CardTransactionsPage {
  transactions: CardTransaction[];
  total: number;
  limit: number;
  offset: number;
}

export interface CardDepositAddress {
  network: string;
  chainId: number;
  address: string;
  tokens: { currency: string | null; tokenAddress: string }[];
}

/** PAN and CVC decrypted on the device. Never store or log these. */
export interface CardSecrets {
  pan: string;
  cvc: string;
  last4: string | null;
  expMonth: string | null;
  expYear: string | null;
}

/** Optional on every cards call: which provider, when the app enabled more than one. */
export type CardProviderParams = { cardProviderId?: string };

export type CardFundingStatus = 'CREATED' | 'BURNED' | 'ATTESTED' | 'MINTED' | 'CREDITED' | 'FAILED';

/**
 * One transfer from the user's Stellar wallet to the card's collateral. It moves
 * on its own once paid: CREATED (waiting for the payment) -> BURNED -> ATTESTED
 * -> MINTED -> CREDITED (the provider booked the deposit). FAILED carries `error`.
 */
export interface CardFunding {
  id: string;
  status: CardFundingStatus;
  amount: string;
  asset: string;
  depositAddress: string;
  chainId: number;
  stellarTxHash: string | null;
  burnTxHash: string | null;
  polygonMintTxHash: string | null;
  providerTxId: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The first pending platform step of a card provider for this user, as a ramp quote reports a route's. */
export interface CardRequirementStep {
  position: number;
  completed: number;
  total: number;
  type: 'KYC' | 'FORM' | 'REGISTRY_CHECK' | 'PROVIDER_REGISTRATION';
  /** A KYC option, a form, a registry option, or for a registration the card provider. */
  optionId: string;
  status: 'none' | 'pending' | 'rejected' | 'expired';
  reviewReason?: string;
}

/** A card provider's steps for this app and where the user stands (GET /cards/requirements). */
export interface CardRequirements {
  cardProviderId: string;
  steps: { position: number; type: CardRequirementStep['type']; optionIds: string[]; completed: boolean }[];
  next: CardRequirementStep | null;
  completed: number;
  total: number;
}

/** A card provider's PROVIDER_REGISTRATION step: status, readiness and what the registration shares. */
export interface CardProviderRegistration {
  cardProviderId: string;
  /**
   * `incomplete`: a registration was sent and the provider holds the user, but their
   * KYC did not reach it; registering again sends it.
   */
  status: 'none' | 'incomplete' | 'registered';
  ready: boolean;
  fields: string[];
  /** The provider's terms the user accepts by registering; null while the platform has none loaded. */
  termsUrl: string | null;
}

export type CardProviderRegistrationSubmitted = Pick<CardProviderRegistration, 'cardProviderId' | 'status'>;

/** Outcome of {@link PollarClient.fundCard}: `cancelled` when the external wallet declined to sign. */
export type CardFundingOutcome = { status: 'ok'; funding: CardFunding } | { status: 'cancelled'; funding: CardFunding };

// --- Earn types (yield vaults / lending) ---------------------------------------

/** Providers this app exposes (from GET /earn/providers). Empty = Earn disabled. */
export type EarnProvidersContent =
  pollarPaths['/earn/providers']['get']['responses'][200]['content']['application/json']['content'];

/** A concrete Earn provider. */
export type EarnProviderId = EarnProvidersContent['providers'][number];

export type EarnOpportunitiesContent =
  pollarPaths['/earn/opportunities']['get']['responses'][200]['content']['application/json']['content'];

/** A vault (DeFindex) or pool (Blend) the user can deposit into. */
export type EarnOpportunity = EarnOpportunitiesContent['opportunities'][number];

/** The user's position (balance + APY) in a vault/pool (from GET /earn/position). */
export type EarnPosition = pollarPaths['/earn/position']['get']['responses'][200]['content']['application/json']['content'];

/** Which unit a provider's withdraw amount is in: asset (Blend) or shares (DeFindex). */
export type EarnWithdrawUnit = EarnPosition['withdrawUnit'];

export type EarnBuildBody = NonNullable<pollarPaths['/earn/build']['post']['requestBody']>['content']['application/json'];

export type EarnBuildContent = pollarPaths['/earn/build']['post']['responses'][200]['content']['application/json']['content'];

/** The ready-to-sign payload a build returns. */
export type EarnBuild = EarnBuildContent['build'];

/** Input to `client.getEarnPosition` - wallet address is filled by the client. */
export type EarnPositionParams = {
  provider: EarnProviderId;
  /** Vault/pool id (an opportunity `id`). */
  opportunity: string;
};

/** Input to `client.earnDeposit` / `client.earnWithdraw` - address filled by the client. */
export type EarnTxParams = {
  provider: EarnProviderId;
  /** Vault/pool id (an opportunity `id`). */
  opportunity: string;
  /** Decimal amount. Deposit: underlying asset. Withdraw: the position `withdrawUnit`. */
  amount: string;
};

// --- Adapter types ------------------------------------------------------------

export type AdapterFn<TParams = unknown> = (params: TParams) => Promise<{ unsignedTransaction: string }>;

/**
 * What an adapter returns when the user authorizes a Soroban call instead of
 * sending a transaction: someone else submits it and pays the fee (an x402
 * facilitator, a contract that sponsors the gas). The adapter builds the
 * entry, Pollar signs it and submits nothing, and `complete` carries on with
 * the signed entry; whatever it returns is the call's result.
 */
export interface AuthEntryAdapterStep<TResult = unknown> {
  /** Base64 XDR of the unsigned `SorobanAuthorizationEntry`. */
  unsignedAuthEntry: string;
  /** Absolute ledger the signature expires at; within the app's validity window. */
  validUntilLedger: number;
  complete: (signedAuthEntry: string) => Promise<TResult>;
}

export type AuthEntryAdapterFn<TParams = unknown, TResult = unknown> = (
  params: TParams,
) => Promise<AuthEntryAdapterStep<TResult>>;

/** An auth-entry adapter call: what `complete` returned, or why nothing was signed. */
export type AuthEntryAdapterOutcome<TResult = unknown> =
  | { status: 'completed'; result: TResult }
  | Exclude<SignAuthEntryOutcome, { status: 'signed' }>;

export type PollarAdapter = Record<string, AdapterFn<any> | AuthEntryAdapterFn<any, any>>;

export interface PollarAdapters {
  [key: string]: PollarAdapter;
}

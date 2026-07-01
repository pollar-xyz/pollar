# @pollar/privy-adapter

> **⚠️ Server-side only.** This package starts an HTTP server with `@hono/node-server` and reads `PRIVY_APP_SECRET` / `POLLAR_API_SECRET` from the host environment. Importing it in a browser, React Native, or any other client-side bundle will leak credentials. The bundler will also blow up on `node:crypto` / `@hono/node-server`. If you need a browser-side Privy integration, use the Privy client SDK directly — not this package.

Stateless HTTP proxy that lets Pollar sign Stellar transactions through your Privy account, without your Privy `APP_SECRET` ever leaving your infrastructure.

You install this package in **your own backend**, point Pollar at your adapter's URL, and it brokers each call to Privy on demand. The adapter holds no state, has no database, and exposes a small set of HTTP endpoints authenticated with a single Bearer token issued by Pollar.

## Install

```bash
npm install @pollar/privy-adapter
```

Requires Node 20+.

## Quick start

```ts
import { createPollarPrivyAdapter } from '@pollar/privy-adapter';

const adapter = createPollarPrivyAdapter({
  getCredentials: async () => ({
    appId: process.env.PRIVY_APP_ID!,
    appSecret: process.env.PRIVY_APP_SECRET!,
  }),
  pollarApiSecret: process.env.POLLAR_API_SECRET!,
  network: 'mainnet',
  port: 3001,
});

await adapter.start();
```

## With AWS Secrets Manager

`getCredentials` is async, so any secret manager works.

The secret must be stored as JSON `{"appId": "...", "appSecret": "..."}` — the example below calls `JSON.parse` directly on `SecretString`.

```ts
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { createPollarPrivyAdapter } from '@pollar/privy-adapter';

const sm = new SecretsManagerClient({ region: 'us-east-1' });

const adapter = createPollarPrivyAdapter({
  getCredentials: async () => {
    const result = await sm.send(new GetSecretValueCommand({ SecretId: 'privy/credentials' }));
    return JSON.parse(result.SecretString!);
  },
  pollarApiSecret: process.env.POLLAR_API_SECRET!,
  network: 'mainnet',
});

await adapter.start();
```

The credentials are cached for 5 minutes by default. If `getCredentials` returns a different `appId`/`appSecret` after the cache expires, the underlying Privy client is rebuilt automatically — so you can rotate `APP_SECRET` without redeploying.

## Graceful shutdown

```ts
const adapter = createPollarPrivyAdapter({
  /* ... */
});
await adapter.start();

const shutdown = async () => {
  await adapter.stop();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
```

## Configuration

```ts
interface PollarPrivyAdapterConfig {
  // ── Required ───────────────────────────────────────────────────────────

  // Async credential resolver. Called on first request and when the cache expires.
  getCredentials: () => Promise<{ appId: string; appSecret: string }>;

  // Bearer token Pollar uses to authenticate calls. Generate it once, set it
  // here, and register it in your Pollar dashboard.
  pollarApiSecret: string;

  // Stellar network used to compute transaction hashes.
  network: 'mainnet' | 'testnet';

  // ── Optional (with defaults) ──────────────────────────────────────────

  port?: number; // 3001
  cacheTtlMs?: number; // 5 * 60 * 1000
  requestTimeoutMs?: number; // 10_000
  maxBodyBytes?: number; // 64 * 1024

  // ── Operation allowlist (optional) ────────────────────────────────────

  // Restricts which Stellar operations the adapter will sign. Because signing
  // goes through Privy `rawSign` (only the transaction *hash* reaches Privy),
  // the adapter is the only place per-operation policy can be enforced.

  // Explicit allowlist of stellar-sdk operation type names. `undefined` (the
  // default) means no restriction — the legacy behavior, any non-fee-bump tx
  // is signed. A transaction containing any operation outside the list is
  // rejected with `TX_OPERATION_NOT_ALLOWED` (403).
  allowedOperations?: string[]; // undefined

  // Shortcut for trustline-only adapters. When `true`, the trustline preset
  // — `['changeTrust', 'beginSponsoringFutureReserves',
  // 'endSponsoringFutureReserves']` — is added to the allowlist AND the
  // transaction is additionally required to contain at least one `changeTrust`.
  restrictToTrustlines?: boolean; // false

  // ── Observability hooks ───────────────────────────────────────────────

  onWalletCreated?: (userId: string, address: string) => void;
  onTransactionSigned?: (walletAddress: string) => void;
  onError?: (error: Error, ctx: { endpoint: string; body: unknown }) => void;
}
```

### Restricting signable operations

By default the adapter signs any non-fee-bump transaction. To lock it down to trustline management — the common case for a Pollar deployment — use `restrictToTrustlines`:

```ts
const adapter = createPollarPrivyAdapter({
  // ...credentials, network, etc.
  restrictToTrustlines: true,
});
```

This allows `changeTrust` and the optional reserve-sponsorship sandwich (`beginSponsoringFutureReserves` / `endSponsoringFutureReserves`), and additionally **requires** at least one `changeTrust`. Anything else — a `payment`, a `manageData`, a `changeTrust` mixed with a `payment` — is rejected with `TX_OPERATION_NOT_ALLOWED` (403) before any Privy round-trip.

For a custom set, use `allowedOperations` with stellar-sdk operation type names:

```ts
allowedOperations: ['changeTrust', 'payment'];
```

**Precedence.** If both are set, the effective allowlist is the **union** of `allowedOperations` and the trustline preset, and the `restrictToTrustlines` "at least one `changeTrust`" requirement still applies. If neither is set, there is no restriction (legacy behavior).

## Endpoints

All endpoints except `/health` require `Authorization: Bearer <pollarApiSecret>`.

Responses share the Pollar envelope:

```jsonc
// success
{ "content": { /* payload */ }, "code": "<SUCCESS_CODE>", "success": true }

// error
{ "code": "<ERROR_CODE>", "success": false }

// error with extra context (Zod issues or upstream reason)
{ "code": "VALIDATION_ERROR", "success": false, "issues": { /* ... */ } }
{ "code": "WALLET_CREATION_FAILED", "success": false, "reason": "Privy API: ..." }
```

| Method | Path                         | Body                               | Success code                   | HTTP |
| ------ | ---------------------------- | ---------------------------------- | ------------------------------ | ---- |
| GET    | `/health`                    | —                                  | `PRIVY_ADAPTER_HEALTH_OK`      | 200  |
| POST   | `/wallets/create`            | `{ userId }`                       | `PRIVY_ADAPTER_WALLET_CREATED` | 201  |
| POST   | `/wallets/create` (existing) | `{ userId }`                       | `PRIVY_ADAPTER_WALLET_EXISTS`  | 200  |
| POST   | `/wallets/sign`              | `{ userId, walletAddress, txXdr }` | `PRIVY_ADAPTER_TX_SIGNED`      | 200  |
| GET    | `/wallets/:userId/address`   | —                                  | `PRIVY_ADAPTER_WALLET_ADDRESS` | 200  |

`/wallets/create` is idempotent: if the user already has a Stellar wallet, the existing address is returned with code `PRIVY_ADAPTER_WALLET_EXISTS`.

`/wallets/sign` accepts a base64 transaction XDR. The adapter parses it, computes the transaction hash for the configured network, asks Privy to sign the hash (Stellar Tier 2: Ed25519 raw sign), assembles the `DecoratedSignature`, and returns the fully signed XDR.

### Error codes

| Code                       | HTTP | When                                                                                                                                                  |
| -------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FORBIDDEN`                | 401  | Missing or wrong Bearer token; response carries `WWW-Authenticate: Bearer …`                                                                          |
| `VALIDATION_ERROR`         | 400  | Body schema mismatch or invalid JSON                                                                                                                  |
| `VALIDATION_ERROR`         | 413  | Body exceeded `maxBodyBytes` — response carries `reason: "body too large"`                                                                            |
| `WALLET_NOT_FOUND`         | 404  | User has no Stellar wallet                                                                                                                            |
| `WALLET_CREATION_FAILED`   | 502  | Privy upstream error during create                                                                                                                    |
| `WALLET_LOOKUP_FAILED`     | 502  | Privy upstream error during wallet lookup                                                                                                             |
| `TX_INVALID_SIGNED_XDR`    | 400  | XDR could not be parsed, or transaction is a fee-bump (unsupported)                                                                                   |
| `TX_OPERATION_NOT_ALLOWED` | 403  | Transaction contains an operation outside the allowlist (or is missing a `changeTrust` while `restrictToTrustlines` is on); response carries `reason` |
| `TX_SIGN_FAILED`           | 502  | Privy upstream error during sign                                                                                                                      |
| `INTERNAL_SERVER_ERROR`    | 500  | Unexpected failure                                                                                                                                    |

## Security notes

- The adapter is the sole holder of `PRIVY_APP_SECRET` in the request path. Pollar only ever sees the Bearer token you issue it.
- Bearer comparison uses `crypto.timingSafeEqual` (constant time).
- The adapter holds no persistent state. An in-memory LRU caches `walletAddress → walletId` (10 min TTL, max 1000 entries) to avoid extra Privy round-trips on hot paths; nothing else is retained.
- Logs are off by default. Pipe `onError` to your own logger.

## License

MIT

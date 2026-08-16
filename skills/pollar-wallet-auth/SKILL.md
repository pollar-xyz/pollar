---
name: pollar-wallet-auth
description: Add email, social, or passkey login with an embedded Stellar wallet to a web or React Native app using @pollar/core and @pollar/react. Covers dashboard setup and API keys, sponsored (gasless) account activation and trustlines, payments, multi-venue swaps, SEP-24 ramps, and SEP-53 / SEP-10 ownership proofs. Use when app users need a Stellar wallet without a seed phrase or a browser extension.
user-invocable: true
argument-hint: '[pollar task]'
---

# Pollar: embedded Stellar wallets and login

Pollar is wallet-as-a-service for Stellar. A user signs in with Google, GitHub, email OTP, or a device
passkey and comes out the other side holding a Stellar account, funded and with trustlines already set,
without ever seeing a secret key. The same client also connects external wallets (Freighter, Albedo,
xBull) so both kinds of user go through one code path.

The SDK is `@pollar/core` (framework agnostic) plus `@pollar/react` (provider, hooks, and prebuilt
modals). Server-side signing, sponsorship, and key custody live behind the Pollar API, configured from
[dashboard.pollar.xyz](https://dashboard.pollar.xyz).

## When to use this skill

- The app wants Stellar accounts for users who do not have a wallet and should not manage keys
- Onboarding must be gasless: the app pays the base reserve, trustline reserves, and fees
- One login flow has to cover both embedded (custodial) and external (Freighter / Albedo) wallets
- The app needs passkey smart accounts (Soroban C-addresses) instead of classic G-addresses
- The app needs payments, trustlines, swaps, SEP-24 fiat ramps, or SEP-10 / SEP-53 ownership proofs
  on top of that wallet

## When NOT to use this skill

- Writing or auditing a Soroban contract: use the Stellar smart-contracts skill
- Talking to Horizon or Stellar RPC directly, or signing with a raw keypair held by the app: use the
  Stellar dapp and data skills
- Issuing an asset from your own issuer account: use the Stellar assets skill

## Read the file that matches the task

| Task                                                             | File                                                  |
| ---------------------------------------------------------------- | ----------------------------------------------------- |
| Keys, dashboard config, funding modes, origin allowlist          | [Setup](#setup) (below)                               |
| Login flows, auth state machine, sessions, logout                | [Authentication](#authentication) (below)             |
| Which wallet a user got, addresses, balances                     | [Wallets and balances](#wallets-and-balances) (below) |
| React and Next.js wiring, `usePollar`, prebuilt modals, branding | [react.md](react.md)                                  |
| React Native and Expo, polyfills, secure storage, deep links     | [react-native.md](react-native.md)                    |
| Payments, sponsorship, trustlines, swaps, ramps, earn, proofs    | [transactions.md](transactions.md)                    |
| Things that silently break an integration                        | [Gotchas](#gotchas) (below)                           |

## Install

```bash
npm install @pollar/react @pollar/core   # React and React Native
npm install @pollar/core                 # anything else (Vue, Angular, Svelte, plain TS, Node)
```

Requires Node 20+ in the toolchain and React 18+ for `@pollar/react`.

---

## Mental model

Every authenticated session carries a wallet with one of three custody types. Almost every branch in an
integration comes down to which one the user has, so read it once and keep it:

| `custody`  | What it is                                                                       | Address | Signing                                   |
| ---------- | -------------------------------------------------------------------------------- | ------- | ----------------------------------------- |
| `internal` | Custodial wallet Pollar creates at login. The default for social and email users | `G...`  | Server-side, sponsored per the app config |
| `smart`    | Soroban smart account deployed for a device passkey                              | `C...`  | WebAuthn ceremony on the device           |
| `external` | A wallet the user already had, connected through an adapter                      | `G...`  | The user's own extension or signer        |

```ts
const wallet = client.getWallet(); // WalletInfo | null
if (wallet?.custody === 'internal') {
  /* server signs */
}
```

There is no `isAuthenticated()` on the core client. A session exists when `getAuthState().step` is
`'authenticated'`, or equivalently when `getWallet()` is non-null. `@pollar/react` exposes the boolean
as `isAuthenticated`.

---

## Setup

### 1. Create the app and take the keys

Sign in at [dashboard.pollar.xyz](https://dashboard.pollar.xyz), create an application, then
**Build > API Keys > Generate**. Keys are per network and come in two flavours:

| Prefix                          | Where it belongs                     |
| ------------------------------- | ------------------------------------ |
| `pub_testnet_` / `pub_mainnet_` | Frontend. Safe to ship in the bundle |
| `sec_testnet_` / `sec_mainnet_` | Backend only. Never in client code   |

The key decides the network: a `pub_testnet_` key can only talk to testnet. Keep `stellarNetwork` in
the client config in sync with the key prefix rather than treating it as an independent switch.

```bash
# .env.local (Next.js)
NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY=pub_testnet_xxxxxxxxxxxxxxxxxxxx
POLLAR_SECRET_KEY=sec_testnet_xxxxxxxxxxxxxxxxxxxx
```

Testnet keys are capped at 1,000 requests per day, which is enough for development.

### 2. Allowlist the origin

Publishable keys are bound to origins. Register every origin the app runs on (including
`http://localhost:3000`) under **Build > Domains**, or requests get rejected before any auth happens.

React Native and Expo send no `Origin` header at all. Those keys need the native-clients flag enabled
on the key itself, otherwise every request from the app fails the origin check. See
[react-native.md](react-native.md).

### 3. Instantiate the client once

```ts
import { PollarClient } from '@pollar/core';

// Module scope, a DI container, or React context. Never inside a render function.
export const client = new PollarClient({
  apiKey: process.env.NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY!,
  stellarNetwork: 'testnet', // default: 'testnet'
  logLevel: 'warn', // 'silent' | 'error' | 'warn' | 'info' | 'debug'
});

await client.ready(); // keypair initialised and any persisted session restored
```

On the web, storage (`localStorage` with an in-memory fallback) and the DPoP key manager
(non-extractable WebCrypto P-256) are autodetected. React Native has to inject both.

### 4. Decide the funding mode

Every Stellar account needs reserves. **Dashboard > Treasury > Funding Mode** picks who triggers the
spend, and no code changes when you switch:

| Mode        | Reserve is locked                              | Use for                                   |
| ----------- | ---------------------------------------------- | ----------------------------------------- |
| `IMMEDIATE` | At registration, automatically at login        | Consumer apps with no compliance gate     |
| `DEFERRED`  | Only when your backend calls the fund endpoint | KYC-gated products, remittances, neobanks |

The reserve is sponsored (CAP-33), not transferred: `1 XLM + 0.5 XLM per configured asset` stays locked
in the app's funding wallet while it sponsors the user account. In `DEFERRED` mode the wallet exists as
a `G...` address with no on-chain account until funded, so read `wallet.existsOnStellar` before offering
any operation that needs a live account.

---

## Authentication

`client.login()` is fire and forget. It returns `void` and reports progress through the auth state
subscription, so never `await` it and never derive UI state from its return value.

```ts
import { PollarClient, WalletType } from '@pollar/core';

client.login({ provider: 'google' });
client.login({ provider: 'github' });
client.login({ provider: 'email', email: 'user@example.com' });
client.login({ provider: WalletType.FREIGHTER }); // an adapter's `type` IS the provider
client.login({ provider: 'xbull' }); // adapters registered via `walletAdapters`

client.verifyEmailCode('123456'); // second step of the email flow
client.cancelLogin(); // abort whatever is in flight, back to `idle`
```

There is no `'wallet'` provider. External wallets are selected by the adapter id.

Passkey smart accounts are their own pair of calls, and both need the `passkey` ceremony injected in
the config (`@pollar/react` supplies it with `@simplewebauthn/browser`):

```ts
client.loginSmartWallet(); // returning user, WebAuthn get
client.createSmartWallet(); // new user, WebAuthn create plus sponsored deploy
```

### Drive the UI from the state machine

```ts
const unsubscribe = client.onAuthStateChange((state) => {
  // state.step: 'idle' | 'authenticating' | ... | 'authenticated' | 'error'
  render(state.step, state.errorCode);
});
```

In React use `useSyncExternalStore` over `onAuthStateChange` plus `getAuthState`, or just use
`usePollar()` from `@pollar/react`. See [react.md](react.md).

### PII is memory only

The session persisted to storage holds ids, tokens, and wallet addresses. Email, name, avatar, and the
linked providers are never written to disk:

```ts
const profile = client.getUserProfile();
// { mail, first_name, last_name, avatar, providers } | null, until /auth/login completes
```

### Sessions and logout

```ts
const sessions = await client.listSessions(); // one row per refresh-token family
await client.revokeSession(familyId);
await client.logout(); // this device
await client.logout({ everywhere: true }); // every session for this user
```

Every authenticated request is signed with a DPoP proof (RFC 9449) bound to a per-session keypair, so a
stolen access token is useless on its own. `client.refresh()` is race safe: concurrent 401s coalesce
into a single refresh.

---

## Wallets and balances

```ts
const wallet = client.getWallet(); // primary Stellar wallet, or null
const all = client.getWallets(); // one per chain, [] on pre-multichain sessions

await client.refreshBalance(); // pushes into WalletBalanceState
const state = client.getWalletBalanceState();
```

The wallet exposes `address` only. There is no `publicKey` field, and `address` can be `null` when the
wallet has no address yet.

Balance records are multichain and tagged by `chain`, each carrying `decimals`, `limit`, and
`sponsored`. `balance` and `available` are `string | null`, and **`null` means the chain could not be
read**. Render it as unavailable, never as `0`, or the UI will tell a user their money is gone during a
transient RPC outage.

For anything that moves value (payments, trustlines, swaps, ramps, earn, ownership proofs) read
[transactions.md](transactions.md).

---

## Gotchas

These are the failures that look like SDK bugs and are not:

1. **Recreating the client on every render.** `PollarClient` owns the keypair, storage listeners, and
   the refresh scheduler. Instantiate it once. In `@pollar/react` the `client` prop is locked at first
   render and swapping it later is ignored.
2. **Awaiting `login()`.** It returns `void`. Subscribe to the auth state instead.
3. **Origin not allowlisted.** The first symptom is a rejected request before any login UI appears. Add
   the origin under Build > Domains, `localhost` included.
4. **React Native without the entry-file polyfills.** DPoP proof construction needs
   `crypto.getRandomValues`, `TextEncoder` / `TextDecoder`, and a spec-compliant `URL`. Missing any of
   them means no authenticated request works at all. See [react-native.md](react-native.md).
5. **Treating a `null` balance as zero.** See above.
6. **Reading PII off the persisted session.** It is not there. Call `getUserProfile()`.
7. **Assuming the account exists on-chain.** In `DEFERRED` funding mode, and for freshly connected
   external wallets, check `wallet.existsOnStellar` first and call `createAccount()` for external ones.
8. **Deciding sponsorship client-side.** Who pays is server-side app config. The client can only opt
   out with `skipSponsorship: true`.
9. **Expecting smart wallets to do everything.** Passkey C-address sessions have no classic trustlines,
   do not use `signTx` (they go through `signAndSubmitTx`), and are not supported yet by swaps, earn, or
   SEP-53 / SEP-10 proofs, which need a classic ed25519 key.
10. **Mixing a mainnet key with `stellarNetwork: 'testnet'`.** The key wins. Keep them in sync.

## Version note

This skill tracks `@pollar/core` and `@pollar/react` `0.11.x`, which moved every request to the `/v2`
API and added Solana alongside Stellar. Two earlier breaks matter if an existing integration is being
upgraded: `0.11.1` made balances nullable, and `0.10.0` replaced the singular `walletAdapter` resolver
and `loginWallet(id)` with a `walletAdapters: WalletAdapter[]` array. Check
[UPGRADE.md](https://github.com/pollar-xyz/pollar/blob/main/UPGRADE.md) before bumping versions.

## Sources

Verify anything version-sensitive against the upstream docs rather than assuming this file is current:

- [docs.pollar.xyz](https://docs.pollar.xyz) - guides, core concepts, and SDK reference
- [github.com/pollar-xyz/pollar](https://github.com/pollar-xyz/pollar) - the SDK monorepo, CHANGELOG, and UPGRADE guide
- [dashboard.pollar.xyz](https://dashboard.pollar.xyz) - app config, API keys, treasury, and domains

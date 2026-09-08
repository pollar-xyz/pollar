# React and Next.js

`@pollar/react` wraps `@pollar/core` with a context provider, one hook, and a set of prebuilt modals
that are already wired to the client. Reach for the modals first; drop to `@pollar/core` only when the
UI has to be custom.

## Provider

```tsx
import { PollarProvider } from '@pollar/react';
import '@pollar/react/styles.css';

export default function Root({ children }: { children: React.ReactNode }) {
  return <PollarProvider client={{ apiKey: process.env.NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY! }}>{children}</PollarProvider>;
}
```

| Prop        | Type                                 | Notes                                                                                                                                                                                 |
| ----------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client`    | `PollarClient \| PollarClientConfig` | Required. **Locked at first render**, swapping it after mount is ignored                                                                                                              |
| `appConfig` | `PollarConfig`                       | Local override of the remote `/applications/config` fetch. Its **presence** is the opt-out switch: pass it, even as `{}`, and the remote fetch is skipped. Can be swapped after mount |
| `adapters`  | `PollarAdapters`                     | Named set of `PollarAdapter` objects for app-specific flows (escrow, and so on)                                                                                                       |

`PollarProvider` already carries `'use client'`. Components calling `usePollar()` need their own
`'use client'` because they use hooks, which is a React rule and not a Pollar one. Server-side the SDK
degrades to a no-op and warns, so never instantiate a client in a Server Component.

The login modal is gated on the remote app-config fetch. Read `configStatus`
(`'loading' | 'ready' | 'error'`) and call `retryConfig()` if you drive the login UI yourself.

## The hook

```tsx
'use client';
import { usePollar } from '@pollar/react';

export function Profile() {
  const { isAuthenticated, wallet, login, logout, getClient } = usePollar();

  if (!isAuthenticated) return <button onClick={() => login({ provider: 'google' })}>Sign in</button>;

  const profile = getClient().getUserProfile(); // PII lives in memory only

  return (
    <div>
      <p>{wallet?.address}</p>
      <p>{profile?.mail}</p>
      <button onClick={logout}>Sign out</button>
    </div>
  );
}
```

What `usePollar()` returns, grouped:

- **Session**: `isAuthenticated`, `wallet`, `wallets`, `verified`, `getClient`
- **App config**: `appConfig`, `styles`, `configStatus`, `retryConfig`
- **Auth**: `login`, `logout`, `openLoginModal`, `sessions`, `openSessionsModal`
- **Transactions**: `tx`, `buildTx`, `signTx`, `signAndSubmitTx`, `submitTx`,
  `buildAndSignAndSubmitTx` (alias `runTx`), `sendPayment`, `openTxModal`
- **History and balances**: `txHistory`, `openTxHistoryModal`, `walletBalance`,
  `refreshWalletBalance`, `openWalletBalanceModal`
- **Assets**: `enabledAssets`, `refreshAssets`, `setTrustline`, `openEnabledAssetsModal`
- **Swap**: `getSwapQuote`, `swap`, `getSwapConfig`, `getSwapTokens`, `openSwapModal`
- **Earn**: `getEarnProviders`, `getEarnOpportunities`, `getEarnPosition`, `earnDeposit`,
  `earnWithdraw`, `openEarnModal`
- **Other openers**: `openSendModal`, `openReceiveModal`, `openRampModal`, `openKycModal`,
  `openDistributionRulesModal`
- **Network**: `network`, `setNetwork`

Custody is derived from the wallet, not a separate field:

```ts
const provider = wallet?.custody === 'external' ? wallet.provider : null;
```

`logout` here is fire and forget. Use `await getClient().logout()` when you need the promise.

## Prebuilt UI

Every modal mounts itself when its `openXModal()` action fires. Do not render them manually; they are
already wired inside the provider. The fastest complete integration is one component:

```tsx
import { WalletButton } from '@pollar/react';

export function Header() {
  return <WalletButton />;
}
```

`<WalletButton>` opens the login modal when signed out. Signed in, it shows the address with a dropdown
for send, receive, copy, balance, history, ramp, KYC, distribution rules, sessions, sign out, plus a
"Create account" action when an external wallet has no on-chain account yet.

The rest: `<SendModal>`, `<ReceiveModal>`, `<SwapModal>`, `<EarnModal>`, `<TxHistoryModal>`,
`<WalletBalanceModal>`, `<EnabledAssetsModal>`, `<SessionsModal>`, `<DistributionRulesModal>`,
`<KycModal>`, `<RampWidget>`.

To keep the data wiring but replace the chrome, use the `Template` companion of any modal
(`<SendModalTemplate>`, `<LoginModalTemplate>`, and so on). `<TxHistoryModal>` and `<TransactionModal>`
are not exported as wrappers, only as templates. The wallet-balance, enabled-assets, send, and receive
templates each need `chains`, `selectedChain`, and `onSelectChain`.

## Multichain UI

Use `useChains()` rather than deriving chains from `wallets` yourself. It is the only source that knows
the app's configured chain order, which comes from `/applications/config` and not from the session:

```ts
const { chains, primaryChain, primaryAddress, ready } = useChains();
```

`chains` is `[]` and `ready` is `false` while the config loads or fails, so gate any chain UI on
`ready`. A chain the app switched off stops appearing on the next page load even if a stored session
still carries it. `addressForChain(wallets, selectedChain)` resolves the address for a picked chain.

## Bridging core into another framework

`PollarClient` is a plain class and `on*StateChange` are callback subscriptions, so any framework works.
Keep the client a singleton.

**React without `@pollar/react`:**

```tsx
const client = new PollarClient({ apiKey: 'pub_testnet_...' }); // module scope

export function useAuthState(): AuthState {
  return useSyncExternalStore(
    (cb) => client.onAuthStateChange(cb), // returns the unsubscribe fn
    () => client.getAuthState(),
    () => client.getAuthState(), // server snapshot
  );
}
```

**Angular:** the callbacks fire outside Angular's zone, so wrap state updates in `NgZone.run()` or use
signals, otherwise the view never updates.

**Vue 3:** assign the payload into a `ref` or `shallowRef` inside `onMounted` and unsubscribe in
`onUnmounted`.

## Logging

```ts
const client = new PollarClient({ apiKey, logLevel: 'debug', logger: mySink });
```

Levels run `silent` < `error` < `warn` < `info` < `debug`, default `info`. State-transition chatter and
retry warnings sit at `debug`. `@pollar/react` reads the client's logger, so one setting covers both.

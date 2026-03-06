# @pollar/react

React bindings for [Pollar](https://pollar.xyz) — drop-in authentication UI and hooks for Stellar-based applications.

## Installation

```bash
npm install @pollar/react @pollar/core
# or
pnpm add @pollar/react @pollar/core
# or
yarn add @pollar/react @pollar/core
```

**Peer dependencies:** `react >= 18`, `react-dom >= 18`

## Quick Start

Wrap your application with `PollarProvider` and use the `usePollar` hook anywhere in the tree.

```tsx
import { PollarProvider } from '@pollar/react';
import '@pollar/react/styles.css';

export default function App({ children }: { children: React.ReactNode }) {
  return (
    <PollarProvider config={{ apiKey: 'your-api-key' }}>
      {children}
    </PollarProvider>
  );
}
```

```tsx
import { usePollar } from '@pollar/react';

export function Profile() {
  const { isAuthenticated, session, login, logout } = usePollar();

  if (!isAuthenticated) {
    return (
      <button onClick={() => login({ provider: 'google' })}>
        Sign in with Google
      </button>
    );
  }

  return (
    <div>
      <p>Wallet: {session?.wallet?.publicKey}</p>
      <button onClick={logout}>Sign out</button>
    </div>
  );
}
```

## API Reference

### `<PollarProvider>`

Context provider that initialises the Pollar client and makes it available to child components.

```tsx
<PollarProvider
  config={{
    apiKey: 'your-api-key',
    baseUrl: 'https://sdk.api.pollar.xyz', // optional
    stellarNetwork: 'testnet',             // optional, default: 'testnet'
  }}
>
  {children}
</PollarProvider>
```

| Prop     | Type                | Required | Description                              |
| -------- | ------------------- | -------- | ---------------------------------------- |
| `config` | `PollarClientConfig`| Yes      | Configuration passed to `PollarClient`   |

---

### `usePollar()`

Returns the authentication context.

```ts
const {
  session,          // PollarApplicationConfigContent | null
  isLoading,        // boolean — true while a login flow is in progress
  isAuthenticated,  // boolean — true when a valid session exists
  login,            // (options: PollarLoginOptions) => void
  logout,           // () => Promise<void>
} = usePollar();
```

#### Login options

```ts
// Social providers (opens a popup)
login({ provider: 'google' });
login({ provider: 'github' });

// Email OTP
login({ provider: 'email', email: 'user@example.com' });

// Stellar wallet
import { WalletType } from '@pollar/core';
login({ provider: 'wallet', type: WalletType.FREIGHTER });
login({ provider: 'wallet', type: WalletType.ALBEDO });
```

---

### `<WalletButton>`

Pre-built button component that opens the Pollar authentication modal.

```tsx
import { WalletButton } from '@pollar/react';

export function Header() {
  return <WalletButton />;
}
```

The modal handles all login providers, loading states, and error feedback out of the box.

---

## Styles

Import the bundled stylesheet once in your application entry point:

```ts
import '@pollar/react/styles.css';
```

All class names are prefixed with `pollar-` to avoid conflicts.

---

## TypeScript

`@pollar/react` ships full type declarations. Key exported types:

```ts
import type {
  AuthProviderProps,
  AuthContextValue,
  LoginButtonProps,
  AuthModalProps,
  PollarConfig,
  PollarStyles,
} from '@pollar/react';
```

---

## License

MIT
import { PollarProvider, usePollar, type PollarConfig } from '@pollar/react';
import { createPrivyAdapter, PrivyAdapterProvider } from '@pollar/privy-adapter';

const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID as string | undefined;
const POLLAR_API_KEY = import.meta.env.VITE_POLLAR_API_KEY as string | undefined;
const POLLAR_BASE_URL = import.meta.env.VITE_POLLAR_BASE_URL as string | undefined;
const STELLAR_NETWORK = (import.meta.env.VITE_STELLAR_NETWORK as 'testnet' | 'mainnet' | undefined) ?? 'testnet';

// Build the adapter once at module scope (it is inert until PrivyAdapterProvider
// mounts). Guarded so a missing app id renders the setup screen instead.
const privy = PRIVY_APP_ID
  ? createPrivyAdapter({ appId: PRIVY_APP_ID, loginMethods: ['email', 'google', 'github'], debug: true })
  : null;

// Local config override so the Privy login button renders without a backend
// `/applications/config` round-trip. `embeddedWallets: true` is what surfaces it.
const appConfig: PollarConfig = {
  application: { name: 'Privy Adapter Example' },
  styles: { theme: 'light', accentColor: '#005DB4', embeddedWallets: true },
};

const box: React.CSSProperties = {
  fontFamily: 'system-ui, sans-serif',
  maxWidth: 560,
  margin: '4rem auto',
  padding: '0 1rem',
  lineHeight: 1.5,
};
const btn: React.CSSProperties = {
  padding: '0.6rem 1.2rem',
  fontSize: '1rem',
  borderRadius: 8,
  border: '1px solid #005DB4',
  background: '#005DB4',
  color: '#fff',
  cursor: 'pointer',
};

function Home() {
  const { wallet, isAuthenticated, verified, openLoginModal, logout } = usePollar();

  return (
    <main style={box}>
      <h1>Pollar x Privy</h1>
      <p>Click log in, choose Privy, and complete the email / Google / GitHub flow.</p>
      {isAuthenticated && wallet ? (
        <>
          <p>
            Connected wallet ({wallet.custody}
            {verified ? ', verified' : ', optimistic'}):
          </p>
          <pre style={{ background: '#f4f4f5', padding: '0.75rem', borderRadius: 8, overflowX: 'auto' }}>
            {wallet.address}
          </pre>
          <button style={btn} onClick={logout}>
            Log out
          </button>
        </>
      ) : (
        <button style={btn} onClick={openLoginModal}>
          Log in
        </button>
      )}
    </main>
  );
}

function Setup() {
  return (
    <main style={box}>
      <h1>Pollar x Privy — setup needed</h1>
      <p>Copy <code>.env.example</code> to <code>.env.local</code> and set:</p>
      <ul>
        <li>
          <code>VITE_PRIVY_APP_ID</code> {PRIVY_APP_ID ? '✓' : '— missing'}
        </li>
        <li>
          <code>VITE_POLLAR_API_KEY</code> {POLLAR_API_KEY ? '✓' : '— missing'}
        </li>
      </ul>
      <p>Then restart <code>npm run dev</code>. See the README for the Privy dashboard prerequisites.</p>
    </main>
  );
}

export function App() {
  if (!privy || !POLLAR_API_KEY) {
    return <Setup />;
  }
  return (
    <PrivyAdapterProvider adapter={privy}>
      <PollarProvider
        client={{
          apiKey: POLLAR_API_KEY,
          walletAdapters: [privy],
          stellarNetwork: STELLAR_NETWORK,
          ...(POLLAR_BASE_URL ? { baseUrl: POLLAR_BASE_URL } : {}),
        }}
        appConfig={appConfig}
      >
        <Home />
      </PollarProvider>
    </PrivyAdapterProvider>
  );
}

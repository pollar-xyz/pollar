import { PollarProvider, usePollar, type PollarConfig } from '@pollar/react';
import { solanaWalletStandardAdapters } from '@pollar/solana-wallet-standard-adapter';

const POLLAR_API_KEY = import.meta.env.VITE_POLLAR_API_KEY as string | undefined;
const POLLAR_BASE_URL = import.meta.env.VITE_POLLAR_BASE_URL as string | undefined;

// Discover installed Solana wallets (Phantom, Solflare, Backpack, …) through the
// Wallet Standard, one adapter each. SSR-safe (returns [] server-side); here it
// runs in the browser, so any injected wallet is picked up. login({ provider })
// then runs the SIWS flow in @pollar/core.
const solanaAdapters = solanaWalletStandardAdapters();

const appConfig: PollarConfig = {
  application: { name: 'Solana Wallet Standard Example' },
  styles: { theme: 'light', accentColor: '#7d00ff' },
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
  border: '1px solid #7d00ff',
  background: '#7d00ff',
  color: '#fff',
  cursor: 'pointer',
};

function Home() {
  const { wallet, isAuthenticated, verified, openLoginModal, logout } = usePollar();

  return (
    <main style={box}>
      <h1>Pollar x Solana</h1>
      <p>Click log in, choose your Solana wallet, and approve the Sign In With Solana request.</p>
      {solanaAdapters.length === 0 && (
        <p style={{ color: '#b45309' }}>
          No Solana wallet detected. Install Phantom, Solflare, or Backpack, then reload.
        </p>
      )}
      {isAuthenticated && wallet ? (
        <>
          <p>
            Connected wallet ({wallet.custody}
            {verified ? ', verified' : ', optimistic'}):
          </p>
          <pre style={{ background: '#f4f4f5', padding: '0.75rem', borderRadius: 8, overflowX: 'auto' }}>{wallet.address}</pre>
          <button style={btn} onClick={logout}>
            Log out
          </button>
        </>
      ) : (
        <button style={btn} onClick={openLoginModal} disabled={solanaAdapters.length === 0}>
          Log in
        </button>
      )}
    </main>
  );
}

function Setup() {
  return (
    <main style={box}>
      <h1>Pollar x Solana — setup needed</h1>
      <p>
        Copy <code>.env.example</code> to <code>.env.local</code> and set{' '}
        <code>VITE_POLLAR_API_KEY</code> (an app with SOLANA enabled). Then restart <code>npm run dev</code>.
      </p>
    </main>
  );
}

export function App() {
  if (!POLLAR_API_KEY) {
    return <Setup />;
  }
  return (
    <PollarProvider
      client={{
        apiKey: POLLAR_API_KEY,
        walletAdapters: solanaAdapters,
        ...(POLLAR_BASE_URL ? { baseUrl: POLLAR_BASE_URL } : {}),
      }}
      appConfig={appConfig}
    >
      <Home />
    </PollarProvider>
  );
}

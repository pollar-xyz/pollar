# @pollar-examples/privy-web

Minimal Vite + React app to **manually end-to-end test** `@pollar/privy-adapter`
against a real Privy app: log in with email / Google / GitHub, have Privy create a
Stellar embedded wallet, and complete Pollar's SEP-10 login.

It uses the local workspace packages (`@pollar/core`, `@pollar/react`,
`@pollar/privy-adapter`), so build them first (`npm run build` at the repo root).

## Prerequisites (Privy dashboard)

For the login to actually work, your Privy app must have:

- **Stellar enabled** (extended chains / Stellar wallets) — otherwise creating the
  Stellar embedded wallet fails.
- **`http://localhost:5173`** added to the allowed origins.
- The **login methods** you want enabled (email, and Google/GitHub OAuth configured
  with their redirect URIs if you use them).

You also need a **Pollar SDK API key**.

## Run

```bash
# from the repo root, once: build the workspace packages
npm run build

# then, in this folder:
cp .env.example .env.local
# edit .env.local: set VITE_PRIVY_APP_ID and VITE_POLLAR_API_KEY
npm run dev          # or: npm run dev -w @pollar-examples/privy-web  (from root)
```

Open http://localhost:5173, click **Log in**, choose **Privy**, and complete the
flow. On success the page shows the connected Stellar wallet address.

> Dev-only: run it with `npm run dev`. A production `vite build` currently fails
> because `@privy-io/react-auth` references `@solana/kit` (an _optional_ peer for a
> Solana funding feature we never use) and the production bundler validates its
> exports. The dev server (esbuild) stubs that optional peer, so the app runs fine.

## What it demonstrates

`src/App.tsx` is the whole integration:

- `createPrivyAdapter({ appId, loginMethods })` builds the adapter.
- `<PrivyAdapterProvider adapter={privy}>` mounts Privy and wires it in.
- `<PollarProvider client={{ apiKey, walletAdapters: [privy] }}>` registers it.
- A local `appConfig` with `styles.embeddedWallets: true` surfaces the Privy button
  without a backend config round-trip.

> Notes: the Privy app id is public (safe in the client bundle). OAuth on web is
> redirect-based; email login resolves in-session.

# @pollar/migrate

Upgrades an app on any `@pollar` release from 0.5 onwards to 0.12. It reads your code, reports every change the upgrade needs file by file, and applies the mechanical ones for you.

```bash
npx @pollar/migrate            # report only, nothing is written
npx @pollar/migrate --fix      # apply the mechanical changes
```

Each finding links to the section of the [upgrade guide](https://docs.pollar.xyz/docs/guides/upgrade-to-0-12) that explains it.

## What it does

1. Finds every `package.json` and source file (`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.mts`, `.cts`; not `.d.ts`) under the directory, skipping `node_modules`, build output and native folders. Monorepos are covered.
2. Reads the release the app is on from what is installed in `node_modules`, or from the ranges in `package.json`. Pass `--from` to set it yourself.
3. Checks only the files that import an SDK package (`@pollar/core`, `@pollar/react`, `@pollar/react-native` and the adapters), and reports only the changes made after your release.

With `--fix` it applies the changes it can make safely:

| Change                                                                                                                                                                                          | Since  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `usePollar()` renames: `transaction` -> `tx`, `openTransactionModal` -> `openTxModal`, `config` -> `appConfig`, `openRampWidget` -> `openRampModal`, `refreshBalance` -> `refreshWalletBalance` | 0.6    |
| `EscrowFn` -> `AdapterFn`, `EscrowAdapter` -> `PollarAdapter`                                                                                                                                   | 0.7    |
| `<PollarProvider config>` -> `client`                                                                                                                                                           | 0.8    |
| `session.wallet.publicKey` -> `session.wallet.address`                                                                                                                                          | 0.9    |
| `usePollar().walletAddress` / `walletType` -> read from `wallet`                                                                                                                                | 0.10   |
| `loginWallet(id)` -> `login({ provider: id })`                                                                                                                                                  | 0.10   |
| `stellarWalletsKit()` -> `stellarWalletsKitAdapters()`, `walletAdapter` -> `walletAdapters`                                                                                                     | 0.10   |
| A `baseUrl` ending in `/v1` or `/v2` -> the origin                                                                                                                                              | 0.11   |
| `setTrustline(asset, { sponsored: true })` -> `setTrustline(asset)`                                                                                                                             | 0.11.1 |
| `@pollar/core`, `react`, `react-native` and the two wallet-adapter ranges in `package.json` -> `^0.12.0`                                                                                        | 0.12   |

Everything else is reported as **to do**, with what to write instead: removed ramp methods, the user profile that left the session, `styles` on the provider, a missing `network`, nullable balances, a headless app with no confirmation handler, direct calls to SDK API v1 or v2, and imports of names 0.12 does not export.

The files are written only after every file was read, so an error leaves the project untouched. Commit or stash your work first, so you can review the diff.

## After running it

1. Install the new versions (`npm install`).
2. Make the changes listed as **to do**.
3. Run your type check (`tsc --noEmit`): what is left surfaces there.
4. Test sign-in and a transaction, then deploy.

## Options

| Option             |                                                                     |
| ------------------ | ------------------------------------------------------------------- |
| `[dir]`            | Directory to scan. Defaults to the current one.                     |
| `--fix`            | Write the fixable changes.                                          |
| `--from <version>` | The release the app is on, when it cannot be read from the project. |
| `--json`           | Print the result as JSON, for scripts and coding agents.            |
| `-h`, `--help`     | Show the help.                                                      |

## JSON output

```json
{
  "root": "/path/to/app",
  "from": "0.5.3",
  "to": "0.12.0",
  "findings": [
    {
      "rule": "react-context-renames",
      "since": "0.6.0",
      "severity": "error",
      "status": "fixable",
      "file": "src/Wallet.tsx",
      "line": 12,
      "column": 9,
      "message": "In `usePollar()`: `transaction` is `tx` (0.6).",
      "docs": "https://docs.pollar.xyz/docs/guides/upgrade-to-0-12#react-context-renames"
    }
  ],
  "changedFiles": [],
  "notes": ["..."]
}
```

`status` is `fixable` (run with `--fix`), `fixed` or `manual`. The same result is available from code:

```ts
import { migrate } from '@pollar/migrate';

const result = migrate({ root: process.cwd(), fix: false });
```

## License

Apache-2.0. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).

---
name: pollar-upgrade
description: Upgrade an app that uses the Pollar SDK (@pollar/core, @pollar/react, @pollar/react-native) from any release between 0.5 and 0.11 to 0.12, the release on SDK API v3. Runs the @pollar/migrate codemod, makes the changes it leaves by hand, and verifies the build. Use when an app is on an old @pollar release, when SDK API v1 answers 410 or sends a Deprecation header, or when the user asks to update Pollar.
user-invocable: true
argument-hint: '[path to the app]'
---

# Upgrade an app to Pollar SDK 0.12

Releases before 0.11.0 call SDK API v1, which is retired on 2026-11-30: from then on it answers `410 Gone` and those
apps stop signing users in. Releases 0.11.x call v2, which is frozen and has no ramps. 0.12 calls v3.

Two sources do the work:

- **`@pollar/migrate`** reads the project, works out the release it is on, reports every change that applies, and
  applies the mechanical ones with `--fix`.
- **The upgrade guide**, <https://docs.pollar.xyz/docs/guides/upgrade-to-0-12>, explains each change. Every finding
  links to its section; read that section before making a change by hand.

## Steps

### 1. Start from a clean tree

Run `git status`. If there are uncommitted changes, ask the user to commit them (or do it if they say so) before
anything else, so the upgrade is one reviewable diff.

### 2. Read the report

```bash
npx @pollar/migrate --json
```

Run it at the root of the app (or pass the path). In a monorepo, run it at the repository root: it reads every
`package.json` under it. Read from the JSON:

- `from`: the release detected. If it is `null`, ask the user which release the app is on and run again with
  `--from <version>`.
- `findings`: each one has `file`, `line`, `rule`, `status` (`fixable` or `manual`), `message` and `docs`.
- `notes`: behaviour changes with no code. Pass them on to the user at the end.

Summarize for the user: the release found, how many changes the tool will make, and the manual ones grouped by
rule.

### 3. Apply the mechanical changes

```bash
npx @pollar/migrate --fix
```

Show the user `git diff --stat`. The tool rewrites only what is safe: renames, provider props, `loginWallet`,
`walletAddress` / `walletType`, a versioned `baseUrl`, the `sponsored` trustline flag and the `@pollar/*` ranges in
`package.json`.

### 4. Install

Install with the package manager the project already uses (the lockfile says which: `package-lock.json` npm,
`pnpm-lock.yaml` pnpm, `yarn.lock` yarn, `bun.lockb` bun). Do not switch package managers.

### 5. Make the manual changes

Work through the `manual` findings file by file. For each one, open the `docs` link and follow it. The frequent ones:

| Rule                          | What to do                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ramps-v3`                    | A ramp is an order of legs on v3. If the app opens the ramp with `<RampWidget>` or `openRampModal()`, delete the custom calls and use that. Otherwise move to `getRampRoutes(direction)`, `quoteRamp`, `createRampOrder({ quoteId, payee })`, `pollRampOrder(id, { onUpdate, signal })` and `signRampLeg(orderId, actionId)`, driven by `order.pendingAction`. |
| `session-profile-data`        | Read the field from `client.getUserProfile()` after login. It is `null` before.                                                                                                                                                                                                                                                                                |
| `session-storage-key`         | Remove the read of `pollar:session` from storage. Use `getAuthState()`, `getWallet()` or `getUserProfile()`. Never read or forward the access token: it is bound to a key on the device and useless anywhere else.                                                                                                                                             |
| `provider-styles-prop`        | Ask the user. Removing `styles` uses the branding set in the dashboard. Moving it to `appConfig={{ styles }}` stops the dashboard configuration (branding, login methods, chains) from loading at all.                                                                                                                                                         |
| `stellar-wallets-kit-network` | Pass `network` (`Networks.PUBLIC` on mainnet, `Networks.TESTNET` on testnet) from `@creit.tech/stellar-wallets-kit`, matching the app's network.                                                                                                                                                                                                               |
| `wallet-adapter-array`        | Wrap the adapter in an array under `walletAdapters`. A custom adapter needs `meta: { label }` and `connect()` resolving `{ address }`.                                                                                                                                                                                                                         |
| `balance-nullable`            | `balance` and `available` are `string \| null`: `null` means the chain could not be read. Show a dash for it, never `0`.                                                                                                                                                                                                                                       |
| `confirmation-handler`        | A headless app (no `<PollarProvider>`): subscribe to `client.onConfirmationRequest()` and call `confirm()` or `reject()` on each pending request from a user action.                                                                                                                                                                                           |
| `package-unsupported`         | `@pollar/privy-adapter` and `@pollar/accesly-adapter` have no 0.12 release. Ask the user before removing one: the app's login through it goes away.                                                                                                                                                                                                            |
| `raw-api-path`                | Code that calls the SDK API directly moves to `/v3`, or to the SDK method that does the same. A backend uses the Server API with a SECRET key, never a user's token.                                                                                                                                                                                           |
| `removed-export`              | The name is gone in 0.12. Find it in the guide or in <https://github.com/pollar-xyz/pollar/blob/main/CHANGELOG.md>.                                                                                                                                                                                                                                            |

Do not guess an API that is not in the guide or in the package's types. When the types of the installed
`@pollar/core` disagree with something here, the types win.

### 6. Verify

1. Run the project's type check (`npx tsc --noEmit`, or its `typecheck` / `lint` script) and fix what it reports.
2. Run `npx @pollar/migrate` again. Nothing should be `fixable`; every `manual` item left needs a reason you can tell
   the user (a decision that is theirs, or a false positive you checked).
3. Run the build and the project's tests.

### 7. Report

Tell the user:

- the release it moved from, and the files changed;
- each decision left to them (unsupported adapters, `styles`, anything you did not change and why);
- the `notes` from the report, in particular: every user signs in once more after the deploy, the app must be
  served over HTTPS, and every signature now asks the user unless the dashboard's Signature confirmation policy
  says otherwise;
- what to test by hand before deploying: sign in with each method the app offers, send a transaction, open each
  Pollar screen the app uses;
- after the deploy, **Monitor > SDK versions** in the dashboard shows whether any user still runs the old build.

## Rules

- Never commit, push or deploy unless the user asks.
- Never read `.env` files or print API keys.
- Keep the user's formatting: run their formatter (`prettier`, `biome`, ...) on the changed files if the project has
  one.

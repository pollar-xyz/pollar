# Contributing to Pollar

Thank you for your interest in contributing to Pollar. This document describes how to participate in the project effectively.

## Table of contents

- [Code of conduct](#code-of-conduct)
- [What is Pollar?](#what-is-pollar)
- [How to contribute](#how-to-contribute)
- [Setting up the environment](#setting-up-the-environment)
- [Development process](#development-process)
- [Pull requests](#pull-requests)
- [Reporting issues](#reporting-issues)

## Code of conduct

This project is governed by our [Code of Conduct](.github/CODE_OF_CONDUCT.md). By participating, you are expected to uphold it in all your interactions with the project and the community.

## What is Pollar?

Pollar is a monorepo containing:

- **@pollar/core**: Authentication client and functions for Pollar services (includes integration with Stellar wallets such as Freighter and Albedo).
- **@pollar/react**: React components for authentication (login modal, provider buttons, etc.).

The project uses **npm workspaces** and **Turborepo** to manage packages.

## How to contribute

- **Fix bugs**: Check open [issues](https://github.com/<YOUR_ORG_OR_USER>/pollar/issues) or open a new one describing the problem.
- **Propose improvements**: Open an issue to discuss the idea before implementing large changes.
- **Submit code**: Follow the [Pull requests](#pull-requests) flow below.

Before submitting a significant Pull Request, we recommend discussing your proposal in an issue to align expectations with the maintainers.

## Setting up the environment

Requirements:

- **Node.js** >= 18 (see `engines` in `package.json`)
- **npm** 10.x (recommended to use the version specified in `packageManager`)

Steps:

```bash
# Clone the repository
git clone https://github.com/<YOUR_ORG_OR_USER>/pollar.git
cd pollar

# Install dependencies (from the monorepo root)
npm install

# Build all packages
npm run build

# Run lint
npm run lint
```

Ensure `npm run build` and `npm run lint` pass before making changes.

## Development process

1. Create a branch from `main` (e.g. `fix/login-modal` or `feat/new-wallet`).
2. Make your changes in the relevant packages (`packages/core` or `packages/react`).
3. Keep the code style consistent:
   - The project uses **Prettier** (config in `.prettierrc`).
   - Strict TypeScript; run `npm run lint` to check types.
4. From the root, run again:
   - `npm run build`
   - `npm run lint`
5. If you add new functionality, document usage in comments or in the package documentation.

### Useful scripts

| Command           | Description                    |
| ----------------- | ------------------------------ |
| `npm run build`   | Build all packages             |
| `npm run dev`     | Watch mode for all packages    |
| `npm run lint`    | Type checking (TypeScript)     |
| `npm run clean`   | Remove build artifacts         |

## Pull requests

1. **Open the PR** against the `main` branch with a clear title and description.
2. **Describe the change**: what problem it solves or what functionality it adds.
3. **Reference issues** when applicable (e.g. "Closes #123").
4. **Keep the PR focused**: one PR per feature/fix when possible.
5. Maintainers will review the code; they may request changes.

Once approved, it will be merged according to the team's policy.

## Reporting issues

When opening an issue:

- Use a descriptive title.
- Include Node version, npm version, and the affected package version (`@pollar/core` or `@pollar/react`).
- For bugs, include steps to reproduce.
- For proposals, describe the use case and desired solution.

---

Thank you for contributing to Pollar.

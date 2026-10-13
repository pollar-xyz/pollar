# Docs

The API reference lives with each package, next to the code it documents:

- [`@pollar/core`](../packages/core/README.md) — `PollarClient`, auth flows, transactions, balances, swaps, earn, ramps
- [`@pollar/react`](../packages/react/README.md) — `PollarProvider`, `usePollar()`, components and templates
- [`@pollar/react-native`](../packages/react-native/README.md) - `PollarProvider`, `usePollar()` and modals for React Native
- [`@pollar/privy-adapter`](../packages/privy-adapter/README.md)
- [`@pollar/privy-server-adapter`](../packages/privy-server-adapter/README.md)
- [`@pollar/accesly-adapter`](../packages/accesly-adapter/README.md)
- [`@pollar/stellar-wallets-kit-adapter`](../packages/stellar-wallets-kit-adapter/README.md)
- [`@pollar/solana-wallet-standard-adapter`](../packages/solana-wallet-standard-adapter/README.md)

Version history is in [CHANGELOG.md](../CHANGELOG.md); migration steps between
breaking versions are in [UPGRADE.md](../UPGRADE.md).

Proposed architecture decisions (not released API guarantees):

- [ADR 0001: Ramp API, adapter contract, and transaction lifecycle](adr/0001-ramp-api-and-lifecycle.md) — DEV-6; pending audit confirmation and Developer B/DevOps review.

Proposed product and integration designs (documentation only):

- [DEV-8: Generic Ramp Adapter and User Experience Design](design/dev-8-ramp-adapter-and-user-experience.md) — frontend journeys, backend responsibilities, adapter contribution model, and review scenarios; implementation and reviews pending.

> This folder previously held `1 Pollar react.md` and `2 Pollar core.md`, hand-maintained
> copies of the two package READMEs. They drifted out of sync and were removed in 0.11.1.
> The package READMEs are the single source of truth.

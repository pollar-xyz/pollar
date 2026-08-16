# Moving value: payments, trustlines, swaps, ramps, proofs

Everything here runs against the wallet in the current session. Which path executes depends on the
wallet's `custody` (`internal`, `smart`, `external`), and the SDK hides most of that behind one call.

## The transaction pipeline

```ts
client.buildTx(operation, params, options?); // unsigned XDR from the Pollar API
client.signTx(unsignedXdr, options?); // custodial: server signs; external: adapter signs
client.submitTx(signedXdr); // broadcast
```

Composed shortcuts, in increasing order of convenience:

```ts
client.signAndSubmitTx(unsignedXdr?); // XDR optional, defaults to the tx in TransactionState
client.buildAndSignAndSubmitTx(operation, params, options?); // alias: client.runTx(...)
client.sendPayment(params); // one entry point for a payment
```

```ts
// Stellar payment
await client.sendPayment({ destination: 'G...', amount: '1.5', asset: { type: 'native' } });

// Solana payment: amount in base units (lamports), custodial only for now
await client.sendPayment({ chain: 'SOLANA', destination: '...', amount: '1500000000' });
```

Subscribe to `client.onTransactionStateChange` for progress. External and passkey wallets keep the
granular `building`, `built`, `signing`, `submitting`, `success` transitions. Custodial wallets take a
single round trip and emit one compound `building-signing-submitting` step, so if the UI needs separate
"Building" / "Signing" / "Submitting" indicators on a custodial flow, call `buildTx`, `signTx`, and
`submitTx` yourself.

Poll the result with `client.getTxStatus(hash)`, which returns
`'PENDING' | 'SUCCESS' | 'FAILED'`.

Smart (passkey) wallets do not use `signTx`. They go through `signAndSubmitTx`, which runs the WebAuthn
ceremony, and they need `passkeySign` injected in the client config.

## Sponsorship (gasless)

Who pays the fee is decided **server-side** from the app's dashboard config, not by the caller. On a
custodial session the backend signs and returns a fee-bumped envelope with the app paying. The client's
only lever is opting out:

```ts
await client.signTx(unsignedXdr); // sponsored per app config
await client.signTx(unsignedXdr, { skipSponsorship: true }); // force the user to pay their own fee
```

## Activating an external account

An external wallet that has never been used on Stellar has no on-chain account. `createAccount()`
builds a sponsored `createAccount` server-side (the app's sponsor wallet pays base reserve and fee),
signs the sponsor, then has the user's own wallet add the new-account signature and broadcasts.

```ts
const wallet = client.getWallet();
if (wallet?.custody === 'external' && wallet.existsOnStellar === false) {
  await client.createAccount();
}
```

Not applicable to custodial wallets, which are created server-side at login, nor to smart wallets.
Trustlines remain a separate step.

## Trustlines

```ts
await client.setTrustline({ code: 'USDC', issuer: 'GA5Z...' }); // establish
await client.setTrustline({ code: 'USDC', issuer: 'GA5Z...' }, { limit: '0' }); // remove
await client.setTrustline(asset, { skipSponsorship: true }); // force self-pay change_trust
```

Routing is by sponsorship flag, not by wallet type: custodial wallets hit the trustline endpoint where
the server sponsors or self-pays and submits; external wallets co-sign whichever XDR the build endpoint
returns. Smart wallets do not use classic trustlines at all.

To render the app's assets against the wallet's on-chain trustline state:

```ts
await client.refreshAssets();
const assets = client.getEnabledAssetsState();
```

## Swaps

`getSwapQuote` returns one priced route per venue (SDEX, Soroswap, Aquarius), each carrying a ready to
run build payload. `swap` establishes any missing trustline on the buy asset unless
`autoTrustline: false`, then executes.

```ts
const quotes = await client.getSwapQuote({
  sellAsset: 'XLM',
  buyAsset: 'USDC:GA5Z...',
  amount: '25',
  provider: 'auto',
  slippageBps: 50,
});

const outcome = await client.swap(quotes[0]);
```

Which venues an app offers comes from its own `GET /swap/config`, so quote first and let the user pick
rather than hardcoding a venue. A prebuilt XDR quote (Soroswap) is signed and submitted directly; an
operation plus params quote (Aquarius, SDEX) runs through the `runTx` pipeline. Either way
`onTransactionStateChange` fires. Slippage is enforced on-chain through `minReceived`. Smart wallets
are not supported yet.

## Earn (yield vaults and lending)

DeFindex vaults and Blend pools sit behind one provider-selected API. An empty provider list means Earn
is switched off for the app, so hide the UI entirely.

```ts
const providers = await client.getEarnProviders(); // [] means Earn is disabled
const opportunities = await client.getEarnOpportunities('blend'); // each carries a live APY
const position = await client.getEarnPosition({ provider: 'blend', opportunity: opportunities[0].id });

await client.earnDeposit({ provider: 'blend', opportunity: opportunities[0].id, amount: '100' });
await client.earnWithdraw({ provider: 'blend', opportunity: opportunities[0].id, amount: position.withdrawable });
```

Units differ per side: the deposit `amount` is the underlying asset amount, while the withdraw `amount`
is in the position's `withdrawUnit` (asset amount for Blend, share count for DeFindex). Smart wallets
are not supported yet.

## Fiat ramps (SEP-24)

```ts
const quote = await client.getRampsQuote(query);
const onramp = await client.createOnRamp(body);
const status = await client.pollRampTransaction(onramp.txId);
```

Custodial wallets get a `kycUrl` to open. External wallets get a `pendingSignature` to sign and resume
through `submitRampSignature(txId, body)`. Off-ramps additionally need `completeWithdraw(txId)`. The
rest of the surface: `getRampCountries`, `createOffRamp`, `getRampTransaction`.

KYC has its own methods: `getKycProviders(country)`, `startKyc(body)`, `getKycStatus(providerId?)`,
`pollKycStatus(providerId)`, `resolveKyc(providerId, level?)`.

## Ownership proofs (SEP-53 and SEP-10)

`client.stellar` namespaces the Stellar-specific proof standards. Each method dispatches by wallet
type: external wallets sign client-side through their adapter, custodial wallets sign server-side, and
smart wallets return an error outcome because a C-address has no classic ed25519 key to prove.

```ts
// SEP-53: prove ownership by signing an arbitrary message
const proof = await client.stellar.sep53.signMessage('verify me');
// { status: 'signed', signature, signerAddress, scheme: 'sep53' } | { status: 'error', details?, code? }

// SEP-10: sign a verifier-issued web-auth challenge
const auth = await client.stellar.sep10.sign({
  challengeXdr,
  homeDomains: 'verifier.example.com', // optional, enables full SEP-10 validation on the custodial path
  webAuthDomain: 'auth.verifier.example.com',
});
// { status: 'signed', signedXdr, signerAddress } | { status: 'error', details?, code? }
```

`signature` is base64 ed25519 over the SEP-53 digest
(`SHA-256("Stellar Signed Message:\n" + message)`), produced identically on both paths, and `scheme` is
always `sep53`. A verifier can treat custodial and external proofs interchangeably.

Note that Freighter implements the client-side message signing; Albedo has no SEP-53 support.

## Soroban auth entries

```ts
await client.signAuthEntry(entryXdr, { validUntilLedger });
```

Emits no transaction state, so a UI subscribed to `onTransactionStateChange` is not left stuck on
`signing`.

## Distribution rules

```ts
const rules = await client.listDistributionRules();
await client.claimDistributionRule(body);
```

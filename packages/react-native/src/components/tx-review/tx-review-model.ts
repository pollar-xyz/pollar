import { fromBaseUnits, type TxBuildContent, type WalletChain } from '@pollar/core';
import type { TxReviewCopy } from './tx-review-copy';

/** One end of the flow: a wallet, an account or a contract, and what it sends or gets. */
export interface TxParty {
  chain?: WalletChain;
  asset?: string;
  amount?: string;
  /** The amount is a floor: a swap delivers at least it. */
  minimum?: boolean;
  address?: string;
  label?: string;
  /** One of the user's own wallets. */
  self?: boolean;
}

export interface TxDetailRow {
  label: string;
  value: string;
  /** What the copy button copies; the row has none when absent. */
  copyValue?: string;
  mono?: boolean;
}

export interface TxReviewData {
  /** The action in plain words: what a user without crypto background reads first. */
  title: string;
  kind: 'send' | 'bridge' | 'approve' | 'swap' | 'payment' | 'create_account' | 'other';
  from?: TxParty;
  to?: TxParty;
  /**
   * Who pays the network fee: after the signature, as the platform reported it;
   * before, only when the transaction itself makes the app pay (`appPaysFee`).
   */
  fee?: { sponsored: boolean };
  rows: TxDetailRow[];
  raw?: string;
  hash?: { value: string; explorerUrl: string | null };
}

const CHAINS = new Set<WalletChain>(['STELLAR', 'POLYGON', 'SOLANA']);
const asChain = (value: unknown): WalletChain | undefined =>
  typeof value === 'string' && CHAINS.has(value as WalletChain) ? (value as WalletChain) : undefined;
const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : typeof value === 'number' ? String(value) : undefined;

export function shortAddress(address: string): string {
  return address.length <= 12 ? address : `${address.slice(0, 4)}...${address.slice(-4)}`;
}

/** A provider slug (`mesadepagos`) or a venue constant (`UNISWAP_V3`) as a name. */
function displayName(label: string): string {
  if (/[A-Z]/.test(label) && /[a-z]/.test(label)) return label;
  return label
    .toLowerCase()
    .split(/[_\s-]+/)
    .map((word) => (word ? word[0]!.toUpperCase() + word.slice(1) : word))
    .join(' ');
}

const withAsset = (party: TxParty | undefined) => [party?.amount, party?.asset].filter(Boolean).join(' ');

function partyRow(label: string, party: TxParty | undefined, copy: TxReviewCopy): TxDetailRow | null {
  if (!party?.address && !party?.label) return null;
  const chain = party.chain ? `${copy.chains[party.chain]} ` : '';
  const name = party.label ? `${displayName(party.label)} ` : '';
  return party.address
    ? { label, value: `${chain}${name}${party.address}`.trim(), copyValue: party.address, mono: true }
    : { label, value: `${chain}${name}`.trim() };
}

function titleOf(data: Pick<TxReviewData, 'kind' | 'from' | 'to'>, fallback: string, copy: TxReviewCopy): string {
  const { from, to } = data;
  switch (data.kind) {
    case 'send':
      return from?.amount ? copy.titles.send(withAsset(from)) : fallback;
    case 'bridge':
      return from?.amount && to?.chain ? copy.titles.bridge(withAsset(from), copy.chains[to.chain]) : fallback;
    case 'approve':
      return from?.asset && to?.label ? copy.titles.approve(from.asset, displayName(to.label)) : fallback;
    case 'swap':
      return from?.asset && to?.asset ? copy.titles.swap(from.asset, to.asset) : fallback;
    case 'payment':
      return from?.amount && to?.label ? copy.titles.payment(withAsset(from), displayName(to.label)) : fallback;
    case 'create_account':
      return copy.titles.createAccount;
    default:
      return fallback;
  }
}

/** The ramp step's `details.flow` (sdk-api `RampStepFlow`), when the request carries a well-formed one. */
function rampFlow(details: Record<string, unknown>) {
  const flow = details.flow as
    | { kind?: unknown; from?: Record<string, unknown>; to?: Record<string, unknown>; via?: unknown }
    | undefined;
  if (!flow || typeof flow !== 'object' || !flow.from || !flow.to) return null;
  const kind = flow.kind;
  if (kind !== 'bridge' && kind !== 'approve' && kind !== 'swap' && kind !== 'payment') return null;
  const party = (p: Record<string, unknown>): TxParty => {
    const out: TxParty = {};
    const chain = asChain(p.chain);
    if (chain) out.chain = chain;
    for (const key of ['asset', 'amount', 'address', 'label'] as const) {
      const value = asString(p[key]);
      if (value) out[key] = value;
    }
    if (p.minimum === true) out.minimum = true;
    return out;
  };
  const from = { ...party(flow.from), self: true };
  // A bridge and a swap land back in the user's own wallets.
  const to = { ...party(flow.to), self: kind === 'bridge' || kind === 'swap' };
  return { kind: kind as 'bridge' | 'approve' | 'swap' | 'payment', from, to, via: asString(flow.via) };
}

/** A base-unit amount with `decimals` and `symbol` next to it, as the user reads it. */
function readableAmount(details: Record<string, unknown>): { amount: string; symbol: string } | null {
  const { amount, decimals, symbol } = details;
  if (typeof amount !== 'string' || typeof decimals !== 'number' || typeof symbol !== 'string') return null;
  try {
    return { amount: fromBaseUnits(amount, decimals), symbol };
  } catch {
    return null;
  }
}

export interface SigningRequestParts {
  chain: WalletChain;
  /** `mainnet` or `testnet`, shown next to the chain in the details. */
  network?: string | undefined;
  operation?: string | undefined;
  /** The server's one-line description of the request. */
  summary?: string | undefined;
  details?: Record<string, unknown> | undefined;
  /** The address that signs: the user's wallet on `chain`. */
  signWith?: string | undefined;
  raw?: string | undefined;
  hash?: { value: string; explorerUrl: string | null } | undefined;
  /** The title when the review has no words for the action: the operation's name. */
  fallbackTitle: string;
  /** Rows the caller adds at the end (a cosign request's expiry). */
  extraRows?: TxDetailRow[];
  /** The platform read the payload: its fee is charged to the app's wallet, so the app pays or nothing lands. */
  appPaysFee?: boolean | undefined;
}

/** A cosign request or a confirmation prompt, as the review draws it. */
export function reviewFromRequest(parts: SigningRequestParts, copy: TxReviewCopy): TxReviewData {
  const details = parts.details ?? {};
  const flow = rampFlow(details);
  const rows: TxDetailRow[] = [];
  let data: Pick<TxReviewData, 'kind' | 'from' | 'to'>;
  let via: string | undefined;

  if (flow) {
    data = { kind: flow.kind, from: flow.from, to: flow.to };
    via = flow.via;
  } else {
    const destination = asString(details.destination) ?? asString(details.to);
    const readable = readableAmount(details);
    const asset = readable?.symbol ?? asString(details.asset) ?? asString(details.assetCode) ?? asString(details.symbol);
    const amount = readable?.amount ?? asString(details.amount);
    const isTransfer = parts.operation === 'payment' || parts.operation === 'transfer';
    if (isTransfer && destination) {
      data = {
        kind: 'send',
        from: {
          chain: parts.chain,
          self: true,
          ...(asset ? { asset } : {}),
          ...(amount ? { amount } : {}),
          ...(parts.signWith ? { address: parts.signWith } : {}),
        },
        to: { chain: parts.chain, address: destination },
      };
    } else if (parts.operation === 'create_account' && destination) {
      data = {
        kind: 'create_account',
        from: { chain: parts.chain, self: true, ...(parts.signWith ? { address: parts.signWith } : {}) },
        to: { chain: parts.chain, address: destination, label: copy.newAccount },
      };
    } else {
      data = { kind: 'other' };
      if (asset) rows.push({ label: copy.rows.asset, value: asset });
      if (amount) rows.push({ label: copy.rows.amount, value: amount });
    }
  }

  if (parts.summary) rows.unshift({ label: copy.rows.description, value: parts.summary });
  rows.push({
    label: copy.rows.network,
    value: [copy.chains[data.from?.chain ?? parts.chain], parts.network].filter(Boolean).join(' '),
  });
  const fromRow = partyRow(copy.rows.from, data.from ?? (parts.signWith ? { address: parts.signWith } : undefined), copy);
  if (fromRow) rows.push(fromRow);
  const toRow = partyRow(copy.rows.to, data.to, copy);
  if (toRow) rows.push(toRow);
  if (data.kind !== 'other' && data.from?.amount) rows.push({ label: copy.rows.amount, value: withAsset(data.from) });
  if (data.kind === 'swap' && data.to?.amount)
    rows.push({ label: data.to.minimum ? copy.rows.receiveMin : copy.rows.amount, value: withAsset(data.to) });
  if (via) rows.push({ label: copy.rows.via, value: displayName(via) });
  const contract = asString(details.contractId);
  if (contract) rows.push({ label: copy.rows.contract, value: contract, copyValue: contract, mono: true });
  const method = asString(details.method);
  if (method) rows.push({ label: copy.rows.method, value: method, mono: true });

  if (parts.appPaysFee) rows.push({ label: copy.rows.fee, value: copy.rows.feeCovered });
  rows.push(...(parts.extraRows ?? []));

  return {
    ...data,
    title: titleOf(data, parts.fallbackTitle, copy),
    ...(parts.appPaysFee ? { fee: { sponsored: true } } : {}),
    rows,
    ...(parts.raw ? { raw: parts.raw } : {}),
    ...(parts.hash ? { hash: parts.hash } : {}),
  };
}

/** `"1.5 USDC"` into its amount and asset. */
function splitAmount(text: string | undefined): { amount: string; asset?: string } | undefined {
  if (!text) return undefined;
  const [amount, ...rest] = text.trim().split(/\s+/);
  if (!amount) return undefined;
  return rest.length ? { amount, asset: rest.join(' ') } : { amount };
}

/** The build's English line labels the review has words for; any other stays as the server wrote it. */
function buildLabel(label: string, copy: TxReviewCopy): string {
  const known: Record<string, string> = {
    From: copy.rows.from,
    To: copy.rows.to,
    Amount: copy.rows.amount,
    Asset: copy.rows.asset,
    Contract: copy.rows.contract,
    Method: copy.rows.method,
    'Receive min': copy.rows.receiveMin,
  };
  return known[label] ?? label;
}

/**
 * A transaction the client built, as the review draws it. The build answers
 * its summary as `Label: value` lines; the known labels become the flow, and
 * every line stays in the details as the server wrote it.
 */
export function reviewFromBuild(
  build: TxBuildContent,
  copy: TxReviewCopy,
  fallbackTitle: string,
  hash?: { value: string; explorerUrl: string | null },
  /** Who paid the fee, from the sign or submit answer; undefined before signing. */
  sponsored?: boolean,
): TxReviewData {
  const lines = new Map<string, string>();
  for (const line of build.summary.lines) {
    const at = line.indexOf(': ');
    if (at > 0) lines.set(line.slice(0, at), line.slice(at + 2));
  }
  const chain: WalletChain = asChain((build as { chain?: unknown }).chain) ?? 'STELLAR';
  let data: Pick<TxReviewData, 'kind' | 'from' | 'to'> = { kind: 'other' };
  const from = lines.get('From') ?? lines.get('Funder');
  if (lines.has('Send') && lines.has('Receive min')) {
    const sent = splitAmount(lines.get('Send'));
    const received = splitAmount(lines.get('Receive min'));
    data = {
      kind: 'swap',
      from: { chain, self: true, ...sent, ...(from ? { address: from } : {}) },
      to: { chain, minimum: true, ...received, ...(lines.get('To') ? { address: lines.get('To')! } : {}) },
    };
  } else if (lines.has('To') && lines.has('Amount')) {
    data = {
      kind: 'send',
      from: { chain, self: true, ...splitAmount(lines.get('Amount')), ...(from ? { address: from } : {}) },
      to: { chain, address: lines.get('To')! },
    };
  } else if (lines.has('New account')) {
    data = {
      kind: 'create_account',
      from: { chain, self: true, ...splitAmount(lines.get('Starting balance')), ...(from ? { address: from } : {}) },
      to: { chain, address: lines.get('New account')!, label: copy.newAccount },
    };
  }

  const rows: TxDetailRow[] = [
    { label: copy.rows.network, value: `${copy.chains[chain]} ${build.summary.network}` },
    ...build.summary.lines.map((line): TxDetailRow => {
      const at = line.indexOf(': ');
      if (at <= 0) return { label: '', value: line };
      const value = line.slice(at + 2);
      const label = line.slice(0, at);
      const isAddress = /^[GCM][A-Z2-7]{55,68}$/.test(value) || /^0x[0-9a-fA-F]{40}$/.test(value);
      return { label: buildLabel(label, copy), value, ...(isAddress ? { copyValue: value, mono: true } : {}) };
    }),
    { label: copy.rows.fee, value: sponsored ? copy.rows.feeCovered : build.summary.fee },
  ];

  return {
    ...data,
    title: titleOf(data, build.summary.title || fallbackTitle, copy),
    rows,
    ...('unsignedXdr' in build && build.unsignedXdr ? { raw: build.unsignedXdr } : {}),
    ...(hash ? { hash } : {}),
    ...(sponsored !== undefined ? { fee: { sponsored } } : {}),
  };
}

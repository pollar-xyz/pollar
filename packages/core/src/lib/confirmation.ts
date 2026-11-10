import type { ConfirmationPolicy, ConfirmationRequest } from '../types';

/** The app's dashboard setting, as `GET /applications/config` sends it. */
export interface AppSignConfirmation {
  mode: 'PROMPT' | 'WINDOW' | 'AUTO';
  windowSeconds: number;
  maxUsd: string;
}

/** A USD price, named the way a payment names its asset (`GET /prices/usd`). */
export interface UsdPrice {
  chain: 'STELLAR' | 'SOLANA' | 'POLYGON';
  asset: string;
  decimals?: number;
  usd: string;
}

/** The dashboard setting as a policy; no setting (or none readable) asks for every signature. */
export function policyOfApp(app: AppSignConfirmation | null | undefined): ConfirmationPolicy {
  if (!app || app.mode === 'PROMPT') return 'prompt';
  if (app.mode === 'AUTO') return 'auto';
  const maxUsd = Number(app.maxUsd);
  if (!(app.windowSeconds > 0) || !(maxUsd > 0)) return 'prompt';
  return { window: { seconds: app.windowSeconds, maxUsd } };
}

const RANK = (p: ConfirmationPolicy) => (p === 'prompt' ? 2 : p === 'auto' ? 0 : 1);

/** The stricter of two policies; between two windows, the shorter time and the lower total. */
export function stricterPolicy(a: ConfirmationPolicy, b: ConfirmationPolicy): ConfirmationPolicy {
  if (typeof a === 'object' && typeof b === 'object') {
    return {
      window: { seconds: Math.min(a.window.seconds, b.window.seconds), maxUsd: Math.min(a.window.maxUsd, b.window.maxUsd) },
    };
  }
  return RANK(a) >= RANK(b) ? a : b;
}

/**
 * The policy a signature runs under: the dashboard's when the app's code sets
 * none, the stricter of the two when it does.
 */
export function effectivePolicy(
  fromCode: ConfirmationPolicy | undefined,
  fromApp: AppSignConfirmation | null | undefined,
): ConfirmationPolicy {
  const app = policyOfApp(fromApp);
  return fromCode === undefined ? app : stricterPolicy(fromCode, app);
}

function priceOf(prices: readonly UsdPrice[], chain: UsdPrice['chain'], asset: string): UsdPrice | undefined {
  return prices.find((p) => p.chain === chain && p.asset === asset);
}

/**
 * What a signature moves, in USD, or null when it cannot be read: only a
 * payment the SDK builds itself names its asset and amount, and so does an
 * auth entry for a token transfer whose contract is a priced Stellar asset
 * (`details.assetKey`). Anything else (a raw transaction, a swap, a contract
 * call) is null and always asks.
 */
export function usdValueOf(
  request: Pick<ConfirmationRequest, 'kind' | 'network' | 'operation' | 'details'>,
  prices: readonly UsdPrice[],
): number | null {
  if (request.kind === 'sign_auth_entry' && request.operation === 'transfer' && request.details) {
    const { amount, assetKey } = request.details as { amount?: unknown; assetKey?: unknown };
    if (typeof amount !== 'string' || !/^\d+(\.\d+)?$/.test(amount) || typeof assetKey !== 'string') return null;
    const price = priceOf(prices, 'STELLAR', assetKey);
    return price ? Number(amount) * Number(price.usd) : null;
  }
  if (request.kind !== 'build_sign_submit' || request.operation !== 'payment' || !request.details) return null;
  const { amount, asset, mint } = request.details as { amount?: unknown; asset?: unknown; mint?: unknown };
  if (typeof amount !== 'string' || !/^\d+(\.\d+)?$/.test(amount)) return null;

  if (request.network === 'STELLAR') {
    const a = asset as { type?: string; code?: string; issuer?: string } | undefined;
    const key = a?.type === 'native' ? 'native' : a?.code && a.issuer ? `${a.code}:${a.issuer}` : null;
    const price = key ? priceOf(prices, 'STELLAR', key) : undefined;
    return price ? Number(amount) * Number(price.usd) : null;
  }

  if (!/^\d+$/.test(amount)) return null;
  const price = priceOf(prices, request.network, typeof mint === 'string' && mint ? mint : 'native');
  if (!price || price.decimals === undefined) return null;
  return (Number(amount) / 10 ** price.decimals) * Number(price.usd);
}

/**
 * The window a confirmed signature opens: until it closes, signatures whose
 * USD values add up to at most the policy's total sign without asking.
 */
export class ConfirmationWindow {
  private openedAt: number | null = null;
  private spentUsd = 0;

  isOpen(seconds: number, now: number): boolean {
    return this.openedAt !== null && now - this.openedAt < seconds * 1000;
  }

  /** Counts a signature against the open window; false when it does not fit (or its value is unknown). */
  take(usd: number | null, maxUsd: number): boolean {
    if (usd === null || !Number.isFinite(usd) || usd < 0 || this.spentUsd + usd > maxUsd) return false;
    this.spentUsd += usd;
    return true;
  }

  open(now: number): void {
    this.openedAt = now;
    this.spentUsd = 0;
  }

  close(): void {
    this.openedAt = null;
    this.spentUsd = 0;
  }
}

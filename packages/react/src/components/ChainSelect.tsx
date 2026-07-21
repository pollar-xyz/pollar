'use client';

// ─── Shared network picker ────────────────────────────────────────────────────
// One chain <select> used by the Send, Wallet Balance and Assets modals. The
// options are the chains the user actually holds a wallet on (`getWallets()`),
// so every option always resolves to an address; the parent defaults to the
// first one. Everything else in those modals — address, assets, balances — is
// filtered by whatever is picked here.
// ─────────────────────────────────────────────────────────────────────────────

import type { WalletChain, WalletInfo } from '@pollar/core';
import './send-modal/SendModal.css';
import './shared.css';

const CHAIN_LABEL: Record<string, string> = {
  STELLAR: 'Stellar',
  POLYGON: 'Polygon',
  SOLANA: 'Solana',
};

/**
 * The chain a record lives on, with the legacy shape folded in: sessions and
 * balance rows minted before multi-chain carry no `chain` and are Stellar by
 * definition, so absent counts as STELLAR rather than as "unknown".
 */
export function resolveChain(chain: WalletChain | undefined): WalletChain {
  return chain ?? 'STELLAR';
}

/**
 * The selectable chains — the first is the default everywhere (network picker,
 * the address the wallet button shows). De-duplicated because two wallets on one
 * chain (e.g. a custodial and a linked external Stellar wallet) are still one
 * network choice.
 *
 * `order` is the app's chain list from `/applications/config`, as arranged in the
 * dashboard. When passed it both ORDERS and FILTERS: a chain missing from it is
 * dropped, because the app switched it off and must stop appearing everywhere.
 *
 * Filtering here and not only in the backend is deliberate. `wallets` comes from
 * the session, which is written at login and then persisted for as long as the
 * session lives; `/config` is refetched on every page load. So a chain disabled
 * today disappears on the next reload even for a user who logged in last week
 * and still carries it in their stored session.
 *
 * Without `order` (config still loading) the fallback is the order the backend
 * listed the wallets in.
 */
export function chainsOf(wallets: WalletInfo[], order?: readonly WalletChain[]): WalletChain[] {
  const held: WalletChain[] = [];
  for (const w of wallets) {
    const chain = resolveChain(w.chain);
    if (!held.includes(chain)) held.push(chain);
  }
  if (!order || order.length === 0) return held;

  return order.filter((c) => held.includes(c));
}

/** The address to show for `chain`, or '' when the user has no wallet there. */
export function addressForChain(wallets: WalletInfo[], chain: WalletChain | null): string {
  if (!chain) return '';
  return wallets.find((w) => resolveChain(w.chain) === chain)?.address ?? '';
}

export interface ChainSelectProps {
  label?: string;
  value: WalletChain | null;
  options: WalletChain[];
  onChange: (chain: WalletChain) => void;
  disabled?: boolean;
}

export function ChainSelect({ label = 'Network', value, options, onChange, disabled = false }: ChainSelectProps) {
  // A single-network app gets no picker: one option is not a choice, and the
  // modals would carry a dead control. The parent still defaults to that chain,
  // so everything below stays filtered to it. Matches how the per-row ChainTag
  // is gated on `multichain` elsewhere.
  if (options.length < 2) return null;

  return (
    <div className="pollar-send-field pollar-chain-field">
      <label className="pollar-send-label">{label}</label>
      <select
        className="pollar-input pollar-send-select"
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as WalletChain)}
      >
        {/* Only present before the parent defaults to the first chain; hidden
            from the open dropdown. */}
        {value === null && <option value="" disabled hidden />}
        {options.map((chain) => (
          <option key={chain} value={chain}>
            {CHAIN_LABEL[chain] ?? chain}
          </option>
        ))}
      </select>
    </div>
  );
}

'use client';

// --- Shared network picker ----------------------------------------------------
// One chain picker used by the Send, Wallet Balance and Assets modals. The
// options are the chains the user actually holds a wallet on (`getWallets()`),
// so every option always resolves to an address; the parent defaults to the
// first one. Everything else in those modals - address, assets, balances - is
// filtered by whatever is picked here.
// -----------------------------------------------------------------------------

import { useInheritedLanguage } from '../language-context';
import type { PollarLanguage, WalletChain, WalletInfo } from '@pollar/core';
import { CHAIN_LOGOS } from '../constants';
import { COMMONS_COPY } from './commons-copy';
import { PollarSelect } from './PollarSelect';
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
 * The selectable chains - the first is the default everywhere (network picker,
 * the address the wallet button shows). De-duplicated because two wallets on one
 * chain (e.g. an embedded and a linked external Stellar wallet) are still one
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
  language?: PollarLanguage | undefined;
}

export function ChainSelect({ label, value, options, onChange, disabled = false, language: languageProp }: ChainSelectProps) {
  const language = useInheritedLanguage(languageProp);
  // A single-network app gets no picker: one option is not a choice, and the
  // modals would carry a dead control. The parent still defaults to that chain,
  // so everything below stays filtered to it. Matches how the per-row ChainTag
  // is gated on `multichain` elsewhere.
  if (options.length < 2) return null;

  return (
    <div className="pollar-send-field pollar-chain-field">
      <label className="pollar-send-label">{label ?? COMMONS_COPY[language].network}</label>
      <PollarSelect
        value={value ?? ''}
        disabled={disabled}
        aria-label={label ?? COMMONS_COPY[language].network}
        onChange={(chain) => onChange(chain as WalletChain)}
        options={options.map((chain) => ({
          value: chain,
          label: CHAIN_LABEL[chain] ?? chain,
          icon: <ChainLogo chain={chain} />,
        }))}
      />
    </div>
  );
}

/** A chain's logo, sized for a pill or a picker option. */
export function ChainLogo({ chain }: { chain: string }) {
  const src = CHAIN_LOGOS[chain as keyof typeof CHAIN_LOGOS];
  return src ? <img className="pollar-network-logo" src={src} alt="" aria-hidden /> : null;
}

export interface NetworkPillProps {
  value: WalletChain | null;
  options: readonly WalletChain[];
  onChange?: (chain: WalletChain) => void;
  /** Once a flow runs the network is a label: switching it would change everything the flow is doing. */
  locked?: boolean;
  disabled?: boolean;
  language?: PollarLanguage | undefined;
}

/**
 * The modal's network, next to its title and out of the form: switching it
 * changes every asset, balance and route the modal shows. A pill on the form,
 * a label once a flow runs, nothing for an app on a single network.
 */
export function NetworkPill({
  value,
  options,
  onChange,
  locked = false,
  disabled = false,
  language: languageProp,
}: NetworkPillProps) {
  const language = useInheritedLanguage(languageProp);
  if (!value || options.length < 2) return null;
  const label = COMMONS_COPY[language].network;
  if (locked) {
    return (
      <span className="pollar-network-tag" title={label}>
        <ChainLogo chain={value} />
        {CHAIN_LABEL[value] ?? value}
      </span>
    );
  }
  return (
    <PollarSelect
      className="pollar-network-pill"
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(chain) => onChange?.(chain as WalletChain)}
      options={options.map((chain) => ({
        value: chain,
        label: CHAIN_LABEL[chain] ?? chain,
        icon: <ChainLogo chain={chain} />,
      }))}
    />
  );
}

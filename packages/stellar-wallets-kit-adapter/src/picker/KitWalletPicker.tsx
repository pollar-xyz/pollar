'use client';

import { type ISupportedWallet, type ModuleInterface, type Networks, StellarWalletsKit } from '@creit.tech/stellar-wallets-kit';
import type { RenderWalletsProps } from '@pollar/react';
import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { ensureInit, type KitPickerOptions } from '../factory';

export interface KitWalletPickerProps extends RenderWalletsProps {
  network?: Networks;
  modules?: ModuleInterface[];
  picker?: KitPickerOptions;
}

const CONNECTING_STEPS = new Set(['connecting_wallet', 'authenticating_wallet', 'authenticating']);

export function KitWalletPicker({ onConnect, authState, network, modules, picker = {} }: KitWalletPickerProps) {
  const [wallets, setWallets] = useState<ISupportedWallet[] | null>(null);
  const warnedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    const initOpts: { network?: Networks; modules?: ModuleInterface[] } = {};
    if (network !== undefined) initOpts.network = network;
    if (modules !== undefined) initOpts.modules = modules;
    ensureInit(initOpts);
    StellarWalletsKit.refreshSupportedWallets()
      .then((list) => {
        if (cancelled) return;
        setWallets(list);
      })
      .catch((err) => {
        console.error('[KitWalletPicker] refreshSupportedWallets failed', err);
        if (!cancelled) setWallets([]);
      });
    return () => {
      cancelled = true;
    };
  }, [network, modules]);

  const filtered = useMemo(() => {
    if (!wallets) return null;
    const { wallets: allowedIds, order = 'as-given', showInstalledOnly = false, labels } = picker;

    const byId = new Map(wallets.map((w) => [w.id, w]));
    let result: ISupportedWallet[];

    if (allowedIds && allowedIds.length > 0) {
      // Honor `as-given` order from the allowedIds; warn once for unknowns.
      result = [];
      for (const id of allowedIds) {
        const w = byId.get(id);
        if (w) {
          result.push(w);
        } else if (!warnedRef.current.has(id)) {
          warnedRef.current.add(id);
          console.warn(`[KitWalletPicker] wallet id "${id}" not present in the active kit modules — skipped`);
        }
      }
    } else {
      result = [...wallets];
    }

    if (showInstalledOnly) {
      result = result.filter((w) => w.isAvailable);
    }

    if (order === 'alphabetical') {
      result = [...result].sort((a, b) => labelOf(a, labels).localeCompare(labelOf(b, labels)));
    } else if (order === 'installed-first') {
      result = [...result].sort((a, b) => {
        if (a.isAvailable === b.isAvailable) return 0;
        return a.isAvailable ? -1 : 1;
      });
    }
    // 'as-given' keeps whatever order we built above.

    return result;
  }, [wallets, picker]);

  const isBusy = CONNECTING_STEPS.has(authState.step);
  const layout = picker.layout ?? 'grid';
  const theme = picker.theme;
  const rootStyle: CSSProperties = {
    display: layout === 'list' ? 'flex' : 'grid',
    flexDirection: layout === 'list' ? 'column' : undefined,
    gridTemplateColumns: layout === 'grid' ? 'repeat(auto-fill, minmax(140px, 1fr))' : undefined,
    gap: '0.5rem',
    width: '100%',
    ...(theme?.accent !== undefined && { ['--pollar-accent' as never]: theme.accent }),
    ...(theme?.mode === 'dark' && { colorScheme: 'dark' as const }),
  };

  // Still loading the wallet list.
  if (filtered === null) {
    return (
      <div role="status" aria-busy="true" style={{ padding: '1rem', textAlign: 'center', fontSize: '0.9rem' }}>
        Loading wallets…
      </div>
    );
  }

  // Empty state: showInstalledOnly hid every wallet, or the filter list is empty.
  if (filtered.length === 0) {
    return (
      <div style={{ padding: '1rem', textAlign: 'center', fontSize: '0.9rem' }}>
        {picker.showInstalledOnly
          ? 'No supported Stellar wallets detected. Install Freighter / xBull / Lobstr to continue.'
          : 'No wallets to show.'}
      </div>
    );
  }

  return (
    <div style={rootStyle}>
      {filtered.map((w) => {
        const label = labelOf(w, picker.labels);
        const disabled = isBusy || (picker.showInstalledOnly ? false : !w.isAvailable);
        return (
          <button
            key={w.id}
            type="button"
            disabled={disabled}
            onClick={() => onConnect(w.id)}
            style={buttonStyle(layout, disabled)}
            title={!w.isAvailable && !picker.showInstalledOnly ? `${label} not detected` : label}
          >
            <img src={w.icon} alt="" width={32} height={32} style={{ borderRadius: 6, opacity: w.isAvailable ? 1 : 0.5 }} />
            <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{label}</span>
            {!w.isAvailable && <span style={{ fontSize: '0.7rem', opacity: 0.6 }}>not installed</span>}
          </button>
        );
      })}
    </div>
  );
}

function labelOf(w: ISupportedWallet, labels: Record<string, string> | undefined): string {
  return labels?.[w.id] ?? w.name;
}

function buttonStyle(layout: 'grid' | 'list', disabled: boolean): CSSProperties {
  const base: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
    background: 'transparent',
    border: '1px solid var(--pollar-border, #e5e7eb)',
    borderRadius: 'var(--pollar-buttons-border-radius, 6px)',
    color: 'var(--pollar-text, inherit)',
    padding: '0.6rem',
    gap: '0.6rem',
  };
  if (layout === 'list') {
    return { ...base, justifyContent: 'flex-start', width: '100%', height: 'var(--pollar-buttons-height, 44px)' };
  }
  return { ...base, flexDirection: 'column', justifyContent: 'center', textAlign: 'center', minHeight: 92 };
}

'use client';

// --- Shared asset picker ------------------------------------------------------
// One asset picker used by both the Send and Swap modals: groups options into
// "App assets" (enabled by the app) and "Other assets" (everything else, incl.
// native XLM), shows a "- X available" suffix, and renders a skeleton shimmer
// while loading. The parent auto-selects the first option, so there is no
// "Select asset" placeholder in the normal flow.
// -----------------------------------------------------------------------------

import { useInheritedLanguage } from '../language-context';
import type { PollarLanguage } from '@pollar/core';
import type { ReactNode } from 'react';
import { COMMONS_COPY } from './commons-copy';
import { PollarSelect } from './PollarSelect';
import './send-modal/SendModal.css';
import './shared.css';

/** A selectable asset, normalized across balance / enabled / catalog records. */
export interface AssetSelectOption {
  /** Stable unique key: `code:issuer` or `code:native`. */
  key: string;
  code: string;
  /** Spendable amount shown as "- X available"; omit to hide the suffix. */
  available?: string | undefined;
  /** App-enabled asset? Drives the App / Other grouping. */
  enabledInApp?: boolean | undefined;
}

interface AssetSelectProps {
  label: string;
  value: string;
  options: AssetSelectOption[];
  onChange: (key: string) => void;
  /** Show a loading indicator instead of the select. */
  loading?: boolean;
  /** When set, `loading` renders a centered spinner + this label inside a
   *  select-shaped box (like the ramp widget) instead of the skeleton shimmer. */
  loadingLabel?: string;
  disabled?: boolean;
  appGroupLabel?: string;
  otherGroupLabel?: string;
  /** Extra content rendered inside the field, below the select (e.g. a
   *  "+ Add a token" toggle). Hidden while loading. */
  children?: ReactNode;
  language?: PollarLanguage | undefined;
}

function formatAmount(value: string): string {
  const n = parseFloat(value);
  return isNaN(n) ? value : n.toLocaleString(undefined, { maximumFractionDigits: 7 });
}

const optionLabel = (o: AssetSelectOption, language: PollarLanguage): string =>
  o.available !== undefined ? COMMONS_COPY[language].assetAvailable(o.code, formatAmount(o.available)) : o.code;

export function AssetSelect({
  label,
  value,
  options,
  onChange,
  loading = false,
  loadingLabel,
  disabled = false,
  appGroupLabel,
  otherGroupLabel,
  children,
  language: languageProp,
}: AssetSelectProps) {
  const language = useInheritedLanguage(languageProp);
  const copy = COMMONS_COPY[language];
  const appAssets = options.filter((o) => o.enabledInApp);
  const otherAssets = options.filter((o) => !o.enabledInApp);

  return (
    <div className="pollar-send-field">
      <label className="pollar-send-label">{label}</label>
      {loading ? (
        loadingLabel ? (
          <div className="pollar-input pollar-select-loading">
            <span className="pollar-spinner pollar-spinner-sm" />
            <span>{loadingLabel}</span>
          </div>
        ) : (
          <div className="pollar-send-skeleton" />
        )
      ) : (
        <PollarSelect
          value={value}
          disabled={disabled}
          aria-label={label}
          onChange={onChange}
          options={[
            {
              label: appGroupLabel ?? copy.appAssets,
              options: appAssets.map((o) => ({ value: o.key, label: optionLabel(o, language) })),
            },
            {
              label: otherGroupLabel ?? copy.otherAssets,
              options: otherAssets.map((o) => ({ value: o.key, label: optionLabel(o, language) })),
            },
          ]}
        />
      )}
      {!loading && children}
    </div>
  );
}

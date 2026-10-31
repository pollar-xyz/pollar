'use client';

// --- Shared amount field --------------------------------------------------------
// The amount input every modal uses: label on the left, "Available: X CODE" on the
// right, and Max + unit inside the input. Presentational: the balance comes in as
// `available` (from `useWalletAvailable` for a wallet asset, or any other
// spendable figure such as an Earn position).
// -----------------------------------------------------------------------------

import { useInheritedLanguage } from '../language-context';
import type { PollarLanguage } from '@pollar/core';
import { COMMONS_COPY } from './commons-copy';
import './send-modal/SendModal.css';
import './shared.css';

interface AmountFieldProps {
  id?: string | undefined;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** The suffix inside the input: an asset code or a fiat currency. */
  unit?: string | undefined;
  /**
   * What can be spent, in `unit`. Undefined hides the hint and Max (a fiat amount,
   * or a balance not read yet); null is a chain that could not be read.
   */
  available?: string | null | undefined;
  /** Replaces filling in the whole `available`, for a max that leaves a fee behind. */
  onMax?: (() => void) | undefined;
  placeholder?: string | undefined;
  disabled?: boolean | undefined;
  language?: PollarLanguage | undefined;
}

// An unreadable chain shows a dash, never 0: a wallet that failed to load must not look empty.
export function formatAvailable(available: string | null): string {
  if (available === null) return '—';
  const n = parseFloat(available);
  return isNaN(n) ? available : n.toLocaleString(undefined, { maximumFractionDigits: 7 });
}

export function AmountField({
  id,
  label,
  value,
  onChange,
  unit,
  available,
  onMax,
  placeholder = '0.00',
  disabled = false,
  language: languageProp,
}: AmountFieldProps) {
  const language = useInheritedLanguage(languageProp);
  const copy = COMMONS_COPY[language];
  const showBalance = available !== undefined;
  const canMax = showBalance && available !== null && parseFloat(available) > 0 && !disabled;

  return (
    <div className="pollar-send-field">
      <div className="pollar-send-label-row">
        <label className="pollar-send-label" htmlFor={id}>
          {label}
        </label>
        {showBalance && (
          <span className="pollar-send-hint">
            {copy.available} {formatAvailable(available)} {unit ?? ''}
          </span>
        )}
      </div>
      <div className="pollar-send-input-shell">
        <input
          id={id}
          className="pollar-input pollar-send-amount-input"
          type="text"
          inputMode="decimal"
          placeholder={placeholder}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          aria-label={id ? undefined : label}
        />
        <div className="pollar-send-input-suffix">
          {showBalance && (
            <button
              type="button"
              className="pollar-send-inline-action"
              disabled={!canMax}
              onClick={() => (onMax ? onMax() : available && onChange(available))}
            >
              {copy.max}
            </button>
          )}
          {unit && <span>{unit}</span>}
        </div>
      </div>
    </div>
  );
}

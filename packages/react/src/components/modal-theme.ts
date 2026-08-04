import type { CSSProperties } from 'react';
import type { PollarStyles } from '../types';

/** Per-app overrides for the modal chrome, configured in the dashboard's
 *  Branding screen. Every field is optional: absent means "use the value the
 *  theme derives", which is what every modal rendered before these existed. */
export interface ModalStyleOverrides {
  /** Card background. Overrides the theme's white / #1a1a1a. */
  backgroundColor?: string | null | undefined;
  /** Body text. Overrides the theme's #111827 / white. Secondary ("muted") text
   *  keeps its theme color, so the two stay distinguishable. */
  textColor?: string | null | undefined;
  /** Fill of the SECONDARY buttons (the wallet / social / provider entries, the
   *  retry button). The primary button is the accent's job. Unset ⇒ the theme's
   *  own surface color, which is what these buttons always used. */
  buttonColor?: string | null | undefined;
  /** Radius of the modal card itself, in px. */
  modalBorderRadius?: number | null | undefined;
  /** Radius of the buttons inside the modal, in px. Independent of the card's. */
  buttonBorderRadius?: number | null | undefined;
}

/** The card radius the modals used before it was configurable (1rem). */
const DEFAULT_MODAL_BORDER_RADIUS = 16;
/** Same, for the buttons. */
const DEFAULT_BUTTON_BORDER_RADIUS = 6;
/** Stacking order of the fixed overlay, before it was configurable. */
const DEFAULT_OVERLAY_Z_INDEX = 50;

/** A configured length, as a CSS px string. Anything that isn't a finite,
 *  non-negative number falls back to `fallback` — a malformed stored value must
 *  not collapse the card's chrome. */
function px(value: number | null | undefined, fallback: number): string {
  return `${typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback}px`;
}

/** A configured color, or the theme's own when unset. Empty string counts as
 *  unset: that's what the dashboard sends when the field is cleared. */
function color(value: string | null | undefined, fallback: string): string {
  return typeof value === 'string' && value.trim() !== '' ? value : fallback;
}

/** `#rgb` / `#rrggbb` as 0-255 channels, or null for anything else (a named
 *  color, a `color-mix()`, a typo). */
function parseHex(value: string): [number, number, number] | null {
  const hex = value.trim().replace(/^#/, '');
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return [Number.parseInt(full.slice(0, 2), 16), Number.parseInt(full.slice(2, 4), 16), Number.parseInt(full.slice(4, 6), 16)];
}

/** Text color that stays legible on `background`. The primary button's label was
 *  hardcoded white, which a light fill (the Amber accent preset, say) turns
 *  invisible — so it follows the fill's luminance instead. Unparseable colors
 *  keep white, the pre-existing behavior. */
export function readableTextOn(background: string): string {
  const rgb = parseHex(background);
  if (!rgb) return '#ffffff';
  // Relative luminance, sRGB coefficients (WCAG). The 0.6 cut lands white on
  // Pollar blue (#005DB4) exactly as before, and dark on a pale fill.
  const [r, g, b] = rgb;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.6 ? '#111827' : '#ffffff';
}

/** How much room a modal gives its header. 'hero' is the identity-forward set
 *  (login, KYC, ramp, the Privy sub-modal): roomier padding and a larger
 *  centered heading. 'compact' is every utility modal (send, balance, history,
 *  …), which keeps the card's own 1.75rem padding. */
export type ModalVariant = 'hero' | 'compact';

/** Theme-derived CSS custom properties shared by every Pollar modal, plus the
 *  per-app overrides on top. One definition so the whole modal family stays
 *  visually in lockstep — a var added here reaches all of them at once. */
export function buildModalCssVars(
  theme: string,
  accentColor: string,
  overrides: ModalStyleOverrides = {},
  variant: ModalVariant = 'compact',
): CSSProperties {
  const isDark = theme === 'dark';
  const textColor = color(overrides.textColor, isDark ? '#ffffff' : '#111827');
  // Only emitted when actually configured. Left out, the secondary buttons fall
  // back inside the CSS to whatever each already used — the theme surface for
  // the filled ones, `transparent` for the ghost one — so an unset field can't
  // flatten those two into the same look.
  const secondaryBg = color(overrides.buttonColor, '');
  return {
    '--pollar-accent': accentColor,
    '--pollar-bg': color(overrides.backgroundColor, isDark ? '#1a1a1a' : '#ffffff'),
    '--pollar-border': isDark ? '#374151' : '#e5e7eb',
    '--pollar-text': textColor,
    '--pollar-muted': isDark ? '#9ca3af' : '#6b7280',
    // The primary button is the accent's, straight up; its label follows the
    // accent's luminance so a pale accent doesn't render white-on-white.
    '--pollar-btn-primary-fg': readableTextOn(accentColor),
    ...(secondaryBg
      ? {
          '--pollar-btn-secondary-bg': secondaryBg,
          '--pollar-btn-secondary-fg': readableTextOn(secondaryBg),
        }
      : {}),
    '--pollar-input-bg': isDark ? '#374151' : '#f9fafb',
    '--pollar-error-bg': isDark ? '#2a1515' : '#fef2f2',
    '--pollar-error-border': isDark ? '#7f1d1d' : '#fecaca',
    '--pollar-error-text': isDark ? '#f87171' : '#dc2626',
    '--pollar-success-text': isDark ? '#4ade80' : '#16a34a',
    '--pollar-modal-border-radius': px(overrides.modalBorderRadius, DEFAULT_MODAL_BORDER_RADIUS),
    '--pollar-buttons-border-radius': px(overrides.buttonBorderRadius, DEFAULT_BUTTON_BORDER_RADIUS),
    '--pollar-buttons-height': '44px',
    '--pollar-input-height': '44px',
    '--pollar-input-border-radius': '0.5rem',
    '--pollar-card-border-radius': '10px',
    ...(variant === 'hero'
      ? {
          '--pollar-modal-padding': '2rem',
          '--pollar-modal-heading-size': '1.375rem',
          '--pollar-modal-subtitle-size': '0.9rem',
        }
      : {}),
  } as CSSProperties;
}

/** Everything a modal wrapper needs to dress itself from the app's branding:
 *  the theme pair its template already took, the overrides to forward to that
 *  template, and the inline style for the fixed overlay behind it. */
export interface ModalChrome {
  theme: string;
  accentColor: string;
  styleOverrides: ModalStyleOverrides;
  overlayStyle: CSSProperties;
}

/** Resolve the branding config into the props/styles a modal wrapper applies.
 *  Called by every `.pollar-overlay` renderer so the z-index and the card
 *  overrides can't drift apart between modals. */
export function modalChrome(styles: PollarStyles): ModalChrome {
  const zIndex = styles.modalZIndex;
  return {
    theme: styles.theme ?? 'light',
    accentColor: styles.accentColor ?? '#005DB4',
    styleOverrides: {
      backgroundColor: styles.backgroundColor,
      textColor: styles.textColor,
      buttonColor: styles.buttonColor,
      modalBorderRadius: styles.modalBorderRadius,
      buttonBorderRadius: styles.buttonBorderRadius,
    },
    overlayStyle: {
      '--pollar-overlay-z-index': typeof zIndex === 'number' && Number.isFinite(zIndex) ? zIndex : DEFAULT_OVERLAY_Z_INDEX,
    } as CSSProperties,
  };
}

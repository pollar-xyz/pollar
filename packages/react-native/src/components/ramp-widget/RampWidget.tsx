import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Linking,
  Image,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { SvgXml } from 'react-native-svg';
import type {
  CosignCustody,
  PollarClient,
  RampAsset,
  RampSigningHandler,
  RampWalletStep,
  RampDirection,
  RampField,
  RampFiat,
  RampOrder,
  RampQuote,
  RampQuoteRejection,
  RampQuoteRequirement,
  RampRoute,
} from '@pollar/core';
import {
  appUnavailableMessage,
  languageFromTag,
  type PollarLanguage,
  assertRampStellarSigner,
  describeRampAction,
  isPollarApiError,
  rampCountries,
  rampLegStatus,
  rampLegNote,
  rampLegTimeLeft,
  rampLegTitle,
  rampNextApproval,
  rampStepStatusText,
  rampStepTitle,
  rampFieldError,
  rampFieldValid,
  rampNoRouteText,
  rampOrderReceive,
  rampOrderStopped,
  rampQuoteFields,
  rampRailLabel,
  rampOrderResolutionText,
  rampTrustlineAsset,
  rampTrustlineErrorText,
} from '@pollar/core';
import { usePollar } from '../../context';
import { useWalletAvailable } from '../../useWalletAvailable';
import { AmountField } from '../AmountField';
import { PollarOverlay } from '../commons';
import { deviceLanguageTag } from '../requirement-form-modal/form-fields';
import { useModalLanguage } from '../../language';
import { RejectedRouteDisplay, RouteDisplay } from './RouteDisplay';
import { KycModal } from '../kyc-modal/KycModal';
import { RequirementFormModal } from '../requirement-form-modal/RequirementFormModal';
import { RegistryCheckModal } from '../registry-check-modal/RegistryCheckModal';
import { ProviderRegistrationModal } from '../provider-registration-modal/ProviderRegistrationModal';

export type RampStep = 'input' | 'loading_quote' | 'select_route' | 'contact' | 'status' | 'error';

/** The trustline a dropped route asks for, as the widget tracks it while it is added. */
function trustKey(rejection: RampQuoteRejection): string | null {
  const asset = rampTrustlineAsset(rejection);
  return asset ? `${asset.code}:${asset.issuer}` : null;
}

/** "a", "a and b", "a, b and c" - for naming what a step is asking for. */
function listOf(items: string[]): string {
  const last = items[items.length - 1];
  if (last === undefined) return 'a few details';
  if (items.length === 1) return last;
  return `${items.slice(0, -1).join(', ')} and ${last}`;
}

/** Ramp failures a user can act on, by API code. */
const RAMP_ERROR_MESSAGES: Record<string, string> = {
  SDK_RAMPS_QUOTE_EXPIRED: 'This quote expired. Find a route again.',
  SDK_RAMPS_QUOTE_NOT_FOUND: 'This quote is no longer available. Find a route again.',
  SDK_RAMPS_ACTION_STALE: 'This step changed. It was refreshed; try again.',
  SDK_RAMPS_TX_NOT_FOUND: 'This operation was not found.',
  SDK_RAMPS_WALLET_NOT_READY: 'Approve the new wallet account on your device, then try again.',
};

/** The text for a failed ramp call: an app that cannot serve it, a known code, the server's reason, or the fallback. */
function rampErrorMessage(error: unknown, fallback: string): string {
  const unavailable = appUnavailableMessage(error);
  if (unavailable) return unavailable;
  if (isPollarApiError(error)) {
    const known = RAMP_ERROR_MESSAGES[error.code];
    if (known) return known;
    const message = error.body.message;
    if (typeof message === 'string' && message && !/^[A-Z0-9_]+$/.test(message)) return message;
  }
  return fallback;
}

/** A route's identity across quotes: quoting again gives the same route a new quote id. */
function routeKey(quote: RampQuote): string {
  const node = (n: RampQuote['legs'][number]['from']) =>
    n.kind === 'asset' ? `${n.code}:${n.chain}` : `${n.currency}:${n.rail}`;
  return quote.legs.map((leg) => `${leg.kind}:${node(leg.from)}>${node(leg.to)}`).join('|');
}

/** An exact decimal, as the API takes amounts: "10", "10.5", never "1e3" or "-2". */
const DECIMAL = /^\d+(\.\d+)?$/;

/**
 * Signs a leg, lending the user's own connected wallet as the ramp signer while
 * it does: the wallet (Freighter, Phantom...) shows the transaction and the
 * user approves it there. Core keeps no built-in ramp signer; an app that
 * registered its own signer for a chain keeps it, and the widget's are released
 * once the leg is signed.
 */
async function signLegWithWallet(client: PollarClient, orderId: string, actionId: string): Promise<RampOrder> {
  const lent: Array<() => void> = [];
  const lend = (chain: 'STELLAR' | 'SOLANA', encoding: string, handler: RampSigningHandler) => {
    try {
      lent.push(client.registerRampSigningHandler(chain, encoding, handler));
    } catch {
      // The app registered its own signer for this chain: that one signs.
    }
  };
  lend('STELLAR', 'xdr', async (action) => {
    const wallet = client.getWallet();
    if (!wallet) throw new Error('Connect the Stellar wallet this step was built for.');
    assertRampStellarSigner(action, wallet.address);
    const outcome = await client.signTx(action.payload.value);
    if (client.getWallet()?.address !== wallet.address)
      throw new Error('The connected wallet changed. Refresh before signing.');
    if (outcome.status === 'signed') return outcome.signedXdr;
    throw new Error(
      outcome.status === 'error' ? (outcome.message ?? outcome.details ?? 'Signing was cancelled.') : 'Signing was cancelled.',
    );
  });
  lend('SOLANA', 'solana-v0-json', async (action) => {
    // The server built the transfer from the user's wallet; sign only one from the wallet connected now.
    const payload = JSON.parse(action.payload.value) as { from?: string; unsignedTransaction?: string };
    const solanaWallet = () => client.getWallets().find((w) => w.chain === 'SOLANA' && w.custody === 'external');
    const wallet = solanaWallet();
    if (!wallet || payload.from !== wallet.address || !payload.unsignedTransaction)
      throw new Error('This step must be signed by the Solana wallet it was built for. Reconnect that wallet.');
    const signed = await client.signSolanaTransaction(payload.unsignedTransaction);
    if (solanaWallet()?.address !== wallet.address) throw new Error('The connected wallet changed. Refresh before signing.');
    return signed;
  });
  try {
    return await client.signRampLeg(orderId, actionId);
  } finally {
    for (const release of lent) release();
  }
}
const CHAIN_NAME: Record<string, string> = { STELLAR: 'Stellar', POLYGON: 'Polygon', SOLANA: 'Solana' };
const fiatKey = (fiat: Pick<RampFiat, 'currency' | 'rail'>) => `${fiat.currency}:${fiat.rail}`;
const assetKey = (asset: Pick<RampAsset, 'code' | 'chain' | 'identifier'>) =>
  `${asset.code}:${asset.chain}:${asset.identifier ?? ''}`;

export interface RampWidgetTemplateProps {
  /** Language of the rail labels. Defaults to the user's device; the widget passes the resolved one. */
  language?: PollarLanguage;
  theme?: string;
  accentColor?: string;
  step: RampStep;
  /** Labels of the steps this run goes through: 'Details' only when the route asks for fields. */
  flowSteps?: string[];
  /** Index into `flowSteps`, or -1 outside the flow (the error step). */
  flowStepIndex?: number;
  direction: RampDirection;
  routesLoading: boolean;
  countries: Array<{ country: string; fiats: RampFiat[] }>;
  country: string;
  fiats: RampFiat[];
  fiat: RampFiat | null;
  assets: RampAsset[];
  asset: RampAsset | null;
  amount: string;
  /** What the wallet can spend of the asset being sold, as `useWalletAvailable` reads it; undefined hides it. */
  sellAvailable?: string | null | undefined;
  quotes: RampQuote[];
  rejected: RampQuoteRejection[];
  startingQuoteId: string | null;
  fields: RampField[];
  fieldValues: Record<string, string>;
  order: RampOrder | null;
  pendingOrders: RampOrder[];
  isLoading: boolean;
  signing: boolean;
  errorMsg: string | null;
  /** Progress the route waits on that is not a failure, shown with a spinner (an account the user approves on the device). */
  notice?: string | null;
  onDirectionChange: (direction: RampDirection) => void;
  onCountryChange: (country: string) => void;
  onFiatChange: (key: string) => void;
  onAssetChange: (key: string) => void;
  onAmountChange: (value: string) => void;
  onFindRoute: () => void;
  onSelectQuote: (quote: RampQuote) => void;
  /** Opens the verification step a dropped route waits on. */
  onVerifyRoute?: (requirement: RampQuoteRequirement) => void;
  /** The Stellar asset whose trustline is being added, as `code:issuer`; null when none is. */
  trustingAsset?: string | null;
  /** Adds the trustline a dropped route needs, then quotes again. */
  onTrustAsset?: (asset: { code: string; issuer: string }) => void;
  /** The dropped route (its index in `rejected`) whose wallet step is running; null when none is. */
  walletBusy?: number | null;
  /** The app leaves the custody to the user: a wallet set up or moved from a row asks which. */
  custodyChoice?: boolean;
  /**
   * Runs the wallet step a dropped route asks for (create, set up or move the wallet),
   * then quotes again; absent, the row only says what the user needs.
   */
  onWalletStep?: ((step: RampWalletStep, index: number, custody?: CosignCustody) => void) | undefined;
  /** The app serves no chain, so it has nothing to buy or sell. */
  noChains?: boolean;
  /** A held order the user resolves is being run again. */
  retrying?: boolean;
  /** Runs the user's held order again; absent, a held order only says what happened. */
  onRetryOrder?: (() => void) | undefined;
  /** Opens the wallet's recovery setup, for an order held until the wallet has a way to be recovered. */
  onSetUpRecovery?: (() => void) | undefined;
  /** Whether the wallet still has no way to be recovered; null while its state is unread. */
  recoveryMissing?: boolean | null;
  /** Reading the order keeps failing and polling is retrying. */
  pollTrouble?: boolean;
  onFieldChange: (key: string, value: string) => void;
  onContactContinue: () => void;
  onSign: () => void;
  onApprove: () => void;
  onCopy: (text: string) => void;
  onResumeOrder: (id: string) => void;
  onNewOrder: () => void;
  onBack: () => void;
  /** Returns to an earlier step of `flowSteps`, keeping what was entered; absent, the step bar only shows progress. */
  onStepSelect?: ((label: string) => void) | undefined;
  onRetry: () => void;
  onClose: () => void;
}

/** Renders again at `at` (ms since epoch), so what lapses then (a signature's button) goes then, not at the next read. */
const timeLeftText = (seconds: number) =>
  seconds <= 0
    ? 'Taking a little longer than usual'
    : seconds < 60
      ? `About ${seconds}s left`
      : `About ${Math.ceil(seconds / 60)} min left`;

/** The current time, every second while `running`: what a countdown reads. */
function useNowEverySecond(running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  return now;
}

function useRenderAt(at: number | null) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (at === null) return;
    const timer = setTimeout(() => setTick((n) => n + 1), Math.max(0, at - Date.now()) + 50);
    return () => clearTimeout(timer);
  }, [at]);
}

export function RampWidgetTemplate({
  theme = 'light',
  accentColor = '#005DB4',
  step,
  flowSteps = [],
  flowStepIndex = -1,
  direction,
  routesLoading,
  countries,
  country,
  fiats,
  fiat,
  assets,
  asset,
  amount,
  sellAvailable,
  quotes,
  rejected,
  startingQuoteId,
  fields,
  fieldValues,
  order,
  pendingOrders,
  isLoading,
  signing,
  errorMsg,
  notice = null,
  onDirectionChange,
  onCountryChange,
  onFiatChange,
  onAssetChange,
  onAmountChange,
  onFindRoute,
  onSelectQuote,
  onVerifyRoute,
  trustingAsset = null,
  onTrustAsset,
  walletBusy = null,
  custodyChoice = false,
  onWalletStep,
  noChains = false,
  retrying = false,
  onRetryOrder,
  onSetUpRecovery,
  recoveryMissing = null,
  pollTrouble = false,
  onFieldChange,
  onContactContinue,
  onSign,
  onApprove,
  onCopy,
  onResumeOrder,
  onNewOrder,
  onBack,
  onStepSelect,
  onRetry,
  onClose,
  language = languageFromTag(deviceLanguageTag()) ?? 'en',
}: RampWidgetTemplateProps) {
  const isDark = theme === 'dark';
  const colors = {
    bg: isDark ? '#1a1a1a' : '#ffffff',
    border: isDark ? '#374151' : '#e5e7eb',
    text: isDark ? '#ffffff' : '#111827',
    muted: isDark ? '#9ca3af' : '#6b7280',
    inputBg: isDark ? '#374151' : '#f9fafb',
    error: '#ef4444',
  };
  const onramp = direction === 'ONRAMP';
  const view = order ? describeRampAction(order) : null;
  const settled = order ? ['completed', 'failed', 'refunded'].includes(order.state) : false;
  // A leg running on its own (not waiting on the user) counts down its quoted time.
  const running = order?.legs.find((leg) => rampLegStatus(leg) === 'active' && order.pendingAction?.legIndex !== leg.index);
  const now = useNowEverySecond(step === 'status' && !settled && !!running && running.etaSeconds !== null);
  const nextApproval = order && !settled ? rampNextApproval(order) : null;
  // Held (no next read) or final: the order no longer moves on its own.
  const stopped = order ? rampOrderStopped(order) : false;
  const receive = order ? rampOrderReceive(order) : null;
  // A held order that waits on the wallet's recovery: retrying before it exists fails the same way.
  const waitsOnRecovery = order?.failure?.resolutionAction === 'set_up_recovery';
  useRenderAt(view?.canSign && view.expiresAt ? Date.parse(view.expiresAt) : null);
  const missingField = fields.some((f) => !rampFieldValid(f, fieldValues[f.key]));
  const canFind = !!amount && Number(amount) > 0 && !!fiat && !!asset && !isLoading;
  // Once the order exists, going back means a new order, which "New order" already starts.
  const stepsOpen =
    !!onStepSelect &&
    step !== 'status' &&
    !isLoading &&
    startingQuoteId === null &&
    trustingAsset === null &&
    walletBusy === null;

  const primary = (label: string, onPress: () => void, disabled = false) => (
    <TouchableOpacity
      style={[styles.primaryBtn, { backgroundColor: accentColor, opacity: disabled ? 0.5 : 1 }]}
      disabled={disabled}
      onPress={onPress}
    >
      <Text style={styles.primaryBtnText}>{label}</Text>
    </TouchableOpacity>
  );
  const secondary = (label: string, onPress: () => void, disabled = false) => (
    <TouchableOpacity
      style={[styles.secondaryBtn, { borderColor: colors.border, opacity: disabled ? 0.5 : 1 }]}
      disabled={disabled}
      onPress={onPress}
    >
      <Text style={{ color: colors.text, fontWeight: '600' }}>{label}</Text>
    </TouchableOpacity>
  );
  const chips = <T extends string>(items: Array<{ key: T; label: string }>, selected: string, onPick: (key: T) => void) => (
    <View style={[styles.row, { flexWrap: 'wrap' }]}>
      {items.map((item) => (
        <TouchableOpacity
          key={item.key}
          style={[styles.chip, { borderColor: item.key === selected ? accentColor : colors.border }]}
          onPress={() => onPick(item.key)}
        >
          <Text style={{ color: colors.text }}>{item.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
  const copyRow = (label: string, value: string) => (
    <View key={label} style={[styles.instructions, { borderColor: colors.border }]}>
      <Text style={{ color: colors.muted, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: colors.text }} selectable>
        {value}
      </Text>
      <TouchableOpacity onPress={() => onCopy(value)} accessibilityLabel={`Copy ${label}`}>
        <Text style={{ color: accentColor, fontWeight: '600', marginTop: 4 }}>Copy</Text>
      </TouchableOpacity>
    </View>
  );
  const stepTitle: Record<RampStep, string> = {
    input: onramp ? 'Buy crypto' : 'Sell crypto',
    loading_quote: 'Finding the best route',
    select_route: 'Choose a route',
    contact: 'Your details',
    status: order?.state === 'completed' ? 'Transfer completed' : onramp ? 'Your purchase' : 'Your sale',
    error: 'Something went wrong',
  };
  const stepSubtitle: Record<RampStep, string> = {
    input: onramp ? 'Pick what you receive and how much you pay' : 'Pick what you sell and how much',
    loading_quote: 'Comparing routes in real time…',
    select_route: 'All amounts include fees',
    contact: `This route needs ${listOf(fields.filter((f) => !f.optional).map((f) => f.label.toLowerCase()))} to continue`,
    status: view?.title ?? 'Processing',
    error: 'Please try again',
  };
  const errorLine = errorMsg ? <Text style={[styles.note, { color: colors.error }]}>{errorMsg}</Text> : null;
  const scannable = view?.scannable ?? null;

  return (
    <View style={[styles.card, { backgroundColor: colors.bg, borderColor: colors.border }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>{stepTitle[step]}</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>{stepSubtitle[step]}</Text>
      </View>

      <TouchableOpacity
        style={[styles.iconButton, styles.closeBtn, { borderColor: colors.border }]}
        onPress={onClose}
        accessibilityLabel="Close"
      >
        <Text style={{ color: colors.muted, fontSize: 16 }}>✕</Text>
      </TouchableOpacity>

      {flowStepIndex >= 0 && flowSteps.length > 0 && (
        <View style={styles.steps}>
          <Text style={[styles.stepsLabel, { color: colors.muted }]}>
            Step {flowStepIndex + 1} of {flowSteps.length}
          </Text>
          <View style={styles.stepsTrack}>
            {flowSteps.map((label, i) => {
              const reachable = stepsOpen && i < flowStepIndex;
              const current = i === flowStepIndex;
              return (
                <TouchableOpacity
                  key={label}
                  style={styles.stepsItem}
                  disabled={!reachable}
                  onPress={() => onStepSelect?.(label)}
                  accessibilityRole="button"
                  accessibilityLabel={`Go to ${label}`}
                  accessibilityState={{ disabled: !reachable, selected: current }}
                >
                  <View style={[styles.stepsSegment, { backgroundColor: i <= flowStepIndex ? accentColor : colors.border }]} />
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.stepsName,
                      {
                        // No hover on a phone: a step that can be tapped says so in the accent colour.
                        color: current ? colors.text : reachable ? accentColor : colors.muted,
                        fontWeight: current ? '600' : '400',
                      },
                    ]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
        {step === 'input' && (
          <>
            {pendingOrders.length > 0 && (
              <>
                <Text style={[styles.note, { color: colors.muted }]}>These operations are waiting for you:</Text>
                {pendingOrders.map((pending) =>
                  secondary(
                    `Resume ${pending.direction === 'ONRAMP' ? 'purchase' : 'sale'} · ${pending.id.slice(-8)}`,
                    () => onResumeOrder(pending.id),
                    isLoading,
                  ),
                )}
              </>
            )}
            {chips<RampDirection>(
              [
                { key: 'ONRAMP', label: 'Buy' },
                { key: 'OFFRAMP', label: 'Sell' },
              ],
              direction,
              onDirectionChange,
            )}
            {routesLoading ? (
              <ActivityIndicator color={accentColor} style={{ marginBottom: 16 }} />
            ) : countries.length === 0 ? (
              <Text style={[styles.note, { color: colors.muted }]}>
                {noChains
                  ? 'This app has no chains enabled, so there is nothing to buy or sell yet.'
                  : 'No ramp routes are available for this app yet.'}
              </Text>
            ) : (
              <>
                <Text style={[styles.label, { color: colors.text }]}>Country</Text>
                {chips(
                  countries.map((c) => ({ key: c.country, label: c.country })),
                  country,
                  onCountryChange,
                )}
                {fiats.length > 1 && (
                  <>
                    <Text style={[styles.label, { color: colors.text }]}>{onramp ? 'Pay with' : 'Receive in'}</Text>
                    {chips(
                      fiats.map((f) => ({
                        key: fiatKey(f),
                        label: `${f.currency} · ${rampRailLabel(f.rail, { language })}`,
                      })),
                      fiat ? fiatKey(fiat) : '',
                      onFiatChange,
                    )}
                  </>
                )}
                <Text style={[styles.label, { color: colors.text }]}>{onramp ? 'Receive' : 'Sell'}</Text>
                {chips(
                  assets.map((a) => ({ key: assetKey(a), label: `${a.code} on ${CHAIN_NAME[a.chain] ?? a.chain}` })),
                  asset ? assetKey(asset) : '',
                  onAssetChange,
                )}
              </>
            )}
            <AmountField
              theme={theme}
              accentColor={accentColor}
              label={onramp ? 'You pay' : 'You sell'}
              value={amount}
              onChange={onAmountChange}
              unit={onramp ? fiat?.currency : asset?.code}
              available={onramp ? undefined : sellAvailable}
              placeholder="25.00"
            />
            {errorLine}
            {primary('Find best route', onFindRoute, !canFind)}
          </>
        )}

        {step === 'loading_quote' && (
          <View style={styles.statusBox}>
            <ActivityIndicator size="large" color={accentColor} />
            <Text style={{ color: colors.text, marginTop: 16 }}>Finding routes…</Text>
          </View>
        )}

        {step === 'select_route' && (
          <>
            {quotes.map((q, i) => (
              <RouteDisplay
                key={q.quoteId}
                quote={q}
                best={i === 0}
                disabled={startingQuoteId != null}
                onSelect={onSelectQuote}
              />
            ))}
            {rejected.map((r, i) => (
              <RejectedRouteDisplay
                key={i}
                rejection={r}
                accentColor={accentColor}
                disabled={startingQuoteId != null || trustingAsset !== null || walletBusy !== null}
                trusting={trustKey(r) === trustingAsset}
                walletBusy={walletBusy === i}
                custodyChoice={custodyChoice}
                onVerify={onVerifyRoute}
                onTrust={onTrustAsset}
                onWalletStep={onWalletStep && ((step, custody) => onWalletStep(step, i, custody))}
              />
            ))}
            {quotes.length === 0 && <Text style={[styles.note, { color: colors.muted }]}>{rampNoRouteText(rejected)}</Text>}
            {startingQuoteId && <ActivityIndicator color={accentColor} />}
            {notice && (
              <View style={styles.noticeRow}>
                <ActivityIndicator size="small" color={accentColor} />
                <Text style={[styles.note, { color: colors.muted }]}>{notice}</Text>
              </View>
            )}
            {errorLine}
            {/* A dead end keeps a button out: the step bar alone is too quiet as the only way forward. */}
            {(errorMsg || !quotes.length) &&
              primary(
                !errorMsg && rejected.some((r) => r.failure.resolutionAction === 'change_amount') ? 'Change amount' : 'Back',
                onBack,
              )}
          </>
        )}

        {step === 'contact' && (
          <>
            {fields.map((f) => (
              <View key={f.key}>
                <Text style={[styles.label, { color: colors.text }]}>
                  {f.label}
                  {f.optional ? ' (optional)' : ''}
                </Text>
                {f.type === 'select' && f.options ? (
                  chips(
                    f.options.map((o) => ({ key: o.value, label: o.label })),
                    fieldValues[f.key] ?? '',
                    (value) => onFieldChange(f.key, value),
                  )
                ) : (
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
                    placeholder={f.placeholder ?? ''}
                    placeholderTextColor={colors.muted}
                    keyboardType={f.type === 'email' ? 'email-address' : f.type === 'tel' ? 'phone-pad' : 'default'}
                    autoCapitalize="none"
                    value={fieldValues[f.key] ?? ''}
                    onChangeText={(value) => onFieldChange(f.key, value)}
                  />
                )}
                {f.hint ? <Text style={[styles.note, { color: colors.muted }]}>{f.hint}</Text> : null}
                {rampFieldError(f, fieldValues[f.key]) ? (
                  <Text style={[styles.note, { color: colors.error }]}>{rampFieldError(f, fieldValues[f.key])}</Text>
                ) : null}
              </View>
            ))}
            {errorLine}
            {primary(isLoading ? 'Starting…' : 'Continue', onContactContinue, missingField || isLoading)}
          </>
        )}

        {step === 'status' && order && view && (
          <>
            {order.legs.map((leg) => {
              const status = rampLegStatus(leg);
              const row = (
                <View key={leg.index} style={[styles.row, { alignItems: 'center', marginBottom: 6 }]}>
                  <View
                    style={[
                      styles.legDot,
                      {
                        borderColor: status === 'failed' ? colors.error : status === 'pending' ? colors.border : accentColor,
                        backgroundColor: status === 'done' ? accentColor : 'transparent',
                      },
                    ]}
                  />
                  <Text
                    style={{
                      flex: 1,
                      color: status === 'failed' ? colors.error : status === 'pending' ? colors.muted : colors.text,
                    }}
                  >
                    {rampLegTitle(leg)}
                  </Text>
                  {status === 'active' && !settled && <ActivityIndicator size="small" color={accentColor} />}
                </View>
              );
              const note = rampLegNote(leg);
              const steps = (status === 'active' && !settled ? leg.steps : null) ?? [];
              const timeLeft = running === leg && !settled ? rampLegTimeLeft(leg, now) : null;
              if (!note && !steps.length && timeLeft === null) return row;
              return (
                <View key={leg.index}>
                  {row}
                  {note && <Text style={[styles.legNote, { color: colors.muted }]}>{note}</Text>}
                  {steps.map((s) => (
                    <View key={s.kind} style={styles.legStep}>
                      <Text style={{ flex: 1, fontSize: 13, color: s.status === 'pending' ? colors.muted : colors.text }}>
                        {rampStepTitle(s, leg)}
                      </Text>
                      {s.status === 'confirming' && <ActivityIndicator size="small" color={accentColor} />}
                      <Text
                        style={{
                          fontSize: 13,
                          color: s.status === 'awaiting_approval' ? accentColor : colors.muted,
                          fontWeight: s.status === 'awaiting_approval' ? '600' : '400',
                        }}
                      >
                        {rampStepStatusText(s)}
                      </Text>
                    </View>
                  ))}
                  {timeLeft !== null && <Text style={[styles.legNote, { color: colors.muted }]}>{timeLeftText(timeLeft)}</Text>}
                </View>
              );
            })}
            {nextApproval && !order.pendingAction && (
              <Text style={[styles.note, { color: colors.muted }]}>
                Next: {nextApproval}. You approve it on this device when it comes up.
              </Text>
            )}

            {receive &&
              copyRow(
                order.state === 'completed' ? 'You received' : 'You receive',
                `${receive.estimated ? '~' : ''}${receive.amount} ${receive.unit}`,
              )}
            {order.failure && (
              <>
                <Text style={[styles.note, { color: colors.text }]}>{rampOrderResolutionText(order)}</Text>
                {copyRow('Order', order.id)}
                {stopped &&
                  !settled &&
                  waitsOnRecovery &&
                  recoveryMissing !== false &&
                  onSetUpRecovery &&
                  secondary('Set up recovery', onSetUpRecovery)}
                {stopped && !settled && waitsOnRecovery && recoveryMissing === true && (
                  <Text style={[styles.note, { color: colors.muted }]}>Once it is set up, the order goes on by itself.</Text>
                )}
                {stopped &&
                  !settled &&
                  order.failure.resolutionOwner === 'END_USER' &&
                  onRetryOrder &&
                  primary(
                    retrying ? 'Trying again…' : 'Try again',
                    onRetryOrder,
                    retrying || (waitsOnRecovery && recoveryMissing === true),
                  )}
              </>
            )}
            {!settled && view.action?.kind === 'FIAT_PAYMENT' && view.expiresAt && (
              <Text style={[styles.note, { color: colors.muted }]}>
                {Date.parse(view.expiresAt) > Date.now()
                  ? `Pay before ${new Date(view.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`
                  : 'This payment window has closed. If you have not paid, start a new operation.'}
              </Text>
            )}

            {!settled && scannable && (
              <View style={{ alignItems: 'center', marginVertical: 12 }}>
                {scannable.payload ? (
                  <QRCode value={scannable.payload} size={200} />
                ) : scannable.image.mediaType === 'image/svg+xml' ? (
                  <SvgXml xml={scannable.image.data} width={200} height={200} color={colors.text} />
                ) : (
                  <Image
                    source={{ uri: `data:${scannable.image.mediaType};base64,${scannable.image.data}` }}
                    style={{ width: 200, height: 200 }}
                    accessibilityLabel="Payment QR"
                  />
                )}
              </View>
            )}
            {!settled && view.codeMissing && (
              <Text style={[styles.note, { color: colors.error }]}>
                The payment code could not be shown. Refresh; if it still does not appear, contact this app's support.
              </Text>
            )}
            {!settled && scannable?.payload && scannable.payloadLabel && copyRow(scannable.payloadLabel, scannable.payload)}
            {!settled && view.details.map((d) => copyRow(d.label, d.value))}

            {!settled && view.canSign && primary(signing ? 'Waiting for your wallet…' : 'Authorize', onSign, signing)}
            {!settled && view.action?.kind === 'SIGNATURE' && !view.canSign && (
              <Text style={[styles.note, { color: colors.muted }]}>Preparing a new signature request…</Text>
            )}
            {!settled && view.canApprove && primary('Approve on this device', onApprove)}
            {!settled && view.link && primary(view.linkLabel ?? 'Open', () => void Linking.openURL(view.link!))}
            {!settled && order.pendingAction?.kind === 'KYC' && !view.link && (
              <Text style={[styles.note, { color: colors.muted }]}>
                {view.note ?? 'The provider is reviewing your details. This updates on its own.'}
              </Text>
            )}
            {pollTrouble && !settled && (
              <Text style={[styles.note, { color: colors.muted }]}>Having trouble reaching the server. Retrying…</Text>
            )}
            {errorLine}
            {secondary('Start another operation', onNewOrder)}
          </>
        )}

        {step === 'error' && (
          <>
            {errorLine}
            {primary('Try again', onRetry)}
            {secondary('Close', onClose)}
          </>
        )}
      </ScrollView>
    </View>
  );
}

export function RampWidget({
  onClose,
  language: languageProp,
}: {
  onClose: () => void;
  /** Language of the widget and the steps it opens, as a BCP 47 tag. A language pinned in the dashboard wins over it. */
  language?: string | undefined;
}) {
  const {
    getClient,
    copyText,
    ramp: saved,
    setRamp: save,
    styles: pollarStyles,
    openCosignModal,
    setCosignNextStep,
    openRecoveryModal,
    recovery,
    recoveryLocked,
    appConfig,
    cosign,
    refreshWalletBalance,
  } = usePollar();
  const { theme = 'light', accentColor = '#005DB4' } = pollarStyles;
  const language = useModalLanguage(languageProp);
  const client = getClient();

  const [step, setStep] = useState<RampStep>(saved ? 'status' : 'input');
  const [direction, setDirection] = useState<RampDirection>(saved?.direction ?? 'ONRAMP');
  const [routes, setRoutes] = useState<RampRoute[]>([]);
  const [routesLoading, setRoutesLoading] = useState(true);
  const [country, setCountry] = useState('');
  const [fiatChoice, setFiatChoice] = useState('');
  const [assetChoice, setAssetChoice] = useState('');
  const [amount, setAmount] = useState('');
  const [quotes, setQuotes] = useState<RampQuote[]>([]);
  const [rejected, setRejected] = useState<RampQuoteRejection[]>([]);
  const [selected, setSelected] = useState<RampQuote | null>(null);
  const [startingQuoteId, setStartingQuoteId] = useState<string | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [order, setOrderState] = useState<RampOrder | null>(saved?.order ?? null);
  const [pendingOrders, setPendingOrders] = useState<RampOrder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [signing, setSigning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<RampQuoteRequirement | null>(null);
  const [trustingAsset, setTrustingAsset] = useState<string | null>(null);
  // The dropped route (its index) whose wallet step is running.
  const [walletBusy, setWalletBusy] = useState<number | null>(null);
  const [retrying, setRetrying] = useState(false);
  // A route whose order waits on the new account the user approves on the device: once that
  // request is approved the route is resumed, since its quote may lapse meanwhile.
  const [awaitingAccount, setAwaitingAccount] = useState<{ routeKey: string; requestId: string } | null>(null);
  // A read of the order failed and polling keeps trying; cleared by the next good read.
  const [pollTrouble, setPollTrouble] = useState(false);
  // Bumped to start following the order again (after a retry of one that had stopped).
  const [pollKey, setPollKey] = useState(0);
  // The approval the user was last prompted for, so each new one prompts once.
  const promptedApproval = useRef<string | null>(null);
  // An app that leaves the custody to the user: the user picks it for each wallet step.
  const custodyChoice = appConfig.application?.walletCustodyMode === 'USER_CHOICE';
  const appChains = appConfig.application?.chains;
  // The step opened last: a modal that reports after it was closed or replaced is ignored.
  const verifyAttempt = useRef<RampQuoteRequirement | null>(null);

  // The provider keeps the order so closing and reopening the widget lands back on it.
  const setOrder = (next: RampOrder | null) => {
    setOrderState(next);
    save(next ? { direction: next.direction, order: next } : null);
  };

  const countries = useMemo(() => rampCountries(routes), [routes]);
  const fiats = countries.find((c) => c.country === country)?.fiats ?? [];
  const fiat = fiats.find((f) => fiatKey(f) === fiatChoice) ?? fiats[0] ?? null;
  const assets = useMemo(() => {
    const seen = new Map<string, RampAsset>();
    for (const route of routes)
      if (fiat && route.fiat.country === country && fiatKey(route.fiat) === fiatKey(fiat))
        seen.set(assetKey(route.asset), route.asset);
    return [...seen.values()];
  }, [routes, country, fiat]);
  const asset = assets.find((a) => assetKey(a) === assetChoice) ?? assets[0] ?? null;
  const fields = selected ? rampQuoteFields(selected) : [];
  const sellAvailable = useWalletAvailable(
    direction === 'OFFRAMP' && asset ? { chain: asset.chain, code: asset.code, issuer: asset.identifier } : null,
  );

  useEffect(() => {
    if (direction === 'OFFRAMP') void refreshWalletBalance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [direction]);

  const flowSteps =
    fields.length || quotes.some((q) => rampQuoteFields(q).length)
      ? ['Amount', 'Route', 'Details', 'Complete']
      : ['Amount', 'Route', 'Complete'];
  const stepLabel: Partial<Record<RampStep, string>> = {
    input: 'Amount',
    loading_quote: 'Amount',
    select_route: 'Route',
    contact: 'Details',
    status: 'Complete',
  };
  const flowLabel = stepLabel[step];

  useEffect(() => {
    let active = true;
    setRoutesLoading(true);
    client
      .getRampRoutes(direction)
      .then(({ routes: found }) => {
        if (!active) return;
        setRoutes(found);
        const first = rampCountries(found)[0]?.country ?? '';
        setCountry((current) => (found.some((r) => r.fiat.country === current) ? current : first));
      })
      .catch((error) => {
        if (active) setErrorMsg(rampErrorMessage(error, 'Could not load the ramp routes.'));
      })
      .finally(() => {
        if (active) setRoutesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, direction]);

  useEffect(() => {
    let active = true;
    client
      // Every order not final yet: one already paid and moving on its own is still the user's to follow.
      .listRampOrders({ open: 'true', limit: 5 })
      .then((page) => {
        if (active) setPendingOrders(page.orders);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [client, step]);

  // Follow the order at the pace the server suggests until it settles. Reading never signs or approves.
  const orderId = order?.id ?? null;
  useEffect(() => {
    if (step !== 'status' || !orderId) return;
    const controller = new AbortController();
    client
      .pollRampOrder(orderId, {
        signal: controller.signal,
        onUpdate: (next) => {
          setOrder(next);
          setPollTrouble(false);
        },
        onError: () => setPollTrouble(true),
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setErrorMsg(rampErrorMessage(error, 'This operation could not be read.'));
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, step, orderId, pollKey]);

  // A co-signed step of the order waits on the user's device: bring its request up the moment it appears.
  const approval = order?.pendingAction?.kind === 'COSIGN_APPROVAL' ? order.pendingAction.actionId : null;
  useEffect(() => {
    if (!approval || promptedApproval.current === approval) return;
    promptedApproval.current = approval;
    void client.cosign
      .pending()
      .catch(() => undefined)
      .then(() => openCosignModal());
  }, [approval, client, openCosignModal]);

  // The approval prompt stays up between two approvals of the order instead of closing and reopening.
  const nextApproval = step === 'status' && order ? rampNextApproval(order) : null;
  useEffect(() => {
    setCosignNextStep(nextApproval);
  }, [nextApproval, setCosignNextStep]);
  useEffect(() => () => setCosignNextStep(null), [setCosignNextStep]);

  /** Runs the user's held order again, then follows it. */
  async function handleRetryOrder() {
    if (!order || retrying) return;
    setRetrying(true);
    setErrorMsg(null);
    try {
      setOrder(await client.retryRampOrder(order.id));
      setPollKey((key) => key + 1);
    } catch (error) {
      setErrorMsg(rampErrorMessage(error, 'Could not try again. Please try again.'));
    } finally {
      setRetrying(false);
    }
  }

  // An order held until the wallet has a way to be recovered tries again once it has one.
  const heldForRecovery = step === 'status' && order?.failure?.resolutionAction === 'set_up_recovery';
  const wasRecoveryLocked = useRef(recoveryLocked);
  useEffect(() => {
    if (heldForRecovery && wasRecoveryLocked.current && !recoveryLocked && recovery) void handleRetryOrder();
    wasRecoveryLocked.current = recoveryLocked;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heldForRecovery, recoveryLocked, recovery]);

  const resolvedRequest = cosign.lastResolved;
  useEffect(() => {
    if (!awaitingAccount || resolvedRequest?.id !== awaitingAccount.requestId) return;
    setAwaitingAccount(null);
    if (resolvedRequest.status !== 'APPROVED') {
      setErrorMsg('The new account was not approved, so this route cannot start.');
      return;
    }
    void resumeRoute(awaitingAccount.routeKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaitingAccount, resolvedRequest]);

  /** Quotes the entered amount and shows the routes; the quotes found, none when it failed. */
  async function handleFindRoute(): Promise<RampQuote[]> {
    if (!fiat || !asset) return [];
    if (!DECIMAL.test(amount.trim()) || Number(amount) <= 0) {
      setErrorMsg('Enter an amount greater than zero.');
      return [];
    }
    setStep('loading_quote');
    setErrorMsg(null);
    setSelected(null);
    try {
      const result = await client.quoteRamp({
        direction,
        fiat: { currency: fiat.currency, rail: fiat.rail, country: fiat.country },
        asset: { code: asset.code, identifier: asset.identifier, chain: asset.chain },
        amount: { value: amount.trim(), denomination: 'in' },
      });
      setQuotes(result.quotes);
      setRejected(result.rejected);
      setStep('select_route');
      return result.quotes;
    } catch (error) {
      if (isPollarApiError(error) && error.code === 'SDK_RAMPS_NO_ROUTE') {
        setQuotes([]);
        setRejected(Array.isArray(error.body.rejected) ? (error.body.rejected as RampQuoteRejection[]) : []);
        setStep('select_route');
        return [];
      }
      setErrorMsg(rampErrorMessage(error, 'Could not find a route. Please try again.'));
      setStep('error');
      return [];
    }
  }

  function handleVerifyRoute(requirement: RampQuoteRequirement) {
    setErrorMsg(null);
    verifyAttempt.current = requirement;
    setVerifying(requirement);
  }

  function closeVerification() {
    verifyAttempt.current = null;
    setVerifying(null);
  }

  /** A completed step can unlock its route: quote again with the same amount. */
  function verificationDone(requirement: RampQuoteRequirement) {
    if (verifyAttempt.current !== requirement) return;
    closeVerification();
    void handleFindRoute();
  }

  /** Adds the trustline a dropped route needs, sponsored when the app covers it, then quotes again. */
  async function handleTrustAsset(asset: { code: string; issuer: string }) {
    if (trustingAsset) return;
    setTrustingAsset(`${asset.code}:${asset.issuer}`);
    setErrorMsg(null);
    try {
      const outcome = await client.setTrustline(asset);
      if (outcome.status === 'error') {
        setErrorMsg(rampTrustlineErrorText(outcome, asset.code));
        return;
      }
      if (outcome.status === 'cosign_pending') {
        setErrorMsg(`Approve the ${asset.code} trustline, then refresh the routes.`);
        openCosignModal();
        return;
      }
      await client.refreshAssets().catch(() => {});
      await handleFindRoute();
    } catch (error) {
      setErrorMsg(rampErrorMessage(error, `Could not add the ${asset.code} trustline. Please try again.`));
    } finally {
      setTrustingAsset(null);
    }
  }

  /**
   * Runs the wallet step a dropped route asks for (create, set up or move the wallet),
   * then quotes again. A new Turnkey wallet first gets a recovery method: it signs
   * nothing until it has one.
   */
  async function handleWalletStep(walletStep: RampWalletStep, index: number, custody?: CosignCustody) {
    if (walletBusy !== null) return;
    setWalletBusy(index);
    setErrorMsg(null);
    try {
      const { recoveryRequired } = await client.runRampWalletStep(walletStep, custody);
      if (recoveryRequired) {
        setErrorMsg('Add a way to recover your wallet, then find the route again.');
        openRecoveryModal();
        return;
      }
      await handleFindRoute();
    } catch (error) {
      const code = isPollarApiError(error) ? error.code : null;
      if (code === 'SDK_RAMPS_WALLET_NOT_READY') {
        setErrorMsg('Approve the new account, then find the route again.');
        openCosignModal();
        return;
      }
      setErrorMsg(
        code === 'SDK_WALLET_PROVISIONING_DISABLED'
          ? 'This app does not create wallets.'
          : rampErrorMessage(error, 'Could not prepare the wallet. Please try again.'),
      );
    } finally {
      setWalletBusy(null);
    }
  }

  /** Quotes again and continues with the same route on its fresh quote, which is never resumed again. */
  async function resumeRoute(key: string) {
    const same = (await handleFindRoute()).find((q) => routeKey(q) === key);
    if (same) handleSelectQuote(same, true);
    else setErrorMsg('That route is no longer available. Pick another one.');
  }

  /** `fresh`: the quote was just taken, so a lapse is reported instead of quoting again. */
  function handleSelectQuote(quote: RampQuote, fresh = false) {
    // The server refuses a lapsed quote: take the same route on a new one instead of sending it.
    if (!fresh && Date.parse(quote.expiresAt) <= Date.now()) {
      void resumeRoute(routeKey(quote));
      return;
    }
    setSelected(quote);
    setErrorMsg(null);
    const missing = rampQuoteFields(quote).some((f) => !f.optional && !(fieldValues[f.key] ?? '').trim());
    if (missing) setStep('contact');
    else void startOrder(quote, fresh);
  }

  async function startOrder(quote: RampQuote, fresh = false) {
    setIsLoading(true);
    setStartingQuoteId(quote.quoteId);
    setErrorMsg(null);
    setAwaitingAccount(null);
    try {
      const payee = Object.fromEntries(
        rampQuoteFields(quote)
          .map((f) => [f.key, (fieldValues[f.key] ?? '').trim()])
          .filter(([, value]) => value),
      );
      setOrder(await client.createRampOrder({ quoteId: quote.quoteId, ...(Object.keys(payee).length ? { payee } : {}) }));
      setStep('status');
    } catch (error) {
      // The route's wallet on another chain waits on the user's approval: bring that request up.
      // Not a failure while the request is there: the route starts again once it is approved.
      if (isPollarApiError(error) && error.code === 'SDK_RAMPS_WALLET_NOT_READY') {
        const pending = await client.cosign.pending().catch(() => []);
        const request = pending.find((r) => r.intent === 'add_accounts');
        if (request) setAwaitingAccount({ routeKey: routeKey(quote), requestId: request.id });
        else setErrorMsg(rampErrorMessage(error, 'Could not start the operation. Please try again.'));
        openCosignModal();
        setStep('select_route');
        return;
      }
      // Lapsed between the list and the tap (or by the server's clock): same route, new quote.
      if (isPollarApiError(error) && error.code === 'SDK_RAMPS_QUOTE_EXPIRED' && !fresh) {
        void resumeRoute(routeKey(quote));
        return;
      }
      setErrorMsg(rampErrorMessage(error, 'Could not start the operation. Please try again.'));
      // A refused detail is fixed on the form; an expired quote needs a new one.
      if (isPollarApiError(error) && error.code === 'VALIDATION_ERROR' && rampQuoteFields(quote).length) setStep('contact');
      else setStep('select_route');
    } finally {
      setIsLoading(false);
      setStartingQuoteId(null);
    }
  }

  async function handleSign() {
    const action = order?.pendingAction;
    if (!order || action?.kind !== 'SIGNATURE' || signing) return;
    setSigning(true);
    setErrorMsg(null);
    try {
      setOrder(await signLegWithWallet(client, order.id, action.actionId));
    } catch (error) {
      setErrorMsg(rampErrorMessage(error, error instanceof Error && error.message ? error.message : 'Signing was cancelled.'));
      setOrder(await client.getRampOrder(order.id).catch(() => order));
    } finally {
      setSigning(false);
    }
  }

  async function handleResumeOrder(id: string) {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const found = await client.getRampOrder(id);
      setDirection(found.direction);
      setOrder(found);
      setStep('status');
    } catch (error) {
      setErrorMsg(rampErrorMessage(error, 'Could not resume the operation.'));
    } finally {
      setIsLoading(false);
    }
  }

  // The step replaces the widget while it is open; the widget keeps what was entered.
  if (verifying) {
    const progress = { position: verifying.completed + 1, total: verifying.total };
    const done = () => verificationDone(verifying);
    if (verifying.type === 'FORM')
      return (
        <RequirementFormModal
          formId={verifying.optionId}
          progress={progress}
          language={languageProp}
          onClose={closeVerification}
          onSubmitted={done}
        />
      );
    if (verifying.type === 'REGISTRY_CHECK')
      return (
        <RegistryCheckModal
          optionId={verifying.optionId}
          progress={progress}
          language={languageProp}
          onClose={closeVerification}
          onApproved={done}
        />
      );
    if (verifying.type === 'PROVIDER_REGISTRATION')
      return (
        <ProviderRegistrationModal
          corridorId={verifying.corridorId}
          language={languageProp}
          progress={progress}
          onClose={closeVerification}
          onRegistered={done}
        />
      );
    return (
      <KycModal
        country={country}
        corridorId={verifying.corridorId}
        providerId={verifying.optionId}
        onClose={closeVerification}
        onApproved={done}
      />
    );
  }

  return (
    <PollarOverlay onCancel={onClose}>
      <View style={styles.modalWrapper}>
        <RampWidgetTemplate
          language={language}
          theme={theme}
          accentColor={accentColor}
          step={step}
          flowSteps={flowSteps}
          flowStepIndex={flowLabel ? flowSteps.indexOf(flowLabel) : -1}
          direction={direction}
          routesLoading={routesLoading}
          countries={countries}
          country={country}
          fiats={fiats}
          fiat={fiat}
          assets={assets}
          asset={asset}
          amount={amount}
          sellAvailable={sellAvailable}
          quotes={quotes}
          rejected={rejected}
          startingQuoteId={startingQuoteId}
          fields={fields}
          fieldValues={fieldValues}
          order={order}
          pendingOrders={pendingOrders}
          isLoading={isLoading}
          signing={signing}
          errorMsg={errorMsg}
          notice={awaitingAccount ? 'Approve the new account on your device. The order starts once it is approved.' : null}
          onDirectionChange={(next) => {
            setDirection(next);
            setErrorMsg(null);
            setAwaitingAccount(null);
          }}
          onCountryChange={(next) => {
            setCountry(next);
            setFiatChoice('');
            setAssetChoice('');
          }}
          onFiatChange={(key) => {
            setFiatChoice(key);
            setAssetChoice('');
          }}
          onAssetChange={setAssetChoice}
          onAmountChange={(next) => {
            setAmount(next);
            setErrorMsg(null);
          }}
          onFindRoute={() => void handleFindRoute()}
          onSelectQuote={(quote) => handleSelectQuote(quote)}
          onVerifyRoute={handleVerifyRoute}
          trustingAsset={trustingAsset}
          onTrustAsset={(asset) => void handleTrustAsset(asset)}
          walletBusy={walletBusy}
          custodyChoice={custodyChoice}
          onWalletStep={(walletStep, index, custody) => void handleWalletStep(walletStep, index, custody)}
          noChains={Array.isArray(appChains) && appChains.length === 0}
          retrying={retrying}
          onRetryOrder={() => void handleRetryOrder()}
          onSetUpRecovery={openRecoveryModal}
          recoveryMissing={recovery === null ? null : recoveryLocked}
          pollTrouble={pollTrouble}
          onFieldChange={(key, value) => setFieldValues((current) => ({ ...current, [key]: value }))}
          onContactContinue={() => {
            if (selected) void startOrder(selected);
          }}
          onSign={() => void handleSign()}
          onApprove={openCosignModal}
          onCopy={(text) =>
            void copyText(text).catch((error: unknown) => setErrorMsg(rampErrorMessage(error, 'Could not copy.')))
          }
          onResumeOrder={(id) => void handleResumeOrder(id)}
          onNewOrder={() => {
            setAwaitingAccount(null);
            setOrder(null);
            setSelected(null);
            setQuotes([]);
            setRejected([]);
            setErrorMsg(null);
            setStep('input');
          }}
          onBack={() => {
            setErrorMsg(null);
            setAwaitingAccount(null);
            setStep(step === 'contact' ? 'select_route' : 'input');
          }}
          onStepSelect={(target) => {
            // Only Amount and Route sit before a step the user can leave; Complete is never left this way.
            setErrorMsg(null);
            setAwaitingAccount(null);
            setStep(target === 'Route' ? 'select_route' : 'input');
          }}
          onRetry={() => {
            setErrorMsg(null);
            setStep('input');
          }}
          onClose={onClose}
        />
      </View>
    </PollarOverlay>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 50,
  },
  modalWrapper: {
    width: '100%',
    maxWidth: 400,
  },
  card: {
    width: '100%',
    maxHeight: '90%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 25,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  header: {
    gap: 4,
    marginBottom: 16,
    marginTop: 10,
    // Clear of the close button in the corner.
    paddingRight: 40,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  iconButton: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 6,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  closeBtn: {
    top: 16,
    right: 16,
  },
  body: {
    marginVertical: 12,
  },
  steps: {
    gap: 8,
    marginTop: 4,
  },
  stepsLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  stepsTrack: {
    flexDirection: 'row',
    gap: 6,
  },
  stepsItem: {
    flex: 1,
    gap: 6,
    paddingBottom: 2,
  },
  stepsSegment: {
    height: 4,
    borderRadius: 9999,
  },
  stepsName: {
    fontSize: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 9999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  note: {
    fontSize: 14,
    lineHeight: 20,
    marginVertical: 8,
  },
  noticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 16,
    marginBottom: 8,
  },
  instructions: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginVertical: 8,
  },
  primaryBtn: {
    width: '100%',
    height: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryBtn: {
    width: '100%',
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  legDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },
  // Indented like the note: past the dot (10) and the row gap (8).
  legStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 18,
    marginBottom: 6,
  },
  // Indented past the dot (10) and the row gap (8), under the title.
  legNote: {
    fontSize: 12,
    lineHeight: 16,
    paddingLeft: 18,
    marginTop: -2,
    marginBottom: 6,
  },
  statusBox: {
    paddingVertical: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

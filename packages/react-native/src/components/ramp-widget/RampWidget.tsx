import React, { useEffect, useMemo, useState } from 'react';
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
  RampAsset,
  RampDirection,
  RampField,
  RampFiat,
  RampOrder,
  RampQuote,
  RampQuoteRejection,
  RampRoute,
} from '@pollar/core';
import {
  appUnavailableMessage,
  describeRampAction,
  isPollarApiError,
  rampCountries,
  rampLegStatus,
  rampLegTitle,
  rampQuoteFields,
  rampResolutionText,
} from '@pollar/core';
import { usePollar } from '../../context';
import { PollarOverlay } from '../commons';
import { RejectedRouteDisplay, RouteDisplay } from './RouteDisplay';

export type RampStep = 'input' | 'loading_quote' | 'select_route' | 'contact' | 'status' | 'error';

/** Ramp failures a user can act on, by API code. */
const RAMP_ERROR_MESSAGES: Record<string, string> = {
  SDK_RAMPS_QUOTE_EXPIRED: 'This quote expired. Find a route again.',
  SDK_RAMPS_QUOTE_NOT_FOUND: 'This quote is no longer available. Find a route again.',
  SDK_RAMPS_ACTION_STALE: 'This step changed. It was refreshed; try again.',
  SDK_RAMPS_TX_NOT_FOUND: 'This operation was not found.',
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

/** An exact decimal, as the API takes amounts: "10", "10.5", never "1e3" or "-2". */
const DECIMAL = /^\d+(\.\d+)?$/;
const CHAIN_NAME: Record<string, string> = { STELLAR: 'Stellar', POLYGON: 'Polygon', SOLANA: 'Solana' };
const fiatKey = (fiat: Pick<RampFiat, 'currency' | 'rail'>) => `${fiat.currency}:${fiat.rail}`;
const assetKey = (asset: Pick<RampAsset, 'code' | 'chain' | 'identifier'>) =>
  `${asset.code}:${asset.chain}:${asset.identifier ?? ''}`;

export interface RampWidgetTemplateProps {
  theme?: string;
  accentColor?: string;
  step: RampStep;
  direction: RampDirection;
  routesLoading: boolean;
  countries: Array<{ country: string; fiats: RampFiat[] }>;
  country: string;
  fiats: RampFiat[];
  fiat: RampFiat | null;
  assets: RampAsset[];
  asset: RampAsset | null;
  amount: string;
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
  onDirectionChange: (direction: RampDirection) => void;
  onCountryChange: (country: string) => void;
  onFiatChange: (key: string) => void;
  onAssetChange: (key: string) => void;
  onAmountChange: (value: string) => void;
  onFindRoute: () => void;
  onSelectQuote: (quote: RampQuote) => void;
  onFieldChange: (key: string, value: string) => void;
  onContactContinue: () => void;
  onSign: () => void;
  onApprove: () => void;
  onCopy: (text: string) => void;
  onResumeOrder: (id: string) => void;
  onNewOrder: () => void;
  onBack: () => void;
  onRetry: () => void;
  onClose: () => void;
}

export function RampWidgetTemplate({
  theme = 'light',
  accentColor = '#005DB4',
  step,
  direction,
  routesLoading,
  countries,
  country,
  fiats,
  fiat,
  assets,
  asset,
  amount,
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
  onDirectionChange,
  onCountryChange,
  onFiatChange,
  onAssetChange,
  onAmountChange,
  onFindRoute,
  onSelectQuote,
  onFieldChange,
  onContactContinue,
  onSign,
  onApprove,
  onCopy,
  onResumeOrder,
  onNewOrder,
  onBack,
  onRetry,
  onClose,
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
  const missingField = fields.some((f) => !f.optional && !(fieldValues[f.key] ?? '').trim());
  const canFind = !!amount && Number(amount) > 0 && !!fiat && !!asset && !isLoading;

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
  const errorLine = errorMsg ? <Text style={[styles.note, { color: colors.error }]}>{errorMsg}</Text> : null;
  const scannable = view?.scannable ?? null;

  return (
    <View style={[styles.card, { backgroundColor: colors.bg, borderColor: colors.border }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>{onramp ? 'Add funds' : 'Cash out'}</Text>
      </View>

      <TouchableOpacity
        style={[styles.iconButton, styles.closeBtn, { borderColor: colors.border }]}
        onPress={onClose}
        accessibilityLabel="Close"
      >
        <Text style={{ color: colors.muted, fontSize: 16 }}>✕</Text>
      </TouchableOpacity>

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
              <Text style={[styles.note, { color: colors.muted }]}>No ramp routes are available for this app yet.</Text>
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
                      fiats.map((f) => ({ key: fiatKey(f), label: `${f.currency} · ${f.rail}` })),
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
            <Text style={[styles.label, { color: colors.text }]}>
              {onramp ? 'You pay' : 'You sell'}
              {(onramp ? fiat?.currency : asset?.code) ? ` (${onramp ? fiat?.currency : asset?.code})` : ''}
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
              placeholder="25.00"
              placeholderTextColor={colors.muted}
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={onAmountChange}
            />
            {errorLine}
            {primary('Find routes', onFindRoute, !canFind)}
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
              <RejectedRouteDisplay key={i} rejection={r} />
            ))}
            {quotes.length === 0 && (
              <Text style={[styles.note, { color: colors.muted }]}>
                No route can take this amount right now. Try another amount.
              </Text>
            )}
            {startingQuoteId && <ActivityIndicator color={accentColor} />}
            {errorLine}
            {secondary('Back', onBack)}
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
              </View>
            ))}
            {errorLine}
            {primary(isLoading ? 'Starting…' : 'Continue', onContactContinue, missingField || isLoading)}
            {secondary('Back', onBack)}
          </>
        )}

        {step === 'status' && order && view && (
          <>
            <Text style={[styles.label, { color: colors.text }]}>{view.title}</Text>
            {order.legs.map((leg) => {
              const status = rampLegStatus(leg);
              return (
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
            })}

            {order.failure && (
              <>
                <Text style={[styles.note, { color: colors.text }]}>{rampResolutionText(order.failure)}</Text>
                {copyRow('Order', order.id)}
              </>
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
            {!settled && scannable?.payload && scannable.payloadLabel && copyRow(scannable.payloadLabel, scannable.payload)}
            {!settled && view.details.map((d) => copyRow(d.label, d.value))}

            {!settled && view.canSign && primary(signing ? 'Waiting for your wallet…' : 'Authorize', onSign, signing)}
            {!settled && view.canApprove && primary('Approve on this device', onApprove)}
            {!settled && view.link && primary('Complete verification', () => void Linking.openURL(view.link!))}
            {!settled && order.pendingAction?.kind === 'KYC' && !view.link && (
              <Text style={[styles.note, { color: colors.muted }]}>
                The provider is reviewing your details. This updates on its own.
              </Text>
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

export function RampWidget({ onClose }: { onClose: () => void }) {
  const { getClient, copyText, ramp: saved, setRamp: save, styles: pollarStyles, openCosignModal } = usePollar();
  const { theme = 'light', accentColor = '#005DB4' } = pollarStyles;
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
      .listRampOrders({ pending: 'true', limit: 5 })
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
    client.pollRampOrder(orderId, { signal: controller.signal, onUpdate: setOrder }).catch(() => {});
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, step, orderId]);

  async function handleFindRoute() {
    if (!fiat || !asset) return;
    if (!DECIMAL.test(amount.trim()) || Number(amount) <= 0) {
      setErrorMsg('Enter an amount greater than zero.');
      return;
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
    } catch (error) {
      if (isPollarApiError(error) && error.code === 'SDK_RAMPS_NO_ROUTE') {
        setQuotes([]);
        setRejected(Array.isArray(error.body.rejected) ? (error.body.rejected as RampQuoteRejection[]) : []);
        setStep('select_route');
        return;
      }
      setErrorMsg(rampErrorMessage(error, 'Could not find a route. Please try again.'));
      setStep('error');
    }
  }

  function handleSelectQuote(quote: RampQuote) {
    setSelected(quote);
    setErrorMsg(null);
    const missing = rampQuoteFields(quote).some((f) => !f.optional && !(fieldValues[f.key] ?? '').trim());
    if (missing) setStep('contact');
    else void startOrder(quote);
  }

  async function startOrder(quote: RampQuote) {
    setIsLoading(true);
    setStartingQuoteId(quote.quoteId);
    setErrorMsg(null);
    try {
      const payee = Object.fromEntries(
        rampQuoteFields(quote)
          .map((f) => [f.key, (fieldValues[f.key] ?? '').trim()])
          .filter(([, value]) => value),
      );
      setOrder(await client.createRampOrder({ quoteId: quote.quoteId, ...(Object.keys(payee).length ? { payee } : {}) }));
      setStep('status');
    } catch (error) {
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
      setOrder(await client.signRampLeg(order.id, action.actionId));
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

  return (
    <PollarOverlay onCancel={onClose}>
      <View style={styles.modalWrapper}>
        <RampWidgetTemplate
          theme={theme}
          accentColor={accentColor}
          step={step}
          direction={direction}
          routesLoading={routesLoading}
          countries={countries}
          country={country}
          fiats={fiats}
          fiat={fiat}
          assets={assets}
          asset={asset}
          amount={amount}
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
          onDirectionChange={(next) => {
            setDirection(next);
            setErrorMsg(null);
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
          onSelectQuote={handleSelectQuote}
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
            setOrder(null);
            setSelected(null);
            setQuotes([]);
            setRejected([]);
            setErrorMsg(null);
            setStep('input');
          }}
          onBack={() => {
            setErrorMsg(null);
            setStep(step === 'contact' ? 'select_route' : 'input');
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
    marginBottom: 16,
    marginTop: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
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
  statusBox: {
    paddingVertical: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

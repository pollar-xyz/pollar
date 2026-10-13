import React, { useState, useRef, useEffect } from 'react';
import { Image, Linking, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { describeRampAction, rampReplacementQuote, type RampQuote, type PollarClient, type RampSnapshot } from '@pollar/core';
import { ActionButton, Choice, Field, Label } from '../native-ui';
export function RampWorkflow({
  client,
  snapshot,
  onChange,
  onQuoteChanged,
  copyText,
}: {
  client: PollarClient;
  snapshot: RampSnapshot;
  onChange: (next: RampSnapshot) => void;
  onQuoteChanged?: (quote: RampQuote) => void;
  copyText: (text: string) => unknown;
}) {
  const model = describeRampAction(snapshot);
  const locked = useRef(false);
  useEffect(() => {
    setFields({});
  }, [model.action?.actionId]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  async function continueAction() {
    if (!model.action || locked.current) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      onChange(
        model.canSign
          ? await client.signRampAction(snapshot.txId, snapshot)
          : await client.continueRamp(snapshot.txId, {
              actionId: model.action.actionId,
              transactionVersion: snapshot.transactionVersion!,
              ...(model.action.kind === 'collect_information' ? { fields } : {}),
            }),
      );
    } catch (e) {
      const replacement = rampReplacementQuote(e);
      if (replacement && onQuoteChanged) {
        onQuoteChanged(replacement);
        return;
      }
      setError(e instanceof Error ? e.message : 'Unable to continue.');
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return (
    <View accessibilityLabel="Ramp progress" style={{ gap: 12 }}>
      <Label>{model.title}</Label>
      {snapshot.terms && (
        <Label>
          {snapshot.terms.fiatAmount} {snapshot.terms.fiatCurrency} · {snapshot.terms.cryptoAmount} {snapshot.terms.assetCode}
          {'\n'}Includes {snapshot.terms.feeAmount} {snapshot.terms.feeCurrency} fee
        </Label>
      )}
      {model.details.map((item, index) => (
        <Label key={index}>
          {item.label}: {item.value}
        </Label>
      ))}
      {model.links.map((link, index) => (
        <ActionButton key={index} title={link.label} onPress={() => void Linking.openURL(link.url)} />
      ))}
      {model.qrImage && (
        <Image source={{ uri: model.qrImage }} style={{ width: 180, height: 180 }} accessibilityLabel="Payment QR code" />
      )}
      {model.qr && (
        <>
          <QRCode value={model.qr} />
          <ActionButton title="Copy payment code" onPress={() => void copyText(model.qr!)} />
        </>
      )}
      {model.action?.kind === 'collect_information' &&
        model.action.fields.map((field) =>
          field.type === 'select' ? (
            <Choice
              key={field.key}
              label={field.label + (field.optional ? ' (optional)' : '')}
              value={fields[field.key] ?? ''}
              options={field.options?.map((option) => option.value) ?? []}
              labels={Object.fromEntries(field.options?.map((option) => [option.value, option.label]) ?? [])}
              onChange={(value) => setFields((previous) => ({ ...previous, [field.key]: value }))}
            />
          ) : (
            <Field
              key={field.key}
              label={field.label + (field.optional ? ' (optional)' : '')}
              value={fields[field.key] ?? ''}
              onChangeText={(value) => setFields((previous) => ({ ...previous, [field.key]: value }))}
            />
          ),
        )}
      {(model.canContinue || model.canSign) && (
        <ActionButton title={model.canSign ? 'Authorize' : 'Continue'} disabled={busy} onPress={() => void continueAction()} />
      )}
      {snapshot.milestones?.map((milestone, index) => (
        <Label key={index}>
          {milestone.kind.replace(/_/g, ' ')} · {milestone.verifiedAt}
        </Label>
      ))}
      {error && (
        <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={{ color: '#d84a53' }}>
          {error}
        </Text>
      )}
      <Label>Reference: {snapshot.txId}</Label>
    </View>
  );
}

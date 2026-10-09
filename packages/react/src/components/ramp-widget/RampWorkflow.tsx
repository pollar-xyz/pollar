'use client';
import { describeRampAction, type PollarClient, type RampSnapshot } from '@pollar/core';
import { QRCode } from '../../lib/qr-code';
import { useState, useRef, useEffect } from 'react';
export function RampWorkflow({
  client,
  snapshot,
  onChange,
}: {
  client: PollarClient;
  snapshot: RampSnapshot;
  onChange: (next: RampSnapshot) => void;
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
      setError(e instanceof Error ? e.message : 'Unable to continue.');
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return (
    <section aria-label="Ramp progress" aria-live="polite">
      <h3>{model.title}</h3>
      {snapshot.terms && (
        <p>
          {snapshot.terms.fiatAmount} {snapshot.terms.fiatCurrency} · {snapshot.terms.cryptoAmount} {snapshot.terms.assetCode}
          <br />
          Includes {snapshot.terms.feeAmount} {snapshot.terms.feeCurrency} fee
        </p>
      )}
      {model.details.map((item, index) => (
        <p key={index}>
          <strong>{item.label}: </strong>
          {item.value}
        </p>
      ))}
      {model.links.map((link, index) => (
        <p key={index}>
          <a href={link.url} target="_blank" rel="noopener noreferrer">
            {link.label}
          </a>
        </p>
      ))}
      {model.qr && <QRCode value={model.qr} size={180} />}
      {model.qr && (
        <button type="button" onClick={() => void navigator.clipboard.writeText(model.qr!)}>
          Copy payment code
        </button>
      )}
      {model.action?.kind === 'collect_information' &&
        model.action.fields.map((field) => (
          <label key={field.key}>
            {field.label}
            {field.optional ? ' (optional)' : ''}
            {field.type === 'select' ? (
              <select
                value={fields[field.key] ?? ''}
                onChange={(e) => setFields((previous) => ({ ...previous, [field.key]: e.target.value }))}
              >
                <option value="">Choose</option>
                {field.options?.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={field.type}
                placeholder={field.placeholder}
                value={fields[field.key] ?? ''}
                onChange={(e) => setFields((previous) => ({ ...previous, [field.key]: e.target.value }))}
              />
            )}
            {field.hint && <small>{field.hint}</small>}
          </label>
        ))}
      {(model.canContinue || model.canSign) && (
        <button type="button" disabled={busy} onClick={() => void continueAction()}>
          {model.canSign ? 'Authorize' : 'Continue'}
        </button>
      )}
      {snapshot.milestones?.map((milestone, index) => (
        <p key={index}>
          {milestone.kind.replace(/_/g, ' ')} · {milestone.verifiedAt}
        </p>
      ))}
      {error && <p role="alert">{error}</p>}
      <small>Reference: {snapshot.txId}</small>
    </section>
  );
}

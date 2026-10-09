import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { ProviderRegistration } from '@pollar/core';
import { usePollar } from '../../context';
import { PollarModalFooter } from '../commons';
import { formLanguage } from '../requirement-form-modal/form-fields';
import {
  errorCode,
  missingFieldsOf,
  REGISTRATION_COPY,
  registrationFixOf,
  SHARED_FIELD_LABELS,
} from '../registry-check-modal/registry-copy';
import { RequirementFormModal } from '../requirement-form-modal/RequirementFormModal';

export interface ProviderRegistrationModalProps {
  /** The route whose ramp the user registers with. */
  corridorId?: string | undefined;
  /** Or the card provider. One of the two. */
  cardProviderId?: string | undefined;
  /** Position of this step over the route's steps, when known. */
  progress?: { position: number; total: number } | undefined;
  onClose: () => void;
  /** Called once the user is registered with the provider. */
  onRegistered: () => void;
}

/**
 * One PROVIDER_REGISTRATION step: what the ramp provider receives, listed before the
 * user consents. Registering is the consent; nothing is sent until then.
 */
export function ProviderRegistrationModal({
  corridorId,
  cardProviderId,
  progress,
  onClose,
  onRegistered,
}: ProviderRegistrationModalProps) {
  const { getClient, styles: pollarStyles } = usePollar();
  const { theme = 'light', accentColor = '#005DB4' } = pollarStyles;
  const client = getClient();
  const language = useMemo(formLanguage, []);
  const copy = REGISTRATION_COPY[language];
  const labels = SHARED_FIELD_LABELS[language];
  const isDark = theme === 'dark';
  const colors = {
    text: isDark ? '#ffffff' : '#111827',
    muted: isDark ? '#9ca3af' : '#6b7280',
    border: isDark ? '#374151' : '#e5e7eb',
  };

  const [registration, setRegistration] = useState<
    (Pick<ProviderRegistration, 'ready' | 'fields'> & { status: ProviderRegistration['status'] | 'incomplete' }) | null
  >(null);
  const [termsUrl, setTermsUrl] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // The form holding answers the registration could not use: reopened to fix them, then the registration is sent again.
  const [fixForm, setFixForm] = useState<string | null>(null);
  const [fixing, setFixing] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    // Set on every mount: development mounts components twice, and the cleanup of the
    // first mount would otherwise leave this false and drop every response.
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const load = cardProviderId
      ? client.getCardProviderRegistration(cardProviderId).then((loaded) => {
          setTermsUrl(loaded.termsUrl);
          return loaded;
        })
      : client.getProviderRegistration(corridorId ?? '');
    load
      .then((loaded) => {
        if (!mounted.current) return;
        if (loaded.status === 'registered') onRegistered();
        else setRegistration(loaded);
      })
      .catch(() => {
        if (mounted.current) setError(copy.loadError);
      });
    // The client instance, the copy and the callback do not change while the modal is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corridorId, cardProviderId]);

  async function submit() {
    setSubmitting(true);
    setError(null);
    setFixForm(null);
    try {
      if (cardProviderId) await client.submitCardProviderRegistration(cardProviderId);
      else await client.submitProviderRegistration(corridorId ?? '');
      if (mounted.current) onRegistered();
    } catch (e) {
      if (!mounted.current) return;
      const code = errorCode(e);
      if (code === 'KYC_REGISTRATION_MISSING_DATA') {
        const fix = registrationFixOf(e);
        const named = (keys: string[]) => keys.map((key) => labels[key] ?? key).join(', ');
        const missing = missingFieldsOf(e).filter((key) => !fix.invalid.includes(key));
        setError(
          [
            fix.invalid.length ? copy.invalid.replace('{fields}', named(fix.invalid)) : null,
            missing.length ? copy.missing.replace('{fields}', named(missing)) : null,
          ]
            .filter(Boolean)
            .join(' '),
        );
        setFixForm(fix.forms[0]?.formId ?? null);
      } else if (code === 'KYC_REGISTRATION_STEPS_PENDING') setError(copy.notReady);
      else if (code === 'SDK_CARDS_PROVIDER_ERROR') setError(copy.providerDown);
      else if (code === 'SDK_CARDS_IP_NOT_SUPPORTED') setError(copy.ipNotSupported);
      else setError(copy.submitError);
    } finally {
      if (mounted.current) setSubmitting(false);
    }
  }

  const ready = !!registration?.ready;

  if (fixing) {
    return (
      <RequirementFormModal
        formId={fixing}
        onClose={() => setFixing(null)}
        onSubmitted={() => {
          setFixing(null);
          void submit();
        }}
      />
    );
  }

  return (
    <View style={styles.overlay}>
      <View style={styles.modalWrapper}>
        <View style={[styles.card, { backgroundColor: isDark ? '#1a1a1a' : '#ffffff', borderColor: colors.border }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>{copy.title}</Text>
            {progress && (
              <Text style={{ color: colors.muted, fontSize: 14, marginTop: 4 }}>
                {copy.step.replace('{n}', String(progress.position)).replace('{total}', String(progress.total))}
              </Text>
            )}
          </View>
          <TouchableOpacity
            style={[styles.closeBtn, { borderColor: colors.border }]}
            onPress={onClose}
            accessibilityLabel={copy.close}
          >
            <Text style={{ color: colors.muted, fontSize: 16 }}>✕</Text>
          </TouchableOpacity>

          {!!error && (
            <View style={[styles.notice, { borderColor: colors.border, borderLeftColor: accentColor }]}>
              <Text style={{ color: colors.text, fontSize: 14, lineHeight: 20 }} accessibilityRole="alert">
                {error}
              </Text>
            </View>
          )}
          {!!fixForm && !submitting && (
            <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: accentColor }]} onPress={() => setFixing(fixForm)}>
              <Text style={styles.primaryBtnText}>{copy.fix}</Text>
            </TouchableOpacity>
          )}

          {!registration && !error && (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={accentColor} />
            </View>
          )}

          {registration && !ready && (
            <View style={[styles.notice, { borderColor: colors.border, borderLeftColor: accentColor }]}>
              <Text style={{ color: colors.text, fontSize: 14, lineHeight: 20 }}>{copy.notReady}</Text>
            </View>
          )}

          {registration && ready && (
            <ScrollView style={{ maxHeight: 360 }}>
              {registration.status === 'incomplete' && (
                <View style={[styles.notice, { borderColor: colors.border, borderLeftColor: accentColor }]}>
                  <Text style={{ color: colors.text, fontSize: 14, lineHeight: 20 }}>{copy.incomplete}</Text>
                </View>
              )}
              <Text style={{ color: colors.muted, fontSize: 14, marginBottom: 8 }}>{copy.intro}</Text>
              {registration.fields.map((key) => (
                <Text key={key} style={{ color: colors.text, fontSize: 14, marginBottom: 4 }}>
                  {'•'} {labels[key] ?? key}
                </Text>
              ))}
              {termsUrl && (
                <TouchableOpacity onPress={() => void Linking.openURL(termsUrl)}>
                  <Text style={{ color: accentColor, fontSize: 14, marginTop: 8, textDecorationLine: 'underline' }}>
                    {copy.terms}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.choice}
                onPress={() => setConsent((value) => !value)}
                disabled={submitting}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: consent, disabled: submitting }}
              >
                <View
                  style={[
                    styles.box,
                    {
                      borderColor: consent ? accentColor : colors.border,
                      backgroundColor: consent ? accentColor : 'transparent',
                    },
                  ]}
                >
                  {consent && <Text style={styles.boxMark}>✓</Text>}
                </View>
                <Text style={{ color: colors.text, fontSize: 14, flex: 1 }}>{copy.consent}</Text>
              </TouchableOpacity>
            </ScrollView>
          )}

          {registration && ready && (
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: accentColor, opacity: submitting || !consent ? 0.6 : 1 }]}
              onPress={() => void submit()}
              disabled={submitting || !consent}
            >
              <Text style={styles.primaryBtnText}>{submitting ? copy.submitting : copy.submit}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.secondaryBtn, { borderColor: colors.border }]}
            onPress={onClose}
            disabled={submitting}
          >
            <Text style={{ color: colors.text, fontWeight: '600' }}>{copy.close}</Text>
          </TouchableOpacity>
          <PollarModalFooter />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 50,
  },
  modalWrapper: { width: '100%', maxWidth: 400 },
  card: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 25,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  header: { marginBottom: 12, marginTop: 10, paddingRight: 40 },
  title: { fontSize: 22, fontWeight: '700' },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 6,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  notice: { borderWidth: 1, borderLeftWidth: 3, borderRadius: 8, padding: 12, marginBottom: 8 },
  loadingBox: { padding: 24, alignItems: 'center', justifyContent: 'center' },
  choice: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 },
  box: { width: 20, height: 20, borderRadius: 4, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
  boxMark: { color: '#fff', fontSize: 13, fontWeight: '700' },
  primaryBtn: { width: '100%', height: 44, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginTop: 12 },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondaryBtn: {
    width: '100%',
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
});

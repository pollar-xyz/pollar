import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { RegistryCheck, RegistryCheckPrefill } from '@pollar/core';
import { usePollar } from '../../context';
import { PollarModalFooter } from '../commons';
import { formLanguage } from '../requirement-form-modal/form-fields';
import { errorCode, REGISTRY_COPY } from './registry-copy';

export interface RegistryCheckModalProps {
  optionId: string;
  /** Position of this step over the route's steps, when known. */
  progress?: { position: number; total: number } | undefined;
  onClose: () => void;
  /** Called once the registry confirmed the data. */
  onApproved: () => void;
}

/**
 * One REGISTRY_CHECK step (SEGIP): the user's verified data, prefilled and read-only
 * except for the surname split and the CI complement, sent to the registry on confirm.
 */
export function RegistryCheckModal({ optionId, progress, onClose, onApproved }: RegistryCheckModalProps) {
  const { getClient, styles: pollarStyles } = usePollar();
  const { theme = 'light', accentColor = '#005DB4' } = pollarStyles;
  const client = getClient();
  const language = useMemo(formLanguage, []);
  const copy = REGISTRY_COPY[language];
  const isDark = theme === 'dark';
  const colors = {
    text: isDark ? '#ffffff' : '#111827',
    muted: isDark ? '#9ca3af' : '#6b7280',
    border: isDark ? '#374151' : '#e5e7eb',
    itemBg: isDark ? '#262626' : '#f9fafb',
  };

  const [check, setCheck] = useState<RegistryCheck | null>(null);
  const [surname1, setSurname1] = useState('');
  const [surname2, setSurname2] = useState('');
  const [complement, setComplement] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
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
    client
      .getRegistryCheck(optionId)
      .then((loaded) => {
        if (!mounted.current) return;
        if (loaded.status === 'approved') return onApproved();
        setCheck(loaded);
        if (loaded.status === 'pending') setReview(true);
        // A check the registry did not confirm on the surnames or the complement: say which, keep the form open.
        if (loaded.status === 'rejected') setError(rejectedMessage(loaded.rejectedFields));
        if (loaded.prefill.applies) {
          setSurname1(loaded.prefill.surname1);
          setSurname2(loaded.prefill.surname2 ?? '');
          setComplement(loaded.prefill.complementNumber ?? '');
        }
      })
      .catch((e: unknown) => {
        if (!mounted.current) return;
        setError(errorCode(e) === 'KYC_REGISTRY_IDENTITY_REQUIRED' ? copy.identityRequired : copy.loadError);
      });
    // The client instance and the copy do not change while the modal is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionId]);

  const prefill: RegistryCheckPrefill | null = check?.prefill.applies ? check.prefill : null;

  /** The registry's rejected fields, named as the screen names them. */
  function rejectedMessage(fields: string[] | undefined) {
    const labels: Record<string, string> = { surname1: copy.surname1, surname2: copy.surname2, complementNumber: copy.complement };
    const named = (fields ?? []).map((field) => labels[field] ?? field);
    return copy.rejected.replace('{fields}', named.length ? named.join(', ') : copy.surname2);
  }

  async function submit() {
    if (!prefill) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await client.submitRegistryCheck(optionId, {
        surname1: surname1.trim(),
        ...(surname2.trim() ? { surname2: surname2.trim() } : {}),
        ...(complement.trim() ? { complementNumber: complement.trim() } : {}),
      });
      if (!mounted.current) return;
      if (result.status === 'approved') onApproved();
      else if (result.status === 'rejected') setError(rejectedMessage(result.rejectedFields));
      else setReview(true);
    } catch (e) {
      if (!mounted.current) return;
      const code = errorCode(e);
      // A check recorded while this screen was open (a slow answer the client gave up on) is the approval.
      if (code === 'SDK_KYC_ALREADY_APPROVED') return onApproved();
      if (code === 'KYC_REGISTRY_NAME_MISMATCH') {
        setError(copy.nameMismatch.replace('{full}', [prefill.surname1, prefill.surname2].filter(Boolean).join(' ')));
      } else if (code === 'SDK_KYC_UNDER_REVIEW') setReview(true);
      else setError(copy.submitError);
    } finally {
      if (mounted.current) setSubmitting(false);
    }
  }

  const input = [styles.input, { borderColor: colors.border, backgroundColor: colors.itemBg, color: colors.text }];
  const readOnly = (label: string, value: string) => (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <TextInput style={[input, { opacity: 0.6 }]} value={value} editable={false} />
    </View>
  );
  const editable = (label: string, value: string, onChange: (value: string) => void, extra: { maxLength?: number } = {}) => (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <TextInput
        style={input}
        value={value}
        editable={!submitting}
        autoCapitalize="characters"
        onChangeText={onChange}
        {...extra}
      />
    </View>
  );

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

          {!check && !error && (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={accentColor} />
            </View>
          )}

          {check && (review || !prefill) && (
            <View style={[styles.notice, { borderColor: colors.border, borderLeftColor: accentColor }]}>
              <Text style={{ color: colors.text, fontSize: 14, lineHeight: 20 }}>
                {review ? copy.review : copy.notApplicable}
              </Text>
            </View>
          )}

          {prefill && !review && (
            <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
              <Text style={{ color: colors.muted, fontSize: 14, marginBottom: 12 }}>{copy.intro}</Text>
              {readOnly(copy.givenNames, prefill.givenNames)}
              {editable(`${copy.surname1} *`, surname1, setSurname1)}
              {editable(copy.surname2, surname2, setSurname2)}
              {readOnly(copy.birthdate, prefill.birthdate)}
              {readOnly(copy.documentNumber, prefill.documentNumber)}
              {editable(copy.complement, complement, (value) => setComplement(value.toUpperCase().replace(/[^0-9A-Z]/g, '')), {
                maxLength: 3,
              })}
            </ScrollView>
          )}

          {prefill && !review && (
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: accentColor, opacity: submitting || !surname1.trim() ? 0.6 : 1 }]}
              onPress={() => void submit()}
              disabled={submitting || !surname1.trim()}
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
  field: { marginBottom: 14 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 8, height: 44, paddingHorizontal: 12, fontSize: 15 },
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

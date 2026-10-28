import { useInheritedLanguage } from '../../language-context';
import { type CosignDevicesContent, type PollarLanguage, type RecoveryState } from '@pollar/core';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { PollarModalFooter } from '../commons';
import { RECOVERY_COPY } from './recovery-copy';

export type RecoveryView = 'overview' | 'email' | 'export' | 'recover-email';

export interface RecoveryModalTemplateProps {
  theme: string;
  accentColor: string;
  /** Null while the first read is in flight. */
  state: RecoveryState | null;
  devices: CosignDevicesContent | null;
  thisDeviceKey: string | null;
  /** Whether this device's key is one of the wallet's credentials. */
  thisDeviceEnrolled: boolean;
  /** Whether the runtime can run passkey ceremonies here. */
  passkeyAvailable: boolean;
  /** A self-custody wallet of an app that never asked the user to accept its risks. */
  selfCustodyRisks: boolean;
  view: RecoveryView;
  /** The action in flight, by key, for its button's spinner. */
  busy: string | null;
  error: string | null;
  notice: string | null;
  emailDraft: string;
  codeSent: boolean;
  /** The recovery phrase, once exported. */
  phrase: string | null;
  onView: (view: RecoveryView) => void;
  onEmailDraft: (email: string) => void;
  onAddPasskey: () => void;
  onRemovePasskey: (authenticatorId: string) => void;
  onSendEmailCode: () => void;
  onConfirmEmail: (code: string) => void;
  onApproveDevice: (enrollmentId: string) => void;
  onRejectDevice: (enrollmentId: string) => void;
  onRequestEnrollment: () => void;
  onRecoverWithPasskey: () => void;
  onSendRecoveryCode: () => void;
  onRecoverWithCode: (code: string) => void;
  onExport: () => void;
  onClose: () => void;
  /** Language of the modal's text. Defaults to the user's device; the modal passes the resolved one. */
  language?: PollarLanguage | undefined;
}

type Copy = (typeof RECOVERY_COPY)['en'];

type Colors = ReturnType<typeof palette>;

function palette(isDark: boolean) {
  return {
    bg: isDark ? '#1a1a1a' : '#ffffff',
    border: isDark ? '#374151' : '#e5e7eb',
    text: isDark ? '#ffffff' : '#111827',
    muted: isDark ? '#9ca3af' : '#6b7280',
    errorBg: isDark ? '#2a1515' : '#fef2f2',
    errorText: isDark ? '#f87171' : '#b91c1c',
    warnBg: isDark ? '#2a2212' : '#fffbeb',
    warnText: isDark ? '#fbbf24' : '#92400e',
    okBg: isDark ? '#12261a' : '#f0fdf4',
    okText: isDark ? '#4ade80' : '#15803d',
  };
}

const shortKey = (key: string) => `${key.slice(0, 6)}...${key.slice(-4)}`;

function Button(props: {
  copy: Copy;
  colors: Colors;
  accentColor: string;
  busy: string | null;
  id: string;
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'quiet' | 'danger';
  disabled?: boolean;
}) {
  const kind = props.kind ?? 'quiet';
  const disabled = props.disabled || props.busy !== null;
  const tint = kind === 'primary' ? props.accentColor : kind === 'danger' ? props.colors.errorText : props.colors.border;
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={props.label}
      disabled={disabled}
      onPress={props.onPress}
      style={[
        styles.btn,
        { borderColor: tint, opacity: disabled ? 0.55 : 1 },
        kind === 'primary' ? { backgroundColor: props.accentColor } : null,
      ]}
    >
      <Text
        style={{
          fontWeight: '600',
          color: kind === 'primary' ? '#fff' : kind === 'danger' ? props.colors.errorText : props.colors.text,
        }}
      >
        {props.busy === props.id ? props.copy.working : props.label}
      </Text>
    </TouchableOpacity>
  );
}

function Banner({ colors, tone, children }: { colors: Colors; tone: 'warn' | 'ok'; children: React.ReactNode }) {
  return (
    <View
      accessibilityRole={tone === 'warn' ? 'alert' : 'text'}
      style={[styles.banner, { backgroundColor: tone === 'warn' ? colors.warnBg : colors.okBg }]}
    >
      <Text style={{ color: tone === 'warn' ? colors.warnText : colors.okText }}>{children}</Text>
    </View>
  );
}

function CodeForm(props: {
  copy: Copy;
  colors: Colors;
  accentColor: string;
  busy: string | null;
  id: string;
  label: string;
  onSubmit: (code: string) => void;
}) {
  const [code, setCode] = useState('');
  return (
    <View style={styles.row}>
      <TextInput
        style={[styles.input, { borderColor: props.colors.border, color: props.colors.text }]}
        value={code}
        onChangeText={setCode}
        placeholder={props.copy.codePlaceholder}
        placeholderTextColor={props.colors.muted}
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        keyboardType="number-pad"
        accessibilityLabel={props.copy.codePlaceholder}
      />
      <Button
        copy={props.copy}
        colors={props.colors}
        accentColor={props.accentColor}
        busy={props.busy}
        id={props.id}
        label={props.label}
        kind="primary"
        onPress={() => code.trim() && props.onSubmit(code)}
        disabled={!code.trim()}
      />
    </View>
  );
}

export function RecoveryModalTemplate(p: RecoveryModalTemplateProps) {
  const colors = palette(p.theme === 'dark');
  const copy = RECOVERY_COPY[useInheritedLanguage(p.language)];
  const [exportAccepted, setExportAccepted] = useState(false);
  const [risksAccepted, setRisksAccepted] = useState(false);
  const state = p.state;
  const locked = !!state && state.required && !state.configured;
  // An app in SELF_CUSTODY creates the wallet at login, so this is the first
  // place its user reads what self-custody means; setup waits for the accept.
  const risksPending = locked && p.selfCustodyRisks && !risksAccepted;
  const lastMethod =
    !!state && state.passkeys.length + (state.email.verified ? 1 : 0) + (state.devices.length >= 2 ? 1 : 0) <= 1;
  const btn = { copy, colors, accentColor: p.accentColor, busy: p.busy };
  const muted = (text: string) => <Text style={{ color: colors.muted }}>{text}</Text>;
  const heading = (text: string) => <Text style={[styles.sectionTitle, { color: colors.text }]}>{text}</Text>;
  const back = <Button {...btn} id="back" label={copy.back} onPress={() => p.onView('overview')} />;

  let body: React.ReactNode;
  if (!state) {
    body = muted(copy.loading);
  } else if (!state.required) {
    body = muted(copy.notRequired);
  } else if (!p.thisDeviceEnrolled && p.view !== 'recover-email') {
    // A device the user signed in on, but whose key is not one of the wallet's credentials.
    body = (
      <>
        <Banner colors={colors} tone="warn">
          {copy.notEnrolled}
        </Banner>
        {state.passkeys.length > 0 && p.passkeyAvailable && (
          <Button {...btn} id="recover-passkey" label={copy.usePasskey} kind="primary" onPress={p.onRecoverWithPasskey} />
        )}
        {state.email.verified && (
          <Button
            {...btn}
            id="recover-send"
            label={copy.emailCodeTo(state.email.address ?? copy.yourEmail)}
            onPress={() => p.onView('recover-email')}
          />
        )}
        <Button {...btn} id="enroll" label={copy.askAnotherDevice} onPress={p.onRequestEnrollment} />
      </>
    );
  } else if (risksPending && p.view === 'overview') {
    body = (
      <>
        <Banner colors={colors} tone="warn">
          {copy.selfCustodyWarning}
        </Banner>
        <Button {...btn} id="accept-risks" label={copy.acceptRisks} kind="primary" onPress={() => setRisksAccepted(true)} />
      </>
    );
  } else if (p.view === 'recover-email') {
    body = (
      <>
        {muted(copy.recoverEmailIntro(state.email.address ?? copy.yourEmail))}
        {!p.codeSent ? (
          <Button {...btn} id="recover-send" label={copy.sendCode} kind="primary" onPress={p.onSendRecoveryCode} />
        ) : (
          <CodeForm {...btn} id="recover-code" label={copy.recover} onSubmit={p.onRecoverWithCode} />
        )}
        {back}
      </>
    );
  } else if (p.view === 'email') {
    body = (
      <>
        {muted(copy.emailIntro)}
        {!p.codeSent ? (
          <View style={styles.row}>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.text }]}
              value={p.emailDraft}
              onChangeText={p.onEmailDraft}
              placeholder={copy.emailPlaceholder}
              placeholderTextColor={colors.muted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              accessibilityLabel={copy.email}
            />
            <Button
              {...btn}
              id="email-send"
              label={copy.sendCode}
              kind="primary"
              onPress={p.onSendEmailCode}
              disabled={!p.emailDraft.trim()}
            />
          </View>
        ) : (
          <CodeForm {...btn} id="email-confirm" label={copy.confirm} onSubmit={p.onConfirmEmail} />
        )}
        {back}
      </>
    );
  } else if (p.view === 'export') {
    body = p.phrase ? (
      <>
        <Banner colors={colors} tone="warn">
          {copy.phraseWarning}
        </Banner>
        <Text selectable style={[styles.phrase, { borderColor: colors.border, color: colors.text }]}>
          {p.phrase}
        </Text>
        <Button {...btn} id="hide" label={copy.hide} kind="primary" onPress={() => p.onView('overview')} />
      </>
    ) : (
      <>
        {muted(copy.exportIntro)}
        <TouchableOpacity
          accessibilityRole="checkbox"
          accessibilityState={{ checked: exportAccepted }}
          onPress={() => setExportAccepted((v) => !v)}
          style={styles.check}
        >
          <View
            style={[
              styles.box,
              { borderColor: colors.border },
              exportAccepted ? { backgroundColor: p.accentColor, borderColor: p.accentColor } : null,
            ]}
          />
          <Text style={{ color: colors.text, flexShrink: 1 }}>{copy.exportAccept}</Text>
        </TouchableOpacity>
        <Button {...btn} id="export" label={copy.showPhrase} kind="danger" onPress={p.onExport} disabled={!exportAccepted} />
        {back}
      </>
    );
  } else {
    const enrollments = p.devices?.enrollments ?? [];
    body = (
      <>
        {locked ? (
          <Banner colors={colors} tone="warn">
            {copy.locked(p.passkeyAvailable)}
          </Banner>
        ) : (
          <Banner colors={colors} tone="ok">
            {copy.recoverable}
          </Banner>
        )}

        <View style={[styles.section, { borderColor: colors.border }]}>
          {heading(copy.passkeys)}
          {state.passkeys.length === 0 && muted(copy.noPasskey)}
          {state.passkeys.map((pk) => (
            <View key={pk.authenticatorId} style={styles.item}>
              <Text style={{ color: colors.text, flexShrink: 1 }}>{pk.name}</Text>
              <Button
                {...btn}
                id={`passkey:${pk.authenticatorId}`}
                label={copy.remove}
                kind="danger"
                onPress={() => p.onRemovePasskey(pk.authenticatorId)}
                disabled={lastMethod}
              />
            </View>
          ))}
          {p.passkeyAvailable ? (
            <Button {...btn} id="passkey" label={copy.addPasskey} onPress={p.onAddPasskey} />
          ) : (
            muted(copy.passkeysUnavailableApp)
          )}
        </View>

        <View style={[styles.section, { borderColor: colors.border }]}>
          {heading(copy.email)}
          {state.email.verified ? (
            <View style={styles.item}>
              <Text style={{ color: colors.text, flexShrink: 1 }}>{state.email.address}</Text>
              <Text style={{ color: colors.okText }}>{copy.confirmed}</Text>
            </View>
          ) : (
            <Button {...btn} id="email" label={copy.confirmEmail} onPress={() => p.onView('email')} />
          )}
        </View>

        <View style={[styles.section, { borderColor: colors.border }]}>
          {heading(copy.devices)}
          {(p.devices?.devices ?? []).map((d) => (
            <View key={d.id} style={styles.item}>
              <Text style={{ color: colors.text, flexShrink: 1 }}>{d.label ?? shortKey(d.publicKey)}</Text>
              {d.publicKey.toLowerCase() === p.thisDeviceKey && <Text style={{ color: colors.muted }}>{copy.thisDevice}</Text>}
            </View>
          ))}
          {enrollments.map((e) => (
            <View key={e.id} style={[styles.pending, { borderColor: p.accentColor }]}>
              <Text style={{ color: colors.text }}>{copy.wantsToJoin(e.label ?? copy.aDevice, shortKey(e.publicKey))}</Text>
              <View style={styles.row}>
                <Button
                  {...btn}
                  id={`approve:${e.id}`}
                  label={copy.approve}
                  kind="primary"
                  onPress={() => p.onApproveDevice(e.id)}
                />
                <Button {...btn} id={`reject:${e.id}`} label={copy.reject} onPress={() => p.onRejectDevice(e.id)} />
              </View>
            </View>
          ))}
          {muted(copy.addDeviceHelp)}
        </View>

        <View style={[styles.section, { borderColor: colors.border }]}>
          {heading(copy.recoveryPhrase)}
          <Button {...btn} id="export-open" label={copy.exportPhrase} onPress={() => p.onView('export')} />
        </View>
      </>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.bg, borderColor: colors.border }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>{copy.title}</Text>
        <TouchableOpacity onPress={p.onClose} accessibilityRole="button" accessibilityLabel={copy.close}>
          <Text style={{ color: colors.muted, fontSize: 18 }}>x</Text>
        </TouchableOpacity>
      </View>
      <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {body}
        {p.notice ? <Text style={{ color: colors.okText }}>{p.notice}</Text> : null}
        {p.error ? (
          <View accessibilityRole="alert" style={[styles.banner, { backgroundColor: colors.errorBg }]}>
            <Text style={{ color: colors.errorText }}>{p.error}</Text>
          </View>
        ) : null}
      </ScrollView>
      <PollarModalFooter />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%', maxWidth: 420, borderRadius: 16, borderWidth: 1, padding: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 17, fontWeight: '600' },
  body: { gap: 10 },
  banner: { borderRadius: 10, padding: 10 },
  section: { borderTopWidth: 1, paddingTop: 10, gap: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '600' },
  item: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  pending: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9 },
  btn: { alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  box: { width: 20, height: 20, borderRadius: 4, borderWidth: 1.5 },
  phrase: { borderWidth: 1, borderRadius: 10, padding: 12, fontFamily: 'Courier', lineHeight: 22 },
});

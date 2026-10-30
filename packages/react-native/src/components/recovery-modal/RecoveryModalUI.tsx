import type { CosignDevicesContent, RecoveryState } from '@pollar/core';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { PollarModalFooter } from '../commons';

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
}

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
        {props.busy === props.id ? 'Working...' : props.label}
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
        placeholder="Code from the email"
        placeholderTextColor={props.colors.muted}
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        keyboardType="number-pad"
        accessibilityLabel="Code from the email"
      />
      <Button
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
  const [exportAccepted, setExportAccepted] = useState(false);
  const [risksAccepted, setRisksAccepted] = useState(false);
  const state = p.state;
  const locked = !!state && state.required && !state.configured;
  // An app in SELF_CUSTODY creates the wallet at login, so this is the first
  // place its user reads what self-custody means; setup waits for the accept.
  const risksPending = locked && p.selfCustodyRisks && !risksAccepted;
  const lastMethod =
    !!state && state.passkeys.length + (state.email.verified ? 1 : 0) + (state.devices.length >= 2 ? 1 : 0) <= 1;
  const btn = { colors, accentColor: p.accentColor, busy: p.busy };
  const muted = (text: string) => <Text style={{ color: colors.muted }}>{text}</Text>;
  const heading = (text: string) => <Text style={[styles.sectionTitle, { color: colors.text }]}>{text}</Text>;
  const back = <Button {...btn} id="back" label="Back" onPress={() => p.onView('overview')} />;

  let body: React.ReactNode;
  if (!state) {
    body = muted("Loading your wallet's recovery methods...");
  } else if (!state.required) {
    body = muted("This wallet doesn't need recovery methods: it isn't secured by your device.");
  } else if (!p.thisDeviceEnrolled && p.view !== 'recover-email') {
    // A device the user signed in on, but whose key is not one of the wallet's credentials.
    body = (
      <>
        <Banner colors={colors} tone="warn">
          This device isn&apos;t part of your wallet yet. Get back in with one of your recovery methods, or ask a device that
          already has the wallet to add this one.
        </Banner>
        {state.passkeys.length > 0 && p.passkeyAvailable && (
          <Button {...btn} id="recover-passkey" label="Use a passkey" kind="primary" onPress={p.onRecoverWithPasskey} />
        )}
        {state.email.verified && (
          <Button
            {...btn}
            id="recover-send"
            label={`Email a code to ${state.email.address ?? 'your email'}`}
            onPress={() => p.onView('recover-email')}
          />
        )}
        <Button {...btn} id="enroll" label="Ask another device to add this one" onPress={p.onRequestEnrollment} />
      </>
    );
  } else if (risksPending && p.view === 'overview') {
    body = (
      <>
        <Banner colors={colors} tone="warn">
          This is a self-custody wallet: only your device can sign. If you lose this device and every recovery method, nobody
          can recover the wallet or its funds, not the app and not Pollar. Nobody can undo or freeze a transaction you sign.
        </Banner>
        <Button
          {...btn}
          id="accept-risks"
          label="I understand and accept these risks"
          kind="primary"
          onPress={() => setRisksAccepted(true)}
        />
      </>
    );
  } else if (p.view === 'recover-email') {
    body = (
      <>
        {muted(
          `We'll email a code to ${state.email.address ?? 'your email'}. The code goes straight to the wallet provider, encrypted on this device.`,
        )}
        {!p.codeSent ? (
          <Button {...btn} id="recover-send" label="Send code" kind="primary" onPress={p.onSendRecoveryCode} />
        ) : (
          <CodeForm {...btn} id="recover-code" label="Recover" onSubmit={p.onRecoverWithCode} />
        )}
        {back}
      </>
    );
  } else if (p.view === 'email') {
    body = (
      <>
        {muted(
          'Confirm an email you control. If you lose this device, a code sent there lets you add a new one. Anyone who controls this inbox could do the same, so use one that is well protected.',
        )}
        {!p.codeSent ? (
          <View style={styles.row}>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.text }]}
              value={p.emailDraft}
              onChangeText={p.onEmailDraft}
              placeholder="you@example.com"
              placeholderTextColor={colors.muted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              accessibilityLabel="Email"
            />
            <Button
              {...btn}
              id="email-send"
              label="Send code"
              kind="primary"
              onPress={p.onSendEmailCode}
              disabled={!p.emailDraft.trim()}
            />
          </View>
        ) : (
          <CodeForm {...btn} id="email-confirm" label="Confirm" onSubmit={p.onConfirmEmail} />
        )}
        {back}
      </>
    );
  } else if (p.view === 'export') {
    body = p.phrase ? (
      <>
        <Banner colors={colors} tone="warn">
          Anyone with these words controls every account in this wallet. Write them down offline and never share them.
        </Banner>
        <Text selectable style={[styles.phrase, { borderColor: colors.border, color: colors.text }]}>
          {p.phrase}
        </Text>
        <Button {...btn} id="hide" label="Hide" kind="primary" onPress={() => p.onView('overview')} />
      </>
    ) : (
      <>
        {muted(
          'Your recovery phrase lets you take this wallet to another app. It is decrypted only on this device; the app and Pollar never see it.',
        )}
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
          <Text style={{ color: colors.text, flexShrink: 1 }}>
            I understand that whoever sees the phrase controls the wallet
          </Text>
        </TouchableOpacity>
        <Button
          {...btn}
          id="export"
          label="Show recovery phrase"
          kind="danger"
          onPress={p.onExport}
          disabled={!exportAccepted}
        />
        {back}
      </>
    );
  } else {
    const enrollments = p.devices?.enrollments ?? [];
    body = (
      <>
        {locked ? (
          <Banner colors={colors} tone="warn">
            Your wallet is locked until you add a way to recover it. Without one, losing this device means losing the funds, and
            nobody can get them back, not the app and not Pollar. Add {p.passkeyAvailable ? 'a passkey, ' : ''}a second device
            or your email.
          </Banner>
        ) : (
          <Banner colors={colors} tone="ok">
            Your wallet can be recovered if you lose this device.
          </Banner>
        )}

        <View style={[styles.section, { borderColor: colors.border }]}>
          {heading('Passkeys')}
          {state.passkeys.length === 0 && muted('No passkey yet.')}
          {state.passkeys.map((pk) => (
            <View key={pk.authenticatorId} style={styles.item}>
              <Text style={{ color: colors.text, flexShrink: 1 }}>{pk.name}</Text>
              <Button
                {...btn}
                id={`passkey:${pk.authenticatorId}`}
                label="Remove"
                kind="danger"
                onPress={() => p.onRemovePasskey(pk.authenticatorId)}
                disabled={lastMethod}
              />
            </View>
          ))}
          {p.passkeyAvailable ? (
            <Button {...btn} id="passkey" label="Add a passkey" onPress={p.onAddPasskey} />
          ) : (
            muted("Passkeys aren't available in this app.")
          )}
        </View>

        <View style={[styles.section, { borderColor: colors.border }]}>
          {heading('Email')}
          {state.email.verified ? (
            <View style={styles.item}>
              <Text style={{ color: colors.text, flexShrink: 1 }}>{state.email.address}</Text>
              <Text style={{ color: colors.okText }}>Confirmed</Text>
            </View>
          ) : (
            <Button {...btn} id="email" label="Confirm an email" onPress={() => p.onView('email')} />
          )}
        </View>

        <View style={[styles.section, { borderColor: colors.border }]}>
          {heading('Devices')}
          {(p.devices?.devices ?? []).map((d) => (
            <View key={d.id} style={styles.item}>
              <Text style={{ color: colors.text, flexShrink: 1 }}>{d.label ?? shortKey(d.publicKey)}</Text>
              {d.publicKey.toLowerCase() === p.thisDeviceKey && <Text style={{ color: colors.muted }}>This device</Text>}
            </View>
          ))}
          {enrollments.map((e) => (
            <View key={e.id} style={[styles.pending, { borderColor: p.accentColor }]}>
              <Text style={{ color: colors.text }}>
                {e.label ?? 'A device'} wants to join ({shortKey(e.publicKey)})
              </Text>
              <View style={styles.row}>
                <Button
                  {...btn}
                  id={`approve:${e.id}`}
                  label="Approve"
                  kind="primary"
                  onPress={() => p.onApproveDevice(e.id)}
                />
                <Button {...btn} id={`reject:${e.id}`} label="Reject" onPress={() => p.onRejectDevice(e.id)} />
              </View>
            </View>
          ))}
          {muted(
            'To add another device, sign in there and choose "Ask another device to add this one"; it shows up here to approve. Only approve a device you are holding.',
          )}
        </View>

        <View style={[styles.section, { borderColor: colors.border }]}>
          {heading('Recovery phrase')}
          <Button {...btn} id="export-open" label="Export recovery phrase" onPress={() => p.onView('export')} />
        </View>
      </>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.bg, borderColor: colors.border }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Wallet recovery</Text>
        <TouchableOpacity onPress={p.onClose} accessibilityRole="button" accessibilityLabel="Close">
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

import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { PollarLanguage } from '@pollar/core';
import { ScreenLayout as Screen } from './layout';
import { LANGUAGE_NAMES, NEXT_LANGUAGE, ONBOARDING_COPY } from './shell-copy';
export interface ApplicationSummary {
  id: string;
  name: string;
  network: 'testnet' | 'mainnet';
  accessType?: string;
}
/** Account data only: credentials and Hub transport never enter this template. */
export interface AccountOnboardingProps {
  account: {
    loaded: boolean;
    busy: boolean;
    error: string;
    cleanupRequired: boolean;
    session: { data?: { mail?: string } } | null;
    applications: ApplicationSummary[];
    client: {
      signIn: () => Promise<unknown>;
      cancelSignIn: () => void;
      clearSavedCredentials: () => Promise<unknown>;
      create: (name: string) => Promise<unknown>;
      select: (app: ApplicationSummary) => Promise<unknown>;
      reload: () => Promise<unknown>;
      logout: () => Promise<unknown>;
    };
  };
  settings: { theme: 'light' | 'dark'; language: PollarLanguage };
  onPreferencesChange: (next: AccountOnboardingProps['settings']) => Promise<void>;
}

export function AccountOnboarding({ account, settings, onPreferencesChange: save }: AccountOnboardingProps) {
  const [name, setName] = useState('');
  const copy = ONBOARDING_COPY[settings.language];
  const next = NEXT_LANGUAGE[settings.language];
  const dark = settings.theme === 'dark';
  const foreground = dark ? '#f0f5ff' : '#152237';
  const muted = dark ? '#b6c7dd' : '#506680';
  const button = (title: string, onPress: () => void, disabled = account.busy, secondary = false) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: secondary ? (dark ? '#24354c' : '#e7eef8') : '#1763df',
          opacity: disabled || pressed ? 0.55 : 1,
        },
      ]}
    >
      <Text
        style={{
          color: secondary ? foreground : '#fff',
          fontWeight: '700',
          fontSize: 16,
        }}
      >
        {title}
      </Text>
    </Pressable>
  );
  if (!account.loaded)
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator accessibilityLabel={copy.restoring} />
      </SafeAreaView>
    );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: dark ? '#101827' : '#f5f7fb' }}>
      <Screen>
        <View style={styles.brandRow}>
          <Text style={[styles.brand, { color: foreground }]}>pollar</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.changeLanguage}
            onPress={() => void save({ ...settings, language: next })}
          >
            <Text style={{ color: muted }}>{LANGUAGE_NAMES[next]}</Text>
          </Pressable>
        </View>
        <View style={styles.hero}>
          <Text style={{ color: '#9ac5ff', fontWeight: '800', letterSpacing: 2 }}>POLLAR · MOBILE</Text>
          <Text style={styles.heading}>{account.session ? copy.yourApplications : copy.heroSignedOut}</Text>
          <Text style={styles.description}>{account.session ? copy.introSignedIn : copy.introSignedOut}</Text>
        </View>
        {!!account.error && (
          <View accessibilityRole="alert" style={styles.error}>
            <Text style={{ color: '#8c2525' }}>
              {account.error === 'ORIGIN_NOT_ALLOWED' ? copy.originNotAllowed : account.error}
            </Text>
          </View>
        )}
        {account.busy && <ActivityIndicator accessibilityLabel={copy.working} />}
        {!account.session ? (
          <View style={styles.group}>
            <Text style={[styles.title, { color: foreground }]}>{copy.signInTitle}</Text>
            {button(copy.continueWithGoogle, () => void account.client.signIn(), account.busy || account.cleanupRequired)}
            {account.cleanupRequired && button(copy.retryClear, () => void account.client.clearSavedCredentials())}
            {account.busy && button(copy.cancelSignIn, account.client.cancelSignIn, false, true)}
            <Text style={{ color: muted, lineHeight: 22 }}>{copy.signInHint}</Text>
          </View>
        ) : (
          <>
            <Text style={{ color: muted }}>{account.session.data?.mail || copy.connected}</Text>
            <View style={styles.group}>
              <Text style={[styles.title, { color: foreground }]}>{copy.createTitle}</Text>
              <TextInput
                accessibilityLabel={copy.appName}
                placeholder={copy.appNamePlaceholder}
                placeholderTextColor={muted}
                value={name}
                onChangeText={setName}
                maxLength={100}
                editable={!account.busy}
                style={[styles.input, { color: foreground, borderColor: muted }]}
              />
              <Text style={{ color: muted }}>{copy.testnetNote}</Text>
              {button(copy.createTestnet, () => void account.client.create(name), account.busy || name.trim().length < 3)}
            </View>
            <View style={styles.group}>
              <Text style={[styles.title, { color: foreground }]}>{copy.yourApplications}</Text>
              {!account.applications.length && <Text style={{ color: muted }}>{copy.noApplications}</Text>}
              {account.applications.map((app) => (
                <View key={app.id} style={[styles.app, { borderColor: muted }]}>
                  <Text style={[styles.title, { color: foreground }]}>{app.name}</Text>
                  <Text style={{ color: muted }}>
                    {app.network.toUpperCase()} · {app.accessType || 'member'}
                  </Text>
                  {button(
                    copy.open,
                    () =>
                      Alert.alert(copy.confirmTitle, copy.confirmBody, [
                        { text: copy.cancel, style: 'cancel' },
                        {
                          text: copy.continue,
                          onPress: () => void account.client.select(app),
                        },
                      ]),
                    account.busy || app.network !== 'testnet' || ['viewer', 'support'].includes(app.accessType || ''),
                  )}
                  {app.network === 'mainnet' && <Text style={{ color: muted }}>{copy.mainnetDisabled}</Text>}
                </View>
              ))}
              {button(copy.refresh, () => void account.client.reload(), account.busy, true)}
              {button(copy.signOut, () => void account.client.logout(), account.busy, true)}
            </View>
          </>
        )}
      </Screen>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  brandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  brand: { fontSize: 32, fontWeight: '900', letterSpacing: -1 },
  hero: { backgroundColor: '#12386d', borderRadius: 24, padding: 24, gap: 18 },
  heading: { color: '#fff', fontSize: 32, fontWeight: '800', lineHeight: 39 },
  description: { color: '#d4e4fc', fontSize: 16, lineHeight: 24 },
  title: { fontSize: 21, fontWeight: '700' },
  group: { gap: 16 },
  button: {
    padding: 17,
    borderRadius: 12,
    alignItems: 'center',
    minHeight: 54,
  },
  input: { borderWidth: 1, borderRadius: 12, padding: 15, fontSize: 16 },
  app: { borderWidth: 1, borderRadius: 18, padding: 18, gap: 14 },
  error: { backgroundColor: '#ffe8e8', padding: 16, borderRadius: 12 },
});

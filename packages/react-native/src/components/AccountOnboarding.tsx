import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenLayout as Screen } from './layout';
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
  settings: { theme: 'light' | 'dark'; language: 'en' | 'es' };
  onPreferencesChange: (next: AccountOnboardingProps['settings']) => Promise<void>;
}

export function AccountOnboarding({ account, settings, onPreferencesChange: save }: AccountOnboardingProps) {
  const [name, setName] = useState('');
  const es = settings.language === 'es';
  const dark = settings.theme === 'dark';
  const foreground = dark ? '#f0f5ff' : '#152237';
  const muted = dark ? '#b6c7dd' : '#506680';
  const text = (en: string, spanish: string) => (es ? spanish : en);
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
        <ActivityIndicator accessibilityLabel="Restoring Pollar account" />
      </SafeAreaView>
    );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: dark ? '#101827' : '#f5f7fb' }}>
      <Screen>
        <View style={styles.brandRow}>
          <Text style={[styles.brand, { color: foreground }]}>pollar</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Change language"
            onPress={() => void save({ ...settings, language: es ? 'en' : 'es' })}
          >
            <Text style={{ color: muted }}>{es ? 'English' : 'Español'}</Text>
          </Pressable>
        </View>
        <View style={styles.hero}>
          <Text style={{ color: '#9ac5ff', fontWeight: '800', letterSpacing: 2 }}>POLLAR · MOBILE</Text>
          <Text style={styles.heading}>
            {account.session
              ? text('Your applications', 'Tus aplicaciones')
              : text('Build with Pollar.\nFrom your phone.', 'Crea con Pollar.\nDesde tu teléfono.')}
          </Text>
          <Text style={styles.description}>
            {account.session
              ? text(
                  'Choose an application or create a new one to start using Pollar.',
                  'Elige una aplicación o crea una nueva para empezar a usar Pollar.',
                )
              : text(
                  'Sign in, create your application, and explore wallets, payments and Pollar products.',
                  'Inicia sesión, crea tu aplicación y explora billeteras, pagos y productos Pollar.',
                )}
          </Text>
        </View>
        {!!account.error && (
          <View accessibilityRole="alert" style={styles.error}>
            <Text style={{ color: '#8c2525' }}>
              {account.error === 'ORIGIN_NOT_ALLOWED'
                ? text(
                    'The deployed SDK API rejected native access. Your application was not opened. Retry after the backend configuration is updated.',
                    'La API rechazó el acceso nativo. No se abrió tu aplicación. Reintenta después de actualizar la configuración del servidor.',
                  )
                : account.error}
            </Text>
          </View>
        )}
        {account.busy && <ActivityIndicator accessibilityLabel={text('Working', 'Procesando')} />}
        {!account.session ? (
          <View style={styles.group}>
            <Text style={[styles.title, { color: foreground }]}>
              {text('Sign in to your Pollar account', 'Inicia sesión en tu cuenta Pollar')}
            </Text>
            {button(
              text('Continue with Google', 'Continuar con Google'),
              () => void account.client.signIn(),
              account.busy || account.cleanupRequired,
            )}
            {account.cleanupRequired &&
              button(
                text('Retry removing saved credentials', 'Reintentar borrar credenciales'),
                () => void account.client.clearSavedCredentials(),
              )}
            {account.busy &&
              button(text('Cancel sign-in', 'Cancelar inicio de sesión'), account.client.cancelSignIn, false, true)}
            <Text style={{ color: muted, lineHeight: 22 }}>
              {text(
                'Use the same Google account as the Pollar dashboard. No API key is needed to sign in.',
                'Usa la misma cuenta de Google que en el dashboard de Pollar. No necesitas una clave API para iniciar sesión.',
              )}
            </Text>
          </View>
        ) : (
          <>
            <Text style={{ color: muted }}>
              {account.session.data?.mail || text('Pollar account connected', 'Cuenta Pollar conectada')}
            </Text>
            <View style={styles.group}>
              <Text style={[styles.title, { color: foreground }]}>{text('Create an application', 'Crear una aplicación')}</Text>
              <TextInput
                accessibilityLabel={text('Application name', 'Nombre de la aplicación')}
                placeholder={text('My Pollar application', 'Mi aplicación Pollar')}
                placeholderTextColor={muted}
                value={name}
                onChangeText={setName}
                maxLength={100}
                editable={!account.busy}
                style={[styles.input, { color: foreground, borderColor: muted }]}
              />
              <Text style={{ color: muted }}>
                {text('New applications start on Stellar testnet.', 'Las nuevas aplicaciones empiezan en Stellar testnet.')}
              </Text>
              {button(
                text('Create testnet application', 'Crear aplicación testnet'),
                () => void account.client.create(name),
                account.busy || name.trim().length < 3,
              )}
            </View>
            <View style={styles.group}>
              <Text style={[styles.title, { color: foreground }]}>{text('Your applications', 'Tus aplicaciones')}</Text>
              {!account.applications.length && (
                <Text style={{ color: muted }}>
                  {text(
                    'No applications yet. Create your first one above.',
                    'Aún no tienes aplicaciones. Crea la primera arriba.',
                  )}
                </Text>
              )}
              {account.applications.map((app) => (
                <View key={app.id} style={[styles.app, { borderColor: muted }]}>
                  <Text style={[styles.title, { color: foreground }]}>{app.name}</Text>
                  <Text style={{ color: muted }}>
                    {app.network.toUpperCase()} · {app.accessType || 'member'}
                  </Text>
                  {button(
                    text('Open application', 'Abrir aplicación'),
                    () =>
                      Alert.alert(
                        text('Use this application on mobile?', '¿Usar esta aplicación en el teléfono?'),
                        text(
                          'If this device has no saved mobile key, Pollar will create a native-enabled publishable key for this application. Existing web keys are unchanged.',
                          'Si este dispositivo no tiene una clave móvil guardada, Pollar creará una clave pública con acceso nativo. Las claves web no cambian.',
                        ),
                        [
                          { text: text('Cancel', 'Cancelar'), style: 'cancel' },
                          {
                            text: text('Continue', 'Continuar'),
                            onPress: () => void account.client.select(app),
                          },
                        ],
                      ),
                    account.busy || app.network !== 'testnet' || ['viewer', 'support'].includes(app.accessType || ''),
                  )}
                  {app.network === 'mainnet' && (
                    <Text style={{ color: muted }}>
                      {text(
                        'Mainnet onboarding is not enabled in this testnet demo.',
                        'La incorporación mainnet no está habilitada en esta demo testnet.',
                      )}
                    </Text>
                  )}
                </View>
              ))}
              {button(
                text('Refresh applications', 'Actualizar aplicaciones'),
                () => void account.client.reload(),
                account.busy,
                true,
              )}
              {button(
                text('Sign out of Pollar', 'Cerrar sesión en Pollar'),
                () => void account.client.logout(),
                account.busy,
                true,
              )}
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

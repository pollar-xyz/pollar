import React, { createContext, useContext } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import type { TextProps, ViewProps } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const Theme = createContext<'light' | 'dark'>('light');
/** Also usable before wallet authentication, without a Pollar client. */
export function PollarUIProvider({ theme = 'light', children }: { theme?: 'light' | 'dark'; children: React.ReactNode }) {
  return <Theme.Provider value={theme}>{children}</Theme.Provider>;
}
export function PollarSafeAreaProvider({ children }: { children: React.ReactNode }) {
  return <SafeAreaProvider>{children}</SafeAreaProvider>;
}
export function useSurfaceColors() {
  const dark = useContext(Theme) === 'dark';
  return dark
    ? { bg: '#090909', surface: '#161616', text: '#f5f5f5', muted: '#999999', border: '#292929', blue: '#379aea' }
    : { bg: '#ffffff', surface: '#f6f7f9', text: '#171717', muted: '#626972', border: '#e4e5e8', blue: '#005db4' };
}
/** Shared native layout/typography; consumers need not recreate platform styling. */
export function PollarStack({ style, ...props }: ViewProps) {
  return <View {...props} style={[{ gap: 12 }, style]} />;
}
export function PollarText({ style, ...props }: TextProps) {
  const c = useSurfaceColors();
  return <Text {...props} style={[{ color: c.text, fontSize: 15, lineHeight: 23 }, style]} />;
}
export function ScreenLayout({ children, banner }: { children: React.ReactNode; banner?: React.ReactNode }) {
  const c = useSurfaceColors();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {banner}
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: 48, gap: 20 }}>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
export function NoticeBanner({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: '#fff0b3', padding: 10 }}>
      <Text accessibilityRole="alert" style={{ color: '#463500', fontSize: 11, fontWeight: '700', textAlign: 'center' }}>
        {children}
      </Text>
    </View>
  );
}
export function LoadingScreen({ label }: { label: string }) {
  const c = useSurfaceColors();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}>
      <ActivityIndicator accessibilityLabel={label} />
    </View>
  );
}
export function ErrorNotice({ message }: { message: string }) {
  return (
    <PollarText accessibilityRole="alert" style={{ padding: 24, color: '#c73445' }}>
      {message}
    </PollarText>
  );
}

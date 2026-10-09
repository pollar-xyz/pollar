import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View, Image, type ImageSourcePropType } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePollar } from '../context';
import { WalletButton } from './wallet-button/WalletButton';
import { useSurfaceColors } from './layout';
export interface AppShellGroup {
  key: string;
  section: string;
  soon?: boolean;
  isNew?: boolean;
  tabs: { href: string; label: string }[];
}
export interface AppShellProps {
  children: React.ReactNode;
  path: string;
  currentKey?: string;
  groups: AppShellGroup[];
  sections: readonly string[];
  settings: { theme: 'light' | 'dark'; language: 'en' | 'es' };
  onPreferencesChange: (next: AppShellProps['settings']) => Promise<void>;
  onNavigate: (href: string, replace?: boolean) => void;
  label: (key: string, language: 'en' | 'es') => string;
  logo?: ImageSourcePropType;
  applicationKeyLabel?: string;
}
export function AppShell({
  children,
  path,
  currentKey,
  groups,
  sections,
  settings,
  onPreferencesChange: save,
  onNavigate,
  label: navLabel,
  logo,
  applicationKeyLabel = 'Application key',
}: AppShellProps) {
  const [drawer, setDrawer] = useState(false);
  const p = usePollar();
  const [preferencesError, setPreferencesError] = useState('');
  const updatePreferences = (next: typeof settings) => {
    setPreferencesError('');
    void save(next).catch((error) => setPreferencesError(error instanceof Error ? error.message : String(error)));
  };
  const c = useSurfaceColors();
  const tabs = groups.find((g) => g.key === currentKey)?.tabs ?? [];
  const go = (href: string) => {
    setDrawer(false);
    onNavigate(href);
  };
  const chip = {
    minHeight: 40,
    justifyContent: 'center' as const,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
  };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top', 'bottom']}>
      <View
        style={{
          borderBottomWidth: 1,
          borderColor: c.border,
          paddingHorizontal: 16,
          paddingVertical: 10,
          gap: 10,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open navigation menu"
            onPress={() => setDrawer(true)}
            style={{ padding: 8 }}
          >
            <Text style={{ color: c.text, fontSize: 24 }}>☰</Text>
          </Pressable>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Pollar demo home"
            onPress={() => go('/')}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              flex: 1,
            }}
          >
            <Image source={logo} style={{ width: 27, height: 32 }} resizeMode="contain" />
            <Text style={{ color: c.text, fontSize: 22, fontWeight: '800' }}>Pollar</Text>
            <Text
              style={{
                backgroundColor: '#112b40',
                color: '#52aeef',
                paddingHorizontal: 7,
                paddingVertical: 3,
                borderRadius: 5,
                fontSize: 10,
                fontWeight: '800',
              }}
            >
              DEMO
            </Text>
          </Pressable>
          <WalletButton />
        </View>
        <View style={{ flexDirection: 'row', gap: 7 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Application API key settings"
            onPress={() => go('/settings')}
            style={chip}
          >
            <Text style={{ color: c.muted, fontSize: 11 }}>{applicationKeyLabel}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Network settings"
            onPress={() => go('/settings')}
            style={{ ...chip, backgroundColor: '#29210a' }}
          >
            <Text style={{ color: '#edbc38', fontSize: 11 }}>● {p.network === 'testnet' ? 'Testnet' : 'Mainnet'}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Change language"
            onPress={() =>
              updatePreferences({
                ...settings,
                language: settings.language === 'en' ? 'es' : 'en',
              })
            }
            style={chip}
          >
            <Text style={{ color: c.text }}>◎ {settings.language.toUpperCase()}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={settings.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            onPress={() =>
              updatePreferences({
                ...settings,
                theme: settings.theme === 'dark' ? 'light' : 'dark',
              })
            }
            style={chip}
          >
            <Text style={{ color: c.text, fontSize: 18 }}>{settings.theme === 'dark' ? '☀' : '☾'}</Text>
          </Pressable>
        </View>
      </View>
      {!!preferencesError && (
        <Text accessibilityRole="alert" style={{ color: '#ef7777', padding: 12 }}>
          {preferencesError}
        </Text>
      )}
      {tabs.length > 0 && (
        <View style={{ borderBottomWidth: 1, borderColor: c.border }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 22 }}
          >
            {tabs.map((tab) => (
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: path === tab.href }}
                key={tab.href}
                onPress={() => onNavigate(tab.href, true)}
                style={{
                  paddingVertical: 15,
                  borderBottomWidth: 2,
                  borderColor: path === tab.href ? c.blue : 'transparent',
                }}
              >
                <Text
                  style={{
                    color: path === tab.href ? c.blue : c.muted,
                    fontWeight: '600',
                  }}
                >
                  {navLabel(tab.label, settings.language)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
      {children}
      <Modal visible={drawer} transparent animationType="fade" onRequestClose={() => setDrawer(false)}>
        <View style={{ flex: 1, flexDirection: 'row', backgroundColor: '#0009' }}>
          <SafeAreaView style={{ width: '86%', maxWidth: 380, backgroundColor: c.bg }}>
            <View
              style={{
                padding: 20,
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Text style={{ color: c.text, fontSize: 22, fontWeight: '800' }}>Pollar DEMO</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close navigation menu"
                onPress={() => setDrawer(false)}
                style={{ padding: 10 }}
              >
                <Text style={{ color: c.text, fontSize: 22 }}>×</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 0, gap: 24 }}>
              <Pressable accessibilityRole="link" accessibilityLabel="Explore the Pollar SDK" onPress={() => go('/')}>
                <Text style={{ color: c.blue }}>Explore the Pollar SDK</Text>
              </Pressable>
              {sections.map((section) => (
                <View key={section} style={{ gap: 9 }}>
                  <Text
                    style={{
                      color: c.muted,
                      fontSize: 11,
                      fontWeight: '700',
                      letterSpacing: 1,
                    }}
                  >
                    {navLabel(section, settings.language).toUpperCase()}
                  </Text>
                  {groups
                    .filter((g) => g.section === section)
                    .map((g) => (
                      <Pressable
                        key={g.key}
                        accessibilityRole="link"
                        accessibilityLabel={navLabel(g.key, settings.language)}
                        accessibilityState={{
                          selected: currentKey === g.key,
                        }}
                        onPress={() => {
                          if (g.tabs[0]) go(g.tabs[0].href);
                        }}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 10,
                          padding: 12,
                          borderRadius: 8,
                          backgroundColor: currentKey === g.key ? '#15334c' : 'transparent',
                        }}
                      >
                        <Text
                          style={{
                            flex: 1,
                            color: currentKey === g.key ? '#78bcf0' : c.text,
                            fontSize: 16,
                          }}
                        >
                          {navLabel(g.key, settings.language)}
                        </Text>
                        {(g.soon || g.isNew) && (
                          <Text
                            style={{
                              fontSize: 10,
                              fontWeight: '800',
                              color: g.soon ? '#e5b82e' : '#4da6e9',
                              backgroundColor: g.soon ? '#332706' : '#122e44',
                              borderRadius: 10,
                              paddingVertical: 3,
                              paddingHorizontal: 6,
                            }}
                          >
                            {g.soon ? 'SOON' : 'NEW'}
                          </Text>
                        )}
                      </Pressable>
                    ))}
                </View>
              ))}
              <Pressable accessibilityRole="link" onPress={() => go('/settings')}>
                <Text style={{ color: c.muted }}>Account & settings</Text>
              </Pressable>
            </ScrollView>
          </SafeAreaView>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss navigation"
            onPress={() => setDrawer(false)}
            style={{ flex: 1 }}
          />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

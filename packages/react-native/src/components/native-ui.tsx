import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import type { TextInputProps } from 'react-native';
import { usePollar } from '../context';

export function useNativeColors() {
  const { styles } = usePollar();
  const dark = styles.theme === 'dark';
  return {
    text: dark ? '#f0f5ff' : '#152237',
    muted: dark ? '#a9b8cd' : '#53657b',
    card: dark ? '#1b283c' : '#ffffff',
    border: dark ? '#34465e' : '#dce3ed',
    accent: styles.accentColor || '#005DB4',
  };
}
export function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  const c = useNativeColors();
  return (
    <View style={{ backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 20, padding: 20, gap: 14 }}>
      {title && (
        <Text accessibilityRole="header" style={{ fontSize: 21, fontWeight: '700', color: c.text }}>
          {title}
        </Text>
      )}
      {children}
    </View>
  );
}
export function Label({ children }: { children: React.ReactNode }) {
  const c = useNativeColors();
  return <Text style={{ color: c.text, fontSize: 15, lineHeight: 23 }}>{children}</Text>;
}
export function ActionButton({ title, onPress, disabled = false }: { title: string; onPress: () => void; disabled?: boolean }) {
  const c = useNativeColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: c.accent,
        opacity: disabled ? 0.4 : pressed ? 0.75 : 1,
        borderRadius: 12,
        padding: 14,
        minHeight: 48,
        alignItems: 'center',
      })}
    >
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{title}</Text>
    </Pressable>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const c = useNativeColors();
  return (
    <View style={{ gap: 6 }}>
      <Label>{label}</Label>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={label}
        placeholderTextColor={c.muted}
        {...props}
        style={[
          { borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 13, color: c.text, minHeight: 48 },
          props.style,
        ]}
      />
    </View>
  );
}
export function ResultView({ value }: { value: unknown }) {
  const c = useNativeColors();
  if (value === undefined || value === null) return null;
  return (
    <Text selectable style={{ color: c.muted, fontFamily: 'monospace', fontSize: 12, lineHeight: 19 }}>
      {typeof value === 'string'
        ? value
        : JSON.stringify(
            value,
            (key, item) =>
              /^(accessToken|refreshToken|token|apiKey|privateKey|secretKey|submissionToken|codeVerifier)$/i.test(key)
                ? '[redacted]'
                : item,
            2,
          )}
    </Text>
  );
}
/** Locks synchronously, including before React commits disabled=true. Ignores stale completions. */
export function useAction() {
  const locked = useRef(false);
  const mounted = useRef(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<unknown>();
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError('');
    setResult(undefined);
    try {
      const next = await fn();
      if (mounted.current) setResult(next);
      return next;
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : String(e));
      return undefined;
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return { busy, error, result, run };
}
export function ActionState({ action }: { action: ReturnType<typeof useAction> }) {
  return (
    <View style={{ gap: 8 }}>
      {action.busy && <ActivityIndicator accessibilityLabel="Request in progress" />}
      {!!action.error && (
        <Text accessibilityRole="alert" style={{ color: '#d84a53' }}>
          {action.error}
        </Text>
      )}
      <ResultView value={action.result} />
    </View>
  );
}
export function Choice<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
}) {
  const c = useNativeColors();
  return (
    <View style={{ gap: 8 }}>
      <Label>{label}</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map((option) => (
          <Pressable
            key={option}
            accessibilityRole="radio"
            accessibilityState={{ checked: option === value }}
            accessibilityLabel={option}
            onPress={() => onChange(option)}
            style={{
              borderWidth: 1,
              borderColor: c.border,
              backgroundColor: option === value ? c.accent : c.card,
              padding: 12,
              borderRadius: 10,
              minHeight: 44,
              maxWidth: '100%',
            }}
          >
            <Text style={{ color: option === value ? '#fff' : c.text }}>{option}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

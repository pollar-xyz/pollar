/**
 * Generate a RFC 4122 v4 UUID. Prefers the secure-context `crypto.randomUUID`
 * when available; falls back to a manual v4 build via `crypto.getRandomValues`
 * for environments where `randomUUID` is missing (older RN/Hermes — where the
 * `react-native-get-random-values` polyfill provides `getRandomValues` but not
 * `randomUUID` — and insecure HTTP origins).
 *
 * Throws only when no secure random source exists at all, in which case DPoP
 * (and the SDK) cannot operate anyway.
 */
export function randomUUID(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }
  if (c && typeof c.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    c.getRandomValues(bytes);
    bytes[6] = ((bytes[6] as number) & 0x0f) | 0x40; // version 4
    bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80; // RFC 4122 variant
    const hex: string[] = [];
    for (let i = 0; i < 16; i++) hex.push((bytes[i] as number).toString(16).padStart(2, '0'));
    return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
  }
  throw new Error(
    '[PollarClient] No secure random source available (crypto.randomUUID / crypto.getRandomValues). ' +
      'DPoP requires a secure context (HTTPS) or, in React Native, the `react-native-get-random-values` polyfill.',
  );
}

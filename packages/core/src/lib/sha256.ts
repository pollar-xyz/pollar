/**
 * SHA-256 via WebCrypto. Returns the raw 32-byte digest as a `Uint8Array`.
 *
 * Async because `crypto.subtle.digest` is the only SHA-256 primitive guaranteed
 * to exist in every target runtime (browser, Node ≥20, RN ≥0.74, Workers, Deno,
 * Bun) without pulling in a JS-only crypto library. Older RN environments may
 * need a `crypto.subtle` polyfill (e.g. `react-native-quick-crypto`).
 */
export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const buf = await crypto.subtle.digest('SHA-256', data as unknown as BufferSource);
  return new Uint8Array(buf);
}
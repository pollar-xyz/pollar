/**
 * Base64url encoder/decoder (RFC 4648 §5), pure JS — no `btoa`, no `Buffer`.
 * Used everywhere we need to encode/decode JWS segments, JWK fields, hashes,
 * private scalars, etc. Output is unpadded ("=" stripped).
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

const REVERSE: ReadonlyMap<string, number> = (() => {
  const m = new Map<string, number>();
  for (let i = 0; i < ALPHABET.length; i++) m.set(ALPHABET[i] as string, i);
  return m;
})();

/** Encode raw bytes to base64url (no padding). */
export function base64urlEncode(bytes: Uint8Array): string {
  let result = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const b1 = bytes[i] as number;
    const b2 = bytes[i + 1] as number;
    const b3 = bytes[i + 2] as number;
    result += ALPHABET[b1 >> 2];
    result += ALPHABET[((b1 & 0x03) << 4) | (b2 >> 4)];
    result += ALPHABET[((b2 & 0x0f) << 2) | (b3 >> 6)];
    result += ALPHABET[b3 & 0x3f];
  }
  if (i < bytes.length) {
    const b1 = bytes[i] as number;
    if (i + 1 === bytes.length) {
      result += ALPHABET[b1 >> 2];
      result += ALPHABET[(b1 & 0x03) << 4];
    } else {
      const b2 = bytes[i + 1] as number;
      result += ALPHABET[b1 >> 2];
      result += ALPHABET[((b1 & 0x03) << 4) | (b2 >> 4)];
      result += ALPHABET[(b2 & 0x0f) << 2];
    }
  }
  return result;
}

/** Decode a base64url string (with or without "=" padding) to raw bytes. */
export function base64urlDecode(input: string): Uint8Array {
  const clean = input.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let byteIdx = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c1 = REVERSE.get(clean[i] as string);
    const c2 = REVERSE.get(clean[i + 1] as string);
    const c3 = i + 2 < clean.length ? REVERSE.get(clean[i + 2] as string) : undefined;
    const c4 = i + 3 < clean.length ? REVERSE.get(clean[i + 3] as string) : undefined;
    if (c1 === undefined || c2 === undefined) {
      throw new Error('[PollarClient] Invalid base64url input');
    }
    out[byteIdx++] = (c1 << 2) | (c2 >> 4);
    if (c3 !== undefined) {
      out[byteIdx++] = ((c2 & 0x0f) << 4) | (c3 >> 2);
      if (c4 !== undefined) {
        out[byteIdx++] = ((c3 & 0x03) << 6) | c4;
      }
    }
  }
  return out.slice(0, byteIdx);
}

/** Encode a UTF-8 string to base64url. */
export function base64urlEncodeString(s: string): string {
  return base64urlEncode(new TextEncoder().encode(s));
}

/** Decode base64url to a UTF-8 string. */
export function base64urlDecodeString(s: string): string {
  return new TextDecoder().decode(base64urlDecode(s));
}

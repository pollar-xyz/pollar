// @pollar smoke test — KeyManager primitives + base64url + thumbprint.
//
// Run with `node tests/smoke-keys.cjs` after `pnpm build`. Imports the built
// dist/ output so it tests the published artifact (catches build-system
// regressions that unit tests against src/ would miss).
//
// Uses the RN entry (`index.rn.js`) so it can exercise both WebCryptoKeyManager
// (where IndexedDB is present) and NobleKeyManager (where it isn't — i.e. Node).
// In Node, IDB is absent so the WebCrypto path falls through to its
// "persistence failed but in-memory works" branch, which is exactly what we
// want to verify.

const path = require('node:path');

// Make Node behave like a browser enough to satisfy `isBrowser` checks in client.ts
globalThis.window = { addEventListener: () => {}, removeEventListener: () => {} };
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

const SDK_DIST = path.resolve(__dirname, '../packages/core/dist/index.rn.js');
const sdk = require(SDK_DIST);

let pass = 0;
let fail = 0;
function check(label, ok, extra) {
  if (ok) {
    pass++;
    console.log(`  OK    ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}`, extra ?? '');
  }
}

(async () => {
  console.log('── 1. NobleKeyManager auto-init on getPublicJwk() ─────────────');
  {
    const km = new sdk.NobleKeyManager(sdk.createMemoryAdapter(), 'pk_test_auto_pub');
    // Skip init() — call directly. Regression guard for the timing bug where
    // the OAuth flow called getPublicJwk before _initialize had completed.
    const jwk = await km.getPublicJwk();
    check('getPublicJwk auto-initialized', jwk.kty === 'EC' && jwk.crv === 'P-256');
    check('  jwk.x is base64url (~43 chars)', typeof jwk.x === 'string' && jwk.x.length >= 42 && jwk.x.length <= 44);
    check('  jwk.y is base64url (~43 chars)', typeof jwk.y === 'string' && jwk.y.length >= 42 && jwk.y.length <= 44);
  }

  console.log('\n── 2. NobleKeyManager auto-init on sign() ─────────────────────');
  {
    const km = new sdk.NobleKeyManager(sdk.createMemoryAdapter(), 'pk_test_auto_sign');
    const sig = await km.sign(new TextEncoder().encode('hello'));
    check('sign auto-initialized', sig.length === 64);
  }

  console.log('\n── 3. Concurrent init() calls share one in-flight promise ────');
  {
    const km = new sdk.NobleKeyManager(sdk.createMemoryAdapter(), 'pk_test_concurrent');
    const results = await Promise.all(Array.from({ length: 10 }, () => km.getPublicJwk()));
    check(
      'all 10 calls returned a JWK',
      results.every((j) => j.kty === 'EC'),
    );
    check(
      '  all JWKs identical (single keypair generated)',
      results.every((j) => j.x === results[0].x),
    );
  }

  console.log('\n── 4. reset() clears state; next call generates fresh keypair ');
  {
    const km = new sdk.NobleKeyManager(sdk.createMemoryAdapter(), 'pk_test_reset');
    const jwk1 = await km.getPublicJwk();
    await km.reset();
    const jwk2 = await km.getPublicJwk();
    check('post-reset getPublicJwk works', jwk2.kty === 'EC');
    check('  new keypair (different x)', jwk1.x !== jwk2.x);
  }

  console.log('\n── 5. computeJwkThumbprint matches reference algorithm ────────');
  {
    // RFC 7638-style EC P-256 JWK
    const jwk = {
      kty: 'EC',
      crv: 'P-256',
      x: 'f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU',
      y: 'x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0',
    };
    const ours = await sdk.computeJwkThumbprint(jwk);
    // Reference computed via Node native crypto (constant for this JWK).
    const expected = 'oKIywvGUpTVTyxMQ3bwIIeQUudfr_CkLMjCE19ECD-U';
    check(`thumbprint matches reference (${expected.slice(0, 12)}…)`, ours === expected);
  }

  console.log('\n── 6. htu normalization (RFC 3986 §6.2 + RFC 9449 §4.3) ───────');
  {
    const cases = [
      ['https://API.Example.com:443/v1/auth/login', 'https://api.example.com/v1/auth/login'],
      ['HTTP://example.com:80/foo', 'http://example.com/foo'],
      ['https://example.com:8443/api/', 'https://example.com:8443/api/'],
      ['https://example.com/v1/foo?q=1#frag', 'https://example.com/v1/foo'],
      ['https://example.com/v1/foo/?q=1#frag', 'https://example.com/v1/foo/'],
      ['https://user:pass@example.com/x', 'https://example.com/x'],
      ['http://[::1]:8080/v1', 'http://[::1]:8080/v1'],
      ['http://[::1]:80/v1', 'http://[::1]/v1'],
    ];
    for (const [input, expected] of cases) {
      const got = sdk.normalizeHtu(input);
      check(`${input} → ${got}`, got === expected, expected);
    }
  }

  console.log('\n── 7. NobleKeyManager.getThumbprint() auto-inits + matches computeJwkThumbprint ──');
  {
    const km = new sdk.NobleKeyManager(sdk.createMemoryAdapter(), 'pk_test_thumb');
    const tp = await km.getThumbprint(); // skip init() — must auto-init like getPublicJwk/sign
    check(
      'getThumbprint auto-initialized (base64url SHA-256, ~43 chars)',
      typeof tp === 'string' && tp.length >= 42 && tp.length <= 44,
      tp,
    );
    const tp2 = await sdk.computeJwkThumbprint(await km.getPublicJwk());
    check('  getThumbprint() === computeJwkThumbprint(getPublicJwk()) (RFC 7638)', tp === tp2, `${tp} vs ${tp2}`);
  }

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});

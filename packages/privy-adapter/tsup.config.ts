import { readFileSync, writeFileSync } from 'fs';
import { defineConfig } from 'tsup';

export default defineConfig({
  // Two entries: the default web build (react-auth) and the React Native build
  // (@privy-io/expo), resolved via the `react-native` export condition.
  entry: { index: 'src/index.tsx', 'index.native': 'src/index.native.tsx' },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: 'es2020',
  external: [
    '@pollar/core',
    '@stellar/stellar-sdk',
    'react',
    '@privy-io/react-auth',
    '@privy-io/expo',
    '@privy-io/api-types',
    'react-native',
    'react-native-webview',
  ],
  // The web entry renders React hooks, so it must be a client module under
  // Next.js app-router. tsup/esbuild strip a module-level "use client" (and the
  // `banner` option too), so prepend it to the built files post-build — same
  // approach as `@pollar/react`. Web entry only (the directive is meaningless in
  // React Native).
  async onSuccess() {
    for (const file of ['dist/index.js', 'dist/index.mjs']) {
      const content = readFileSync(file, 'utf-8');
      if (!content.startsWith("'use client'")) {
        writeFileSync(file, `'use client';\n${content}`);
      }
    }
  },
});

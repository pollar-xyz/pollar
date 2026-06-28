import { readFileSync, writeFileSync } from 'fs';
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.tsx' },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: 'es2020',
  external: ['@pollar/core', '@stellar/stellar-sdk', 'react', '@privy-io/react-auth'],
  // The web entry renders React hooks, so it must be a client module under
  // Next.js app-router. tsup/esbuild strip a module-level "use client" (and the
  // `banner` option too), so prepend it to the built files post-build — same
  // approach as `@pollar/react`.
  async onSuccess() {
    for (const file of ['dist/index.js', 'dist/index.mjs']) {
      const content = readFileSync(file, 'utf-8');
      if (!content.startsWith("'use client'")) {
        writeFileSync(file, `'use client';\n${content}`);
      }
    }
  },
});

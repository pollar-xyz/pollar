import { defineConfig } from 'tsup';
import { readFileSync, writeFileSync } from 'fs';
import pkg from './package.json';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: ['react', 'react-dom', '@pollar/core'],
  jsx: 'react-jsx',
  define: {
    __POLLAR_VERSION__: JSON.stringify(pkg.version),
  },
  async onSuccess() {
    for (const file of ['dist/index.js', 'dist/index.mjs']) {
      const content = readFileSync(file, 'utf-8');
      if (!content.startsWith("'use client'")) {
        writeFileSync(file, `'use client';\n${content}`);
      }
    }
  },
});

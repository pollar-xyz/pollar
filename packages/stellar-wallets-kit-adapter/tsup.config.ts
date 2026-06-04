import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    picker: 'src/picker/index.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: 'es2020',
  external: ['@pollar/core', '@creit.tech/stellar-wallets-kit', 'react', 'react-dom', '@pollar/react'],
  esbuildOptions(opts) {
    opts.jsx = 'automatic';
  },
});

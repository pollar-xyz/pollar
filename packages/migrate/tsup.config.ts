import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    cli: 'src/cli.ts',
  },
  format: ['cjs'],
  dts: { entry: { index: 'src/index.ts' } },
  splitting: false,
  sourcemap: true,
  clean: true,
  target: 'node20',
  platform: 'node',
  external: ['typescript'],
});

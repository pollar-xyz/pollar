import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'index.rn': 'src/index.rn.ts',
    'adapters/expo-secure-store': 'src/adapters/expo-secure-store.ts',
    'adapters/react-native-keychain': 'src/adapters/react-native-keychain.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  noExternal: ['@stellar/freighter-api', 'openapi-fetch'],
});

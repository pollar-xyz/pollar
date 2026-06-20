import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

const { version } = JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string };

export default defineConfig({
  // Replace `__POLLAR_SDK_VERSION__` with the package version at build time so
  // `POLLAR_CORE_VERSION` is available at runtime without importing package.json.
  define: { __POLLAR_SDK_VERSION__: JSON.stringify(version) },
  entry: {
    index: 'src/index.ts',
    'index.rn': 'src/index.rn.ts',
    'adapters/expo-secure-store': 'src/adapters/expo-secure-store.ts',
    'adapters/react-native-keychain': 'src/adapters/react-native-keychain.ts',
    'adapters/react-native-appstate': 'src/adapters/react-native-appstate.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  noExternal: ['@stellar/freighter-api', 'openapi-fetch'],
});

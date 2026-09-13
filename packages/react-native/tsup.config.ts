/// <reference types="node" />
import { readFileSync, writeFileSync } from 'fs';
import { defineConfig } from 'tsup';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: false,
    splitting: false,
    sourcemap: true,
    clean: true,
    treeshake: true,
    external: ['react', 'react-native', '@pollar/core'],
    esbuildOptions(options) {
        options.jsx = 'automatic';
    },
    define: {
        __POLLAR_VERSION__: JSON.stringify(pkg.version),
    }
});

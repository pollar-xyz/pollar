// Injected at build time by tsup (`define`) from `package.json#version`.
// `declare` so TypeScript knows the identifier; at runtime it is either
// replaced with a string literal (bundled builds) or absent (running the
// source unbundled — ts-node, vitest), which the `typeof` guard below handles.
declare const __POLLAR_SDK_VERSION__: string;

/**
 * Version of this `@pollar/core` build (e.g. `'0.8.2'`). Falls back to `'dev'`
 * when running unbundled.
 *
 * Named per-package on purpose: importing it alongside `@pollar/react`'s
 * `POLLAR_REACT_VERSION` never collides, so an app can report both versions in
 * a single bug-report / diagnostics line.
 */
export const POLLAR_CORE_VERSION: string = typeof __POLLAR_SDK_VERSION__ !== 'undefined' ? __POLLAR_SDK_VERSION__ : 'dev';

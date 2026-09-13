import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // `_`-prefix marks intentionally-unused params/vars (e.g. interface-shape
      // params kept for adapter contracts even when this implementation ignores
      // them).
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // `any` shows up in openapi-fetch glue + a few hand-written endpoint
      // wrappers. Treat as a smell but not a build failure — tighten once
      // those callsites move to proper generics.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    ignores: ['dist/**', 'src/api/schema.d.ts'],
  },
);

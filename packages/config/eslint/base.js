// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Archivos de configuración de herramientas: exigen `export default`. */
export const CONFIG_FILES = ['**/*.config.{js,mjs,cjs,ts,mts}'];

/**
 * Base de ESLint para todo el monorepo: TypeScript estricto y sin `any` (06 §4, RNF-22).
 * Exportaciones con nombre; `export default` solo donde una herramienta lo exige.
 *
 * @param {{ tsconfigRootDir: string }} options
 */
export function base({ tsconfigRootDir }) {
  return defineConfig(
    {
      ignores: [
        'dist/**',
        'dist-worker/**',
        'coverage/**',
        '.next/**',
        '.turbo/**',
        'next-env.d.ts',
      ],
    },
    js.configs.recommended,
    tseslint.configs.strictTypeChecked,
    {
      languageOptions: {
        parserOptions: { projectService: true, tsconfigRootDir },
      },
      rules: {
        '@typescript-eslint/consistent-type-imports': 'error',
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
        'no-restricted-exports': [
          'error',
          {
            restrictDefaultExports: {
              direct: true,
              named: true,
              defaultFrom: true,
              namedFrom: true,
              namespaceFrom: true,
            },
          },
        ],
      },
    },
    {
      files: ['**/*.{js,mjs,cjs}'],
      extends: [tseslint.configs.disableTypeChecked],
    },
    {
      files: ['**/*.cjs'],
      languageOptions: { sourceType: 'commonjs', globals: globals.node },
      rules: { '@typescript-eslint/no-require-imports': 'off' },
    },
    {
      files: CONFIG_FILES,
      rules: { 'no-restricted-exports': 'off' },
    },
    prettier,
  );
}

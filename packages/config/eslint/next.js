// @ts-check
import nextPlugin from '@next/eslint-plugin-next';
import { defineConfig } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import { base } from './base.js';

/** Archivos del App Router que Next.js exige con `export default` (rutas y metadatos). */
const NEXT_ROUTE_FILES = [
  'src/app/**/{page,layout,template,loading,error,global-error,not-found,default}.tsx',
  'src/app/**/{icon,apple-icon,opengraph-image}.tsx',
  'src/app/{manifest,robots,sitemap}.ts',
  // Playwright exige export default en su globalSetup.
  'e2e/global-setup.ts',
];

/**
 * ESLint para apps/web (Next.js App Router).
 *
 * @param {{ tsconfigRootDir: string }} options
 */
export function next({ tsconfigRootDir }) {
  return defineConfig(
    base({ tsconfigRootDir }),
    nextPlugin.configs.recommended,
    nextPlugin.configs['core-web-vitals'],
    reactHooks.configs.flat.recommended,
    {
      languageOptions: { globals: { ...globals.browser, ...globals.node } },
    },
    {
      files: NEXT_ROUTE_FILES,
      rules: { 'no-restricted-exports': 'off' },
    },
  );
}

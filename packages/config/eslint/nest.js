// @ts-check
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import { base } from './base.js';

const SPEC_FILES = ['**/*.spec.ts'];
/** Nombres exactos: como patrón, `http` también atraparía carpetas como adapters/in/http. */
const HTTP_MODULES = ['express', 'http', 'https', 'node:http', 'node:https'];

/**
 * @param {string[]} names
 * @param {string} message
 */
const exactly = (names, message) => names.map((name) => ({ name, message }));

const DOMAIN_MESSAGE = '02 §4: domain no importa NestJS, Prisma, Zod ni HTTP.';
const APPLICATION_NEST_MESSAGE = '02 §4: en application, de NestJS solo Injectable e Inject.';
const APPLICATION_INFRA_MESSAGE = '02 §4: application no importa Prisma ni objetos HTTP.';

/**
 * Lo que dependency-cruiser no puede ver: los nombres importados (02 §4).
 * Las fronteras entre módulos y capas las verifica `pnpm lint:arch`.
 */
export const domainImports = {
  paths: exactly(['prisma', 'zod', ...HTTP_MODULES], DOMAIN_MESSAGE),
  patterns: [
    { group: ['@nestjs/*', '@prisma/*', 'zod/*'], message: DOMAIN_MESSAGE },
    {
      group: ['**/application/**', '**/adapters/**'],
      message: '02 §4: domain no importa application ni adapters.',
    },
  ],
};

export const applicationImports = {
  paths: [
    {
      name: '@nestjs/common',
      allowImportNames: ['Injectable', 'Inject'],
      message: APPLICATION_NEST_MESSAGE,
    },
    ...exactly(['prisma', ...HTTP_MODULES], APPLICATION_INFRA_MESSAGE),
  ],
  patterns: [
    { group: ['@nestjs/*', '!@nestjs/common'], message: APPLICATION_NEST_MESSAGE },
    { group: ['@prisma/*'], message: APPLICATION_INFRA_MESSAGE },
    { group: ['**/adapters/**'], message: '02 §4: application no importa adaptadores.' },
  ],
};

/**
 * ESLint para apps/api (NestJS 12, ESM).
 *
 * @param {{ tsconfigRootDir: string }} options
 */
export function nest({ tsconfigRootDir }) {
  return defineConfig(
    base({ tsconfigRootDir }),
    {
      languageOptions: { globals: globals.node },
      rules: {
        '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
      },
    },
    {
      files: ['src/modules/*/domain/**/*.ts'],
      ignores: SPEC_FILES,
      rules: { 'no-restricted-imports': ['error', domainImports] },
    },
    {
      files: ['src/modules/*/application/**/*.ts'],
      ignores: SPEC_FILES,
      rules: { 'no-restricted-imports': ['error', applicationImports] },
    },
  );
}

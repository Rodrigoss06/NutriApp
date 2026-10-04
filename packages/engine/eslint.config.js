import { base } from '@nutricoach/config/eslint/base';
import { defineConfig } from 'eslint/config';

const PURITY = 'packages/engine/CLAUDE.md: el motor es puro, sin reloj, azar ni E/S.';

export default defineConfig(base({ tsconfigRootDir: import.meta.dirname }), {
  files: ['src/**/*.ts'],
  ignores: ['src/**/*.spec.ts'],
  rules: {
    'no-restricted-globals': [
      'error',
      ...[
        'Date',
        'process',
        'Buffer',
        'crypto',
        'fetch',
        'setTimeout',
        'setInterval',
        'TextEncoder',
      ].map((name) => ({ name, message: PURITY })),
    ],
    'no-restricted-properties': ['error', { object: 'Math', property: 'random', message: PURITY }],
  },
});

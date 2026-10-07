import { baseConfig } from '@nutricoach/config/vitest';
import { defineConfig, mergeConfig } from 'vitest/config';

/** Tokens y funciones en Node; componentes en happy-dom (`// @vitest-environment happy-dom`). */
const config = mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      coverage: {
        include: ['src/**/*.{ts,tsx}'],
        thresholds: { lines: 70, functions: 70, branches: 70, statements: 70 },
      },
    },
  }),
);

// mergeConfig concatena los arreglos: se reemplazan aquí.
config.test.include = ['src/**/*.spec.{ts,tsx}'];
config.test.coverage.exclude = ['src/**/*.spec.{ts,tsx}', 'src/index.ts'];

export default config;

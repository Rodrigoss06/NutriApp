import { baseConfig } from '@nutricoach/config/vitest';
import { defineConfig, mergeConfig } from 'vitest/config';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      // RNF-20: 90 % o más en el dominio; el kernel es su base.
      coverage: { thresholds: { lines: 90, functions: 90, branches: 90, statements: 90 } },
    },
  }),
);

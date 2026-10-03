import { defineConfig, mergeConfig } from 'vitest/config';
import { baseConfig } from './vitest.js';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      // Las pruebas de reglas de arquitectura lanzan dependency-cruiser como proceso aparte.
      testTimeout: 60_000,
    },
  }),
);

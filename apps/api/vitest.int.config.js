import { baseConfig } from '@nutricoach/config/vitest';
import swc from 'unplugin-swc';
import { defineConfig, mergeConfig } from 'vitest/config';

/**
 * Pruebas de integración (06 §6): `*.int.spec.ts` contra PostgreSQL 18 real en Testcontainers. La base se
 * crea una vez con infra/db/init y todas las migraciones; las pruebas se conectan como app_user.
 */
const config = mergeConfig(
  baseConfig,
  defineConfig({
    plugins: [swc.vite({ module: { type: 'es6' } })],
    test: {
      globalSetup: ['test/integration/global-setup.ts'],
      testTimeout: 30_000,
      hookTimeout: 120_000,
      // Una sola base compartida: los archivos corren uno tras otro.
      fileParallelism: false,
    },
  }),
);

// mergeConfig concatena los arreglos: include y exclude se reemplazan aquí.
config.test.include = ['src/**/*.int.spec.ts', 'test/**/*.int.spec.ts'];
config.test.exclude = ['**/node_modules/**', '**/dist/**'];

export default config;

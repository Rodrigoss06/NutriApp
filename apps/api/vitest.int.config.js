import { baseConfig, SOURCE_CONDITION } from '@nutricoach/config/vitest';
import swc from 'unplugin-swc';
import { defineConfig, mergeConfig } from 'vitest/config';
import { INTEGRATION_COVERED } from './vitest.config.js';

/**
 * Pruebas de integración (06 §6): `*.int.spec.ts` contra PostgreSQL 18 real en Testcontainers. La base se
 * crea una vez con infra/db/init y todas las migraciones; las pruebas se conectan como app_user.
 */
/**
 * La API corre en Node: sin la condición `module`, que en algunos paquetes (@opentelemetry/api, de pg-boss)
 * apunta a un ESM sin extensiones que Node no carga.
 */
export const NODE_CONDITIONS = [SOURCE_CONDITION, 'node'];

const config = mergeConfig(
  baseConfig,
  defineConfig({
    plugins: [swc.vite({ module: { type: 'es6' } })],
    test: {
      globalSetup: ['test/integration/global-setup.ts'],
      setupFiles: ['test/integration/setup-env.ts'],
      testTimeout: 30_000,
      hookTimeout: 120_000,
      // Una sola base compartida: los archivos corren uno tras otro.
      fileParallelism: false,
      coverage: {
        // RNF-20: 70 % o más en el backend, también en lo que solo se prueba contra la base.
        thresholds: { lines: 70, functions: 70, branches: 70, statements: 70 },
      },
    },
  }),
);

// mergeConfig concatena los arreglos: include, exclude y condiciones se reemplazan aquí.
config.resolve.conditions = NODE_CONDITIONS;
config.ssr.resolve.conditions = NODE_CONDITIONS;
config.test.include = ['src/**/*.int.spec.ts', 'test/**/*.int.spec.ts'];
config.test.exclude = ['**/node_modules/**', '**/dist/**'];
config.test.coverage.include = INTEGRATION_COVERED;
config.test.coverage.exclude = ['src/platform/database/generated/**', '**/*.spec.ts'];

export default config;

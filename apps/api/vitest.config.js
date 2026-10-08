import { baseConfig, SOURCE_CONDITION } from '@nutricoach/config/vitest';
import swc from 'unplugin-swc';
import { defineConfig, mergeConfig } from 'vitest/config';

/** Código que solo tiene sentido probar contra PostgreSQL: su cobertura la mide `test:int`. */
export const INTEGRATION_COVERED = [
  'src/platform/database/**',
  'src/platform/events/**',
  'src/platform/queue/**',
  'src/platform/maintenance/**',
  'src/platform/worker/**',
  'src/platform/health/readiness.service.ts',
  'src/platform/audit/**',
  'src/platform/idempotency/idempotency.interceptor.ts',
  'src/platform/idempotency/idempotency.module.ts',
  'src/platform/http/request-meta.ts',
  'src/platform/rate-limit/rate-limiter.ts',
  // Adaptadores y cableado de cada contexto: controladores, repositorios y consumidores.
  'src/modules/*/adapters/**',
  'src/modules/*/*.module.ts',
];

const config = mergeConfig(
  baseConfig,
  defineConfig({
    // SWC conserva los metadatos de los decoradores que usa la inyección de NestJS.
    plugins: [swc.vite({ module: { type: 'es6' } })],
    test: {
      // Valores sintéticos para que la configuración cargue; las pruebas unitarias no abren la base.
      env: {
        DATABASE_URL: 'postgresql://app_user:sin_base@127.0.0.1:1/nutricoach',
        ENCRYPTION_KEYS: `v1:${Buffer.alloc(32, 1).toString('base64')}`,
        BLIND_INDEX_KEY: Buffer.alloc(32, 2).toString('base64'),
        APP_URL: 'http://localhost:3000',
        SMTP_URL: 'smtp://127.0.0.1:1025',
      },
      coverage: {
        // Arranque de los procesos: lo cubren el humo de `pnpm dev` y las pruebas de API.
        // El cliente de Prisma lo genera `prisma generate`. Los adaptadores de base y cola los cubre
        // `test:int` contra PostgreSQL real (vitest.int.config.js).
        exclude: [
          'src/main.ts',
          'src/worker.ts',
          'src/env-file.ts',
          'src/cli/**',
          'src/**/*.spec-support.ts',
          'src/platform/database/generated/**',
          ...INTEGRATION_COVERED,
        ],
        // RNF-20: 70 % o más en el backend.
        thresholds: { lines: 70, functions: 70, branches: 70, statements: 70 },
      },
    },
  }),
);

// La API corre en Node: sin la condición `module` (ver vitest.int.config.js). mergeConfig concatena arreglos.
config.resolve.conditions = [SOURCE_CONDITION, 'node'];
config.ssr.resolve.conditions = [SOURCE_CONDITION, 'node'];

export default config;

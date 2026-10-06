import { baseConfig } from '@nutricoach/config/vitest';
import swc from 'unplugin-swc';
import { defineConfig, mergeConfig } from 'vitest/config';

export default mergeConfig(
  baseConfig,
  defineConfig({
    // SWC conserva los metadatos de los decoradores que usa la inyección de NestJS.
    plugins: [swc.vite({ module: { type: 'es6' } })],
    test: {
      coverage: {
        // Arranque de los procesos: lo cubren el humo de `pnpm dev` y las pruebas de API.
        // El cliente de Prisma lo genera `prisma generate`.
        exclude: ['src/main.ts', 'src/worker.ts', 'src/platform/database/generated/**'],
        // RNF-20: 70 % o más en el backend.
        thresholds: { lines: 70, functions: 70, branches: 70, statements: 70 },
      },
    },
  }),
);

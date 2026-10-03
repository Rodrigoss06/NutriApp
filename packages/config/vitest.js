// @ts-check
import { defaultClientConditions, defaultServerConditions } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Condición de exportación de los paquetes internos que apunta a su código fuente: las pruebas
 * no necesitan compilar antes los paquetes de los que dependen.
 */
export const SOURCE_CONDITION = '@nutricoach/source';

/**
 * Base de Vitest (06 §6): pruebas unitarias `*.spec.ts` junto al archivo o en `test/`.
 * Las de integración (`*.int.spec.ts`) no corren aquí: son de `test:int`.
 */
export const baseConfig = defineConfig({
  resolve: { conditions: [SOURCE_CONDITION, ...defaultClientConditions] },
  ssr: { resolve: { conditions: [SOURCE_CONDITION, ...defaultServerConditions] } },
  test: {
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.int.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/**/index.ts'],
      reporter: ['text', 'lcov'],
    },
  },
});

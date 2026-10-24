import { fileURLToPath } from 'node:url';
import { baseConfig } from '@nutricoach/config/vitest';
import { mergeConfig } from 'vitest/config';

// Pruebas de componentes cuando haga falta; los recorridos de cada demo van en e2e/ (Playwright). El alias @ es el
// mismo de tsconfig.json.
export default mergeConfig(baseConfig, {
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
});

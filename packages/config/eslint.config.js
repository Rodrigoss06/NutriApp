import { defineConfig } from 'eslint/config';
import { base } from './eslint/base.js';

export default defineConfig(
  base({ tsconfigRootDir: import.meta.dirname }),
  { ignores: ['test/fixtures/**'] },
  {
    // Configuraciones compartidas que sus herramientas consumen como `export default`.
    files: ['prettier.js'],
    rules: { 'no-restricted-exports': 'off' },
  },
);

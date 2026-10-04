// @ts-check
/**
 * Alias de módulos para dependency-cruiser. El alias @/* de apps/web vive en su tsconfig sin baseUrl
 * (TypeScript 6 lo depreca), y el lector de tsconfig de dependency-cruiser lo resuelve desde el
 * directorio de trabajo. Aquí se declara con la misma ruta, relativa a la raíz del monorepo.
 */
const { resolve } = require('node:path');

module.exports = {
  resolve: {
    alias: { '@': resolve('apps/web/src') },
  },
};

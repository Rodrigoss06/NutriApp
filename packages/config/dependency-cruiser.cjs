// @ts-check
/**
 * Reglas de dependencia de Notion 02 Arquitectura, sección 4 (RNF-21), verificadas con `pnpm lint:arch`.
 * Una regla rota no se silencia: se discute y, si cambia, se registra un ADR en DECISIONS.md.
 * test/dependency-cruiser.spec.ts demuestra que cada regla atrapa su caso.
 */

const { resolve } = require('node:path');

const API_SRC = '^apps/api/src/';
/** Un contexto de src/modules o la plataforma técnica: ambos exponen solo su index.ts. */
const BOUNDED = '(modules/[^/]+|platform)';
const SPEC = '\\.spec\\.ts$';
const TYPE_ONLY = /** @type {const} */ (['type-only', 'type-import']);

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'module-public-api',
      comment: '02 §4: desde otro módulo solo se importa el index.ts (platform incluida).',
      severity: 'error',
      from: { path: `${API_SRC}${BOUNDED}/` },
      to: {
        path: `${API_SRC}${BOUNDED}/`,
        pathNot: [`${API_SRC}$1/`, `${API_SRC}${BOUNDED}/index\\.ts$`],
      },
    },
    {
      name: 'module-public-api-from-app-root',
      comment: '02 §4: main, worker, app.module y las pruebas de API usan solo el index.ts.',
      severity: 'error',
      from: { path: '^apps/api/(src|test)/', pathNot: `${API_SRC}${BOUNDED}/` },
      to: {
        path: `${API_SRC}${BOUNDED}/`,
        pathNot: `${API_SRC}${BOUNDED}/index\\.ts$`,
      },
    },
    {
      name: 'domain-allowlist',
      comment:
        '02 §4: domain solo importa su propio dominio, shared-kernel y tipos de engine ' +
        '(nada de NestJS, Prisma, Zod, HTTP, Node, application, adapters ni otros módulos).',
      severity: 'error',
      from: { path: `${API_SRC}modules/([^/]+)/domain/`, pathNot: SPEC },
      to: {
        pathNot: [
          `${API_SRC}modules/$1/domain/`,
          '^packages/shared-kernel/src/',
          '^packages/engine/src/',
        ],
      },
    },
    {
      name: 'domain-engine-types-only',
      comment: '02 §4: domain solo usa tipos de engine; los cálculos se invocan desde application.',
      severity: 'error',
      from: { path: `${API_SRC}modules/[^/]+/domain/`, pathNot: SPEC },
      to: { path: '^packages/engine/', dependencyTypesNot: [...TYPE_ONLY] },
    },
    {
      name: 'application-no-infrastructure',
      comment: '02 §4: application no importa Prisma, adaptadores ni objetos HTTP.',
      severity: 'error',
      from: { path: `${API_SRC}modules/[^/]+/application/`, pathNot: SPEC },
      to: {
        path: [
          '/adapters/',
          '(^|/)node_modules/(@prisma/[^/]+|prisma|express|@nestjs/platform-express)/',
          '^(@prisma/|prisma$|express$|@nestjs/platform-express$)',
          '^(node:)?https?$',
        ],
      },
    },
    {
      name: 'web-not-to-api',
      comment: '02 §4: apps/web no importa ningún archivo de apps/api.',
      severity: 'error',
      from: { path: '^apps/web/' },
      to: { path: '^apps/api/' },
    },
    {
      name: 'web-allowed-packages',
      comment:
        '02 §4: apps/web usa contracts, ui y engine (vistas previas); shared-kernel es del backend.',
      severity: 'error',
      from: { path: '^apps/web/src/' },
      to: { path: '^packages/shared-kernel/' },
    },
    {
      name: 'packages-not-to-apps',
      comment: 'Los paquetes compartidos no dependen de las aplicaciones.',
      severity: 'error',
      from: { path: '^packages/' },
      to: { path: '^apps/' },
    },
    {
      name: 'engine-pure',
      comment: 'Regla dura 2 y ADR-007: el motor no tiene dependencias ni E/S.',
      severity: 'error',
      from: { path: '^packages/engine/src/', pathNot: SPEC },
      to: { pathNot: '^packages/engine/src/' },
    },
    {
      name: 'shared-kernel-no-dependencies',
      comment: '02 §5: shared-kernel no tiene dependencias externas.',
      severity: 'error',
      from: { path: '^packages/shared-kernel/src/', pathNot: SPEC },
      to: { pathNot: '^packages/shared-kernel/src/' },
    },
    {
      name: 'no-circular',
      comment: 'Sin ciclos entre archivos; los imports de solo tipos no cuentan.',
      severity: 'error',
      from: {},
      to: { circular: true, viaOnly: { dependencyTypesNot: [...TYPE_ONLY] } },
    },
    {
      name: 'not-to-unresolvable',
      comment: 'Todo import resuelve a un archivo o a un paquete instalado.',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: '(^|/)node_modules/' },
    exclude: {
      path: [
        '(^|/)(dist|dist-worker|coverage|\\.next|\\.turbo)/',
        'next-env\\.d\\.ts$',
        '^packages/config/test/fixtures/',
      ],
    },
    tsPreCompilationDeps: true,
    // El alias @/* de apps/web se resuelve con dependency-cruiser.resolve.cjs.
    webpackConfig: { fileName: resolve(__dirname, 'dependency-cruiser.resolve.cjs') },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['@nutricoach/source', 'import', 'require', 'node', 'default', 'types'],
      mainFields: ['module', 'main', 'types', 'typings'],
    },
  },
};

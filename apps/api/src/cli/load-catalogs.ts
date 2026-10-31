import '../env-file.js';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NestFactory } from '@nestjs/core';
import { importCatalog, platformAdmin } from './catalog-cli.js';
import { CliModule } from './cli.module.js';

/**
 * Los catálogos globales de seeds/, en orden: la TAFERA enlaza alimentos de la TPCA y la tabla patrón × nivel, ejercicios
 * de la biblioteca (RF-38). Corren en todo entorno, también en producción, donde db:seed no corre nunca: sin ellos no hay
 * alimentos, actividades ni ejercicios. Cada archivo ya aplicado queda como lote repetido.
 */
const CATALOGS = [
  { kind: 'TPCA_FOODS', file: 'food/tpca-2017.csv' },
  { kind: 'TAFERA_MEASURES', file: 'food/tafera-2016-medidas.csv' },
  { kind: 'TAFERA_COOKING_FACTORS', file: 'food/tafera-2016-factores.csv' },
  { kind: 'COMPENDIUM_ACTIVITIES', file: 'exercise/compendium-2024.csv' },
  { kind: 'EXERCISE_LIBRARY', file: 'exercise/ejercicios-base.csv' },
  { kind: 'EXERCISE_PATTERN_CHOICES', file: 'exercise/pattern-choice-v3.csv' },
] as const;

/** seeds/ en la raíz del repositorio, visto desde dist/cli. */
const DEFAULT_SEEDS = fileURLToPath(new URL('../../../../seeds/', import.meta.url));

/** Uso: node dist/cli/load-catalogs.js <correo del administrador de plataforma> [carpeta seeds] */
const [email, seeds = DEFAULT_SEEDS] = process.argv.slice(2);
if (!email) {
  console.error('Uso: load-catalogs <correo> [carpeta seeds]');
  process.exit(2);
}

const app = await NestFactory.createApplicationContext(CliModule, { logger: ['error', 'warn'] });
try {
  const startedBy = await platformAdmin(app, email);
  for (const { kind, file } of CATALOGS) {
    if (!(await importCatalog(app, kind, join(seeds, file), startedBy))) process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await app.close();
}

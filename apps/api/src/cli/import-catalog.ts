import '../env-file.js';
import { NestFactory } from '@nestjs/core';
import { CatalogImporter } from '../platform/index.js';
import { importCatalog, platformAdmin } from './catalog-cli.js';
import { CliModule } from './cli.module.js';

/**
 * Importa un archivo de catálogo global como un lote (RF-38, RN-I04): valida cada fila, guarda las válidas y registra
 * el lote con su hash. El mismo archivo dos veces deja el segundo lote como DUPLICATE sin tocar los datos.
 *
 * Uso: node dist/cli/import-catalog.js <TIPO> <archivo.csv> <correo del administrador de plataforma>
 */
const [kind, path, email] = process.argv.slice(2);
const app = await NestFactory.createApplicationContext(CliModule, { logger: ['error', 'warn'] });
try {
  if (!kind || !path || !email) {
    const kinds = app.get(CatalogImporter).kinds().join(', ');
    console.error(`Uso: import-catalog <TIPO> <archivo.csv> <correo>\nTipos: ${kinds}`);
    process.exitCode = 2;
  } else {
    const ok = await importCatalog(app, kind, path, await platformAdmin(app, email));
    if (!ok) process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await app.close();
}

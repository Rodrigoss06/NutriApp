import '../env-file.js';
import { NestFactory } from '@nestjs/core';
import { AnalyticsRebuild } from '../modules/analytics/index.js';
import { AnalyticsCliModule } from './analytics-cli.module.js';

/**
 * Reconstruye la analítica desde las tablas de origen (P14, alcance 2): borra los resúmenes del paciente y los vuelve a calcular
 * con la misma función que el worker. Reconstruir dos veces da los mismos números.
 *
 * Uso: node dist/cli/analytics-rebuild.js --patient <id del paciente> | --all
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const [flag, value] = process.argv.slice(2).filter((arg) => arg !== '--');

if (!(flag === '--all' || (flag === '--patient' && value !== undefined && UUID.test(value)))) {
  console.error('Uso: analytics:rebuild --patient <id del paciente> | --all');
  process.exitCode = 2;
} else {
  const app = await NestFactory.createApplicationContext(AnalyticsCliModule, {
    logger: ['error', 'warn'],
  });
  try {
    const rebuild = app.get(AnalyticsRebuild);
    const started = Date.now();
    const report = flag === '--all' ? await rebuild.all() : await rebuild.patient(value ?? '');
    if (!report) {
      console.error('No existe un paciente con ese id.');
      process.exitCode = 1;
    } else {
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      console.log(
        `Analítica reconstruida: ${String(report.patients)} pacientes, ${String(report.days)} días, en ${seconds} s.`,
      );
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

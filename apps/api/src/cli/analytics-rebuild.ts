import '../env-file.js';
import { NestFactory } from '@nestjs/core';
import { AnalyticsRebuild } from '../modules/analytics/index.js';
import { AnalyticsCliModule } from './analytics-cli.module.js';

/**
 * Reconstruye la analítica desde las tablas de origen (P14, alcance 2): borra los resúmenes del paciente y los vuelve a calcular
 * con la misma función que el worker. Reconstruir dos veces da los mismos números.
 *
 * Uso: node dist/cli/analytics-rebuild.js --patient <id del paciente> | --all [--concurrency N]
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const [flag, value, option] = process.argv.slice(2).filter((arg) => arg !== '--');
/** --all --concurrency N: N pacientes a la vez (1 a 8), cada uno con sus transacciones (ADR-096). */
const concurrency = flag === '--all' && value === '--concurrency' ? Number(option) : 1;

if (!(
  (flag === '--all' && Number.isInteger(concurrency) && concurrency >= 1 && concurrency <= 8) ||
  (flag === '--patient' && value !== undefined && UUID.test(value) && option === undefined)
)) {
  console.error('Uso: analytics:rebuild --patient <id del paciente> | --all [--concurrency N]');
  process.exitCode = 2;
} else {
  const app = await NestFactory.createApplicationContext(AnalyticsCliModule, {
    logger: ['error', 'warn'],
  });
  try {
    const rebuild = app.get(AnalyticsRebuild);
    const started = Date.now();
    const report =
      flag === '--all' ? await rebuild.all(concurrency) : await rebuild.patient(value ?? '');
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

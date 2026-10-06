import { readdirSync } from 'node:fs';
import { Inject, Injectable } from '@nestjs/common';
import type { HealthStatus } from '@nutricoach/contracts';
import type { PrismaClient } from '../database/generated/client.js';
import { PRISMA } from '../database/prisma.provider.js';
import { PG_BOSS_SCHEMA } from '../queue/pg-boss.provider.js';

export type ReadinessCheck = 'database' | 'migrations' | 'queue' | 'partitions';
export type Readiness = Record<ReadinessCheck, HealthStatus>;

/** La cola está activa si el programador de pg-boss del worker pasó hace poco (corre cada minuto). */
const QUEUE_STALE_AFTER = '5 minutes';

/** Migraciones que trae esta versión: apps/api/prisma/migrations, igual desde src que desde dist. */
export function bundledMigrations(
  directory: URL = new URL('../../../prisma/migrations', import.meta.url),
): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/**
 * Listo para recibir tráfico (01 §8): base, migraciones al día, cola activa y partición del mes siguiente.
 * Lee solo metadatos con funciones de app y el esquema de pg-boss; nunca datos de una organización.
 */
@Injectable()
export class ReadinessService {
  readonly #expected = bundledMigrations();

  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async check(): Promise<Readiness> {
    const database = await this.#probe(async () => {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    });
    if (database === 'error') {
      return { database, migrations: 'error', queue: 'error', partitions: 'error' };
    }
    const [migrations, queue, partitions] = await Promise.all([
      this.#probe(async () => {
        const rows = await this.prisma.$queryRaw<
          { name: string }[]
        >`SELECT app.applied_migrations() AS name`;
        const applied = new Set(rows.map((row) => row.name));
        return this.#expected.every((name) => applied.has(name));
      }),
      this.#probe(async () => {
        const rows = await this.prisma.$queryRawUnsafe<{ active: boolean }[]>(
          `SELECT max(cron_on) > now() - interval '${QUEUE_STALE_AFTER}' AS active FROM ${PG_BOSS_SCHEMA}.version`,
        );
        return rows[0]?.active === true;
      }),
      this.#probe(async () => {
        const rows = await this.prisma.$queryRaw<
          unknown[]
        >`SELECT * FROM app.missing_next_month_partitions()`;
        return rows.length === 0;
      }),
    ]);
    return { database, migrations, queue, partitions };
  }

  async #probe(test: () => Promise<boolean>): Promise<HealthStatus> {
    try {
      return (await test()) ? 'ok' : 'error';
    } catch {
      return 'error';
    }
  }
}

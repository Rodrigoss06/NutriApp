import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { healthResponseSchema } from '@nutricoach/contracts';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { configureHttp, WorkerRuntime } from '../../src/platform/index.js';
import { WorkerModule } from '../../src/worker.module.js';
import { pool } from './support/database.js';

let worker: INestApplicationContext;
let api: INestApplication<App>;

beforeAll(async () => {
  worker = await NestFactory.createApplicationContext(WorkerModule, {
    logger: false,
    abortOnError: false,
  });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  api = moduleRef.createNestApplication({ logger: false });
  configureHttp(api);
  await api.init();
}, 60_000);

afterAll(async () => {
  await api.close();
  await worker.close();
});

describe('02 §1 · el worker corre con el mismo código que la API', () => {
  it('arranca pg-boss, despacha el outbox y programa el mantenimiento', async () => {
    expect(worker.get(WorkerRuntime).running).toBe(true);
    const queues = await pool('user').query<{ name: string }>(
      'SELECT name FROM pgboss.queue ORDER BY name',
    );
    expect(queues.rows.map((q) => q.name)).toEqual(
      expect.arrayContaining([
        'platform.dead-letter',
        'platform.maintenance-cleanup',
        'platform.maintenance-partitions',
      ]),
    );
  });
});

describe('01 §8 · /api/health/ready', () => {
  it('responde 200 con la base, las migraciones al día, la cola activa y la partición del mes siguiente', async () => {
    const response = await request(api.getHttpServer()).get('/api/health/ready');

    expect(response.status).toBe(200);
    expect(healthResponseSchema.parse(response.body)).toEqual({
      status: 'ok',
      checks: { database: 'ok', migrations: 'ok', queue: 'ok', partitions: 'ok' },
    });
  });
});

describe('01 §8 · el worker se detiene limpio', () => {
  it('al cerrarse deja de despachar', async () => {
    const runtime = worker.get(WorkerRuntime);
    await worker.close();

    expect(runtime.running).toBe(false);
    worker = await NestFactory.createApplicationContext(WorkerModule, {
      logger: false,
      abortOnError: false,
    });
  });
});

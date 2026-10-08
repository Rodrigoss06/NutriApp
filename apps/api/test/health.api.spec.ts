import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { healthResponseSchema } from '@nutricoach/contracts';
import { isUuidV7 } from '@nutricoach/shared-kernel';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureHttp } from '../src/platform/index.js';

describe('01 §8 · verificaciones de salud de la API', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureHttp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health/live responde 200: el proceso está vivo', async () => {
    const response = await request(app.getHttpServer()).get('/api/health/live');

    expect(response.status).toBe(200);
    expect(healthResponseSchema.parse(response.body)).toEqual({ status: 'ok' });
  });

  it('GET /api/health/ready responde 503 sin base y dice qué revisó', async () => {
    const response = await request(app.getHttpServer()).get('/api/health/ready');

    expect(response.status).toBe(503);
    expect(healthResponseSchema.parse(response.body)).toEqual({
      status: 'error',
      checks: { database: 'error', migrations: 'error', queue: 'error', partitions: 'error' },
    });
  });

  it('RNF-24 · cada respuesta trae x-request-id y conserva el que llega válido', async () => {
    const incoming = '01928c4e-3f5a-7b2c-9d1e-0f2a3b4c5d6e';

    const generated = await request(app.getHttpServer()).get('/api/health/live');
    const propagated = await request(app.getHttpServer())
      .get('/api/health/live')
      .set('x-request-id', incoming);

    expect(isUuidV7(String(generated.headers['x-request-id']))).toBe(true);
    expect(propagated.headers['x-request-id']).toBe(incoming);
  });

  it('06 §5 · la salud no lleva versión; lo de negocio vive bajo /api/v1', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health/live');

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body).toMatchObject({ status: 404, code: 'NC-PLT-404' });
    expect(response.body).toHaveProperty('requestId');
  });
});

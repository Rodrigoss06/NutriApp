import {
  BadRequestException,
  Body,
  Controller,
  InternalServerErrorException,
  Module,
  Post,
  type INestApplication,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { asId, type SecurityContext } from '@nutricoach/shared-kernel';
import type { NextFunction, Response } from 'express';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { id } from '../../../test/integration/support/database.js';
import { DatabaseModule } from '../database/database.module.js';
import { configureHttp } from '../http/configure-http.js';
import type { ContextualRequest } from '../http/request-context.js';
import { IDEMPOTENCY_HEADER, REPLAYED_HEADER } from './idempotency.interceptor.js';
import { IdempotencyModule } from './idempotency.module.js';

/** Caso de uso de prueba: cuenta cuántas veces se ejecuta de verdad. */
const executions: string[] = [];
let release: (() => void) | undefined;

@Controller('test-idempotency')
class TestController {
  @Post()
  create(@Body() body: { item: string }): { created: string; execution: number } {
    executions.push(body.item);
    return { created: body.item, execution: executions.length };
  }

  @Post('slow')
  async slow(): Promise<{ ok: true }> {
    executions.push('slow');
    await new Promise<void>((resolve) => (release = resolve));
    return { ok: true };
  }

  @Post('invalid')
  invalid(): never {
    executions.push('invalid');
    throw new BadRequestException({ code: 'NC-TST-001', title: 'Inválido' });
  }

  @Post('flaky')
  flaky(): { ok: true } {
    executions.push('flaky');
    if (executions.filter((e) => e === 'flaky').length === 1)
      throw new InternalServerErrorException();
    return { ok: true };
  }
}

/** En P5 lo hacen SessionGuard y TenantGuard; aquí, la cabecera x-test-user. */
@Module({ controllers: [TestController] })
class TestModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply((req: ContextualRequest, _res: Response, next: NextFunction) => {
        const userId = req.header('x-test-user');
        if (userId) {
          req.securityContext = {
            organizationId: null,
            userId: asId(userId),
            role: 'PATIENT',
            patientId: null,
          } satisfies SecurityContext;
        }
        next();
      })
      .forRoutes('*');
  }
}

let app: INestApplication<App>;
const userA = id();
const userB = id();
const post = (
  path: string,
  user: string | undefined,
  key: string | undefined,
  body: object = {},
) => {
  const req = request(app.getHttpServer()).post(`/api/v1/test-idempotency${path}`).send(body);
  if (user) void req.set('x-test-user', user);
  if (key) void req.set(IDEMPOTENCY_HEADER, key);
  return req;
};

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [DatabaseModule, IdempotencyModule, TestModule],
  }).compile();
  app = moduleRef.createNestApplication({ logger: false });
  configureHttp(app);
  await app.init();
});

afterAll(async () => {
  await app.close();
});

describe('RN-G08 · Idempotency-Key: un reintento no duplica', () => {
  it('la misma clave y el mismo cuerpo devuelven la respuesta guardada sin ejecutar otra vez', async () => {
    const key = `clave-${id()}`;
    const first = await post('', userA, key, { item: 'agua', ml: 250 });
    const retry = await post('', userA, key, { ml: 250, item: 'agua' });

    expect(first.status).toBe(201);
    expect(retry.status).toBe(201);
    expect(retry.body).toEqual(first.body);
    expect(retry.headers[REPLAYED_HEADER]).toBe('true');
    expect(executions.filter((e) => e === 'agua')).toHaveLength(1);
  });

  it('la misma clave con otro cuerpo responde 422', async () => {
    const key = `clave-${id()}`;
    await post('', userA, key, { item: 'arroz' });
    const reused = await post('', userA, key, { item: 'pollo' });

    expect(reused.status).toBe(422);
    expect(reused.body).toMatchObject({ code: 'NC-PLT-001', status: 422 });
  });

  it('mientras la primera sigue en curso, la segunda responde 409', async () => {
    const key = `clave-${id()}`;
    const first = post('/slow', userA, key).then((r) => r);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const concurrent = await post('/slow', userA, key);
    release?.();
    const done = await first;

    expect(concurrent.status).toBe(409);
    expect(concurrent.body).toMatchObject({ code: 'NC-PLT-002' });
    expect(done.status).toBe(201);
  });

  it('una respuesta 4xx se guarda y se repite igual', async () => {
    const key = `clave-${id()}`;
    const first = await post('/invalid', userA, key);
    const retry = await post('/invalid', userA, key);

    expect(first.status).toBe(400);
    expect(retry.status).toBe(400);
    expect(retry.body).toEqual(first.body);
    expect(executions.filter((e) => e === 'invalid')).toHaveLength(1);
  });

  it('una respuesta 5xx no se guarda: el reintento vuelve a ejecutar', async () => {
    const key = `clave-${id()}`;
    const first = await post('/flaky', userA, key);
    const retry = await post('/flaky', userA, key);

    expect(first.status).toBe(500);
    expect(retry.status).toBe(201);
    expect(executions.filter((e) => e === 'flaky')).toHaveLength(2);
  });

  it('cada usuario tiene sus claves: la misma clave de otro usuario es otra petición', async () => {
    const key = `clave-${id()}`;
    await post('', userA, key, { item: 'pan' });
    const other = await post('', userB, key, { item: 'pan' });

    expect(other.headers[REPLAYED_HEADER]).toBeUndefined();
    expect(executions.filter((e) => e === 'pan')).toHaveLength(2);
  });

  it('una clave con formato inválido responde 400; sin usuario o sin clave, la petición sigue igual', async () => {
    expect((await post('', userA, 'corta')).status).toBe(400);
    await post('', undefined, `clave-${id()}`, { item: 'anónimo' });
    await post('', userA, undefined, { item: 'anónimo' });
    expect(executions.filter((e) => e === 'anónimo')).toHaveLength(2);
  });
});

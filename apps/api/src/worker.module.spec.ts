import { NestFactory } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { WorkerHeartbeat } from './platform/index.js';
import { WorkerModule } from './worker.module.js';

describe('02 §1 · el worker arranca con el mismo código que la API', () => {
  it('levanta su contexto, late mientras vive y se detiene al cerrarse', async () => {
    const worker = await NestFactory.createApplicationContext(WorkerModule, {
      logger: false,
      abortOnError: false,
    });
    const heartbeat = worker.get(WorkerHeartbeat);

    expect(heartbeat.running).toBe(true);

    await worker.close();

    expect(heartbeat.running).toBe(false);
  });
});

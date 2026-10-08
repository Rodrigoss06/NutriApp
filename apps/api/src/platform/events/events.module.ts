import { Global, Module } from '@nestjs/common';
import { OUTBOX } from '@nutricoach/shared-kernel';
import { ConsumerRunner } from './consumer-runner.js';
import { JobRegistry } from '../jobs/job-registry.js';
import { ConsumerRegistry } from './event-consumer.js';
import { PrismaOutbox } from './prisma-outbox.js';

/** Outbox y consumidores (02 §6): la API escribe eventos; los módulos registran sus consumidores. */
@Global()
@Module({
  providers: [
    { provide: OUTBOX, useClass: PrismaOutbox },
    ConsumerRegistry,
    ConsumerRunner,
    JobRegistry,
  ],
  exports: [OUTBOX, ConsumerRegistry, ConsumerRunner, JobRegistry],
})
export class EventsModule {}

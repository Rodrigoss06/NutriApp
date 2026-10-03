import { Global, Module } from '@nestjs/common';
import { CLOCK, ID_GENERATOR } from '@nutricoach/shared-kernel';
import { LoggerModule } from 'nestjs-pino';
import { SystemClock } from './clock/system.clock.js';
import { loadEnv } from './config/env.js';
import { UuidV7IdGenerator } from './ids/uuid-v7.id-generator.js';
import { buildLoggerParams } from './logging/logger.options.js';

/**
 * Plataforma técnica compartida por la API y el worker (02 §2): logs y adaptadores de los puertos
 * transversales. P2 agrega la unidad de trabajo, el outbox, la idempotencia y la auditoría.
 */
@Global()
@Module({
  imports: [LoggerModule.forRoot(buildLoggerParams(loadEnv().NODE_ENV))],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: ID_GENERATOR, useClass: UuidV7IdGenerator },
  ],
  exports: [CLOCK, ID_GENERATOR],
})
export class PlatformModule {}

import { Global, Module } from '@nestjs/common';
import { CLOCK, ID_GENERATOR } from '@nutricoach/shared-kernel';
import { LoggerModule } from 'nestjs-pino';
import { AuditModule } from './audit/audit.module.js';
import { SystemClock } from './clock/system.clock.js';
import { loadEnv } from './config/env.js';
import { DatabaseModule } from './database/database.module.js';
import { EventsModule } from './events/events.module.js';
import { UuidV7IdGenerator } from './ids/uuid-v7.id-generator.js';
import { createMailer } from './mail/mailers.js';
import { MAILER } from './mail/mailer.port.js';
import { RateLimiter } from './rate-limit/rate-limiter.js';
import { buildLoggerParams } from './logging/logger.options.js';

/**
 * Plataforma técnica compartida por la API y el worker (02 §2): logs y adaptadores de los puertos
 * transversales, la base con su unidad de trabajo, el outbox, la auditoría y el cifrado.
 */
@Global()
@Module({
  imports: [
    LoggerModule.forRoot(buildLoggerParams(loadEnv().NODE_ENV)),
    DatabaseModule,
    EventsModule,
    AuditModule,
  ],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: ID_GENERATOR, useClass: UuidV7IdGenerator },
    { provide: MAILER, useFactory: () => createMailer() },
    RateLimiter,
  ],
  exports: [CLOCK, ID_GENERATOR, MAILER, RateLimiter],
})
export class PlatformModule {}

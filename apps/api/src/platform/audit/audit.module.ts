import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AUDIT_PORT, ENCRYPTION_PORT } from '@nutricoach/shared-kernel';
import { AesGcmEncryption } from '../crypto/aes-gcm.encryption.js';
import { AuditEventsConsumer } from './audit-events.consumer.js';
import { PrismaAuditAdapter } from './prisma-audit.adapter.js';
import { SupportAuditInterceptor } from './support-audit.interceptor.js';

/**
 * Auditoría y cifrado de campos (02 §10); las escrituras se auditan desde sus eventos y cada petición del soporte en modo soporte, al
 * llegar (ADR-129).
 */
@Global()
@Module({
  providers: [
    AuditEventsConsumer,
    { provide: APP_INTERCEPTOR, useClass: SupportAuditInterceptor },
    { provide: AUDIT_PORT, useClass: PrismaAuditAdapter },
    { provide: ENCRYPTION_PORT, useFactory: () => new AesGcmEncryption() },
  ],
  exports: [AUDIT_PORT, ENCRYPTION_PORT],
})
export class AuditModule {}

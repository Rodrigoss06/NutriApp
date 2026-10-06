import { Global, Module } from '@nestjs/common';
import { AUDIT_PORT, ENCRYPTION_PORT } from '@nutricoach/shared-kernel';
import { AesGcmEncryption } from '../crypto/aes-gcm.encryption.js';
import { PrismaAuditAdapter } from './prisma-audit.adapter.js';

/** Auditoría y cifrado de campos (02 §10). */
@Global()
@Module({
  providers: [
    { provide: AUDIT_PORT, useClass: PrismaAuditAdapter },
    { provide: ENCRYPTION_PORT, useFactory: () => new AesGcmEncryption() },
  ],
  exports: [AUDIT_PORT, ENCRYPTION_PORT],
})
export class AuditModule {}

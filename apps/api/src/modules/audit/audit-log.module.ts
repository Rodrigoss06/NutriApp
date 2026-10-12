import { Module } from '@nestjs/common';
import { AUDIT_LOG_STORE } from './application/ports/audit-log.port.js';
import { AuditQueries } from './application/queries/audit.queries.js';
import { AuditEventsController } from './adapters/in/http/audit-events.controller.js';
import { PrismaAuditLogStore } from './adapters/out/persistence/prisma-audit-log.store.js';

/**
 * audit (02 §2): consulta de la bitácora para el dueño (RF-06). La escritura es de platform (AuditPort, transacción
 * propia, falla cerrado) y de los eventos; este contexto solo lee.
 */
@Module({
  controllers: [AuditEventsController],
  providers: [AuditQueries, { provide: AUDIT_LOG_STORE, useClass: PrismaAuditLogStore }],
})
export class AuditLogModule {}

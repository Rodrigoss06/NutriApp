import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  ID_GENERATOR,
  type AuditEntry,
  type AuditPort,
  type Clock,
  type IdGenerator,
  type SecurityContext,
} from '@nutricoach/shared-kernel';
import { ClsService } from 'nestjs-cls';
import type { PrismaClient } from '../database/generated/client.js';
import { PRISMA } from '../database/prisma.provider.js';
import { requestMeta } from '../http/request-meta.js';

/**
 * AuditPort sobre audit.audit_log (RN-B03). Escribe en una transacción propia, con el mismo contexto de
 * seguridad: las consultas corren en transacciones de solo lectura y la auditoría de una lectura no puede
 * esperar ni perderse con ellas. Si falla, `record` falla y la petición también (falla cerrado). INSERT sin
 * RETURNING: el paciente escribe su auditoría, pero no la lee.
 */
@Injectable()
export class PrismaAuditAdapter implements AuditPort {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    private readonly cls: ClsService,
  ) {}

  async record(context: SecurityContext, entry: AuditEntry): Promise<void> {
    const meta = requestMeta(this.cls);
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT
        set_config('app.org_id', ${context.organizationId ?? ''}, true),
        set_config('app.user_id', ${context.userId ?? ''}, true),
        set_config('app.role', ${context.role}, true),
        set_config('app.patient_id', ${context.patientId ?? ''}, true),
          set_config('app.member_id', ${context.memberId ?? ''}, true)`;
      await tx.auditLog.createMany({
        data: [
          {
            id: this.ids.newId<'AuditLogId'>(),
            occurredAt: this.clock.now(),
            organizationId: context.organizationId,
            actorUserId: context.userId,
            actorRole: context.role,
            supportGrantId: context.supportGrantId ?? null,
            action: entry.action,
            resourceType: entry.resourceType,
            resourceId: entry.resourceId ?? null,
            patientId: entry.patientId ?? null,
            requestId: meta.requestId,
            ip: meta.ip,
            userAgent: meta.userAgent,
            changedFields: entry.changedFields ? [...entry.changedFields] : [],
            outcome: entry.outcome ?? 'SUCCESS',
          },
        ],
      });
    });
  }
}

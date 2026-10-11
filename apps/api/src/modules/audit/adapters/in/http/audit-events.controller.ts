import { Controller, Get, Header, Query, Req } from '@nestjs/common';
import { auditEventsQuerySchema, type AuditEventListResponse } from '@nutricoach/contracts';
import type { SecurityContext } from '@nutricoach/shared-kernel';
import {
  parseBody,
  ProblemException,
  RequirePermission,
  type ContextualRequest,
} from '../../../../../platform/index.js';
import { AuditQueries } from '../../../application/queries/audit.queries.js';

const contextOf = (request: ContextualRequest): SecurityContext => {
  if (!request.securityContext?.organizationId) {
    throw new ProblemException(403, {
      title: 'Elige con qué organización trabajas.',
      code: 'NC-TEN-011',
    });
  }
  return request.securityContext;
};

/** Auditoría de accesos y cambios para el dueño (RF-06, RN-B03): solo OWNER. */
@Controller('audit-events')
export class AuditEventsController {
  constructor(private readonly queries: AuditQueries) {}

  @Get()
  @RequirePermission('audit.read')
  @Header('Cache-Control', 'no-store')
  async list(
    @Req() request: ContextualRequest,
    @Query() query: unknown,
  ): Promise<AuditEventListResponse> {
    const page = await this.queries.list(
      contextOf(request),
      parseBody(auditEventsQuerySchema, query),
    );
    return {
      events: page.events.map((e) => ({
        id: e.id,
        occurredAt: e.occurredAt.toISOString(),
        actorUserId: e.actorUserId,
        actorName: e.actorName,
        actorRole: e.actorRole,
        action: e.action,
        resourceType: e.resourceType,
        resourceId: e.resourceId,
        patientId: e.patientId,
        patientCode: e.patientCode,
        changedFields: [...e.changedFields],
        outcome: e.outcome,
        requestId: e.requestId,
      })),
      nextCursor: page.nextCursor,
    };
  }
}

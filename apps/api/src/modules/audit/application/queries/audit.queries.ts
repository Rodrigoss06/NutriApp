import { Inject, Injectable } from '@nestjs/common';
import {
  UNIT_OF_WORK,
  type SecurityContext,
  type UnitOfWork,
  type UserId,
} from '@nutricoach/shared-kernel';
import { ClinicalApi } from '../../../clinical/index.js';
import { IamApi } from '../../../iam/index.js';
import {
  AUDIT_LOG_STORE,
  type AuditLogRecord,
  type AuditLogStore,
} from '../ports/audit-log.port.js';

export interface AuditEventView extends AuditLogRecord {
  readonly actorName: string | null;
  readonly patientCode: string | null;
}

export interface AuditPage {
  readonly events: readonly AuditEventView[];
  readonly nextCursor: string | null;
}

const encodeCursor = (event: AuditLogRecord): string =>
  Buffer.from(JSON.stringify([event.occurredAt.toISOString(), event.id])).toString('base64url');
function decodeCursor(cursor: string | undefined): { occurredAt: Date; id: string } | null {
  if (!cursor) return null;
  try {
    const [at, id] = JSON.parse(Buffer.from(cursor, 'base64url').toString()) as [unknown, unknown];
    const occurredAt = typeof at === 'string' ? new Date(at) : null;
    return occurredAt && !Number.isNaN(occurredAt.getTime()) && typeof id === 'string'
      ? { occurredAt, id }
      : null;
  } catch {
    return null;
  }
}

/**
 * Consulta de auditoría para el dueño (RF-06): accesos y cambios de su organización, con filtros por paciente,
 * usuario, acción y un rango de fechas de 90 días como máximo (usa las particiones). Muestra el nombre de quien actuó
 * y el código del paciente; nunca correos ni datos clínicos.
 */
@Injectable()
export class AuditQueries {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(AUDIT_LOG_STORE) private readonly log: AuditLogStore,
    private readonly iam: IamApi,
    private readonly clinical: ClinicalApi,
  ) {}

  list(
    context: SecurityContext,
    params: {
      from: string;
      to: string;
      patientId?: string | undefined;
      userId?: string | undefined;
      action?: string | undefined;
      cursor?: string | undefined;
      limit: number;
    },
  ): Promise<AuditPage> {
    return this.uow.query(context, async () => {
      const rows = await this.log.list({
        from: new Date(params.from),
        to: new Date(params.to),
        patientId: params.patientId ?? null,
        userId: params.userId ?? null,
        action: params.action ?? null,
        after: decodeCursor(params.cursor),
        limit: params.limit + 1,
      });
      const page = rows.slice(0, params.limit);
      const names = await this.iam.displayNames([
        ...new Set(page.flatMap((e) => (e.actorUserId ? [e.actorUserId] : []))),
      ] as UserId[]);
      const codes = await this.clinical.patientCodes([
        ...new Set(page.flatMap((e) => (e.patientId ? [e.patientId] : []))),
      ]);
      const last = page.at(-1);
      return {
        events: page.map((event) => ({
          ...event,
          actorName: event.actorUserId ? (names.get(event.actorUserId) ?? null) : null,
          patientCode: event.patientId ? (codes.get(event.patientId) ?? null) : null,
        })),
        nextCursor: rows.length > params.limit && last ? encodeCursor(last) : null,
      };
    });
  }
}

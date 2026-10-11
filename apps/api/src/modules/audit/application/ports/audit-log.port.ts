import type { UserId } from '@nutricoach/shared-kernel';

export interface AuditLogRecord {
  readonly id: string;
  readonly occurredAt: Date;
  readonly actorUserId: UserId | null;
  readonly actorRole: string | null;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId: string | null;
  readonly patientId: string | null;
  readonly changedFields: readonly string[];
  readonly outcome: string;
  readonly requestId: string | null;
}

export interface AuditLogFilter {
  readonly from: Date;
  readonly to: Date;
  readonly patientId: string | null;
  readonly userId: string | null;
  readonly action: string | null;
  readonly after: { occurredAt: Date; id: string } | null;
  readonly limit: number;
}

/** audit.audit_log con la transacción de la UnitOfWork: la RLS deja leer solo la organización del contexto. */
export interface AuditLogStore {
  list(filter: AuditLogFilter): Promise<readonly AuditLogRecord[]>;
}

export const AUDIT_LOG_STORE = Symbol.for('nutricoach.audit.AuditLogStore');

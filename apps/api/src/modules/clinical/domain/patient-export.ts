import { domainError, type DomainError } from '@nutricoach/shared-kernel';
import type { ActorRole } from './clinical-rules.js';

/**
 * La exportación del paciente (RF-07, RN-B04; ADR-124, ADR-131): la piden el responsable, el dueño o el propio paciente; el worker arma
 * el ZIP y queda 24 horas para descargarlo, solo quien la pidió. Puro.
 */
export type PatientExportStatus = 'PENDING' | 'READY' | 'EXPIRED' | 'FAILED';
export type ExportRequesterRole = 'STAFF' | 'PATIENT';

/** 24 horas desde que está lista (ADR-124). */
export const EXPORT_TTL_MS = 24 * 60 * 60 * 1000;
/** Un pedido que el worker no terminó en una hora ya no se termina: se muestra como fallido y se puede pedir otro. */
export const EXPORT_STALE_MS = 60 * 60 * 1000;
/** Lo que se lista: lo pedido en los últimos 7 días. */
export const EXPORT_LIST_MS = 7 * 24 * 60 * 60 * 1000;

export interface PatientExportRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly patientId: string;
  readonly requestedBy: string;
  readonly requestedByRole: ExportRequesterRole;
  /** El miembro que la pidió; null si la pidió el paciente. Las notas «Solo el autor» van solo a su autor. */
  readonly requestedByMember: string | null;
  readonly status: PatientExportStatus;
  readonly fileId: string | null;
  readonly sizeBytes: number | null;
  readonly createdAt: Date;
  readonly readyAt: Date | null;
  readonly expiresAt: Date | null;
}

export const EXPORT_NOT_ALLOWED = domainError({
  code: 'NC-CLI-041',
  rule: 'RN-B04',
  message:
    'La exportación la piden el responsable del paciente, el dueño de la organización o el propio paciente.',
});
export const EXPORT_NOT_FOUND = domainError({
  code: 'NC-CLI-042',
  rule: 'RN-B04',
  message: 'La exportación no existe o no la pediste tú.',
});
export const EXPORT_NOT_READY = domainError({
  code: 'NC-CLI-043',
  rule: 'RN-B04',
  message: 'La exportación todavía se está preparando.',
});
export const EXPORT_EXPIRED = domainError({
  code: 'NC-CLI-044',
  rule: 'RN-B04',
  message: 'La exportación venció: pide otra.',
});
export const EXPORT_FAILED = domainError({
  code: 'NC-CLI-045',
  rule: 'RN-B04',
  message: 'No se pudo preparar la exportación: pide otra.',
});

/** El estado que se muestra: una lista vencida es EXPIRED y una pendiente de hace más de una hora, FAILED, aunque el trabajo no pasó. */
export function effectiveStatus(record: PatientExportRecord, now: Date): PatientExportStatus {
  if (record.status === 'READY' && record.expiresAt && record.expiresAt <= now) return 'EXPIRED';
  if (
    record.status === 'PENDING' &&
    now.getTime() - record.createdAt.getTime() >= EXPORT_STALE_MS
  ) {
    return 'FAILED';
  }
  return record.status;
}

/** RN-B04 (ADR-131): del equipo, el responsable del paciente y el dueño de la organización. */
export function canRequestExport(
  actor: { readonly role: ActorRole; readonly memberId: string | null },
  patient: { readonly responsibleMemberId: string },
): DomainError | null {
  if (actor.role === 'OWNER') return null;
  return actor.memberId !== null && actor.memberId === patient.responsibleMemberId
    ? null
    : EXPORT_NOT_ALLOWED;
}

/** El pedido pendiente que se reutiliza en vez de crear otro: el más reciente de quien pide, si todavía puede terminarse. */
export function reusablePending(
  records: readonly PatientExportRecord[],
  now: Date,
): PatientExportRecord | null {
  return records.find((record) => effectiveStatus(record, now) === 'PENDING') ?? null;
}

/** Si se descarga ahora: lista y sin vencer. */
export function downloadable(record: PatientExportRecord, now: Date): DomainError | null {
  switch (effectiveStatus(record, now)) {
    case 'READY':
      return null;
    case 'PENDING':
      return EXPORT_NOT_READY;
    case 'EXPIRED':
      return EXPORT_EXPIRED;
    case 'FAILED':
      return EXPORT_FAILED;
  }
}

/** «exportacion-p-0007-2026-11-13.zip»: el código del paciente sin símbolos y el día, en UTC, en que quedó lista. */
export function exportFileName(patientCode: string, readyAt: Date): string {
  const code = patientCode
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `exportacion-${code || 'paciente'}-${readyAt.toISOString().slice(0, 10)}.zip`;
}

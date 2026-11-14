import type { PatientExportRecord } from '../../domain/patient-export.js';
import type { ArchiveEntry } from '../patient-export-archive.js';
import type { PatientExportTable } from '../patient-export-sources.js';

export type NewPatientExport = Pick<
  PatientExportRecord,
  | 'id'
  | 'organizationId'
  | 'patientId'
  | 'requestedBy'
  | 'requestedByRole'
  | 'requestedByMember'
  | 'createdAt'
>;

/** clinical.patient_export y las filas de cada tabla de la exportación, con el contexto de la transacción activa (RLS). */
export interface PatientExportStore {
  insert(record: NewPatientExport): Promise<void>;
  find(id: string): Promise<PatientExportRecord | null>;
  /** Las que pidió ese usuario para ese paciente desde esa fecha, de la más reciente a la más antigua. */
  listByRequester(
    patientId: string,
    requestedBy: string,
    since: Date,
  ): Promise<readonly PatientExportRecord[]>;
  /** Solo el worker: la deja lista con su archivo. false si ya no estaba pendiente. */
  markReady(
    id: string,
    file: { readonly fileId: string; readonly sizeBytes: number },
    readyAt: Date,
    expiresAt: Date,
  ): Promise<boolean>;
  /** Solo el worker: las listas que vencieron y las pendientes que ya no se terminan, de la organización del contexto. */
  toClose(
    expiredAt: Date,
    staleBefore: Date,
  ): Promise<{
    readonly expired: readonly PatientExportRecord[];
    readonly stale: readonly PatientExportRecord[];
  }>;
  close(id: string, status: 'EXPIRED' | 'FAILED'): Promise<void>;
  /** Las filas de una tabla, como JSON, con $1 = el paciente y $2 = el miembro que la pidió. */
  rows(
    table: PatientExportTable,
    params: { readonly patientId: string; readonly requesterMemberId: string | null },
  ): Promise<readonly Record<string, unknown>[]>;
}

export const PATIENT_EXPORT_STORE = Symbol.for('nutricoach.PatientExportStore');

/** Arma el ZIP (ADR-124: fflate, solo en el adaptador). */
export interface ArchiveWriter {
  zip(entries: readonly ArchiveEntry[]): Promise<Uint8Array>;
}

export const ARCHIVE_WRITER = Symbol.for('nutricoach.ArchiveWriter');

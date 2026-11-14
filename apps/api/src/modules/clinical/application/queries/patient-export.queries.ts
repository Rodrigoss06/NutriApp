import { Inject, Injectable } from '@nestjs/common';
import {
  AUDIT_PORT,
  CLOCK,
  err,
  ok,
  UNIT_OF_WORK,
  type AuditPort,
  type Clock,
  type DomainError,
  type Id,
  type PatientId,
  type Result,
  type SecurityContext,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import { FileRegistry } from '../../../../platform/index.js';
import { PATIENT_NOT_FOUND } from '../../domain/clinical-rules.js';
import {
  downloadable,
  effectiveStatus,
  EXPORT_LIST_MS,
  EXPORT_NOT_FOUND,
  exportFileName,
  type PatientExportRecord,
  type PatientExportStatus,
} from '../../domain/patient-export.js';
import { PATIENT_STORE, type PatientStore } from '../ports/clinical.ports.js';
import { PATIENT_EXPORT_STORE, type PatientExportStore } from '../ports/patient-export.ports.js';

/** Una exportación con el estado que se muestra (vencida o fallida aunque el trabajo de cada hora no haya pasado). */
export interface PatientExportView extends PatientExportRecord {
  readonly status: PatientExportStatus;
}

export interface PatientExportFile {
  readonly content: Buffer;
  readonly fileName: string;
}

/**
 * Las exportaciones de quien pregunta y su descarga (RN-B04, RN-B03; ADR-131). Cada uno ve y descarga solo las que pidió: el equipo,
 * con la RLS del paciente (RN-A05); el paciente, las suyas. Cada descarga queda en la auditoría como EXPORT.
 */
@Injectable()
export class PatientExportQueries {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(PATIENT_EXPORT_STORE) private readonly store: PatientExportStore,
    @Inject(PATIENT_STORE) private readonly patients: PatientStore,
    @Inject(FileRegistry) private readonly files: FileRegistry,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Las que pidió quien pregunta para ese paciente en los últimos 7 días. */
  list(
    context: SecurityContext,
    patientId: string,
  ): Promise<Result<readonly PatientExportView[], DomainError>> {
    return this.uow.query(context, async () => {
      const patient = await this.patients.find(patientId);
      if (!patient) return err(PATIENT_NOT_FOUND);
      return ok(await this.#mine(context, patient.id));
    });
  }

  listForPatient(
    context: SecurityContext & { patientId: string },
  ): Promise<readonly PatientExportView[]> {
    return this.uow.query(context, () => this.#mine(context, context.patientId));
  }

  /** El ZIP como adjunto, si la pidió quien pregunta, es de ese paciente, está lista y no venció. Auditado como EXPORT (RN-B03). */
  async file(
    context: SecurityContext,
    patientId: string,
    exportId: string,
  ): Promise<Result<PatientExportFile, DomainError>> {
    const found = await this.uow.query(
      context,
      async (): Promise<
        Result<{ record: PatientExportRecord; file: PatientExportFile }, DomainError>
      > => {
        const record = await this.store.find(exportId);
        if (!record || record.patientId !== patientId || record.requestedBy !== context.userId) {
          return err(EXPORT_NOT_FOUND);
        }
        const blocked = downloadable(record, this.clock.now());
        if (blocked) return err(blocked);
        const patient = await this.patients.find(record.patientId);
        const file = record.fileId ? await this.files.read(record.fileId) : null;
        if (!patient || !file || !record.readyAt) return err(EXPORT_NOT_FOUND);
        return ok({
          record,
          file: { content: file.content, fileName: exportFileName(patient.code, record.readyAt) },
        });
      },
    );
    if (!found.ok) return found;
    await this.audit.record(context, {
      action: 'EXPORT',
      resourceType: 'clinical.patient_export',
      resourceId: found.value.record.id as Id<string>,
      patientId: found.value.record.patientId as PatientId,
    });
    return ok(found.value.file);
  }

  async #mine(context: SecurityContext, patientId: string): Promise<readonly PatientExportView[]> {
    if (!context.userId) throw new Error('Las exportaciones se listan para quien las pidió.');
    const now = this.clock.now();
    const records = await this.store.listByRequester(
      patientId,
      context.userId,
      new Date(now.getTime() - EXPORT_LIST_MS),
    );
    return records.map((record) => ({ ...record, status: effectiveStatus(record, now) }));
  }
}

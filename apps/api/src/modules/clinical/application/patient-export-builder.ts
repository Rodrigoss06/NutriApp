import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  systemContext,
  UNIT_OF_WORK,
  type Clock,
  type OrganizationId,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import { FileRegistry } from '../../../platform/index.js';
import { effectiveStatus, EXPORT_TTL_MS } from '../domain/patient-export.js';
import { PATIENT_STORE, type PatientStore } from './ports/clinical.ports.js';
import {
  ARCHIVE_WRITER,
  PATIENT_EXPORT_STORE,
  type ArchiveWriter,
  type PatientExportStore,
} from './ports/patient-export.ports.js';
import {
  archiveEntries,
  type ExportFileContent,
  type ExportTableRows,
} from './patient-export-archive.js';
import { PatientExportSources } from './patient-export-sources.js';

/** El propósito del ZIP en platform.file_object. Una exportación no entra en la siguiente. */
export const EXPORT_FILE_PURPOSE = 'PATIENT_EXPORT';

/**
 * Arma una exportación en el worker (RN-B04, ADR-131), como SYSTEM de la organización y en transacciones cortas, porque todo junto no
 * cabe en una: el pedido y el paciente; lo que cada contexto prepare (documents genera las fichas vigentes que falten, cada una en la
 * suya); las tablas de cada contexto y la lista de archivos, en una de solo lectura por contexto; los bytes y el ZIP, fuera de toda
 * transacción; y el archivo con el pedido listo por 24 horas, en una última. Idempotente: solo se arma un pedido pendiente, y dejarlo
 * listo es condicional, así que una entrega repetida no deja dos.
 */
@Injectable()
export class PatientExportBuilder {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(PATIENT_EXPORT_STORE) private readonly store: PatientExportStore,
    @Inject(PATIENT_STORE) private readonly patients: PatientStore,
    @Inject(PatientExportSources) private readonly sources: PatientExportSources,
    @Inject(FileRegistry) private readonly files: FileRegistry,
    @Inject(ARCHIVE_WRITER) private readonly archive: ArchiveWriter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async build(organizationId: OrganizationId, exportId: string): Promise<void> {
    const system = systemContext(organizationId);
    const found = await this.uow.query(system, async () => {
      const record = await this.store.find(exportId);
      // Uno que el trabajo de cada hora ya da por fallido no se arma: quien lo pidió ya ve que pida otro.
      if (!record || effectiveStatus(record, this.clock.now()) !== 'PENDING') return null;
      const patient = await this.patients.find(record.patientId);
      return patient ? { record, patient } : null;
    });
    if (!found) return;
    const { record, patient } = found;

    for (const source of this.sources.all()) await source.prepare?.(organizationId, patient.id);

    const params = { patientId: patient.id, requesterMemberId: record.requestedByMember };
    const tables: ExportTableRows[] = [];
    for (const source of this.sources.all()) {
      const present = source.present?.bind(source);
      const read = await this.uow.query(system, async () => {
        const rows: ExportTableRows[] = [];
        for (const table of source.tables) {
          const raw = await this.store.rows(table, params);
          rows.push({
            table: table.table,
            rows: present ? await Promise.all(raw.map((row) => present(table.table, row))) : raw,
          });
        }
        return rows;
      });
      tables.push(...read);
    }
    const listed = await this.uow.query(system, () =>
      this.files.listForPatient(patient.id, [EXPORT_FILE_PURPOSE]),
    );
    const files: ExportFileContent[] = [];
    for (const file of listed) {
      files.push({ ...file, content: await this.files.readKey(file.storageKey) });
    }

    const zip = await this.archive.zip(
      archiveEntries({
        exportedAt: this.clock.now(),
        patientId: patient.id,
        patientCode: patient.code,
        authorNotes: record.requestedByMember !== null,
        tables,
        files,
      }),
    );
    const written = await this.files.writeArchive(organizationId, zip);
    try {
      await this.uow.run(system, async () => {
        await this.files.register({
          ...written,
          sizeBytes: zip.byteLength,
          organizationId,
          purpose: EXPORT_FILE_PURPOSE,
          uploadedBy: null,
          patientId: patient.id,
        });
        const readyAt = this.clock.now();
        const ready = await this.store.markReady(
          record.id,
          { fileId: written.id, sizeBytes: zip.byteLength },
          readyAt,
          new Date(readyAt.getTime() + EXPORT_TTL_MS),
        );
        // Otra entrega la dejó lista primero, o el trabajo de cada hora la cerró: este ZIP sobra y no queda registrado.
        if (!ready) throw new ExportNoLongerPending();
      });
    } catch (error) {
      await this.files.discard(written.key);
      if (!(error instanceof ExportNoLongerPending)) throw error;
    }
  }
}

/** Para deshacer el registro del ZIP cuando el pedido ya no está pendiente. */
class ExportNoLongerPending extends Error {
  constructor() {
    super('La exportación dejó de estar pendiente mientras se armaba.');
  }
}

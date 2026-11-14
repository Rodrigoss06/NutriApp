import { Inject, Injectable } from '@nestjs/common';
import { ENCRYPTION_PORT, type EncryptionPort } from '@nutricoach/shared-kernel';
import { documentAad, phoneAad } from './commands/patient.commands.js';
import type { PatientExportSource } from './patient-export-sources.js';

/** «\x0a1b…», como to_jsonb escribe un bytea. */
const bytesOf = (value: unknown): Uint8Array | null =>
  typeof value === 'string' && value.startsWith('\\x') ? Buffer.from(value.slice(2), 'hex') : null;

/**
 * Lo de clinical en la exportación (RN-B04, ADR-131; ClinicalModule la registra al iniciar): la ficha del paciente con su documento
 * y su teléfono descifrados (sin el índice ciego), su equipo de atención, sus consentimientos, su historia clínica con las respuestas
 * de la anamnesis V2, sus condiciones, objetivos y notas, su perfil de rendimiento, sus cribados y su expediente de documentos. Las
 * notas «Solo el autor», solo si las escribió quien pidió la exportación.
 */
@Injectable()
export class ClinicalExportSource implements PatientExportSource {
  readonly context = 'clinical';
  readonly tables = [
    { table: 'clinical.patient', where: 'id = $1' },
    { table: 'clinical.care_team_member', orderBy: 'member_id' },
    { table: 'clinical.consent' },
    { table: 'clinical.clinical_history' },
    { table: 'clinical.condition' },
    { table: 'clinical.goal' },
    {
      table: 'clinical.clinical_note',
      where: "patient_id = $1 AND (visibility <> 'AUTHOR_ONLY' OR author_member_id = $2)",
    },
    { table: 'clinical.performance_profile' },
    { table: 'clinical.pre_exercise_screening' },
    { table: 'clinical.record_document' },
  ] as const;

  constructor(@Inject(ENCRYPTION_PORT) private readonly encryption: EncryptionPort) {}

  present(table: string, row: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (table !== 'clinical.patient') return Promise.resolve(row);
    const rest = { ...row };
    delete rest.document_number_enc;
    delete rest.document_number_bidx;
    delete rest.phone_enc;
    const id = String(row.id);
    const document = bytesOf(row.document_number_enc);
    const phone = bytesOf(row.phone_enc);
    return Promise.resolve({
      ...rest,
      document_number: document ? this.encryption.decrypt(document, documentAad(id)) : null,
      phone: phone ? this.encryption.decrypt(phone, phoneAad(id)) : null,
    });
  }
}

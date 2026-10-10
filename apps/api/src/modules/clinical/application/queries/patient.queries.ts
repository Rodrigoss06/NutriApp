import { Inject, Injectable } from '@nestjs/common';
import {
  AUDIT_PORT,
  CLOCK,
  ENCRYPTION_PORT,
  UNIT_OF_WORK,
  type AuditPort,
  type Clock,
  type EncryptionPort,
  type Id,
  type PatientId,
  type SecurityContext,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import { FileRegistry } from '../../../../platform/index.js';
import {
  ageYears,
  normalizeDocument,
  type DocumentType,
  type PatientStatus,
} from '../../domain/clinical-rules.js';
import { documentAad } from '../commands/patient.commands.js';
import { localToday } from '../local-today.js';
import {
  CONSENT_STORE,
  PATIENT_STORE,
  type CareTeamRecord,
  type ConsentDocumentRecord,
  type ConsentRecord,
  type ConsentStore,
  type PatientRecord,
  type PatientStore,
} from '../ports/clinical.ports.js';

export interface PatientView extends PatientRecord {
  readonly documentLast4: string | null;
  readonly ageYears: number;
  readonly careTeam: readonly CareTeamRecord[];
}

export interface PatientPage {
  readonly patients: readonly PatientRecord[];
  readonly nextCursor: string | null;
}

/** Cursor opaco de la lista: apellido e id del último de la página. */
const encodeCursor = (patient: PatientRecord): string =>
  Buffer.from(JSON.stringify([patient.lastName, patient.id])).toString('base64url');
function decodeCursor(cursor: string | undefined): { lastName: string; id: string } | null {
  if (!cursor) return null;
  try {
    const [lastName, id] = JSON.parse(Buffer.from(cursor, 'base64url').toString()) as [
      unknown,
      unknown,
    ];
    return typeof lastName === 'string' && typeof id === 'string' ? { lastName, id } : null;
  } catch {
    return null;
  }
}

/**
 * Lecturas de pacientes (RF-08). La RLS deja ver solo lo que RN-A05 permite. Abrir la ficha o descargar una evidencia
 * deja un READ en la auditoría (RN-B03).
 */
@Injectable()
export class PatientQueries {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(ENCRYPTION_PORT) private readonly encryption: EncryptionPort,
    @Inject(PATIENT_STORE) private readonly patients: PatientStore,
    @Inject(CONSENT_STORE) private readonly consentStore: ConsentStore,
    private readonly files: FileRegistry,
  ) {}

  /** Por nombre sin tildes o por documento exacto: el número se busca por su índice ciego, nunca en claro. */
  search(
    context: SecurityContext,
    params: {
      q?: string | undefined;
      documentType?: DocumentType | undefined;
      documentNumber?: string | undefined;
      status: PatientStatus;
      cursor?: string | undefined;
      limit: number;
    },
  ): Promise<PatientPage> {
    const organizationId = context.organizationId;
    if (!organizationId) throw new Error('Consulta clínica sin organización activa.');
    let documentBidx: Uint8Array | null = null;
    if (params.documentType && params.documentNumber) {
      const normalized = normalizeDocument(params.documentType, params.documentNumber);
      if (!normalized) return Promise.resolve({ patients: [], nextCursor: null });
      documentBidx = this.encryption.blindIndex(organizationId, params.documentType, normalized);
    }
    return this.uow.query(context, async () => {
      const rows = await this.patients.search({
        nameQuery: params.q?.trim() || null,
        documentBidx,
        status: params.status,
        after: decodeCursor(params.cursor),
        limit: params.limit + 1,
      });
      const page = rows.slice(0, params.limit);
      const last = page.at(-1);
      return {
        patients: page,
        nextCursor: rows.length > params.limit && last ? encodeCursor(last) : null,
      };
    });
  }

  /** La ficha con su equipo. Deja un READ en la auditoría (RN-B03). */
  async get(context: SecurityContext, patientId: string): Promise<PatientView | null> {
    const view = await this.uow.query(context, async () => {
      const patient = await this.patients.find(patientId);
      if (!patient) return null;
      return { patient, careTeam: await this.patients.careTeam(patientId) };
    });
    if (!view) return null;
    await this.audit.record(context, {
      action: 'READ',
      resourceType: 'clinical.patient',
      resourceId: patientId as Id<string>,
      patientId: patientId as PatientId,
    });
    const { patient, careTeam } = view;
    const document = patient.documentNumberEnc
      ? this.encryption.decrypt(patient.documentNumberEnc, documentAad(patient.id))
      : null;
    return {
      ...patient,
      documentLast4: document ? document.slice(-4) : null,
      ageYears: ageYears(patient.birthDate, localToday(this.clock.now(), patient.timezone)),
      careTeam,
    };
  }

  consents(context: SecurityContext, patientId: string): Promise<readonly ConsentRecord[] | null> {
    return this.uow.query(context, async () =>
      (await this.patients.find(patientId)) ? this.consentStore.list(patientId) : null,
    );
  }

  currentDocuments(context: SecurityContext): Promise<readonly ConsentDocumentRecord[]> {
    return this.uow.query(context, () => this.consentStore.currentDocuments());
  }

  /** Evidencia de un consentimiento: solo si se ve al paciente; deja un READ en la auditoría. */
  async evidence(
    context: SecurityContext,
    patientId: string,
    consentId: string,
  ): Promise<{ content: Buffer; mimeType: string } | null> {
    const file = await this.uow.query(context, async () => {
      if (!(await this.patients.find(patientId))) return null;
      const consent = (await this.consentStore.list(patientId)).find((c) => c.id === consentId);
      return consent?.evidenceFileId ? this.files.read(consent.evidenceFileId) : null;
    });
    if (!file) return null;
    await this.audit.record(context, {
      action: 'READ',
      resourceType: 'clinical.consent',
      resourceId: consentId as Id<string>,
      patientId: patientId as PatientId,
    });
    return file;
  }
}

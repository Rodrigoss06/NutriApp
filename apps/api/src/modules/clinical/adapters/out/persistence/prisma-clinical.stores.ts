import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { OrganizationId, UserId } from '@nutricoach/shared-kernel';
import type { Db } from '../../../../../platform/index.js';
import type {
  CareTeamAccess,
  CareTeamRole,
  ConsentChannel,
  ConsentPurpose,
  DocumentType,
  PatientStatus,
  Population,
  Sex,
} from '../../../domain/clinical-rules.js';
import type {
  CareTeamRecord,
  ConsentDocumentRecord,
  ConsentRecord,
  ConsentStore,
  PatientChanges,
  PatientRecord,
  PatientSearch,
  PatientStore,
} from '../../../application/ports/clinical.ports.js';

const bytes = (value: Uint8Array | null): Uint8Array<ArrayBuffer> | null =>
  value ? new Uint8Array(value) : null;
const isoDate = (value: Date): string => value.toISOString().slice(0, 10);
const asDate = (value: string): Date => new Date(`${value}T00:00:00Z`);

interface PatientRow {
  id: string;
  organizationId: string;
  userId: string | null;
  code: string;
  firstName: string;
  lastName: string;
  sex: string;
  birthDate: Date;
  documentType: string | null;
  documentNumberEnc: Uint8Array | null;
  documentNumberBidx: Uint8Array | null;
  email: string | null;
  phoneEnc: Uint8Array | null;
  timezone: string;
  population: string;
  status: string;
  responsibleMemberId: string;
  version: number;
}

const PATIENT_FIELDS = {
  id: true,
  organizationId: true,
  userId: true,
  code: true,
  firstName: true,
  lastName: true,
  sex: true,
  birthDate: true,
  documentType: true,
  documentNumberEnc: true,
  documentNumberBidx: true,
  email: true,
  phoneEnc: true,
  timezone: true,
  population: true,
  status: true,
  responsibleMemberId: true,
  version: true,
} as const;

const toPatient = (row: PatientRow): PatientRecord => ({
  ...row,
  organizationId: row.organizationId as OrganizationId,
  userId: row.userId as UserId | null,
  sex: row.sex as Sex,
  birthDate: isoDate(row.birthDate),
  documentType: row.documentType as DocumentType | null,
  population: row.population as Population,
  status: row.status as PatientStatus,
});

/** clinical.patient y su equipo con la transacción de la UnitOfWork; la RLS aplica RN-A01 y RN-A05. */
@Injectable()
export class PrismaPatientStore implements PatientStore {
  constructor(@Inject(TransactionHost) private readonly db: Db) {}

  async nextPatientNumber(organizationId: OrganizationId): Promise<number> {
    const [row] = await this.db.tx.$queryRaw<{ value: bigint }[]>`
      INSERT INTO platform.counter AS c (organization_id, name, next_value)
      VALUES (${organizationId}::uuid, 'patient', 2)
      ON CONFLICT (organization_id, name) DO UPDATE SET next_value = c.next_value + 1
      RETURNING c.next_value - 1 AS value`;
    return Number(row?.value ?? 1);
  }

  async countActivePatients(): Promise<number> {
    const [row] = await this.db.tx.$queryRaw<
      { n: number }[]
    >`SELECT app.count_active_patients() AS n`;
    return row?.n ?? 0;
  }

  async documentTaken(bidx: Uint8Array, exceptPatientId: string | null): Promise<boolean> {
    const [row] = await this.db.tx.$queryRaw<{ taken: boolean }[]>`
      SELECT app.patient_document_taken(${bytes(bidx)}, ${exceptPatientId}::uuid) AS taken`;
    return row?.taken ?? false;
  }

  async insert(patient: PatientRecord & { createdBy: UserId }): Promise<void> {
    await this.db.tx.patient.createMany({
      data: [
        {
          id: patient.id,
          organizationId: patient.organizationId,
          userId: patient.userId,
          code: patient.code,
          firstName: patient.firstName,
          lastName: patient.lastName,
          sex: patient.sex,
          birthDate: asDate(patient.birthDate),
          documentType: patient.documentType,
          documentNumberEnc: bytes(patient.documentNumberEnc),
          documentNumberBidx: bytes(patient.documentNumberBidx),
          email: patient.email,
          phoneEnc: bytes(patient.phoneEnc),
          timezone: patient.timezone,
          population: patient.population,
          status: patient.status,
          responsibleMemberId: patient.responsibleMemberId,
          createdBy: patient.createdBy,
        },
      ],
    });
  }

  async find(patientId: string): Promise<PatientRecord | null> {
    const row = await this.db.tx.patient.findUnique({
      where: { id: patientId },
      select: PATIENT_FIELDS,
    });
    return row ? toPatient(row) : null;
  }

  async update(patientId: string, version: number, changes: PatientChanges): Promise<boolean> {
    const { birthDate, documentNumberEnc, documentNumberBidx, phoneEnc, ...rest } = changes;
    const { count } = await this.db.tx.patient.updateMany({
      where: { id: patientId, version },
      data: {
        ...rest,
        ...(birthDate === undefined ? {} : { birthDate: asDate(birthDate) }),
        ...(documentNumberEnc === undefined ? {} : { documentNumberEnc: bytes(documentNumberEnc) }),
        ...(documentNumberBidx === undefined
          ? {}
          : { documentNumberBidx: bytes(documentNumberBidx) }),
        ...(phoneEnc === undefined ? {} : { phoneEnc: bytes(phoneEnc) }),
        version: { increment: 1 },
        updatedAt: new Date(),
      },
    });
    return count === 1;
  }

  async setStatus(
    patientId: string,
    status: PatientStatus,
    from: PatientStatus,
    at: Date,
  ): Promise<boolean> {
    const { count } = await this.db.tx.patient.updateMany({
      where: { id: patientId, status: from },
      data: {
        status,
        archivedAt: status === 'ARCHIVED' ? at : null,
        version: { increment: 1 },
        updatedAt: at,
      },
    });
    return count === 1;
  }

  /** Nombre sin tildes por trigramas (patient_name_trgm) o documento exacto por índice ciego; cursor por apellido. */
  async search(search: PatientSearch): Promise<readonly PatientRecord[]> {
    const rows = await this.db.tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM clinical.patient
      WHERE status = ${search.status}
        AND (${search.nameQuery}::text IS NULL
             OR app.unaccent_immutable(lower(first_name || ' ' || last_name))
                LIKE '%' || app.unaccent_immutable(lower(${search.nameQuery}::text)) || '%')
        AND (${bytes(search.documentBidx)}::bytea IS NULL OR document_number_bidx = ${bytes(search.documentBidx)}::bytea)
        AND (${search.after?.lastName ?? null}::text IS NULL
             OR (last_name, id) > (${search.after?.lastName ?? null}::text, ${search.after?.id ?? null}::uuid))
      ORDER BY last_name, id
      LIMIT ${search.limit}`;
    if (rows.length === 0) return [];
    const found = await this.db.tx.patient.findMany({
      where: { id: { in: rows.map((r) => r.id) } },
      select: PATIENT_FIELDS,
    });
    const byId = new Map(found.map((row) => [row.id, toPatient(row)]));
    return rows.flatMap((r) => byId.get(r.id) ?? []);
  }

  async careTeam(patientId: string): Promise<readonly CareTeamRecord[]> {
    const rows = await this.db.tx.careTeamMember.findMany({
      where: { patientId },
      select: { memberId: true, role: true, access: true },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => ({
      memberId: row.memberId,
      role: row.role as CareTeamRole,
      access: row.access as CareTeamAccess,
    }));
  }

  async upsertCareTeamMember(
    patient: { id: string; organizationId: OrganizationId },
    member: CareTeamRecord,
    addedBy: UserId,
  ): Promise<void> {
    await this.db.tx.$executeRaw`
      INSERT INTO clinical.care_team_member (patient_id, member_id, organization_id, role, access, added_by)
      VALUES (${patient.id}::uuid, ${member.memberId}::uuid, ${patient.organizationId}::uuid, ${member.role},
              ${member.access}, ${addedBy}::uuid)
      ON CONFLICT (patient_id, member_id) DO UPDATE SET role = EXCLUDED.role, access = EXCLUDED.access`;
  }

  async removeCareTeamMember(patientId: string, memberId: string): Promise<boolean> {
    const { count } = await this.db.tx.careTeamMember.deleteMany({
      where: { patientId, memberId },
    });
    return count === 1;
  }
}

/** Consentimientos y sus textos (RN-B01). Un consentimiento solo se revoca: UPDATE solo de revoked_at. */
@Injectable()
export class PrismaConsentStore implements ConsentStore {
  constructor(@Inject(TransactionHost) private readonly db: Db) {}

  async currentDocuments(): Promise<readonly ConsentDocumentRecord[]> {
    const rows = await this.db.tx.$queryRaw<
      { id: string; purpose: string; version: string; body_markdown: string }[]
    >`
      SELECT DISTINCT ON (purpose) id, purpose, version, body_markdown
      FROM clinical.consent_document
      WHERE published_at IS NOT NULL
      ORDER BY purpose, (organization_id IS NULL), published_at DESC`;
    return rows.map((row) => ({
      id: row.id,
      purpose: row.purpose as ConsentPurpose,
      version: row.version,
      bodyMarkdown: row.body_markdown,
    }));
  }

  async list(patientId: string): Promise<readonly ConsentRecord[]> {
    const rows = await this.db.tx.consent.findMany({
      where: { patientId },
      select: {
        id: true,
        patientId: true,
        purpose: true,
        channel: true,
        grantedAt: true,
        revokedAt: true,
        evidenceFileId: true,
        consentDocument: { select: { version: true } },
      },
      orderBy: { grantedAt: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      patientId: row.patientId,
      purpose: row.purpose as ConsentPurpose,
      documentVersion: row.consentDocument.version,
      channel: row.channel as ConsentChannel,
      grantedAt: row.grantedAt,
      revokedAt: row.revokedAt,
      evidenceFileId: row.evidenceFileId,
    }));
  }

  async active(patientId: string, purpose: ConsentPurpose): Promise<ConsentRecord | null> {
    return (
      (await this.list(patientId)).find((c) => c.purpose === purpose && c.revokedAt === null) ??
      null
    );
  }

  async insert(consent: Parameters<ConsentStore['insert']>[0]): Promise<void> {
    await this.db.tx.consent.createMany({ data: [consent] });
  }

  async revoke(consentId: string, at: Date): Promise<boolean> {
    const { count } = await this.db.tx.consent.updateMany({
      where: { id: consentId, revokedAt: null },
      data: { revokedAt: at },
    });
    return count === 1;
  }
}

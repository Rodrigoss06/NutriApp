import type { OrganizationId, UserId } from '@nutricoach/shared-kernel';
import type {
  CareTeamAccess,
  CareTeamRole,
  ConsentChannel,
  ConsentPurpose,
  DocumentType,
  PatientStatus,
  Population,
  Sex,
} from '../../domain/clinical-rules.js';

export interface PatientRecord {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly userId: UserId | null;
  readonly code: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly sex: Sex;
  readonly birthDate: string;
  readonly documentType: DocumentType | null;
  readonly documentNumberEnc: Uint8Array | null;
  readonly documentNumberBidx: Uint8Array | null;
  readonly email: string | null;
  readonly phoneEnc: Uint8Array | null;
  readonly timezone: string;
  readonly population: Population;
  readonly status: PatientStatus;
  readonly responsibleMemberId: string;
  readonly version: number;
}

export type PatientChanges = Partial<
  Pick<
    PatientRecord,
    | 'firstName'
    | 'lastName'
    | 'sex'
    | 'birthDate'
    | 'documentType'
    | 'documentNumberEnc'
    | 'documentNumberBidx'
    | 'email'
    | 'phoneEnc'
    | 'population'
    | 'responsibleMemberId'
  >
>;

export interface CareTeamRecord {
  readonly memberId: string;
  readonly role: CareTeamRole;
  readonly access: CareTeamAccess;
}

export interface PatientSearch {
  readonly nameQuery: string | null;
  readonly documentBidx: Uint8Array | null;
  readonly status: PatientStatus;
  readonly after: { lastName: string; id: string } | null;
  readonly limit: number;
}

/** clinical.patient y su equipo, con la transacción de la UnitOfWork: RLS por organización y equipo (RN-A05). */
export interface PatientStore {
  nextPatientNumber(organizationId: OrganizationId): Promise<number>;
  /** Activos de toda la organización (RN-A03), no solo los visibles: app.count_active_patients(). */
  countActivePatients(): Promise<number>;
  documentTaken(bidx: Uint8Array, exceptPatientId: string | null): Promise<boolean>;
  insert(patient: PatientRecord & { createdBy: UserId }): Promise<void>;
  find(patientId: string): Promise<PatientRecord | null>;
  /** Bloqueo optimista: false si la versión no coincide. */
  update(patientId: string, version: number, changes: PatientChanges): Promise<boolean>;
  setStatus(
    patientId: string,
    status: PatientStatus,
    from: PatientStatus,
    at: Date,
  ): Promise<boolean>;
  search(search: PatientSearch): Promise<readonly PatientRecord[]>;
  careTeam(patientId: string): Promise<readonly CareTeamRecord[]>;
  upsertCareTeamMember(
    patient: { id: string; organizationId: OrganizationId },
    member: CareTeamRecord,
    addedBy: UserId,
  ): Promise<void>;
  removeCareTeamMember(patientId: string, memberId: string): Promise<boolean>;
}

export interface ConsentDocumentRecord {
  readonly id: string;
  readonly purpose: ConsentPurpose;
  readonly version: string;
  readonly bodyMarkdown: string;
}

export interface ConsentRecord {
  readonly id: string;
  readonly patientId: string;
  readonly purpose: ConsentPurpose;
  readonly documentVersion: string;
  readonly channel: ConsentChannel;
  readonly grantedAt: Date;
  readonly revokedAt: Date | null;
  readonly evidenceFileId: string | null;
}

/** clinical.consent y los textos de clinical.consent_document (RN-B01). */
export interface ConsentStore {
  /** El texto vigente por finalidad: el propio de la organización si existe; si no, el de la plataforma. */
  currentDocuments(): Promise<readonly ConsentDocumentRecord[]>;
  list(patientId: string): Promise<readonly ConsentRecord[]>;
  active(patientId: string, purpose: ConsentPurpose): Promise<ConsentRecord | null>;
  insert(consent: {
    id: string;
    organizationId: OrganizationId;
    patientId: string;
    purpose: ConsentPurpose;
    consentDocumentId: string;
    channel: ConsentChannel;
    grantedAt: Date;
    evidenceFileId: string | null;
    grantedByUserId: UserId | null;
    ip: string | null;
    userAgent: string | null;
  }): Promise<void>;
  revoke(consentId: string, at: Date): Promise<boolean>;
}

export const PATIENT_STORE = Symbol.for('nutricoach.clinical.PatientStore');
export const CONSENT_STORE = Symbol.for('nutricoach.clinical.ConsentStore');

import type { OrganizationId, UserId } from '@nutricoach/shared-kernel';
import type {
  CareTeamAccess,
  CareTeamRole,
  ConditionKind,
  ConditionStatus,
  ConsentChannel,
  ConsentPurpose,
  DocumentType,
  GoalKind,
  GoalStatus,
  NoteVisibility,
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
  /** Índices ciegos del documento buscado: uno por tipo si no se indicó el tipo. null: sin filtro de documento. */
  readonly documentBidxes: readonly Uint8Array[] | null;
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
  /** Vincula la cuenta de la app solo si el paciente sigue activo y sin cuenta (UPDATE condicional). */
  linkAccount(patientId: string, userId: UserId): Promise<boolean>;
  /** Vista previa de una invitación pendiente por el hash del token (app.patient_invitation_preview). */
  previewInvitation(tokenHash: Uint8Array): Promise<InvitationPreviewRecord | null>;
  /** El paciente de la cuenta del contexto (app.patient_of_account). */
  patientOfAccount(): Promise<{
    patientId: string;
    organizationId: OrganizationId;
    hasAccess: boolean;
  } | null>;
  /** El código de los pacientes que el contexto ve (OWNER los ve a todos), para la auditoría. */
  labels(patientIds: readonly string[]): Promise<readonly { id: string; code: string }[]>;
}

export interface InvitationPreviewRecord {
  readonly patientId: string;
  readonly organizationId: OrganizationId;
  readonly firstName: string;
  readonly birthDate: string;
  readonly timezone: string;
  readonly status: PatientStatus;
  readonly linked: boolean;
  readonly activePurposes: readonly ConsentPurpose[];
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

export interface HistoryRevisionRecord {
  readonly id: string;
  readonly revision: number;
  readonly formCode: string;
  readonly formVersion: string;
  readonly answers: unknown;
  readonly recordedAt: Date;
  readonly recordedBy: UserId;
}

export interface ConditionRecord {
  readonly id: string;
  readonly patientId: string;
  readonly kind: ConditionKind;
  readonly label: string;
  readonly codeSystem: string | null;
  readonly code: string | null;
  readonly status: ConditionStatus;
  readonly since: string | null;
  readonly notes: string | null;
  readonly createdAt: Date;
}

export interface GoalRecord {
  readonly id: string;
  readonly patientId: string;
  readonly kind: GoalKind;
  readonly metricCode: string | null;
  readonly targetValue: number | null;
  readonly targetDate: string | null;
  readonly status: GoalStatus;
  readonly notes: string | null;
  readonly createdAt: Date;
}

export interface NoteRecord {
  readonly id: string;
  readonly patientId: string;
  readonly authorMemberId: string;
  readonly body: string;
  readonly visibility: NoteVisibility;
  readonly amendsNoteId: string | null;
  readonly createdAt: Date;
}

export type TimelineKind =
  | 'PATIENT_REGISTERED'
  | 'CONSENT_GRANTED'
  | 'CONSENT_REVOKED'
  | 'HISTORY_REVISED'
  | 'CONDITION_RECORDED'
  | 'GOAL_RECORDED'
  | 'NOTE_WRITTEN';

export interface TimelineRecord {
  readonly kind: TimelineKind;
  readonly occurredAt: Date;
  readonly refId: string;
  readonly label: string;
  readonly detail: string | null;
}

/**
 * Historia clínica, condiciones, objetivos, notas y línea de tiempo (RF-09, RF-10), con la transacción de la
 * UnitOfWork: la RLS aplica RN-A05 y las notas AUTHOR_ONLY.
 */
export interface ClinicalRecordStore {
  /** Bloquea la ficha del paciente hasta el fin de la transacción: las revisiones de la historia van de a una. */
  lockPatient(patientId: string): Promise<void>;
  latestHistory(patientId: string): Promise<HistoryRevisionRecord | null>;
  historyRevisions(
    patientId: string,
  ): Promise<readonly Omit<HistoryRevisionRecord, 'answers' | 'id' | 'formCode' | 'formVersion'>[]>;
  insertHistory(revision: {
    id: string;
    organizationId: OrganizationId;
    patientId: string;
    revision: number;
    formCode: string;
    formVersion: string;
    answers: unknown;
    recordedBy: UserId;
    recordedAt: Date;
  }): Promise<void>;
  conditions(patientId: string): Promise<readonly ConditionRecord[]>;
  insertCondition(
    condition: ConditionRecord & { organizationId: OrganizationId; createdBy: UserId },
  ): Promise<void>;
  updateCondition(
    patientId: string,
    conditionId: string,
    changes: { status?: ConditionStatus; notes?: string | null },
  ): Promise<boolean>;
  goals(patientId: string): Promise<readonly GoalRecord[]>;
  insertGoal(
    goal: GoalRecord & { organizationId: OrganizationId; createdBy: UserId },
  ): Promise<void>;
  updateGoal(
    patientId: string,
    goalId: string,
    changes: { status?: GoalStatus; notes?: string | null },
  ): Promise<boolean>;
  notes(patientId: string): Promise<readonly NoteRecord[]>;
  findNote(patientId: string, noteId: string): Promise<NoteRecord | null>;
  insertNote(note: NoteRecord & { organizationId: OrganizationId }): Promise<void>;
  timeline(
    patientId: string,
    before: { occurredAt: Date; refId: string } | null,
    limit: number,
  ): Promise<readonly TimelineRecord[]>;
}

export const PATIENT_STORE = Symbol.for('nutricoach.clinical.PatientStore');
export const CLINICAL_RECORD_STORE = Symbol.for('nutricoach.clinical.ClinicalRecordStore');
export const CONSENT_STORE = Symbol.for('nutricoach.clinical.ConsentStore');

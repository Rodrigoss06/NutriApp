import { domainError, type DomainError } from '@nutricoach/shared-kernel';

export type Sex = 'M' | 'F';
export type Population = 'ADULT' | 'ATHLETE' | 'CHILD' | 'ADOLESCENT' | 'OBESITY' | 'OLDER_ADULT';
export type DocumentType = 'DNI' | 'CE' | 'PASAPORTE' | 'OTRO';
/** En la versión 1.0 solo ACTIVE y ARCHIVED: un estado que no cuente para el cupo serviría para esquivarlo. */
export type PatientStatus = 'ACTIVE' | 'ARCHIVED';
export type CareTeamRole = 'RESPONSIBLE' | 'NUTRITION' | 'TRAINING' | 'COLLABORATOR';
export type CareTeamAccess = 'READ' | 'WRITE';
export type ConsentPurpose =
  'HEALTH_DATA' | 'APP_ACCESS' | 'IMAGES' | 'ANONYMIZED_RESEARCH' | 'MARKETING';
export type ConsentChannel = 'APP' | 'IN_PERSON_DIGITAL' | 'PAPER_SCANNED';
export type ActorRole = 'OWNER' | 'ADMIN' | 'PROFESSIONAL';
export type ConditionKind =
  | 'DISEASE'
  | 'ALLERGY'
  | 'INTOLERANCE'
  | 'MEDICATION'
  | 'SUPPLEMENT'
  | 'SURGERY'
  | 'INJURY'
  | 'OTHER';
export type ConditionStatus = 'ACTIVE' | 'RESOLVED';
export type GoalKind =
  'FAT_LOSS' | 'MUSCLE_GAIN' | 'MAINTENANCE' | 'RECOMPOSITION' | 'PERFORMANCE' | 'HEALTH' | 'OTHER';
export type GoalStatus = 'ACTIVE' | 'ACHIEVED' | 'ABANDONED';
export type NoteVisibility = 'CARE_TEAM' | 'AUTHOR_ONLY';
/** Las finalidades sin las que la app del paciente no funciona: obligatorias al aceptar la invitación. */
export const APP_PURPOSES = [
  'APP_ACCESS',
  'HEALTH_DATA',
] as const satisfies readonly ConsentPurpose[];

export const OBESITY_NEEDS_HEALTH_DATA = domainError({
  code: 'NC-CLI-001',
  rule: 'RN-B01',
  message:
    'La población «obesidad» es un dato de salud: primero registra el consentimiento de datos de salud.',
});
export const HEALTH_DATA_REQUIRED = domainError({
  code: 'NC-CLI-002',
  rule: 'RN-B01',
  message:
    'Sin el consentimiento de datos de salud vigente no se registran datos de salud de este paciente.',
});
export const INVALID_DOCUMENT = domainError({
  code: 'NC-CLI-003',
  message:
    'El número de documento no es válido: el DNI tiene 8 dígitos; los demás, de 4 a 20 letras o dígitos.',
});
export const DOCUMENT_TAKEN = domainError({
  code: 'NC-CLI-004',
  message: 'Ya existe un paciente con ese documento; pide acceso a su responsable.',
});
export const PATIENT_NOT_FOUND = domainError({ code: 'NC-CLI-005', message: 'No encontrado.' });
export const NOT_RESPONSIBLE = domainError({
  code: 'NC-CLI-006',
  message:
    'Solo el responsable del paciente, el dueño o un administrador que lo atiende pueden hacer esto.',
});
export const ALREADY_IN_STATUS = domainError({
  code: 'NC-CLI-007',
  message: 'El paciente ya está en ese estado.',
});
export const CONSENT_ALREADY_ACTIVE = domainError({
  code: 'NC-CLI-008',
  message: 'Ese consentimiento ya está vigente.',
});
export const EVIDENCE_REQUIRED = domainError({
  code: 'NC-CLI-009',
  rule: 'RN-B01',
  message: 'El consentimiento en papel necesita su escaneo (PDF, JPG o PNG de hasta 5 MB).',
});
export const GUARDIAN_CONSENT_REQUIRED = domainError({
  code: 'NC-CLI-010',
  rule: 'RN-B01',
  message:
    'Un menor de 14 años no da su consentimiento desde la app: su padre, madre o tutor lo firma en papel y se registra en consulta.',
});
export const CONSENT_NOT_FOUND = domainError({ code: 'NC-CLI-011', message: 'No encontrado.' });
export const RESPONSIBLE_NOT_MEMBER = domainError({
  code: 'NC-CLI-012',
  message: 'El responsable debe ser un miembro activo de la organización.',
});
export const WRITE_ACCESS_REQUIRED = domainError({
  code: 'NC-CLI-013',
  rule: 'RN-A05',
  message: 'Solo los miembros del equipo de atención con permiso de escritura pueden hacer esto.',
});
export const CANNOT_REMOVE_RESPONSIBLE = domainError({
  code: 'NC-CLI-014',
  message: 'El responsable no se quita del equipo: primero asigna otro responsable.',
});
export const VERSION_CONFLICT = domainError({
  code: 'NC-CLI-015',
  message: 'Alguien cambió esta ficha mientras la editabas. Vuelve a cargarla.',
});
export const CONSENT_DOCUMENT_NOT_CURRENT = domainError({
  code: 'NC-CLI-016',
  message: 'Ese texto de consentimiento no es el vigente. Vuelve a cargar la página.',
});
export const UNSUPPORTED_EVIDENCE = domainError({
  code: 'NC-CLI-017',
  message: 'La evidencia debe ser un PDF, JPG o PNG.',
});
export const PATIENT_ARCHIVED = domainError({
  code: 'NC-CLI-018',
  message: 'El paciente está archivado: reactívalo para registrar algo nuevo.',
});

export const HISTORY_REVISION_CONFLICT = domainError({
  code: 'NC-CLI-019',
  message: 'Alguien guardó la historia clínica mientras la editabas. Vuelve a cargarla.',
});
export const CONDITION_NOT_FOUND = domainError({ code: 'NC-CLI-020', message: 'No encontrado.' });
export const GOAL_NOT_FOUND = domainError({ code: 'NC-CLI-021', message: 'No encontrado.' });
export const NOTE_NOT_FOUND = domainError({ code: 'NC-CLI-022', message: 'No encontrado.' });
export const PATIENT_ALREADY_LINKED = domainError({
  code: 'NC-CLI-023',
  message: 'El paciente ya tiene su acceso a la app.',
});
export const PATIENT_EMAIL_REQUIRED = domainError({
  code: 'NC-CLI-024',
  message: 'Indica el correo del paciente para invitarlo.',
});
export const APP_CONSENTS_REQUIRED = domainError({
  code: 'NC-CLI-025',
  rule: 'RN-B01',
  message:
    'Para crear tu cuenta acepta cada finalidad: el uso de la app y el tratamiento de tus datos de salud.',
});
export const GUARDIAN_CONSENT_ON_PAPER = domainError({
  code: 'NC-CLI-026',
  rule: 'RN-B01',
  message:
    'Para un menor de 14 años solo vale el consentimiento en papel firmado por su padre, madre o tutor, con su escaneo.',
});
export const OBESITY_NEEDS_CARE_TEAM = domainError({
  code: 'NC-CLI-027',
  rule: 'RN-A05',
  message:
    'La población «obesidad» es un dato de salud: la pone o la quita el equipo de atención con permiso de escritura.',
});

/** DNI: 8 dígitos. Los demás: letras y dígitos sin espacios ni guiones, de 4 a 20. En mayúsculas. */
export function normalizeDocument(type: DocumentType, number: string): string | null {
  const compact = number.replace(/[\s.-]/g, '').toUpperCase();
  if (type === 'DNI') return /^\d{8}$/.test(compact) ? compact : null;
  return /^[A-Z0-9]{4,20}$/.test(compact) ? compact : null;
}

/** Edad cumplida en años a una fecha local (YYYY-MM-DD). */
export function ageYears(birthDate: string, today: string): number {
  const [by = 0, bm = 0, bd = 0] = birthDate.split('-').map(Number);
  const [ty = 0, tm = 0, td = 0] = today.split('-').map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

/**
 * ⚠️ Edad desde la que el paciente consiente por sí mismo, como un adulto y con textos en lenguaje claro: 14 años, como
 * el reglamento de la Ley 29733, hasta que el abogado lo defina.
 */
export const CONSENT_AGE = 14;

/** Menor de 14 años: consiente su padre, madre o tutor, en papel firmado que se escanea en consulta. */
export const needsGuardian = (birthDate: string, today: string): boolean =>
  ageYears(birthDate, today) < CONSENT_AGE;

/** OBESITY es un dato de salud: antes de HEALTH_DATA no se permite (RN-B01). */
export function checkPopulation(
  population: Population,
  hasHealthData: boolean,
): DomainError | null {
  return population === 'OBESITY' && !hasHealthData ? OBESITY_NEEDS_HEALTH_DATA : null;
}

/**
 * Otorgar un consentimiento (RN-B01). En papel exige el escaneo. Para un menor de 14 solo vale el papel firmado por su
 * padre, madre o tutor: la tabla no guarda quién es el tutor (⚠️ hasta que el abogado lo defina).
 */
export function checkGrant(input: {
  channel: ConsentChannel;
  hasEvidence: boolean;
  needsGuardian: boolean;
  alreadyActive: boolean;
}): DomainError | null {
  if (input.alreadyActive) return CONSENT_ALREADY_ACTIVE;
  if (input.needsGuardian && input.channel !== 'PAPER_SCANNED') return GUARDIAN_CONSENT_ON_PAPER;
  if (input.channel === 'PAPER_SCANNED' && !input.hasEvidence) return EVIDENCE_REQUIRED;
  return null;
}

/** Archivar, reactivar y editar el equipo: el responsable, OWNER o ADMIN (si lo ve, cosa que decide la RLS). */
export function canManagePatient(
  actor: { role: ActorRole; memberId: string | null },
  responsibleMemberId: string,
): boolean {
  return actor.role === 'OWNER' || actor.role === 'ADMIN' || actor.memberId === responsibleMemberId;
}

/** Escribir datos clínicos: OWNER, o un miembro del equipo con acceso WRITE (el responsable lo tiene). */
export function canWriteClinical(
  actor: { role: ActorRole; memberId: string | null },
  team: readonly { memberId: string; access: CareTeamAccess }[],
): boolean {
  return (
    actor.role === 'OWNER' ||
    team.some((m) => m.memberId === actor.memberId && m.access === 'WRITE')
  );
}

/**
 * Escribir el expediente (historia, condiciones, objetivos y notas): solo el equipo con acceso WRITE. OWNER ve a todos
 * (RN-A05), pero lo clínico lo escribe quien atiende: si el dueño atiende, está en el equipo.
 */
export function canWriteRecord(
  actor: { memberId: string | null },
  team: readonly { memberId: string; access: CareTeamAccess }[],
): boolean {
  return (
    actor.memberId !== null &&
    team.some((m) => m.memberId === actor.memberId && m.access === 'WRITE')
  );
}

/** Correlativo legible por organización: P-000123. */
export const patientCode = (n: number): string => `P-${String(n).padStart(6, '0')}`;

/** APP_ACCESS y HEALTH_DATA que aún no están vigentes: lo que se pide al aceptar la invitación, sin repetir. */
export function pendingAppPurposes(active: readonly ConsentPurpose[]): ConsentPurpose[] {
  return APP_PURPOSES.filter((purpose) => !active.includes(purpose));
}

/**
 * Aceptar la invitación del paciente (RN-A06, RN-B01): APP_ACCESS y HEALTH_DATA son obligatorias, cada una aceptada
 * por separado. Desde los 14 años se aceptan como un adulto. Un menor de 14 no consiente desde la app: solo entra si
 * ambas ya se registraron en consulta, en papel firmado por su padre, madre o tutor (⚠️).
 */
export function checkAppEnrollment(input: {
  pending: readonly ConsentPurpose[];
  accepted: readonly ConsentPurpose[];
  needsGuardian: boolean;
}): DomainError | null {
  if (input.pending.length === 0) return null;
  if (input.needsGuardian) return GUARDIAN_CONSENT_REQUIRED;
  return input.pending.every((purpose) => input.accepted.includes(purpose))
    ? null
    : APP_CONSENTS_REQUIRED;
}

/** Formulario de la historia clínica vigente: v1 de texto libre por bloque (⚠️ provisional). */
export const HISTORY_FORM = { code: 'ANAMNESIS', version: '1' } as const;

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
export const MINOR_CONSENT_IN_PERSON = domainError({
  code: 'NC-CLI-010',
  rule: 'RN-B01',
  message:
    'Un menor de 18 años no da su consentimiento desde la aplicación: se registra en consulta con su padre, madre o tutor.',
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

export const isMinor = (birthDate: string, today: string): boolean =>
  ageYears(birthDate, today) < 18;

/** OBESITY es un dato de salud: antes de HEALTH_DATA no se permite (RN-B01). */
export function checkPopulation(
  population: Population,
  hasHealthData: boolean,
): DomainError | null {
  return population === 'OBESITY' && !hasHealthData ? OBESITY_NEEDS_HEALTH_DATA : null;
}

/**
 * Otorgar un consentimiento (RN-B01). En papel exige el escaneo; un menor solo consiente en consulta (⚠️ hasta que
 * el abogado lo defina); desde la app solo lo da el propio paciente.
 */
export function checkGrant(input: {
  channel: ConsentChannel;
  hasEvidence: boolean;
  minor: boolean;
  alreadyActive: boolean;
}): DomainError | null {
  if (input.alreadyActive) return CONSENT_ALREADY_ACTIVE;
  if (input.channel === 'PAPER_SCANNED' && !input.hasEvidence) return EVIDENCE_REQUIRED;
  if (input.channel === 'APP' && input.minor) return MINOR_CONSENT_IN_PERSON;
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

/** Correlativo legible por organización: P-000123. */
export const patientCode = (n: number): string => `P-${String(n).padStart(6, '0')}`;

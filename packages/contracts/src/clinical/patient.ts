import { z } from 'zod';
import { emailSchema } from '../iam/access.js';

const isoDate = z.iso.date();
const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();

export const SEXES = ['M', 'F'] as const;
export const POPULATIONS = [
  'ADULT',
  'ATHLETE',
  'CHILD',
  'ADOLESCENT',
  'OBESITY',
  'OLDER_ADULT',
] as const;
export const DOCUMENT_TYPES = ['DNI', 'CE', 'PASAPORTE', 'OTRO'] as const;
export const PATIENT_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
export const CARE_TEAM_ROLES = ['RESPONSIBLE', 'NUTRITION', 'TRAINING', 'COLLABORATOR'] as const;
export const CARE_TEAM_ACCESS = ['READ', 'WRITE'] as const;
export const CONSENT_PURPOSES = [
  'HEALTH_DATA',
  'APP_ACCESS',
  'IMAGES',
  'ANONYMIZED_RESEARCH',
  'MARKETING',
] as const;
export const CONSENT_CHANNELS = ['APP', 'IN_PERSON_DIGITAL', 'PAPER_SCANNED'] as const;

const documentSchema = z
  .object({ type: z.enum(DOCUMENT_TYPES), number: z.string().trim().min(1).max(20) })
  .nullable()
  .optional();

/** Alta con los datos mínimos (RN-B01): sin consentimiento solo existen los datos para crear la ficha e invitar. */
export const registerPatientSchema = z.object({
  firstName: text(80),
  lastName: text(80),
  sex: z.enum(SEXES),
  birthDate: isoDate,
  document: documentSchema,
  email: emailSchema.nullable().optional(),
  phone: optionalText(30),
  population: z.enum(POPULATIONS).default('ADULT'),
  /** Miembro responsable; por defecto, quien registra. */
  responsibleMemberId: z.uuid().optional(),
});
export type RegisterPatient = z.input<typeof registerPatientSchema>;

export const updatePatientSchema = z
  .object({
    firstName: text(80),
    lastName: text(80),
    sex: z.enum(SEXES),
    birthDate: isoDate,
    document: documentSchema,
    email: emailSchema.nullable(),
    phone: optionalText(30),
    population: z.enum(POPULATIONS),
    responsibleMemberId: z.uuid(),
  })
  .partial()
  .refine((change) => Object.keys(change).length > 0, 'Indica qué cambia.');
export type UpdatePatient = z.input<typeof updatePatientSchema>;

export const patientSummarySchema = z.object({
  id: z.uuid(),
  code: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  sex: z.enum(SEXES),
  birthDate: isoDate,
  population: z.enum(POPULATIONS),
  status: z.enum(PATIENT_STATUSES),
  responsibleMemberId: z.uuid(),
});
export type PatientSummary = z.infer<typeof patientSummarySchema>;

export const patientListResponseSchema = z.object({
  patients: z.array(patientSummarySchema),
  nextCursor: z.string().nullable(),
});
export type PatientListResponse = z.infer<typeof patientListResponseSchema>;

/** Búsqueda: nombre sin tildes (trigramas) o documento exacto (índice ciego). */
export const patientSearchSchema = z.object({
  q: z.string().trim().max(80).optional(),
  documentType: z.enum(DOCUMENT_TYPES).optional(),
  documentNumber: z.string().trim().max(20).optional(),
  status: z.enum(PATIENT_STATUSES).default('ACTIVE'),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type PatientSearch = z.input<typeof patientSearchSchema>;

export const careTeamMemberSchema = z.object({
  memberId: z.uuid(),
  role: z.enum(CARE_TEAM_ROLES),
  access: z.enum(CARE_TEAM_ACCESS),
});
export type CareTeamMember = z.infer<typeof careTeamMemberSchema>;

export const patientResponseSchema = patientSummarySchema.extend({
  documentType: z.enum(DOCUMENT_TYPES).nullable(),
  /** Solo los 4 últimos dígitos: el número completo no viaja salvo que se edite. */
  documentLast4: z.string().nullable(),
  email: z.string().nullable(),
  hasPhone: z.boolean(),
  timezone: z.string(),
  ageYears: z.number().int(),
  careTeam: z.array(careTeamMemberSchema),
  version: z.number().int(),
});
export type PatientResponse = z.infer<typeof patientResponseSchema>;

export const setCareTeamMemberSchema = z.object({
  role: z.enum(CARE_TEAM_ROLES).exclude(['RESPONSIBLE']),
  access: z.enum(CARE_TEAM_ACCESS),
});
export type SetCareTeamMember = z.infer<typeof setCareTeamMemberSchema>;

export const consentDocumentSchema = z.object({
  id: z.uuid(),
  purpose: z.enum(CONSENT_PURPOSES),
  version: z.string(),
  bodyMarkdown: z.string(),
  /** true mientras el texto no tenga la revisión legal (versión «0.1-provisional»). */
  provisional: z.boolean(),
});
export type ConsentDocument = z.infer<typeof consentDocumentSchema>;
export const consentDocumentListResponseSchema = z.object({
  documents: z.array(consentDocumentSchema),
});
export type ConsentDocumentListResponse = z.infer<typeof consentDocumentListResponseSchema>;

/** Campos del multipart de otorgar; la evidencia va en el mismo pedido, en el campo «evidence». */
export const grantConsentSchema = z.object({
  consentDocumentId: z.uuid(),
  channel: z.enum(CONSENT_CHANNELS).exclude(['APP']),
});
export type GrantConsent = z.infer<typeof grantConsentSchema>;

export const consentSchema = z.object({
  id: z.uuid(),
  purpose: z.enum(CONSENT_PURPOSES),
  documentVersion: z.string(),
  channel: z.enum(CONSENT_CHANNELS),
  grantedAt: z.iso.datetime(),
  revokedAt: z.iso.datetime().nullable(),
  hasEvidence: z.boolean(),
});
export type Consent = z.infer<typeof consentSchema>;
export const consentListResponseSchema = z.object({ consents: z.array(consentSchema) });
export type ConsentListResponse = z.infer<typeof consentListResponseSchema>;

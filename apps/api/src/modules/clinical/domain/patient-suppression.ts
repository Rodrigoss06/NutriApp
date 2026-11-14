import { domainError, type DomainError } from '@nutricoach/shared-kernel';
import type { ActorRole, PatientStatus } from './clinical-rules.js';

/**
 * La supresión del paciente (RN-B05; ADR-124, ADR-133): anonimización irreversible, solo de un paciente archivado, y la confirma el dueño
 * escribiendo el código del paciente. Puro.
 */
export const SUPPRESSION_NOT_ALLOWED = domainError({
  code: 'NC-CLI-046',
  rule: 'RN-B05',
  message: 'La supresión la confirma solo el dueño de la organización.',
});
export const SUPPRESSION_NOT_ARCHIVED = domainError({
  code: 'NC-CLI-047',
  rule: 'RN-B05',
  message: 'Solo se suprime un paciente archivado: archívalo primero.',
});
export const PATIENT_ANONYMIZED = domainError({
  code: 'NC-CLI-048',
  rule: 'RN-B05',
  message: 'El paciente fue suprimido: sus datos ya no cambian y no se reactiva.',
});
export const SUPPRESSION_CODE_MISMATCH = domainError({
  code: 'NC-CLI-049',
  rule: 'RN-B05',
  message: 'El código no coincide con el del paciente.',
});

/** El código como lo escribe el dueño: sin espacios a los lados y sin distinguir mayúsculas. */
const normalized = (code: string): string => code.trim().toUpperCase();

/** Si el dueño puede suprimir ahora a este paciente, con el código que escribió. */
export function canSuppress(
  actor: { readonly role: ActorRole },
  patient: {
    readonly status: PatientStatus;
    readonly anonymizedAt?: Date | null;
    readonly code: string;
  },
  code: string,
): DomainError | null {
  if (actor.role !== 'OWNER') return SUPPRESSION_NOT_ALLOWED;
  if (patient.anonymizedAt) return PATIENT_ANONYMIZED;
  if (patient.status !== 'ARCHIVED') return SUPPRESSION_NOT_ARCHIVED;
  return normalized(code) === normalized(patient.code) ? null : SUPPRESSION_CODE_MISMATCH;
}

import type { CompositionBasis } from '../../assessment/index.js';
import type { BodyCompositionInput } from '../domain/energy-rules.js';

/** Capa anticorrupción (02 §3): la composición de assessment, traducida a la de nutrition. */
export const bodyCompositionOf = (basis: CompositionBasis): BodyCompositionInput => ({
  evaluationId: basis.evaluationId,
  sex: basis.sex,
  ageYears: basis.ageYears,
  weightKg: basis.weightKg,
  heightCm: basis.heightCm,
  fatFreeMass: basis.fatFreeMass,
});

/** La fecha local (YYYY-MM-DD) en la zona del paciente: desde ahí se cuenta la fecha estimada (RN-E05). */
export function localDateOf(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

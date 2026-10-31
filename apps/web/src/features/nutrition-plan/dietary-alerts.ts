import type { ClinicalHistoryRevision, Condition } from '@nutricoach/contracts';

export interface DietaryAlerts {
  /** Las alergias e intolerancias activas (clinical.condition). */
  readonly conditions: readonly Condition[];
  /** Lo que dice de ellas la última revisión de la historia, tal cual: nunca se interpreta. */
  readonly anamnesisNote: string | null;
}

const DIETARY_KINDS: readonly Condition['kind'][] = ['ALLERGY', 'INTOLERANCE'];

function noteOf(current: ClinicalHistoryRevision | null): string | null {
  if (current === null) return null;
  const text =
    current.formCode === 'JV_ANAMNESIS'
      ? (current.answers.N05 ?? '')
      : [current.answers.allergies, current.answers.intolerances].filter(Boolean).join(' · ');
  return text.trim() || null;
}

/** Lo que hay que tener a la vista al armar una dieta (07 §12). */
export const dietaryAlertsOf = (
  conditions: readonly Condition[],
  current: ClinicalHistoryRevision | null,
): DietaryAlerts => ({
  conditions: conditions.filter((c) => c.status === 'ACTIVE' && DIETARY_KINDS.includes(c.kind)),
  anamnesisNote: noteOf(current),
});

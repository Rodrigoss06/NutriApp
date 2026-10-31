import type { ClinicalHistoryRevision } from '@nutricoach/contracts';

/** Lo que dice de las alergias e intolerancias la última revisión de la historia, tal cual: nunca se interpreta. */
export function anamnesisNoteOf(current: ClinicalHistoryRevision | null): string | null {
  if (current === null) return null;
  const text =
    current.formCode === 'JV_ANAMNESIS'
      ? (current.answers.N05 ?? '')
      : [current.answers.allergies, current.answers.intolerances].filter(Boolean).join(' · ');
  return text.trim() || null;
}

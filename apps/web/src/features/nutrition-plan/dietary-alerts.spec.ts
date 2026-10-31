import type { ClinicalHistoryRevision } from '@nutricoach/contracts';
import { describe, expect, it } from 'vitest';
import { anamnesisNoteOf } from './dietary-alerts';

const META = {
  revision: 1,
  recordedAt: '2026-10-30T12:00:00.000Z',
  recordedBy: '0192f0a0-0000-7000-8000-0000000000a1',
};
const anamnesis = (N05?: string): ClinicalHistoryRevision => ({
  ...META,
  formCode: 'JV_ANAMNESIS',
  formVersion: 'V2',
  answers: { modality: 'IN_PERSON', ...(N05 === undefined ? {} : { N05 }) },
  profile: null,
});
const legacy = (answers: {
  allergies?: string;
  intolerances?: string;
}): ClinicalHistoryRevision => ({
  ...META,
  formCode: 'ANAMNESIS',
  formVersion: '1',
  answers,
  profile: null,
});

describe('07 §12 · lo que dice la anamnesis de las alergias e intolerancias', () => {
  it('la respuesta de la anamnesis V2, aunque no se haya registrado como condición', () => {
    expect(anamnesisNoteOf(anamnesis(' No come mariscos. '))).toBe('No come mariscos.');
    expect(anamnesisNoteOf(anamnesis())).toBeNull();
    expect(anamnesisNoteOf(anamnesis('   '))).toBeNull();
  });

  it('los bloques de alergias e intolerancias de la historia v1', () => {
    expect(anamnesisNoteOf(legacy({ allergies: 'Maní', intolerances: 'Lactosa' }))).toBe(
      'Maní · Lactosa',
    );
    expect(anamnesisNoteOf(legacy({ intolerances: 'Lactosa' }))).toBe('Lactosa');
    expect(anamnesisNoteOf(legacy({}))).toBeNull();
  });

  it('sin historia, nada', () => {
    expect(anamnesisNoteOf(null)).toBeNull();
  });
});

import type { ClinicalHistoryRevision, Condition } from '@nutricoach/contracts';
import { describe, expect, it } from 'vitest';
import { dietaryAlertsOf } from './dietary-alerts';

const condition = (
  kind: Condition['kind'],
  label: string,
  status: Condition['status'] = 'ACTIVE',
) =>
  ({
    id: `${kind}-${label}`,
    kind,
    label,
    status,
    codeSystem: null,
    code: null,
    since: null,
    notes: null,
    createdAt: '2026-10-30T12:00:00.000Z',
  }) satisfies Condition;

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

describe('07 §12 · lo que hay que tener a la vista al armar una dieta', () => {
  it('solo las alergias e intolerancias activas', () => {
    const { conditions } = dietaryAlertsOf(
      [
        condition('ALLERGY', 'Maní'),
        condition('INTOLERANCE', 'Lactosa'),
        condition('ALLERGY', 'Penicilina', 'RESOLVED'),
        condition('DISEASE', 'Hipotiroidismo'),
      ],
      null,
    );

    expect(conditions.map((c) => c.label)).toEqual(['Maní', 'Lactosa']);
  });

  it('lo que se respondió en la anamnesis V2, aunque no se haya registrado como condición', () => {
    expect(dietaryAlertsOf([], anamnesis(' No come mariscos. ')).anamnesisNote).toBe(
      'No come mariscos.',
    );
    expect(dietaryAlertsOf([], anamnesis()).anamnesisNote).toBeNull();
    expect(dietaryAlertsOf([], anamnesis('   ')).anamnesisNote).toBeNull();
  });

  it('los bloques de alergias e intolerancias de la historia v1', () => {
    expect(
      dietaryAlertsOf([], legacy({ allergies: 'Maní', intolerances: 'Lactosa' })).anamnesisNote,
    ).toBe('Maní · Lactosa');
    expect(dietaryAlertsOf([], legacy({ intolerances: 'Lactosa' })).anamnesisNote).toBe('Lactosa');
    expect(dietaryAlertsOf([], legacy({})).anamnesisNote).toBeNull();
  });

  it('sin historia ni condiciones, no hay nada que mostrar', () => {
    expect(dietaryAlertsOf([], null)).toEqual({ conditions: [], anamnesisNote: null });
  });
});

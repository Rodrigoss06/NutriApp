import { isErr, isOk } from '@nutricoach/shared-kernel';
import { describe, expect, it } from 'vitest';
import { checkAthleteProfile, type AthleteProfileInput } from './athlete-profile.js';

const INPUT: AthleteProfileInput = {
  objective: 'HYPERTROPHY',
  level: 'BEGINNER',
  daysPerWeek: 4,
  minutesPerSession: 60,
  equipmentCodes: ['FULL_GYM', 'FULL_GYM'],
  startDate: null,
  macrocycleWeeks: 12,
  medicalClearance: 'CLEARED',
  alarmSymptoms: false,
  injuriesNote: null,
  restrictionsNote: null,
  baselineWeightKg: null,
  baselineRestingHrBpm: null,
  baselineHrvMs: null,
  sleepTargetHours: 8,
  testTargets: { WALK_6MIN: 500 },
  notes: null,
};
const REFERENCES = {
  equipmentCodes: new Set(['FULL_GYM']),
  physicalTestCodes: new Set(['WALK_6MIN']),
};

describe('07 §2 · el perfil de entrenamiento', () => {
  it('pasa con todo en orden, sin repetir equipos', () => {
    const checked = checkAthleteProfile(INPUT, REFERENCES);

    expect(isOk(checked) && checked.value.equipmentCodes).toEqual(['FULL_GYM']);
  });

  it('nombra lo que no existe en los catálogos', () => {
    const checked = checkAthleteProfile(
      { ...INPUT, equipmentCodes: ['TRINEO'], testTargets: { VOLAR: 1 } },
      REFERENCES,
    );

    expect(isErr(checked) && checked.error.details).toEqual({
      problems: ['TRINEO no es un equipo.', 'VOLAR no es una prueba física.'],
    });
  });
});

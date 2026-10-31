import type { AthleteProfile } from '@nutricoach/contracts';
import { describe, expect, it } from 'vitest';
import { parseProfile, valuesOf, type ProfileValues } from './athlete-profile-values';

const FILLED: ProfileValues = {
  ...valuesOf(null),
  objective: 'HYPERTROPHY',
  level: 'BEGINNER',
  daysPerWeek: '4',
};

const problemsOf = (values: ProfileValues) => {
  const parsed = parseProfile(values, 0);
  return parsed.ok ? {} : parsed.problems;
};

describe('07 §2 · el formulario del perfil de entrenamiento', () => {
  it('sin perfil, el alta queda pendiente y el resto por elegir: no se inventa un objetivo', () => {
    expect(valuesOf(null)).toMatchObject({
      objective: '',
      level: '',
      daysPerWeek: '',
      medicalClearance: 'PENDING',
      macrocycleWeeks: '12',
      sleepTargetHours: '8',
    });
    expect(Object.keys(problemsOf(valuesOf(null)))).toEqual(['objective', 'level', 'daysPerWeek']);
  });

  it('acepta coma decimal, deja en null lo vacío y omite los objetivos sin valor', () => {
    const parsed = parseProfile(
      {
        ...FILLED,
        baselineWeightKg: '70,5',
        testTargets: { WALK_6MIN: '500,5', PUSH_UPS: '' },
      },
      3,
    );

    expect(parsed.ok && parsed.body).toMatchObject({
      expectedRevision: 3,
      baselineWeightKg: 70.5,
      minutesPerSession: null,
      startDate: null,
      testTargets: { WALK_6MIN: 500.5 },
    });
  });

  it('dice qué corregir en lo que no pasa el contrato', () => {
    expect(
      problemsOf({
        ...FILLED,
        minutesPerSession: '10',
        baselineRestingHrBpm: '60,5',
        baselineWeightKg: 'mucho',
        sleepTargetHours: '',
        testTargets: { WALK_6MIN: 'lejos' },
      }),
    ).toMatchObject({
      minutesPerSession: expect.stringContaining('30 a 120') as string,
      baselineRestingHrBpm: expect.stringContaining('sin decimales') as string,
      baselineWeightKg: expect.stringContaining('20 a 300') as string,
      sleepTargetHours: expect.stringContaining('4 a 12') as string,
      testTargets: expect.stringContaining('números') as string,
    });
  });

  it('RN-D09: rechaza los decimales que no se guardarían, en vez de redondearlos', () => {
    expect(
      problemsOf({
        ...FILLED,
        baselineWeightKg: '70,123',
        baselineHrvMs: '45,55',
        sleepTargetHours: '7,75',
      }),
    ).toMatchObject({
      baselineWeightKg: expect.stringContaining('2 decimales') as string,
      baselineHrvMs: expect.stringContaining('1 decimal') as string,
      sleepTargetHours: expect.stringContaining('1 decimal') as string,
    });
    expect(
      problemsOf({
        ...FILLED,
        baselineWeightKg: '70,12',
        baselineHrvMs: '45,5',
        sleepTargetHours: '7,5',
      }),
    ).toEqual({});
  });

  it('lo guardado vuelve al formulario y sale igual', () => {
    const current: AthleteProfile = {
      revision: 2,
      objective: 'STRENGTH',
      level: 'ADVANCED',
      daysPerWeek: 5,
      minutesPerSession: 60,
      equipmentCodes: ['FULL_GYM'],
      startDate: '2026-11-02',
      macrocycleWeeks: 8,
      medicalClearance: 'CLEARED',
      alarmSymptoms: true,
      injuriesNote: 'Molestia antigua',
      restrictionsNote: null,
      baselineWeightKg: 80.5,
      baselineRestingHrBpm: 60,
      baselineHrvMs: 45.5,
      sleepTargetHours: 7.5,
      testTargets: { GRIP_R: 40 },
      notes: null,
      recordedBy: '01920000-0000-7000-8000-000000000001',
      recordedAt: '2026-10-20T14:00:00.000Z',
    };

    const parsed = parseProfile(valuesOf(current), current.revision);

    const { revision, recordedBy, recordedAt, ...fields } = current;
    expect(revision).toBe(2);
    expect(recordedBy && recordedAt).toBeTruthy();
    expect(parsed.ok && parsed.body).toEqual({ ...fields, expectedRevision: 2 });
  });
});

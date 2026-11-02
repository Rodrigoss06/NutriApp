import { describe, expect, it } from 'vitest';
import { saveAthleteProfileSchema } from './athlete-profile.js';

const PROFILE = {
  objective: 'HYPERTROPHY',
  level: 'BEGINNER',
  daysPerWeek: 3,
  equipmentCodes: ['FULL_GYM'],
  medicalClearance: 'CLEARED',
  expectedRevision: 0,
};

describe('RN-G17 · ADR-080 · la anticoncepción hormonal del perfil', () => {
  it('es opcional: sin dato vale null', () => {
    expect(saveAthleteProfileSchema.parse(PROFILE).hormonalContraception).toBeNull();
  });

  it('es un sí o un no', () => {
    const accepts = (value: unknown) =>
      saveAthleteProfileSchema.safeParse({ ...PROFILE, hormonalContraception: value }).success;
    expect(accepts(true)).toBe(true);
    expect(accepts(false)).toBe(true);
    expect(accepts('ORAL')).toBe(false);
  });
});

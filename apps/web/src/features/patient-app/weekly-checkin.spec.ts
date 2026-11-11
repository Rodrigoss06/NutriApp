import type { MeWeeklyCheckin } from '@nutricoach/contracts';
import { describe, expect, it } from 'vitest';
import { closesText, weeklyCheckinBody, weeklyCheckinProblems } from './weekly-checkin';

const OPEN: MeWeeklyCheckin = {
  weekDate: '2026-11-15',
  closesOn: '2026-11-17',
  asksWeight: true,
  done: null,
};

describe('RN-G11 · P-21 · el check-in de la semana en la app', () => {
  it('la alimentación es obligatoria, de 0 a 100 sin decimales; el peso, opcional, de 20 a 300 kg', () => {
    const values = { nutritionCompliancePct: 82, bodyWeightKg: null, comment: '' };
    expect(weeklyCheckinProblems(values)).toEqual({});
    expect(weeklyCheckinProblems({ ...values, nutritionCompliancePct: null })).toHaveProperty(
      'nutritionCompliancePct',
    );
    expect(weeklyCheckinProblems({ ...values, nutritionCompliancePct: 82.5 })).toHaveProperty(
      'nutritionCompliancePct',
    );
    expect(weeklyCheckinProblems({ ...values, bodyWeightKg: 15 })).toHaveProperty('bodyWeightKg');
  });

  it('el cuerpo del POST: su domingo, sin peso si la app no lo pide y sin comentario vacío', () => {
    const values = { nutritionCompliancePct: 82, bodyWeightKg: 79.5, comment: '  ' };
    expect(weeklyCheckinBody(OPEN, values, 'c-1')).toEqual({
      clientId: 'c-1',
      weekDate: '2026-11-15',
      nutritionCompliancePct: 82,
      bodyWeightKg: 79.5,
      comment: null,
    });
    expect(
      weeklyCheckinBody({ ...OPEN, asksWeight: false }, { ...values, comment: ' Bien ' }, 'c-2'),
    ).toMatchObject({ bodyWeightKg: null, comment: 'Bien' });
  });

  it('dice hasta qué martes se completa', () => {
    expect(closesText(OPEN)).toBe('Se completa hasta el martes 17 de noviembre de 2026.');
  });
});

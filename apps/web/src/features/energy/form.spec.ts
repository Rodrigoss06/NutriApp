import { describe, expect, it } from 'vitest';
import { prescriptionBody, type ActivityDraft, type PrescriptionDraft } from './form';

const running: ActivityDraft = {
  activityCode: '12050',
  descriptionEs: 'Correr',
  met: 9.3,
  minutes: '30',
  sessions: '3',
};

/** El caso Luis de G-13 a G-17: Mifflin, PAL 1.4, correr 30 min 3 veces, −3 kg de grasa al mes, 15 %, 2 g/kg y 25 %. */
const luis: PrescriptionDraft = {
  evaluationId: '00000000-0000-4000-8000-000000000001',
  rmrMethodCode: 'RMR_MIFFLIN1990',
  strategy: 'ADDITIVE',
  pal: '1,4',
  activities: [running],
  goal: 'LOSE_FAT',
  adjustment: 'LOSE_KG',
  amount: '3',
  targetFatPct: '15',
  proteinGPerKg: '2',
  fatPctKcal: '25',
};

describe('RF-17 · RN-E02 a RN-E07 · el formulario arma la prescripción', () => {
  it('G-16 · «Perder grasa: kg por mes» con 3 es −3 kg de grasa al mes', () => {
    expect(prescriptionBody(luis)).toEqual({
      evaluationId: luis.evaluationId,
      rmrMethodCode: 'RMR_MIFFLIN1990',
      strategy: 'ADDITIVE',
      pal: 1.4,
      activities: [{ activityCode: '12050', minutesPerSession: 30, sessionsPerWeek: 3 }],
      goal: 'LOSE_FAT',
      adjustment: { kind: 'FAT_KG_PER_MONTH', fatKgPerMonth: -3 },
      targetFatPct: 15,
      proteinGPerKg: 2,
      fatPctKcal: 25,
    });
  });

  it('RN-E04 · déficit y superávit en kcal por día; «Sin ajuste» es 0', () => {
    expect(
      prescriptionBody({ ...luis, adjustment: 'DEFICIT_KCAL', amount: '500' })?.adjustment,
    ).toEqual({
      kind: 'KCAL_PER_DAY',
      kcalPerDay: -500,
    });
    expect(
      prescriptionBody({ ...luis, adjustment: 'SURPLUS_KCAL', amount: '300' })?.adjustment,
    ).toEqual({
      kind: 'KCAL_PER_DAY',
      kcalPerDay: 300,
    });
    expect(prescriptionBody({ ...luis, adjustment: 'NONE', amount: '' })?.adjustment).toEqual({
      kind: 'KCAL_PER_DAY',
      kcalPerDay: 0,
    });
  });

  it('RN-E02 · con la estrategia factorial no se suman actividades: el PAL ya las incluye', () => {
    expect(prescriptionBody({ ...luis, strategy: 'FACTORIAL' })?.activities).toEqual([]);
  });

  it('el peso objetivo es opcional', () => {
    expect(prescriptionBody({ ...luis, targetFatPct: '' })?.targetFatPct).toBeNull();
  });

  it.each([
    ['PAL fuera de 1.40 a 2.40', { pal: '2.5' }],
    ['sin PAL', { pal: '' }],
    ['sin proteína', { proteinGPerKg: '' }],
    ['grasa de 100 %', { fatPctKcal: '100' }],
    ['una actividad sin minutos', { activities: [{ ...running, minutes: '' }] }],
    ['una cantidad negativa', { amount: '-3' }],
    ['% de grasa deseado de 100', { targetFatPct: '100' }],
  ] satisfies [string, Partial<PrescriptionDraft>][])(
    '%s: todavía no hay vista previa',
    (_, change) => {
      expect(prescriptionBody({ ...luis, ...change })).toBeNull();
    },
  );
});

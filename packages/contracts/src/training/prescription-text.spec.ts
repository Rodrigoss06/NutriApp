import { describe, expect, it } from 'vitest';
import { LIGHT_EFFORT_TEXT, prescriptionParts, prescriptionText } from './prescription-text.js';

const SET = {
  repsMin: 8,
  repsMax: 12,
  loadKind: 'RIR' as const,
  loadValue: 2,
  restSeconds: 90,
  durationSeconds: null,
  distanceM: null,
  met: null,
};

describe('P-34 · el texto de una serie prescrita (ADR-114)', () => {
  it('sin datos del ejercicio, como siempre: «8 a 12 rep · RIR 2 · 90 s»', () => {
    expect(prescriptionText(SET)).toBe('8 a 12 rep · RIR 2 · 90 s');
  });

  it('«10–12/lado»: las repeticiones de un unilateral son por lado', () => {
    expect(prescriptionText({ ...SET, repsMin: 10, repsMax: 12 }, { isUnilateral: true })).toBe(
      '10 a 12 rep/lado · RIR 2 · 90 s',
    );
    expect(prescriptionParts({ ...SET, repsMin: 8, repsMax: 8 }, { isUnilateral: true }).reps).toBe(
      '8 rep/lado',
    );
  });

  it('«20–30 s/lado»: una isometría se prescribe en segundos, por lado si es unilateral', () => {
    const isometric = {
      ...SET,
      repsMin: null,
      repsMax: null,
      durationSeconds: 30,
      restSeconds: 45,
    };
    expect(
      prescriptionText(isometric, {
        isUnilateral: true,
        baseMeasure: 'SECONDS',
        modality: 'STRENGTH',
      }),
    ).toBe('30 s/lado · RIR 2 · 45 s');
    expect(prescriptionParts(isometric, { baseMeasure: 'SECONDS' }).duration).toBe('30 s');
  });

  it('el cardio en minutos, y con RIR 5 es un esfuerzo suave', () => {
    const cardio = {
      ...SET,
      repsMin: null,
      repsMax: null,
      durationSeconds: 1_800,
      loadValue: 5,
      restSeconds: 0,
    };
    expect(prescriptionText(cardio, { modality: 'CARDIO', baseMeasure: 'MINUTES' })).toBe(
      `30 min · ${LIGHT_EFFORT_TEXT} · 0 s`,
    );
  });

  it('P-34.6 · la movilidad con RIR 4 dice «esfuerzo suave (RPE 5–6)»; con RIR 3, o en fuerza, el RIR', () => {
    const mobility = { modality: 'MOBILITY' as const };
    expect(prescriptionParts({ ...SET, loadValue: 4 }, mobility).load).toBe(
      'esfuerzo suave (RPE 5–6)',
    );
    expect(prescriptionParts({ ...SET, loadValue: 3 }, mobility).load).toBe('RIR 3');
    expect(prescriptionParts({ ...SET, loadValue: 4 }, { modality: 'STRENGTH' }).load).toBe(
      'RIR 4',
    );
    expect(prescriptionParts({ ...SET, loadKind: 'RPE', loadValue: 5 }, mobility).load).toBe(
      'RPE 5',
    );
  });

  it('las cargas, la distancia y el MET, con el número de cada pantalla', () => {
    const kg = prescriptionParts({ ...SET, loadKind: 'KG', loadValue: 62.5 }, {}, (n) =>
      String(n).replace('.', ','),
    );
    expect(kg.load).toBe('62,5 kg');
    expect(prescriptionParts({ ...SET, loadKind: 'BODYWEIGHT', loadValue: null }).load).toBe(
      'Peso corporal',
    );
    expect(prescriptionParts({ ...SET, loadKind: 'PCT_1RM', loadValue: 80 }).load).toBe(
      '80 % de 1RM',
    );
    expect(
      prescriptionText({
        ...SET,
        repsMin: null,
        repsMax: null,
        distanceM: 400,
        met: 6,
        loadKind: null,
      }),
    ).toBe('400 m · MET 6 · 90 s');
  });
});

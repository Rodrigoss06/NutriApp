import { describe, expect, it } from 'vitest';
import {
  correctFoodLogSchema,
  INDICATION_TEXTS,
  logCheckinSchema,
  logFoodSchema,
  logHydrationSchema,
  logMetricSchema,
  logNoteSchema,
  logWorkoutSchema,
  READINESS_INDICATIONS,
  READINESS_NOTE,
} from './records.js';

const CLIENT = '0193a000-0000-7000-8000-000000000001';
const MEAL = '0193a000-0000-7000-8000-000000000002';
const FOOD = '0193a000-0000-7000-8000-000000000003';

describe('RN-G05 · RN-G06 · RN-G08 · registrar una comida', () => {
  it('desde el plan, sin porciones: la del plan por defecto', () => {
    const parsed = logFoodSchema.parse({
      clientId: CLIENT,
      localDate: '2026-11-01',
      source: { kind: 'EXCHANGE', mealId: MEAL, groupCode: 'STA', foodId: FOOD },
    });
    expect(parsed.source).toMatchObject({ kind: 'EXCHANGE', servings: null });
  });

  it('pide el clientId del celular y una fecha', () => {
    expect(
      logFoodSchema.safeParse({
        localDate: '2026-11-01',
        source: { kind: 'MENU', mealId: MEAL, option: 'A' },
      }).success,
    ).toBe(false);
    expect(
      logFoodSchema.safeParse({
        clientId: CLIENT,
        localDate: '1/11/2026',
        source: { kind: 'MENU', mealId: MEAL, option: 'A' },
      }).success,
    ).toBe(false);
  });

  it('fuera del plan, del catálogo, con su tiempo y sus gramos; más decimales de los que se guardan se rechazan (RN-D09)', () => {
    const catalog = { kind: 'CATALOG', mealSlotCode: 'AFTERNOON', foodId: FOOD, grams: 120 };
    expect(
      logFoodSchema.safeParse({ clientId: CLIENT, localDate: '2026-11-01', source: catalog })
        .success,
    ).toBe(true);
    expect(
      logFoodSchema.safeParse({
        clientId: CLIENT,
        localDate: '2026-11-01',
        source: { ...catalog, grams: 120.555 },
      }).success,
    ).toBe(false);
    expect(
      logFoodSchema.safeParse({
        clientId: CLIENT,
        localDate: '2026-11-01',
        source: { ...catalog, mealSlotCode: 'SNACK' },
      }).success,
    ).toBe(false);
  });

  it('RN-G12: corregir lleva un clientId nuevo y lo que reemplaza, sin fecha (es la del registro)', () => {
    expect(
      correctFoodLogSchema.safeParse({
        clientId: CLIENT,
        source: { kind: 'FOOD', mealId: MEAL, foodId: FOOD, grams: 30 },
      }).success,
    ).toBe(true);
  });
});

describe('agua, notas y peso', () => {
  it('el agua va de 1 a 5 000 ml, en enteros', () => {
    const water = (volumeMl: number) =>
      logHydrationSchema.safeParse({ clientId: CLIENT, localDate: '2026-11-01', volumeMl }).success;
    expect(water(250)).toBe(true);
    expect(water(0)).toBe(false);
    expect(water(5001)).toBe(false);
    expect(water(250.5)).toBe(false);
  });

  it('una nota tiene texto, hasta 2 000 caracteres', () => {
    const note = (body: string) =>
      logNoteSchema.safeParse({ clientId: CLIENT, localDate: '2026-11-01', body }).success;
    expect(note('Me costó la cena.')).toBe(true);
    expect(note('   ')).toBe(false);
    expect(note('a'.repeat(2001))).toBe(false);
  });

  it('RN-C04: el peso va de 20 a 300 kg', () => {
    const weight = (value: number) =>
      logMetricSchema.safeParse({
        clientId: CLIENT,
        localDate: '2026-11-01',
        metricCode: 'BODY_WEIGHT',
        value,
      }).success;
    expect(weight(72.4)).toBe(true);
    expect(weight(19.9)).toBe(false);
    expect(weight(301)).toBe(false);
  });
});

describe('RN-G11 · 07 §9 · el registro diario', () => {
  const DAY = { clientId: CLIENT, localDate: '2026-11-02' };
  const accepts = (changes: object) => logCheckinSchema.safeParse({ ...DAY, ...changes }).success;

  it('solo pide el día: lo demás, sin dato, vale null y no cero (07: un dato que falta no es cero)', () => {
    expect(logCheckinSchema.parse(DAY)).toMatchObject({
      sessionMinutes: null,
      sleepHours: null,
      fatigue: null,
      menstrualSymptoms: null,
      restingHrBpm: null,
      hrvMs: null,
    });
  });

  it('el sueño va en medias horas, de 0 a 24', () => {
    expect(accepts({ sleepHours: 7.5 })).toBe(true);
    expect(accepts({ sleepHours: 7.3 })).toBe(false);
    expect(accepts({ sleepHours: 24.5 })).toBe(false);
  });

  it('fatiga, dolor, estrés y motivación, de 1 a 5, enteros', () => {
    for (const field of ['fatigue', 'soreness', 'stress', 'motivation']) {
      expect(accepts({ [field]: 1 })).toBe(true);
      expect(accepts({ [field]: 5 })).toBe(true);
      expect(accepts({ [field]: 0 })).toBe(false);
      expect(accepts({ [field]: 6 })).toBe(false);
      expect(accepts({ [field]: 2.5 })).toBe(false);
    }
  });

  it('RN-G17: los síntomas del ciclo, de 0 a 3', () => {
    expect(accepts({ menstrualSymptoms: 0 })).toBe(true);
    expect(accepts({ menstrualSymptoms: 3 })).toBe(true);
    expect(accepts({ menstrualSymptoms: 4 })).toBe(false);
  });

  it('P-12: el RPE de la sesión, de 0 a 10 con un decimal; RN-D09: más decimales se rechazan', () => {
    expect(accepts({ sessionRpe: 7.5 })).toBe(true);
    expect(accepts({ sessionRpe: 7.55 })).toBe(false);
    expect(accepts({ sessionRpe: 10.5 })).toBe(false);
  });

  it('los datos del reloj, a mano, con los rangos de la tabla', () => {
    expect(accepts({ restingHrBpm: 55, hrvMs: 60.5, steps: 8_000, activeKcal: 320.5 })).toBe(true);
    expect(accepts({ restingHrBpm: 24 })).toBe(false);
    expect(accepts({ hrvMs: 0 })).toBe(false);
    expect(accepts({ steps: 200_001 })).toBe(false);
  });

  it('un campo que no es del registro se rechaza', () => {
    expect(accepts({ patientId: FOOD })).toBe(false);
  });
});

describe('RF-29 · RN-F03 · el entreno', () => {
  const WORKOUT = { clientId: CLIENT, localDate: '2026-11-02', outcome: 'COMPLETED', sets: [] };
  const SET = { exerciseId: FOOD, setNo: 1 };
  const accepts = (changes: object) =>
    logWorkoutSchema.safeParse({ ...WORKOUT, ...changes }).success;

  it('una serie solo pide su ejercicio y su número: sin calentamiento y sin datos por defecto', () => {
    const parsed = logWorkoutSchema.parse({ ...WORKOUT, sets: [SET] });
    expect(parsed).toMatchObject({ sessionId: null, durationMinutes: null, notes: null });
    expect(parsed.sets[0]).toMatchObject({ isWarmup: false, reps: null, loadKg: null, rir: null });
  });

  it('el peso con dos decimales y el estímulo y la fatiga de 1 a 5', () => {
    expect(accepts({ sets: [{ ...SET, loadKg: 62.25, stimulus: 5, fatigue: 1 }] })).toBe(true);
    expect(accepts({ sets: [{ ...SET, loadKg: 62.255 }] })).toBe(false);
    expect(accepts({ sets: [{ ...SET, stimulus: 6 }] })).toBe(false);
  });

  it('una sesión omitida no lleva series: su tonelaje no contaría como hecho', () => {
    expect(accepts({ outcome: 'SKIPPED' })).toBe(true);
    expect(accepts({ outcome: 'SKIPPED', sets: [SET] })).toBe(false);
    expect(accepts({ outcome: 'PARTIAL', sets: [SET] })).toBe(true);
  });

  it('un resultado desconocido o un campo de más se rechazan', () => {
    expect(accepts({ outcome: 'DONE' })).toBe(false);
    expect(accepts({ tonnageKg: 900 })).toBe(false);
  });
});

describe('RN-G15 · 07 §9 · lo que ve el paciente en Hoy', () => {
  it('cada indicación tiene el texto de 07 §9', () => {
    expect(Object.keys(INDICATION_TEXTS).sort()).toEqual([...READINESS_INDICATIONS].sort());
    expect(INDICATION_TEXTS.GREEN.text).toBe(
      'Entrena según lo planificado. Cumple la sesión planificada.',
    );
    expect(INDICATION_TEXTS.YELLOW.text).toBe(
      'Reduce entre 5 % y 15 % la carga o el volumen, y cuida la recuperación.',
    );
    expect(INDICATION_TEXTS.RED.text).toBe(
      'Prioriza la recuperación, evita forzar y avisa a tu coach si hay dolor o malestar.',
    );
    expect(INDICATION_TEXTS.NO_DATA.text).toBe(
      'Completa tu registro diario para recibir una indicación.',
    );
  });

  it('RN-G17: la nota visible dice que el ciclo solo se registra si lo autoriza', () => {
    expect(READINESS_NOTE).toContain('El ciclo menstrual solo se registra si tú lo autorizas.');
  });
});

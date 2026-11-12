import { describe, expect, it } from 'vitest';
import { trainingAnalyticsSchema, trainingWeekSchema } from './training.js';

const METHOD = { code: 'COMPLIANCE', version: '1.0.0' };
const WEEK = {
  weekNo: 1,
  weekStart: '2026-11-04',
  weekEnd: '2026-11-10',
  mesocycleId: 'm-1',
  isDeload: false,
  phase: 'Adaptación',
  volumeFactor: 0.75,
  targetRir: 3,
  started: true,
  sessionsPlanned: 3,
  sessionsDone: 2,
  sessionsCompliancePct: 66.7,
  tonnageKg: 3630,
  adjustedVolumeKg: 3993,
  unfactoredSets: 0,
  srpeLoad: 840,
  cardioMinutesPlanned: 0,
  cardioMinutesDone: 0,
  cardioCompliancePct: 0,
  muscles: [
    {
      muscleCode: 'CHEST',
      setsPlanned: 16,
      setsDone: 12,
      compliancePct: 75,
      tonnageKg: 1330,
      adjustedVolumeKg: 1463,
      unfactoredSets: 0,
      avgRpe: 8,
      avgStimulus: 4,
      avgFatigue: 3,
      sfr: 1.33,
    },
  ],
  fatigue: null,
  muscleFatigue: null,
};

// La semana 3 de Mateo en la hoja piloto: +18 % sobre su promedio y estrés 3, ámbar.
const PANEL = {
  thresholdId: '019a2000-0000-7000-8000-000000000003',
  inputsHash: 'a'.repeat(64),
  avgStress: 3,
  avgSleepHours: 7.1,
  avgFatigue: 3,
  adjustedVolumeKg: 6336,
  baseVolumeKg: 5355,
  loadChangePct: 18.32,
  load: 'AMBER',
  recovery: 'AMBER',
  perceivedFatigue: 'AMBER',
  overall: 'AMBER',
};

// La semana 5 de una hoja como la de Mateo: el pecho y el tríceps con base, y sin entrenar esa semana.
const MUSCLE_FATIGUE = {
  thresholdId: '019a2000-0000-7000-8000-000000000003',
  inputsHash: 'b'.repeat(64),
  baseWeeks: 3,
  muscles: [
    {
      muscleCode: 'CHEST',
      trainingFatigueKg: null,
      baseVolumeKg: 1419,
      changePct: null,
      state: 'NO_DATA',
      recoveryHours: null,
      coefficients: null,
    },
    {
      muscleCode: 'QUADRICEPS',
      trainingFatigueKg: 2600,
      baseVolumeKg: 2000,
      changePct: 30,
      state: 'AMBER',
      recoveryHours: 60,
      // Solo la sentadilla libre: los coeficientes de «pierna y cadera».
      coefficients: {
        muscularFatigue: 1.2,
        neuralFatigue: 1.3,
        axialLoad: 1.3,
        technicalDemand: 1.2,
      },
    },
  ],
};

describe('RF-33 · contrato de la analítica de rutina', () => {
  it('G-25 · una semana con 12 de 16 series de pecho: 75 %', () => {
    expect(trainingWeekSchema.parse(WEEK).muscles[0]?.compliancePct).toBe(75);
  });

  it('P-26 · el volumen ajustado va con lo que quedó «sin factor»; una serie sin factor no se cuenta como 1', () => {
    expect(trainingWeekSchema.parse({ ...WEEK, unfactoredSets: 2 }).unfactoredSets).toBe(2);
    expect(trainingWeekSchema.safeParse({ ...WEEK, unfactoredSets: -1 }).success).toBe(false);
  });

  it('P-23 · P-24 · el panel de fatiga de la semana; la carga puede quedar «sin base», el estado general no', () => {
    expect(trainingWeekSchema.parse({ ...WEEK, fatigue: PANEL }).fatigue?.overall).toBe('AMBER');
    const firstWeek = { ...PANEL, baseVolumeKg: null, loadChangePct: null, load: 'NO_BASE' };
    expect(trainingWeekSchema.parse({ ...WEEK, fatigue: firstWeek }).fatigue?.load).toBe('NO_BASE');
    expect(
      trainingWeekSchema.safeParse({ ...WEEK, fatigue: { ...PANEL, overall: 'NO_BASE' } }).success,
    ).toBe(false);
  });

  it('P-27 · la fatiga por grupo muscular: el estado admite «sin base» y «faltan datos», y la recuperación en horas', () => {
    const parsed = trainingWeekSchema.parse({ ...WEEK, muscleFatigue: MUSCLE_FATIGUE });
    expect(parsed.muscleFatigue?.muscles.map((muscle) => muscle.state)).toEqual([
      'NO_DATA',
      'AMBER',
    ]);
    expect(
      trainingWeekSchema.safeParse({
        ...WEEK,
        muscleFatigue: { ...MUSCLE_FATIGUE, baseWeeks: -1 },
      }).success,
    ).toBe(false);
  });

  it('P-27.1 · cada grupo entrenado trae sus cuatro coeficientes, que no son negativos; sin entrenar, null', () => {
    const parsed = trainingWeekSchema.parse({ ...WEEK, muscleFatigue: MUSCLE_FATIGUE });
    expect(
      parsed.muscleFatigue?.muscles.map((muscle) => muscle.coefficients?.axialLoad ?? null),
    ).toEqual([null, 1.3]);
    const [, quadriceps] = MUSCLE_FATIGUE.muscles;
    const negative = {
      ...MUSCLE_FATIGUE,
      muscles: [{ ...quadriceps, coefficients: { ...quadriceps?.coefficients, axialLoad: -1 } }],
    };
    expect(trainingWeekSchema.safeParse({ ...WEEK, muscleFatigue: negative }).success).toBe(false);
  });

  it('una semana que no empieza deja lo hecho en null', () => {
    const future = {
      ...WEEK,
      started: false,
      sessionsDone: null,
      sessionsCompliancePct: null,
      tonnageKg: null,
      adjustedVolumeKg: null,
      unfactoredSets: null,
      srpeLoad: null,
      cardioMinutesDone: null,
      cardioCompliancePct: null,
      muscles: [],
    };
    expect(trainingWeekSchema.parse(future).sessionsDone).toBeNull();
  });

  it('sin programa vigente, sin semanas; cada número con su método (RN-D02)', () => {
    const empty = {
      program: null,
      methods: {
        tonnage: METHOD,
        adjustedVolume: METHOD,
        fatiguePanel: METHOD,
        muscleFatigue: METHOD,
        fractionalSets: METHOD,
        compliance: METHOD,
        sfr: METHOD,
        rpe: METHOD,
        srpe: METHOD,
      },
      mesocycles: [],
      weeks: [],
      oneRm: [],
    };
    expect(trainingAnalyticsSchema.parse(empty).program).toBeNull();
    expect(trainingAnalyticsSchema.safeParse({ ...empty, methods: {} }).success).toBe(false);
  });
});

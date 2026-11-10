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
};

describe('RF-33 · contrato de la analítica de rutina', () => {
  it('G-25 · una semana con 12 de 16 series de pecho: 75 %', () => {
    expect(trainingWeekSchema.parse(WEEK).muscles[0]?.compliancePct).toBe(75);
  });

  it('P-26 · el volumen ajustado va con lo que quedó «sin factor»; una serie sin factor no se cuenta como 1', () => {
    expect(trainingWeekSchema.parse({ ...WEEK, unfactoredSets: 2 }).unfactoredSets).toBe(2);
    expect(trainingWeekSchema.safeParse({ ...WEEK, unfactoredSets: -1 }).success).toBe(false);
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

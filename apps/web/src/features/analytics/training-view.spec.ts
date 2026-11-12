import type { TrainingAnalytics, TrainingWeek } from '@nutricoach/contracts';
import { describe, expect, it } from 'vitest';
import {
  adjustedText,
  fatigueWeeks,
  loadChangeText,
  mesocycleGroups,
  muscleFatigueInOrder,
  musclesInOrder,
  muscleWeekNo,
  oneRmKey,
  recoveryText,
} from './training-view';

const week = (weekNo: number, mesocycleId: string, started: boolean): TrainingWeek => ({
  weekNo,
  weekStart: '2026-10-26',
  weekEnd: '2026-11-01',
  mesocycleId,
  isDeload: false,
  phase: null,
  volumeFactor: null,
  targetRir: null,
  started,
  sessionsPlanned: 3,
  sessionsDone: started ? 1 : null,
  sessionsCompliancePct: null,
  tonnageKg: null,
  adjustedVolumeKg: null,
  unfactoredSets: null,
  srpeLoad: null,
  cardioMinutesPlanned: 0,
  cardioMinutesDone: null,
  cardioCompliancePct: null,
  muscles: [],
  fatigue: null,
  muscleFatigue: null,
});

const method = { code: 'TONNAGE', version: '1.0.0' };

describe('RF-33 · la analítica de rutina en pantalla', () => {
  const weeks = [week(1, 'b', true), week(2, 'b', true), week(3, 'a', false)];
  const analytics: TrainingAnalytics = {
    program: null,
    methods: {
      tonnage: method,
      adjustedVolume: method,
      fatiguePanel: method,
      muscleFatigue: method,
      fractionalSets: method,
      compliance: method,
      sfr: method,
      rpe: method,
      srpe: method,
    },
    mesocycles: [
      { id: 'a', position: 2, name: 'Intensificación', focus: null },
      { id: 'b', position: 1, name: 'Base', focus: 'Técnica' },
      { id: 'c', position: 3, name: 'Vacío', focus: null },
    ],
    weeks,
    oneRm: [],
  };

  it('agrupado por mesociclo, en el orden del programa', () => {
    expect(
      mesocycleGroups(analytics).map((group) => [group.name, group.weeks.map((w) => w.weekNo)]),
    ).toEqual([
      ['Base', [1, 2]],
      ['Intensificación', [3]],
    ]);
  });

  it('las series por grupo: la pedida; si no, la última con series hechas; si no, la última que empezó; si ninguna, la primera', () => {
    expect(muscleWeekNo(weeks, '3')).toBe(3);
    expect(muscleWeekNo(weeks, undefined)).toBe(2);
    const done = {
      muscleCode: 'QUADS',
      setsPlanned: 3,
      setsDone: 3,
      compliancePct: 100,
      tonnageKg: 1440,
      adjustedVolumeKg: null,
      unfactoredSets: null,
      avgRpe: 8,
      avgStimulus: null,
      avgFatigue: null,
      sfr: null,
    };
    // La semana que corre todavía no tiene series: se abre la anterior, que sí.
    expect(
      muscleWeekNo([{ ...week(1, 'b', true), muscles: [done] }, week(2, 'b', true)], undefined),
    ).toBe(1);
    expect(muscleWeekNo([week(1, 'a', false)], undefined)).toBe(1);
    expect(muscleWeekNo([], undefined)).toBeNull();
  });

  it('los grupos con su nombre, primero los que tienen más series programadas (RN-F06)', () => {
    const muscle = (muscleCode: string, setsPlanned: number | null, setsDone: number) => ({
      muscleCode,
      setsPlanned,
      setsDone,
      compliancePct: 0,
      tonnageKg: null,
      adjustedVolumeKg: null,
      unfactoredSets: null,
      avgRpe: null,
      avgStimulus: null,
      avgFatigue: null,
      sfr: null,
    });
    const names = new Map([
      ['QUADS', 'Cuádriceps'],
      ['GLUTES', 'Glúteo'],
    ]);
    expect(
      musclesInOrder(
        [muscle('GLUTES', 1, 1), muscle('CALVES', null, 0.5), muscle('QUADS', 2, 2)],
        names,
      ).map((m) => m.name),
    ).toEqual(['Cuádriceps', 'Glúteo', 'CALVES']);
  });

  it('RN-D03: un ejercicio con dos fórmulas son dos series', () => {
    const series = {
      exerciseId: 'e1',
      exerciseName: 'Sentadilla goblet',
      method: null,
      points: [],
    };
    expect(oneRmKey({ ...series, formula: 'EPLEY' })).not.toBe(
      oneRmKey({ ...series, formula: 'BRZYCKI' }),
    );
  });
});

describe('P-26 · el volumen ajustado en pantalla (ADR-106)', () => {
  it('con lo que quedó sin factor dicho aparte; sin entrenos, una raya', () => {
    expect(adjustedText(1_782, 0)).toBe('1,782 kg');
    expect(adjustedText(594, 2)).toBe('594 kg · 2 sin factor');
    expect(adjustedText(null, null)).toBe('—');
  });

  it('P-23 · P-24 · el panel de fatiga: solo las semanas con panel, y el cambio de la carga con su signo', () => {
    const panel = {
      thresholdId: 't',
      inputsHash: 'h',
      avgStress: 3,
      avgSleepHours: 7.1,
      avgFatigue: 3,
      adjustedVolumeKg: 6336,
      baseVolumeKg: 5355,
      loadChangePct: 18.319,
      load: 'AMBER',
      recovery: 'AMBER',
      perceivedFatigue: 'AMBER',
      overall: 'AMBER',
    } as const;
    expect(
      fatigueWeeks([{ ...week(1, 'b', true), fatigue: panel }, week(2, 'b', false)]).map(
        (w) => w.weekNo,
      ),
    ).toEqual([1]);
    expect(loadChangeText(panel)).toBe('+18.3 %');
    expect(loadChangeText({ loadChangePct: -40.6 })).toBe('−40.6 %');
    expect(loadChangeText({ loadChangePct: null })).toBeNull();
  });
});

describe('P-27 · la fatiga por grupo muscular en pantalla (ADR-115)', () => {
  const row = (
    muscleCode: string,
    trainingFatigueKg: number | null,
    baseVolumeKg: number | null,
  ) => ({
    muscleCode,
    trainingFatigueKg,
    baseVolumeKg,
    changePct: null,
    state: 'NO_DATA' as const,
    recoveryHours: null,
    coefficients: null,
  });

  it('primero los grupos con más fatiga; después los que solo están en la base, por su base', () => {
    const names = new Map([
      ['CHEST', 'Pecho'],
      ['TRICEPS', 'Tríceps'],
      ['LATS', 'Dorsal'],
    ]);
    expect(
      muscleFatigueInOrder(
        [
          row('TRICEPS', null, 709.5),
          row('CALVES', 300, null),
          row('CHEST', null, 1419),
          row('LATS', 1620, 1590),
        ],
        names,
      ).map((m) => m.name),
    ).toEqual(['Dorsal', 'CALVES', 'Pecho', 'Tríceps']);
  });

  it('la recuperación estimada en horas; sin color, una raya', () => {
    expect(recoveryText(60)).toBe('60 h');
    expect(recoveryText(null)).toBe('—');
  });
});

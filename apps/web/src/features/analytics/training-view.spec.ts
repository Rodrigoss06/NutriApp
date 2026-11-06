import type { TrainingAnalytics, TrainingWeek } from '@nutricoach/contracts';
import { describe, expect, it } from 'vitest';
import { mesocycleGroups, musclesInOrder, muscleWeekNo, oneRmKey } from './training-view';

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
  srpeLoad: null,
  cardioMinutesPlanned: 0,
  cardioMinutesDone: null,
  cardioCompliancePct: null,
  muscles: [],
});

const method = { code: 'TONNAGE', version: '1.0.0' };

describe('RF-33 · la analítica de rutina en pantalla', () => {
  const weeks = [week(1, 'b', true), week(2, 'b', true), week(3, 'a', false)];
  const analytics: TrainingAnalytics = {
    program: null,
    methods: {
      tonnage: method,
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

import type { TrainingWeek, WeeklyReview } from '@nutricoach/contracts';
import { describe, expect, it } from 'vitest';
import {
  formatFactor,
  macrocycleRows,
  nextWeekPlan,
  roundFactor,
  selectedWeekNo,
  sessionSummary,
  weekState,
} from './weekly-review-view';

const week = (weekNo: number, changes: Partial<TrainingWeek> = {}): TrainingWeek => {
  const start = new Date(Date.UTC(2026, 9, 19 + 7 * (weekNo - 1)));
  const end = new Date(start.getTime() + 6 * 86_400_000);
  return {
    weekNo,
    weekStart: start.toISOString().slice(0, 10),
    weekEnd: end.toISOString().slice(0, 10),
    mesocycleId: 'meso-1',
    isDeload: false,
    phase: null,
    volumeFactor: null,
    targetRir: null,
    started: true,
    sessionsPlanned: 3,
    sessionsDone: 0,
    sessionsCompliancePct: 0,
    tonnageKg: null,
    srpeLoad: null,
    cardioMinutesPlanned: 0,
    cardioMinutesDone: null,
    cardioCompliancePct: null,
    muscles: [],
    ...changes,
  };
};

const review = (weekNo: number, changes: Partial<WeeklyReview> = {}): WeeklyReview => ({
  id: `0193a000-0000-7000-8000-00000000000${String(weekNo)}`,
  programId: '0193a000-0000-7000-8000-0000000000aa',
  weekNo,
  weekStart: '2026-10-19',
  weekEnd: '2026-10-25',
  method: { code: 'WEEKLY_REVIEW_JV', version: '3.0.0' },
  light: 'GREEN',
  reasons: [],
  aggregates: null,
  plannedVolumeFactor: 1,
  suggestedVolumeFactor: 1,
  suggestedAction: 'CONTINUE',
  computedAt: '2026-10-26T15:40:00.000Z',
  decision: null,
  resultingProgram: null,
  supersededCount: 0,
  ...changes,
});

describe('07 §10 · el resumen del macrociclo para el coach', () => {
  // Semanas del 19 de octubre, 26 de octubre y 2 de noviembre; hoy es el 4 de noviembre.
  const weeks = [
    week(1, { volumeFactor: 1.1, sessionsDone: 3 }),
    week(2, { volumeFactor: 0.9, sessionsDone: 2 }),
    week(3, { volumeFactor: 1, sessionsDone: 1 }),
    week(4, { started: false, sessionsDone: null, isDeload: true }),
  ];
  const reviews = [
    review(1, {
      light: 'RED',
      plannedVolumeFactor: 1.1,
      suggestedVolumeFactor: 0.825,
      suggestedAction: 'DELOAD',
      decision: {
        decision: 'DELOAD',
        volumeFactor: 0.8,
        note: 'Descarga.',
        decidedBy: '0193a000-0000-7000-8000-0000000000bb',
        decidedAt: '2026-10-27T15:00:00.000Z',
      },
    }),
    review(2, { light: 'AMBER', plannedVolumeFactor: 0.9, suggestedVolumeFactor: 0.81 }),
  ];
  const rows = macrocycleRows(weeks, reviews, '2026-11-04');

  it('una semana cerrada se controla; la que corre y las siguientes, todavía no', () => {
    expect(rows.map((row) => row.state)).toEqual(['CLOSED', 'CLOSED', 'CURRENT', 'UPCOMING']);
    expect(weekState('2026-11-02', '2026-11-08', '2026-11-09')).toBe('CLOSED');
  });

  it('cada semana con su control, si ya se calculó, y el factor con que se controló', () => {
    expect(rows.map((row) => [row.weekNo, row.review?.light ?? null, row.plannedFactor])).toEqual([
      [1, 'RED', 1.1],
      [2, 'AMBER', 0.9],
      [3, null, 1],
      [4, null, null],
    ]);
  });

  it('sesiones: registradas y programadas hasta hoy, y las próximas (lo que falta de esta semana y las siguientes)', () => {
    expect(sessionSummary(rows)).toEqual({ registered: 6, programmedToDate: 9, upcoming: 5 });
  });

  it('abre la semana pedida; si no, la última sin decidir; si no, la última controlada', () => {
    expect(selectedWeekNo(rows, '1')).toBe(1);
    expect(selectedWeekNo(rows, undefined)).toBe(2);
    expect(selectedWeekNo(rows, '3')).toBe(2);
    const decided = macrocycleRows(weeks, reviews.slice(0, 1), '2026-11-04');
    expect(selectedWeekNo(decided, undefined)).toBe(1);
    expect(selectedWeekNo(macrocycleRows(weeks, [], '2026-11-04'), undefined)).toBeNull();
  });

  it('el factor del plan para la semana siguiente; ninguno después de la última', () => {
    expect(nextWeekPlan(weeks, 2)).toEqual({ exists: true, factor: 1 });
    expect(nextWeekPlan(weeks, 3)).toEqual({ exists: true, factor: null });
    expect(nextWeekPlan(weeks, 4)).toEqual({ exists: false, factor: null });
  });
});

describe('RN-F17 · ADR-090 · el factor que propone el formulario', () => {
  it('el sugerido a 2 decimales, con el medio hacia arriba, en decimal (G-39: 0.825 → 0.83)', () => {
    expect(roundFactor(0.825)).toBe(0.83);
    expect(roundFactor(1.1 * 0.75)).toBe(0.83);
    expect(roundFactor(0.945)).toBe(0.95);
    expect(roundFactor(0.7875)).toBe(0.79);
    expect(roundFactor(0.9)).toBe(0.9);
    expect(roundFactor(2)).toBe(2);
  });

  it('el factor se muestra como en la tabla de fases, con el tercer decimal si lo tiene', () => {
    expect(formatFactor(0.9)).toBe('0.90');
    expect(formatFactor(0.825)).toBe('0.825');
    expect(formatFactor(null)).toBe('—');
  });
});

import { describe, expect, it } from 'vitest';
import {
  addDays,
  changesProgram,
  DECISION_FACTOR_REQUIRED,
  decisionProblem,
  isClosed,
  REVIEW_ALREADY_DECIDED,
  REVIEW_SUPERSEDED,
  weekDates,
} from './weekly-review.js';

describe('RN-G16 · 07 §10 · cuándo se controla una semana', () => {
  it('la semana n empieza el día de inicio más 7 × (n − 1) y dura 7 días', () => {
    expect(weekDates('2026-10-26', 1)).toEqual({ weekStart: '2026-10-26', weekEnd: '2026-11-01' });
    expect(weekDates('2026-10-26', 3)).toEqual({ weekStart: '2026-11-09', weekEnd: '2026-11-15' });
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('se controla cuando cierra: su último día ya pasó en la fecha local del paciente', () => {
    expect(isClosed('2026-11-01', '2026-11-02')).toBe(true);
    expect(isClosed('2026-11-01', '2026-11-01')).toBe(false);
  });
});

describe('RN-F17 · la decisión del coach', () => {
  const open = { status: 'CURRENT', coachDecision: null } as const;

  it('mantener no necesita factor; ajustar o descargar, sí', () => {
    expect(
      decisionProblem(open, { decision: 'KEEP', volumeFactor: null, note: 'Sigue igual.' }),
    ).toBeNull();
    expect(
      decisionProblem(open, { decision: 'DELOAD', volumeFactor: null, note: 'Descarga.' }),
    ).toBe(DECISION_FACTOR_REQUIRED);
    expect(
      decisionProblem(open, { decision: 'ADJUST', volumeFactor: 0.9, note: 'Ajuste.' }),
    ).toBeNull();
  });

  it('se decide una sola vez y sobre el control vigente', () => {
    const input = { decision: 'KEEP', volumeFactor: null, note: 'Sigue igual.' } as const;

    expect(decisionProblem({ status: 'SUPERSEDED', coachDecision: null }, input)).toBe(
      REVIEW_SUPERSEDED,
    );
    expect(decisionProblem({ status: 'CURRENT', coachDecision: 'KEEP' }, input)).toBe(
      REVIEW_ALREADY_DECIDED,
    );
  });

  it('mantener no crea versión nueva del programa; ajustar y descargar, sí (ADR-086)', () => {
    expect([changesProgram('KEEP'), changesProgram('ADJUST'), changesProgram('DELOAD')]).toEqual([
      false,
      true,
      true,
    ]);
  });
});

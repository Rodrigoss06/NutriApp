import { describe, expect, it } from 'vitest';
import { sessionDay, weekPlan, type WeekPlanSession } from './week-plan.js';

const named = (name: string, position: number, dayOfWeek: number | null): WeekPlanSession => ({
  name,
  position,
  dayOfWeek,
});
const shown = (plan: ReturnType<typeof weekPlan>) =>
  plan.map(({ label, sessions }) => [label, sessions.join(', ')]);

describe('07 §8 · el plan de la semana', () => {
  it('sin día de la semana, su orden; con él, ese día', () => {
    expect(sessionDay({ position: 2, dayOfWeek: null })).toBe('Día 2');
    expect(sessionDay({ position: 1, dayOfWeek: 5 })).toBe('Viernes');
  });

  it('los días 1 a N son las sesiones 1 a N y los demás, descanso', () => {
    expect(shown(weekPlan([named('A', 1, null), named('B', 2, null)]))).toEqual([
      ['Día 1', 'A'],
      ['Día 2', 'B'],
      ['Día 3', ''],
      ['Día 4', ''],
      ['Día 5', ''],
      ['Día 6', ''],
      ['Día 7', ''],
    ]);
  });

  it('con días fijos, va de lunes a domingo y un día puede tener dos sesiones', () => {
    const plan = shown(weekPlan([named('A', 1, 5), named('B', 2, 1), named('C', 3, 5)]));

    expect(plan[0]).toEqual(['Lunes', 'B']);
    expect(plan[1]).toEqual(['Martes', '']);
    expect(plan[4]).toEqual(['Viernes', 'A, C']);
    expect(plan).toHaveLength(7);
  });

  it('si se mezclan, cada sesión dice su día y lo demás es descanso', () => {
    expect(shown(weekPlan([named('A', 1, 5), named('B', 2, null)]))).toEqual([
      ['Viernes', 'A'],
      ['Día 2', 'B'],
      ['Los demás días', ''],
    ]);
  });

  it('más de 7 sesiones sin día no caben en los 7 días: se listan', () => {
    const sessions = Array.from({ length: 8 }, (_, index) =>
      named(`S${String(index + 1)}`, index + 1, null),
    );

    expect(shown(weekPlan(sessions)).at(-2)).toEqual(['Día 8', 'S8']);
  });

  it('una semana vacía es toda de descanso', () => {
    expect(shown(weekPlan([]))).toHaveLength(7);
  });
});

import { describe, expect, it } from 'vitest';
import { percentile, reportMarkdown, summarize } from '../scripts/analytics-p95.js';
import {
  BLOCK_DAYS,
  dayFactor,
  parseLoadArgs,
  programBlocks,
  programWeeks,
  random,
  sessionsOnDay,
} from '../scripts/seed-load.js';

describe('RNF-05 · ADR-096 · el generador de carga', () => {
  it('--patients y --years con sus valores por defecto y sus límites', () => {
    expect(parseLoadArgs([])).toEqual({ patients: 500, years: 2 });
    expect(parseLoadArgs(['--patients', '3', '--years', '0.25'])).toEqual({
      patients: 3,
      years: 0.25,
    });
    expect(() => parseLoadArgs(['--patients', '0'])).toThrow('--patients');
    expect(() => parseLoadArgs(['--years', '9'])).toThrow('--years');
  });

  it('la historia en bloques de 12 semanas; el último incluye hoy y es el vigente', () => {
    const blocks = programBlocks('2024-11-07', '2026-11-07');
    expect(blocks).toHaveLength(Math.floor(730 / BLOCK_DAYS) + 1);
    expect(blocks[0]).toEqual({ startDate: '2024-11-07', endDate: '2025-01-29', current: false });
    expect(blocks.at(-1)?.current).toBe(true);
    expect(blocks.filter((block) => block.current)).toHaveLength(1);
  });

  it('RN-G09 · con adherencia 1 todos los días caen en rango (±8 %); con 0, ninguno', () => {
    const rand = random(1);
    const inRange = (factor: number) => factor >= 0.92 && factor <= 1.08;
    expect(Array.from({ length: 200 }, () => dayFactor(rand, 1)).every(inRange)).toBe(true);
    expect(Array.from({ length: 200 }, () => dayFactor(rand, 0)).some(inRange)).toBe(false);
    // La misma semilla da la misma historia.
    expect(random(42)()).toBe(random(42)());
  });

  it('07 §8 · las sesiones de cada día del bloque, como tracking: los días 1 a N de la semana, o su día fijo', () => {
    const session = (id: string, position: number, dayOfWeek: number | null = null) => ({
      id,
      position,
      dayOfWeek,
      setsByMuscle: {},
      exercises: [],
    });
    const weeks = programWeeks({
      mesocycles: [
        {
          id: 'm1',
          weeks: [{ weekNo: 1, isDeload: false, sessions: [session('a', 1), session('b', 2)] }],
        },
        { id: 'm2', weeks: [{ weekNo: 2, isDeload: true, sessions: [session('c', 1, 5)] }] },
      ],
    });
    expect(sessionsOnDay(weeks, '2026-11-02', '2026-11-03')?.sessions.map((s) => s.id)).toEqual([
      'b',
    ]);
    expect(sessionsOnDay(weeks, '2026-11-02', '2026-11-05')?.sessions).toEqual([]);
    // Semana 2: la sesión del viernes (5), del mesociclo m2 y de descarga.
    const friday = sessionsOnDay(weeks, '2026-11-02', '2026-11-13');
    expect([
      friday?.week.mesocycleId,
      friday?.week.isDeload,
      friday?.sessions.map((s) => s.id),
    ]).toEqual(['m2', true, ['c']]);
    expect(sessionsOnDay(weeks, '2026-11-02', '2026-11-16')).toBeNull();
    expect(sessionsOnDay(weeks, '2026-11-02', '2026-11-01')).toBeNull();
  });
});

describe('Criterio 4 de P14 · RNF-01 · el p95 de la analítica', () => {
  it('percentil por rango más cercano', () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(values, 50)).toBe(50);
    expect(percentile(values, 95)).toBe(95);
    expect(percentile(values, 100)).toBe(100);
    expect(percentile([], 95)).toBeNaN();
  });

  it('el informe dice si cumple: p95 de 300 ms o menos y sin errores', () => {
    const fast = summarize('Dieta, 4 semanas (RF-32)', 'Dueña', [10, 20, 30], 0);
    expect(fast).toMatchObject({ requests: 3, p50: 20, p95: 30, max: 30 });
    const context = {
      date: '2026-11-07',
      machine: 'CPU de prueba',
      dataset: [['Pacientes', '500']] as const,
    };
    expect(reportMarkdown([fast], context)).toContain(
      '**Resultado:** todas las consultas con p95 de 300 ms o menos',
    );
    const slow = summarize('Tendencia', 'Profesional', [400], 0);
    expect(reportMarkdown([fast, slow], context)).toContain('alguna consulta pasa de 300 ms');
    expect(reportMarkdown([summarize('Panel', 'Dueña', [5], 1)], context)).toContain(
      'tuvo errores',
    );
  });
});

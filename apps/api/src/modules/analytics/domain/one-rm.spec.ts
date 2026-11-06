import { describe, expect, it } from 'vitest';
import { oneRmPoints, type OneRmDay } from './one-rm.js';

const set = (id: string, values: Partial<OneRmDay['workouts'][number]['sets'][number]> = {}) => ({
  id,
  exerciseId: 'squat',
  isWarmup: false,
  reps: 8,
  loadKg: 100,
  ...values,
});

/** Una estimación de prueba: carga × repeticiones, para ver qué serie gana. */
const estimate = (_formula: string, loadKg: number, reps: number) => loadKg * reps;

describe('RN-F04 · el mejor 1RM del día por ejercicio, con la fórmula del programa', () => {
  it('elige la mejor serie efectiva y guarda cuál fue', () => {
    const [point] = oneRmPoints(
      {
        localDate: '2026-11-02',
        workouts: [
          {
            outcome: 'COMPLETED',
            programId: 'p-1',
            sets: [
              set('s-1', { isWarmup: true, loadKg: 200 }),
              set('s-2'),
              set('s-3', { reps: 10 }),
            ],
          },
        ],
      },
      () => 'ONERM_EPLEY1985',
      estimate,
    );

    expect(point).toEqual({
      localDate: '2026-11-02',
      exerciseId: 'squat',
      formula: 'ONERM_EPLEY1985',
      bestEstimated1rmKg: 1000,
      sourceSetId: 's-3',
    });
  });

  it('con más de 12 repeticiones, sin peso o en un entreno omitido no se estima', () => {
    expect(
      oneRmPoints(
        {
          localDate: '2026-11-02',
          workouts: [
            {
              outcome: 'COMPLETED',
              programId: 'p-1',
              sets: [
                set('s-1', { reps: 13 }),
                set('s-2', { loadKg: null }),
                set('s-3', { loadKg: 0 }),
              ],
            },
            { outcome: 'SKIPPED', programId: 'p-1', sets: [set('s-4')] },
          ],
        },
        () => 'ONERM_EPLEY1985',
        estimate,
      ),
    ).toEqual([]);
  });

  it('sin fórmula del programa no hay serie', () => {
    expect(
      oneRmPoints(
        {
          localDate: '2026-11-02',
          workouts: [{ outcome: 'COMPLETED', programId: 'p-1', sets: [set('s-1')] }],
        },
        () => null,
        estimate,
      ),
    ).toEqual([]);
  });
});

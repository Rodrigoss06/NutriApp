import { describe, expect, it } from 'vitest';
import { programCalendar, type CalendarSource } from './program-calendar.js';

const exercise = (muscle: string, sets: { setType: string; durationSeconds: number | null }[]) => ({
  primaryMuscles: [{ code: muscle }],
  secondaryMuscles: [],
  sets,
});

const SOURCE: CalendarSource = {
  startDate: '2026-11-04',
  mesocycles: [
    {
      id: 'm-2',
      weeks: [
        {
          weekNo: 2,
          isDeload: true,
          sessions: [{ setsByMuscle: { QUADRICEPS: 1 }, exercises: [] }],
        },
      ],
    },
    {
      id: 'm-1',
      weeks: [
        {
          weekNo: 1,
          isDeload: false,
          sessions: [
            {
              setsByMuscle: { QUADRICEPS: 3, GLUTES: 3, HAMSTRINGS: 1.5, CARDIO: 1 },
              exercises: [
                exercise('CARDIO', [
                  { setType: 'WORKING', durationSeconds: 1200 },
                  { setType: 'WARMUP', durationSeconds: 300 },
                ]),
              ],
            },
            { setsByMuscle: { QUADRICEPS: 2 }, exercises: [] },
          ],
        },
      ],
    },
  ],
};

describe('RN-F01 · RN-F08 · el calendario del programa', () => {
  it('cada semana con sus fechas, su mesociclo, la descarga y lo programado, en orden', () => {
    const [first, second] = programCalendar(SOURCE);

    expect(first).toEqual({
      weekNo: 1,
      weekStart: '2026-11-04',
      weekEnd: '2026-11-10',
      mesocycleId: 'm-1',
      isDeload: false,
      phaseEs: null,
      volumeFactor: null,
      targetRir: null,
      sessionsPlanned: 2,
      plannedByMuscle: { QUADRICEPS: 5, GLUTES: 3, HAMSTRINGS: 1.5 },
      cardioMinutesPlanned: 20,
    });
    expect(second).toMatchObject({ weekNo: 2, weekStart: '2026-11-11', isDeload: true });
  });
});

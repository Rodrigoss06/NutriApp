import { describe, expect, it } from 'vitest';
import { exerciseOneRms } from './mesocycle-report-builder.js';

const point = (
  exerciseId: string,
  localDate: string,
  estimated1rmKg: number,
  formula = 'ONERM_EPLEY1985',
) => ({
  exerciseId,
  localDate,
  estimated1rmKg,
  formula,
});

describe('RN-G19 · RN-F04 · los 1RM que entran en el informe del mesociclo', () => {
  it('el mejor de antes del mesociclo, los días dentro de él y nada después ni de otra fórmula, en orden', () => {
    const exercises = exerciseOneRms(
      [
        point('sentadilla', '2026-10-15', 87.5),
        point('sentadilla', '2026-10-08', 84),
        point('press-banca', '2026-09-20', 52),
        point('press-banca', '2026-09-27', 55),
        point('press-banca', '2026-10-06', 56),
        point('press-banca', '2026-10-13', 60, 'ONERM_BRZYCKI1993'),
        point('press-banca', '2026-11-03', 70),
        point('jalon', '2026-09-30', 60),
      ],
      'ONERM_EPLEY1985',
      '2026-10-06',
      '2026-11-02',
    );
    expect(exercises).toEqual([
      {
        exerciseId: 'press-banca',
        bestBeforeKg: 55,
        days: [{ localDate: '2026-10-06', estimated1rmKg: 56 }],
      },
      {
        exerciseId: 'sentadilla',
        bestBeforeKg: null,
        days: [
          { localDate: '2026-10-08', estimated1rmKg: 84 },
          { localDate: '2026-10-15', estimated1rmKg: 87.5 },
        ],
      },
    ]);
  });
});

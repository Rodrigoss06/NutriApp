import { describe, expect, it } from 'vitest';
import patternChoiceSeed from '../../../../seeds/exercise/pattern-choice-v3.json' with { type: 'json' };
import periodizationSeed from '../../../../seeds/training/periodization-v3.json' with { type: 'json' };
import {
  macrocycleMesocycles,
  macrocycleWeeks,
  proposalWeek,
  TRAINING_OBJECTIVES,
  weekSets,
  type PeriodizationPhase,
} from './macrocycle.js';
import { BASE_BLOCK, proposeRoutine, type PatternChoice } from './routine-proposal.js';

const PHASES = periodizationSeed.phases as readonly PeriodizationPhase[];
const CHOICES = patternChoiceSeed.choices as readonly PatternChoice[];

describe('RN-F13 · tabla de fases de la V3 (07 §7)', () => {
  it.each(TRAINING_OBJECTIVES)('%s tiene las 12 semanas, en orden', (objective) => {
    const weeks = macrocycleWeeks(PHASES, objective, 12);

    expect(weeks.map(({ weekNo }) => weekNo)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it.each(TRAINING_OBJECTIVES)('%s descarga en las semanas 5 y 9', (objective) => {
    const deloads = macrocycleWeeks(PHASES, objective, 12).filter(({ isDeload }) => isDeload);

    expect(deloads.map(({ weekNo }) => weekNo)).toEqual([5, 9]);
    expect(deloads.every(({ phaseEs }) => phaseEs === 'Descarga')).toBe(true);
  });

  it.each(TRAINING_OBJECTIVES)(
    '%s tiene control y ajuste en las semanas 4, 8 y 12',
    (objective) => {
      const controls = macrocycleWeeks(PHASES, objective, 12).filter(
        ({ reviewKind }) => reviewKind === 'CONTROL',
      );

      expect(controls.map(({ weekNo }) => weekNo)).toEqual([4, 8, 12]);
    },
  );
});

describe('RN-F13 · el macrociclo toma las primeras semanas', () => {
  it('P-07: 8 semanas de hipertrofia terminan en «Intensificación», sin descarga ni retest', () => {
    const weeks = macrocycleWeeks(PHASES, 'HYPERTROPHY', 8);

    expect(weeks).toHaveLength(8);
    expect(weeks.at(-1)?.phaseEs).toBe('Intensificación');
  });

  it.each([7, 13, 9.5])('no acepta un macrociclo de %d semanas', (weeks) => {
    expect(() => macrocycleWeeks(PHASES, 'HEALTH', weeks)).toThrow(RangeError);
  });

  it('falla con una tabla a medias en vez de dar un macrociclo con huecos', () => {
    const missing = PHASES.filter(({ objective }) => objective === 'HEALTH').slice(0, 7);
    const gap = PHASES.filter(({ objective, weekNo }) => objective === 'HEALTH' && weekNo !== 3);

    expect(() => macrocycleWeeks(missing, 'HEALTH', 8)).toThrow(RangeError);
    expect(() => macrocycleWeeks(gap, 'HEALTH', 8)).toThrow(RangeError);
  });

  it('no altera la tabla que recibe', () => {
    const table = [...PHASES].reverse();
    const copy = [...table];

    macrocycleWeeks(table, 'FAT_LOSS', 12);
    expect(table).toEqual(copy);
  });
});

describe('05.2 · mesociclos de un programa de la V3', () => {
  const ranges = (weeks: number) =>
    macrocycleMesocycles(macrocycleWeeks(PHASES, 'HYPERTROPHY', weeks)).map(
      ({ firstWeek, lastWeek }) => [firstWeek, lastWeek],
    );

  it('12 semanas: 1 a 5, 6 a 9 y 10 a 12', () => {
    expect(ranges(12)).toEqual([
      [1, 5],
      [6, 9],
      [10, 12],
    ]);
  });

  it('10 semanas: la última forma el suyo', () => {
    expect(ranges(10)).toEqual([
      [1, 5],
      [6, 9],
      [10, 10],
    ]);
  });

  it('9 semanas: termina en la descarga, sin un mesociclo vacío', () => {
    expect(ranges(9)).toEqual([
      [1, 5],
      [6, 9],
    ]);
  });

  it('8 semanas: 1 a 5 y 6 a 8', () => {
    expect(ranges(8)).toEqual([
      [1, 5],
      [6, 8],
    ]);
  });
});

describe('P-06 · series de la semana', () => {
  it.each([
    [0.5, 2],
    [0.55, 2],
    [0.6, 2],
    [0.65, 2],
    [0.7, 2],
    [0.75, 2],
    [0.8, 2],
    [0.85, 3],
    [0.9, 3],
    [0.95, 3],
    [1, 3],
    [1.05, 3],
    [1.1, 3],
  ])('3 series base con factor %d: %i', (factor, sets) => {
    expect(weekSets(3, factor)).toBe(sets);
  });

  it('nunca menos de una serie', () => {
    expect(weekSets(1, 0.4)).toBe(1);
  });
});

describe('RN-F14 · una semana del macrociclo con la propuesta', () => {
  const proposal = proposeRoutine({ level: 'BEGINNER', daysPerWeek: 4 }, CHOICES);
  const weekOf = (weekNo: number) => {
    const week = macrocycleWeeks(PHASES, 'HYPERTROPHY', 12)[weekNo - 1];
    if (!week) expect.fail(`Falta la semana ${String(weekNo)}.`);
    return proposalWeek(proposal, week);
  };

  it('la semana 3 de hipertrofia (factor 1, RIR 2) es la plantilla tal cual', () => {
    expect(weekOf(3).days).toEqual(proposal.days);
  });

  it('en la descarga bajan las series y el RIR de cada serie es el objetivo de la semana', () => {
    const block = weekOf(5).days[0]?.blocks[0];

    expect(block).toMatchObject({
      sets: 2,
      loadKind: 'RIR',
      loadValue: 4,
      repsMin: BASE_BLOCK.repsMin,
      repsMax: BASE_BLOCK.repsMax,
      tempo: BASE_BLOCK.tempo,
      restSeconds: BASE_BLOCK.restSeconds,
    });
  });

  it('la plantilla conserva su RIR base', () => {
    weekOf(5);

    expect(proposal.days[0]?.blocks[0]?.loadValue).toBe(BASE_BLOCK.loadValue);
    expect(proposal.days[0]?.blocks[0]?.sets).toBe(BASE_BLOCK.sets);
  });
});

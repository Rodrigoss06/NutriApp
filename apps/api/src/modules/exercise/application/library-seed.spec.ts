import { readFileSync } from 'node:fs';
import { isErr } from '@nutricoach/shared-kernel';
import { describe, expect, it } from 'vitest';
import { readCatalogFile, type CatalogImport } from '../../../platform/index.js';
import {
  libraryProblems,
  LIBRARY_COLUMNS,
  parseLibraryRow,
  parsePatternChoiceRow,
  PATTERN_CHOICE_COLUMNS,
} from '../domain/exercise-library.js';

const SEEDS = new URL('../../../../../../seeds/exercise/', import.meta.url);

/** El archivo como lo lee el importador: si una fila no pasa, falla aquí antes que en catalog:load. */
function rowsOf<T>(
  file: string,
  columns: readonly string[],
  parse: CatalogImport<T>['parse'],
): readonly T[] {
  const read = readCatalogFile<T>(
    {
      kind: 'SEED',
      columns,
      parse,
      key: (row) => JSON.stringify(row),
      save: () => Promise.resolve(),
    },
    readFileSync(new URL(file, SEEDS)),
  );
  if (isErr(read)) expect.fail(read.error);
  expect(read.value.errors).toEqual([]);
  return read.value.rows;
}

const library = rowsOf('ejercicios-base.csv', LIBRARY_COLUMNS, parseLibraryRow);
const choices = rowsOf('pattern-choice-v3.csv', PATTERN_CHOICE_COLUMNS, parsePatternChoiceRow);
const byCode = new Map(library.map((exercise) => [exercise.code, exercise]));

/** Los 23 ejercicios de la hoja EJERCICIOS de la V3: el resto los redactó el equipo (ADR-071). */
const V3_CODES = [
  'SQ01',
  'SQ02',
  'SQ03',
  'HG01',
  'HG02',
  'HT01',
  'LN01',
  'HP01',
  'HP02',
  'VP01',
  'VP02',
  'HR01',
  'HR02',
  'VR01',
  'VR02',
  'SH01',
  'AR01',
  'AR02',
  'CR01',
  'CR02',
  'CV01',
  'CD01',
  'CD02',
];

describe('RF-38 · RF-25 · el CSV de ejercicios base', () => {
  it('trae 150 o más ejercicios, sin códigos ni nombres repetidos', () => {
    expect(library.length).toBeGreaterThanOrEqual(150);
    expect(new Set(library.map(({ code }) => code)).size).toBe(library.length);
    expect(new Set(library.map(({ name }) => name)).size).toBe(library.length);
  });

  it('RN-F11: cada variante existe y respeta el nivel', () => {
    expect(libraryProblems(library)).toEqual([]);
  });

  it('ADR-071: solo los 23 de la V3 no son provisionales', () => {
    expect(
      library
        .filter(({ provisional }) => !provisional)
        .map(({ code }) => code)
        .sort(),
    ).toEqual([...V3_CODES].sort());
  });

  it('todos llevan patrón, músculo principal, precaución y valores base', () => {
    for (const exercise of library) {
      expect(exercise.primaryMuscles.length, exercise.code).toBe(1);
      expect(exercise.caution, exercise.code).not.toBeNull();
      expect(exercise.alternativeCode, exercise.code).not.toBeNull();
    }
  });

  it('la V3: «Caminata inclinada» son 20 minutos en 1 serie, y la plancha se mide en segundos', () => {
    expect(byCode.get('CD01')).toMatchObject({
      baseSets: 1,
      baseRepsMin: 20,
      baseMeasure: 'MINUTES',
      baseRestSeconds: 0,
    });
    expect(byCode.get('CR03')).toMatchObject({ baseMeasure: 'SECONDS' });
  });
});

describe('RN-F14 · la tabla patrón × nivel de la V3 (07 §5)', () => {
  it('apunta a ejercicios del archivo, con su nombre y de su patrón', () => {
    expect(choices).toHaveLength(45);
    for (const choice of choices) {
      const exercise = byCode.get(choice.exerciseCode);
      expect(exercise?.name, choice.exerciseCode).toBe(choice.exerciseName);
      expect(exercise?.pattern, choice.exerciseCode).toBe(choice.pattern);
    }
  });

  it('P-11: el nivel de un ejercicio es el más bajo en que la tabla lo usa', () => {
    const RANK = { BEGINNER: 0, INTERMEDIATE: 1, ADVANCED: 2 };
    const lowest = new Map<string, number>();
    for (const { exerciseCode, level } of choices) {
      lowest.set(exerciseCode, Math.min(lowest.get(exerciseCode) ?? 2, RANK[level]));
    }
    for (const [code, rank] of lowest) {
      const exercise = byCode.get(code);
      expect(exercise && RANK[exercise.level], code).toBe(rank);
    }
  });

  it('el alias de la hoja lleva al ejercicio: «RDL con mancuernas»', () => {
    const beginner = choices.find((c) => c.pattern === 'HINGE' && c.level === 'BEGINNER');

    expect(beginner && byCode.get(beginner.exerciseCode)?.aliases).toContain('RDL con mancuernas');
  });
});

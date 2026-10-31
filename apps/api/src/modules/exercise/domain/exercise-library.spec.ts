import { MOVEMENT_PATTERNS, TRAINING_LEVELS } from '@nutricoach/engine';
import { isErr, isOk, type DomainError } from '@nutricoach/shared-kernel';
import { describe, expect, it } from 'vitest';
import {
  FULL_GYM,
  libraryProblems,
  LIBRARY_COLUMNS,
  MOVEMENT_PATTERN_CODES,
  ownExerciseProblems,
  parseLibraryRow,
  parsePatternChoiceRow,
  TRAINING_LEVEL_CODES,
  type LibraryExercise,
  type OwnExerciseInput,
  type OwnExerciseReferences,
} from './exercise-library.js';

const ROW = {
  codigo: 'SQ01',
  patron: 'SQUAT',
  nombre: 'Sentadilla goblet',
  alias: '',
  modalidad: 'STRENGTH',
  nivel: 'BEGINNER',
  equipo: 'DUMBBELL',
  unilateral: 'no',
  principal: 'QUADRICEPS',
  secundarios: 'GLUTES',
  precaucion: 'Dolor de rodilla o lumbar',
  alternativa: 'SQ04',
  regresion: 'SQ05',
  progresion: '',
  series: '3',
  reps_min: '10',
  reps_max: '10',
  medida: 'REPS',
  descanso_s: '90',
  provisional: 'no',
};

const messagesOf = (record: Partial<typeof ROW>) => {
  const parsed = parseLibraryRow({ ...ROW, ...record });
  if (isOk(parsed)) expect.fail('Se esperaba que la fila fallara.');
  return parsed.error;
};

describe('07 §5 · los códigos son los del motor', () => {
  it('los 15 patrones y los 3 niveles', () => {
    expect(MOVEMENT_PATTERN_CODES).toEqual(MOVEMENT_PATTERNS);
    expect(TRAINING_LEVEL_CODES).toEqual(TRAINING_LEVELS);
  });
});

describe('RF-38 · una fila del CSV de ejercicios base', () => {
  it('tiene las columnas del encabezado', () => {
    expect(Object.keys(ROW)).toEqual([...LIBRARY_COLUMNS]);
  });

  it('se convierte en la ficha del ejercicio', () => {
    const parsed = parseLibraryRow(ROW);

    expect(parsed).toEqual({
      ok: true,
      value: {
        code: 'SQ01',
        name: 'Sentadilla goblet',
        aliases: [],
        pattern: 'SQUAT',
        level: 'BEGINNER',
        modality: 'STRENGTH',
        equipmentCode: 'DUMBBELL',
        isUnilateral: false,
        primaryMuscles: ['QUADRICEPS'],
        secondaryMuscles: ['GLUTES'],
        caution: 'Dolor de rodilla o lumbar',
        alternativeCode: 'SQ04',
        easierCode: 'SQ05',
        harderCode: null,
        baseSets: 3,
        baseRepsMin: 10,
        baseRepsMax: 10,
        baseMeasure: 'REPS',
        baseRestSeconds: 90,
        provisional: false,
      },
    });
  });

  it('separa alias y secundarios por punto y coma, y sin equipo queda null', () => {
    const parsed = parseLibraryRow({
      ...ROW,
      alias: 'Uno; Dos',
      secundarios: 'GLUTES;ABS',
      equipo: '',
      provisional: 'si',
    });

    expect(parsed).toMatchObject({
      ok: true,
      value: {
        aliases: ['Uno', 'Dos'],
        secondaryMuscles: ['GLUTES', 'ABS'],
        equipmentCode: null,
        provisional: true,
      },
    });
  });

  it.each([
    [{ codigo: 'sentadilla' }, 'codigo'],
    [{ patron: 'PUSH' }, 'patron'],
    [{ nombre: ' ' }, 'nombre'],
    [{ modalidad: 'YOGA' }, 'modalidad'],
    [{ nivel: 'EXPERTO' }, 'nivel'],
    [{ medida: 'METROS' }, 'medida'],
    [{ unilateral: 'tal vez' }, 'unilateral'],
    [{ provisional: '' }, 'provisional'],
    [{ principal: '' }, 'principal'],
    [{ secundarios: 'QUADRICEPS' }, 'secundarios'],
    [{ series: '0' }, 'series'],
    [{ series: '11' }, 'series'],
    [{ reps_min: 'diez' }, 'reps_min'],
    [{ reps_min: '12', reps_max: '10' }, 'reps_min'],
    [{ descanso_s: '601' }, 'descanso_s'],
    // Un dato que falta no es cero, aunque 0 s de descanso sea un valor válido.
    [{ descanso_s: '' }, 'descanso_s'],
    [{ descanso_s: ' ' }, 'descanso_s'],
  ])('rechaza %j nombrando la columna', (record, column) => {
    expect(messagesOf(record).join(' ')).toContain(`${column}:`);
  });
});

describe('RN-F11 · las variantes del archivo', () => {
  const exercise = (
    code: string,
    level: LibraryExercise['level'],
    links: Partial<LibraryExercise> = {},
  ): LibraryExercise => {
    const parsed = parseLibraryRow({
      ...ROW,
      codigo: code,
      nivel: level,
      alternativa: '',
      regresion: '',
    });
    if (isErr(parsed)) expect.fail(parsed.error.join(' '));
    return { ...parsed.value, ...links };
  };

  it('sin problemas si cada variante existe y respeta el nivel', () => {
    expect(
      libraryProblems([
        exercise('SQ01', 'BEGINNER', { harderCode: 'SQ02', alternativeCode: 'SQ02' }),
        exercise('SQ02', 'ADVANCED', { easierCode: 'SQ01' }),
      ]),
    ).toEqual([]);
  });

  it('una variante que no existe', () => {
    expect(libraryProblems([exercise('SQ01', 'BEGINNER', { alternativeCode: 'SQ99' })])).toEqual([
      'SQ01: alternativa SQ99 no existe',
    ]);
  });

  it('una variante que es el mismo ejercicio', () => {
    expect(libraryProblems([exercise('SQ01', 'BEGINNER', { easierCode: 'SQ01' })])).toEqual([
      'SQ01: regresion es el mismo ejercicio',
    ]);
  });

  it('una regresión que pide más nivel, o una progresión que pide menos', () => {
    expect(
      libraryProblems([
        exercise('SQ01', 'BEGINNER', { easierCode: 'SQ02' }),
        exercise('SQ02', 'ADVANCED', { harderCode: 'SQ01' }),
      ]),
    ).toEqual([
      'SQ01: la regresión SQ02 pide más nivel',
      'SQ02: la progresión SQ01 pide menos nivel',
    ]);
  });
});

describe('RN-F14 · una fila de la tabla patrón × nivel', () => {
  const CHOICE = {
    patron: 'SQUAT',
    nivel: 'BEGINNER',
    codigo_ejercicio: 'SQ01',
    ejercicio: 'Sentadilla goblet',
  };

  it('se convierte', () => {
    expect(parsePatternChoiceRow(CHOICE)).toEqual({
      ok: true,
      value: {
        pattern: 'SQUAT',
        level: 'BEGINNER',
        exerciseCode: 'SQ01',
        exerciseName: 'Sentadilla goblet',
      },
    });
  });

  it.each([
    [{ patron: 'PUSH' }, 'patron'],
    [{ nivel: 'EXPERTO' }, 'nivel'],
    [{ codigo_ejercicio: '1' }, 'codigo_ejercicio'],
    [{ ejercicio: '' }, 'ejercicio'],
  ])('rechaza %j', (record, column) => {
    const parsed = parsePatternChoiceRow({ ...CHOICE, ...record });

    expect(isErr(parsed) && parsed.error.join(' ')).toContain(`${column}:`);
  });
});

describe('RN-I01 · RN-F11 · un ejercicio propio', () => {
  const INPUT: OwnExerciseInput = {
    name: 'Sentadilla en bosu',
    aliases: [],
    pattern: 'SQUAT',
    level: 'INTERMEDIATE',
    modality: 'STRENGTH',
    equipmentCode: 'DUMBBELL',
    isUnilateral: false,
    primaryMuscles: ['QUADRICEPS'],
    secondaryMuscles: ['GLUTES'],
    caution: null,
    alternativeId: 'a',
    easierVariantId: null,
    harderVariantId: null,
    baseSets: 3,
    baseRepsMin: 8,
    baseRepsMax: 12,
    baseMeasure: 'REPS',
    baseRestSeconds: 90,
    mediaUrl: null,
    instructions: null,
  };
  const REFERENCES: OwnExerciseReferences = {
    muscleCodes: new Set(['QUADRICEPS', 'GLUTES']),
    equipmentCodes: new Set(['DUMBBELL', FULL_GYM]),
    visibleExerciseIds: new Set(['a']),
    selfId: 'propio',
  };
  const problemsOf = (input: Partial<OwnExerciseInput>) => {
    const result = ownExerciseProblems({ ...INPUT, ...input }, REFERENCES);
    if (isOk(result)) expect.fail('Se esperaba que fallara.');
    const error: DomainError = result.error;
    expect(error).toMatchObject({ code: 'NC-EXE-001', rule: 'RN-F11' });
    return (error.details as { problems: string[] }).problems;
  };

  it('pasa con todo en orden', () => {
    expect(isOk(ownExerciseProblems(INPUT, REFERENCES))).toBe(true);
  });

  it('necesita un músculo principal', () => {
    expect(problemsOf({ primaryMuscles: [] })).toEqual(['Elige al menos un músculo principal.']);
  });

  it('un músculo no va en las dos listas: cuentan distinto (RN-F06)', () => {
    expect(problemsOf({ secondaryMuscles: ['QUADRICEPS'] })).toEqual([
      'QUADRICEPS está dos veces: va en una sola lista.',
    ]);
  });

  it('no acepta un músculo ni un equipo que no existen', () => {
    expect(problemsOf({ secondaryMuscles: ['ALAS'], equipmentCode: 'TRINEO' })).toEqual([
      'ALAS no es un grupo muscular.',
      'TRINEO no es un equipo.',
    ]);
  });

  it('«Gimnasio completo» es del perfil, no de un ejercicio', () => {
    expect(problemsOf({ equipmentCode: FULL_GYM })).toEqual([
      'Elige el equipo que usa el ejercicio.',
    ]);
  });

  it('las repeticiones van en orden', () => {
    expect(problemsOf({ baseRepsMin: 12, baseRepsMax: 8 })).toEqual([
      'Las repeticiones mínimas son más que las máximas.',
    ]);
  });

  it('una variante no puede ser el mismo ejercicio ni uno que no se ve', () => {
    expect(problemsOf({ easierVariantId: 'propio', harderVariantId: 'de otra' })).toEqual([
      'La regresión no puede ser el mismo ejercicio.',
      'La progresión no existe.',
    ]);
  });
});

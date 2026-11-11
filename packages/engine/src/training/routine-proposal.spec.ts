import { describe, expect, it } from 'vitest';
import { patternChoiceSeed } from '../../test/support.js';
import {
  MOVEMENT_PATTERNS,
  PATTERN_BASE,
  proposeRoutine,
  routineSplit,
  sessionName,
  suggestedExercise,
  TRAINING_LEVELS,
} from './routine-proposal.js';

const CHOICES = patternChoiceSeed();

/** Los patrones de la hoja piloto (P-34, ADR-111 y ADR-112): no están en la plantilla de la V3. */
const PILOT_PATTERNS = [
  'SHOULDER_MOBILITY',
  'THORACIC_MOBILITY',
  'LUMBAR_STABILITY',
  'KNEE_FLEXION',
  'KNEE_EXTENSION',
];

describe('RN-F14 · tabla patrón × nivel de la V3 y de la hoja piloto (07 §5, P-34)', () => {
  it('tiene un ejercicio para cada uno de los 20 patrones en cada nivel: 45 filas de la V3 y 15 de la hoja', () => {
    expect(CHOICES).toHaveLength(60);
    expect(MOVEMENT_PATTERNS).toHaveLength(20);
    for (const pattern of MOVEMENT_PATTERNS) {
      for (const level of TRAINING_LEVELS) {
        expect(suggestedExercise(CHOICES, pattern, level)).not.toBeNull();
      }
    }
  });

  it('P-34 · los patrones nuevos de la hoja, de básico a avanzado, con los ejercicios de Jeremy', () => {
    const names = (pattern: (typeof MOVEMENT_PATTERNS)[number]) =>
      TRAINING_LEVELS.map((level) => suggestedExercise(CHOICES, pattern, level)?.exerciseName);
    expect(names('SHOULDER_MOBILITY')).toEqual([
      'Dislocaciones con banda',
      'Rotación externa en polea',
      'CARs de hombro',
    ]);
    expect(names('THORACIC_MOBILITY')).toEqual([
      'Open book en el suelo',
      'Extensión torácica en rodillo',
      'Rotación torácica en cuadrupedia',
    ]);
    expect(names('LUMBAR_STABILITY')).toEqual([
      'Bird dog',
      'Puente glúteo unilateral',
      'Hip thrust isométrico',
    ]);
  });

  it('ADR-112 · la flexión y la extensión de rodilla, provisionales: la máquina en los tres niveles', () => {
    for (const level of TRAINING_LEVELS) {
      expect(suggestedExercise(CHOICES, 'KNEE_FLEXION', level)?.exerciseName).toBe(
        'Curl femoral en máquina',
      );
      expect(suggestedExercise(CHOICES, 'KNEE_EXTENSION', level)?.exerciseName).toBe(
        'Extensión de rodilla',
      );
    }
  });

  it('sin esa fila no sugiere nada', () => {
    expect(suggestedExercise([], 'SQUAT', 'BEGINNER')).toBeNull();
  });

  it('el mismo código es siempre el mismo ejercicio', () => {
    const names = new Map<string, string>();
    for (const { exerciseCode, exerciseName } of CHOICES) {
      expect(names.get(exerciseCode) ?? exerciseName).toBe(exerciseName);
      names.set(exerciseCode, exerciseName);
    }
  });
});

describe('RN-F14 · división y nombre de cada sesión', () => {
  it('con 2 días o menos es cuerpo completo', () => {
    expect(routineSplit(1)).toBe('FULL_BODY');
  });

  it.each([
    ['FULL_BODY', 1, 'Cuerpo completo'],
    ['FULL_BODY', 2, 'Cuerpo completo'],
    ['FULL_BODY_ABC', 1, 'Cuerpo completo A'],
    ['FULL_BODY_ABC', 3, 'Cuerpo completo C'],
    ['UPPER_LOWER', 1, 'Superior A'],
    ['UPPER_LOWER', 2, 'Inferior A'],
    ['UPPER_LOWER', 3, 'Superior B'],
    ['UPPER_LOWER', 4, 'Inferior B'],
    ['UPPER_LOWER_CONDITIONING', 3, 'Acondicionamiento'],
    ['UPPER_LOWER_CONDITIONING', 5, 'Inferior B'],
    ['PUSH_PULL_LEGS', 5, 'Sesión 5'],
  ] as const)('%s, día %i: %s', (split, day, name) => {
    expect(sessionName(split, day)).toBe(name);
  });
});

describe('RN-F14 · propuesta automática', () => {
  it('con 2 días toma los bloques de los días 1 y 2', () => {
    const { days, split } = proposeRoutine({ level: 'BEGINNER', daysPerWeek: 2 }, CHOICES);

    expect(split).toBe('FULL_BODY');
    expect(days.map(({ name }) => name)).toEqual(['Cuerpo completo', 'Cuerpo completo']);
    expect(days[1]?.blocks[0]?.pattern).toBe('HINGE');
  });

  it('con 3 días son las sesiones A, B y C', () => {
    const { days } = proposeRoutine({ level: 'INTERMEDIATE', daysPerWeek: 3 }, CHOICES);

    expect(days.map(({ name }) => name)).toEqual([
      'Cuerpo completo A',
      'Cuerpo completo B',
      'Cuerpo completo C',
    ]);
  });

  it('con 3 días, ocho bloques por día de la V3, numerados, con el ejercicio del nivel', () => {
    const { days } = proposeRoutine({ level: 'ADVANCED', daysPerWeek: 3 }, CHOICES);

    for (const { blocks } of days) {
      expect(blocks.map(({ order }) => order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    }
    expect(days[0]?.blocks[0]?.suggested?.exerciseName).toBe('Sentadilla trasera');
  });

  it('P-34 · con 4 días, superior e inferior A y B, con los bloques de la hoja', () => {
    const { days, split } = proposeRoutine({ level: 'INTERMEDIATE', daysPerWeek: 4 }, CHOICES);

    expect(split).toBe('UPPER_LOWER');
    expect(days.map(({ name, blocks }) => [name, blocks.map(({ pattern }) => pattern)])).toEqual([
      [
        'Superior A',
        [
          'HORIZONTAL_PUSH',
          'HORIZONTAL_PULL',
          'VERTICAL_PUSH',
          'VERTICAL_PULL',
          'CORE_ANTI_ROTATION',
        ],
      ],
      ['Inferior A', ['SQUAT', 'HIP_EXTENSION', 'KNEE_FLEXION', 'UNILATERAL', 'CALF']],
      [
        'Superior B',
        ['HORIZONTAL_PUSH', 'HORIZONTAL_PULL', 'VERTICAL_PULL', 'SHOULDER', 'BICEPS', 'TRICEPS'],
      ],
      ['Inferior B', ['SQUAT', 'HINGE', 'KNEE_EXTENSION', 'KNEE_FLEXION', 'CORE_ANTI_EXTENSION']],
    ]);
  });

  it('P-34 · con 5 días, lo mismo con el acondicionamiento el día 3 (decisión de Rodrigo, 2026-11-11)', () => {
    const { days, split } = proposeRoutine({ level: 'ADVANCED', daysPerWeek: 5 }, CHOICES);

    expect(split).toBe('UPPER_LOWER_CONDITIONING');
    expect(days.map(({ name }) => name)).toEqual([
      'Superior A',
      'Inferior A',
      'Acondicionamiento',
      'Superior B',
      'Inferior B',
    ]);
    expect(
      days[2]?.blocks.map(({ pattern, tempo, restSeconds }) => [pattern, tempo, restSeconds]),
    ).toEqual([
      ['CONDITIONING', 'Continuo', 0],
      ['SHOULDER_MOBILITY', '2-1-2', 45],
      ['THORACIC_MOBILITY', 'Controlado', 45],
      ['LUMBAR_STABILITY', 'Controlado', 45],
      ['CORE_ANTI_ROTATION', 'Isométrico', 45],
    ]);
  });

  it('P-34 · el tempo y el descanso de cada bloque son los de su patrón, como la hoja', () => {
    const { days } = proposeRoutine({ level: 'INTERMEDIATE', daysPerWeek: 4 }, CHOICES);
    const inferiorA = days[1]?.blocks.map(({ tempo, restSeconds }) => [tempo, restSeconds]);

    // Prensa 3-1-1 y 120 s, hip thrust 2-1-2 y 120 s, curl femoral 2-1-2 y 75 s, split squat 3-1-1 y 90 s, talones 2-1-2 y 60 s.
    expect(inferiorA).toEqual([
      ['3-1-1', 120],
      ['2-1-2', 120],
      ['2-1-2', 75],
      ['3-1-1', 90],
      ['2-1-2', 60],
    ]);
    for (const { blocks } of days) {
      for (const block of blocks) {
        expect(block).toMatchObject({ sets: 3, repsMin: 8, repsMax: 12, loadKind: 'RIR' });
        expect([block.tempo, block.restSeconds]).toEqual([
          PATTERN_BASE[block.pattern].tempo,
          PATTERN_BASE[block.pattern].restSeconds,
        ]);
      }
    }
  });

  it('entre las plantillas están los 20 patrones: los 15 de la V3 en cuerpo completo y los de la hoja con 5 días', () => {
    const used = (daysPerWeek: number) =>
      new Set(
        proposeRoutine({ level: 'BEGINNER', daysPerWeek }, CHOICES).days.flatMap(({ blocks }) =>
          blocks.map(({ pattern }) => pattern),
        ),
      );

    expect([...used(3)].sort()).toEqual(
      MOVEMENT_PATTERNS.filter((pattern) => !PILOT_PATTERNS.includes(pattern)).sort(),
    );
    expect(new Set([...used(3), ...used(5)])).toEqual(new Set(MOVEMENT_PATTERNS));
  });

  it('un bloque sin fila en la tabla queda sin sugerencia: lo elige el coach', () => {
    const { days } = proposeRoutine({ level: 'BEGINNER', daysPerWeek: 2 }, []);

    expect(days[0]?.blocks[0]?.suggested).toBeNull();
  });

  it.each([0, 6, 2.5])('la plantilla no tiene %d días por semana', (daysPerWeek) => {
    expect(() => proposeRoutine({ level: 'BEGINNER', daysPerWeek }, CHOICES)).toThrow(RangeError);
  });
});

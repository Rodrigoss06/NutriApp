import { describe, expect, it } from 'vitest';
import { patternChoiceSeed } from '../../test/support.js';
import {
  MOVEMENT_PATTERNS,
  proposeRoutine,
  routineSplit,
  sessionName,
  suggestedExercise,
  TRAINING_LEVELS,
} from './routine-proposal.js';

const CHOICES = patternChoiceSeed();

describe('RN-F14 · tabla patrón × nivel de la V3 (07 §5)', () => {
  it('tiene un ejercicio para cada uno de los 15 patrones en cada nivel', () => {
    expect(CHOICES).toHaveLength(45);
    for (const pattern of MOVEMENT_PATTERNS) {
      for (const level of TRAINING_LEVELS) {
        expect(suggestedExercise(CHOICES, pattern, level)).not.toBeNull();
      }
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
    ['UPPER_LOWER', 1, 'Superior'],
    ['UPPER_LOWER', 2, 'Inferior'],
    ['UPPER_LOWER', 3, 'Superior'],
    ['UPPER_LOWER', 4, 'Inferior'],
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

  it('P-04: con 5 días el quinto son las fórmulas de la hoja, de «Sesión 1» a «Sesión 5»', () => {
    const { days, split } = proposeRoutine({ level: 'ADVANCED', daysPerWeek: 5 }, CHOICES);

    expect(split).toBe('PUSH_PULL_LEGS');
    expect(days.map(({ name }) => name)).toEqual([
      'Sesión 1',
      'Sesión 2',
      'Sesión 3',
      'Sesión 4',
      'Sesión 5',
    ]);
    expect(days[4]?.blocks.map(({ pattern }) => pattern)).toEqual([
      'HORIZONTAL_PUSH',
      'HORIZONTAL_PULL',
      'SQUAT',
      'HINGE',
      'SHOULDER',
      'BICEPS',
      'TRICEPS',
      'CONDITIONING',
    ]);
  });

  it('ocho bloques por día, numerados, con el ejercicio del nivel', () => {
    const { days } = proposeRoutine({ level: 'ADVANCED', daysPerWeek: 4 }, CHOICES);

    for (const { blocks } of days) {
      expect(blocks.map(({ order }) => order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    }
    expect(days[0]?.blocks[0]?.suggested?.exerciseName).toBe('Sentadilla trasera');
  });

  it('entre los cuatro días de la plantilla están los 15 patrones', () => {
    const { days } = proposeRoutine({ level: 'BEGINNER', daysPerWeek: 4 }, CHOICES);
    const used = new Set(days.flatMap(({ blocks }) => blocks.map(({ pattern }) => pattern)));

    expect([...used].sort()).toEqual([...MOVEMENT_PATTERNS].sort());
  });

  it('un bloque sin fila en la tabla queda sin sugerencia: lo elige el coach', () => {
    const { days } = proposeRoutine({ level: 'BEGINNER', daysPerWeek: 2 }, []);

    expect(days[0]?.blocks[0]?.suggested).toBeNull();
  });

  it.each([0, 6, 2.5])('la plantilla no tiene %d días por semana', (daysPerWeek) => {
    expect(() => proposeRoutine({ level: 'BEGINNER', daysPerWeek }, CHOICES)).toThrow(RangeError);
  });
});

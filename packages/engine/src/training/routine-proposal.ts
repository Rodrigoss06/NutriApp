/** Los 15 patrones de movimiento de la biblioteca (07 §5), con el mismo código que exercise.movement_pattern. */
export const MOVEMENT_PATTERNS = [
  'SQUAT',
  'HINGE',
  'HIP_EXTENSION',
  'UNILATERAL',
  'HORIZONTAL_PUSH',
  'VERTICAL_PUSH',
  'HORIZONTAL_PULL',
  'VERTICAL_PULL',
  'SHOULDER',
  'BICEPS',
  'TRICEPS',
  'CORE_ANTI_EXTENSION',
  'CORE_ANTI_ROTATION',
  'CALF',
  'CONDITIONING',
] as const;
export type MovementPattern = (typeof MOVEMENT_PATTERNS)[number];

export const TRAINING_LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as const;
export type TrainingLevel = (typeof TRAINING_LEVELS)[number];

export const ROUTINE_SPLITS = [
  'FULL_BODY',
  'FULL_BODY_ABC',
  'UPPER_LOWER',
  'PUSH_PULL_LEGS',
] as const;
export type RoutineSplit = (typeof ROUTINE_SPLITS)[number];

/**
 * Versión de la plantilla de bloques y de sus valores base. Cambiarlos la sube; cada programa propuesto la guarda en su
 * snapshot, como la versión de la tabla de fases (RN-F13).
 */
export const ROUTINE_TEMPLATE_VERSION = '1.0.0';

/** División por días disponibles (RN-F14): 2 o menos, 3, 4 y 5. */
export function routineSplit(daysPerWeek: number): RoutineSplit {
  if (daysPerWeek <= 2) return 'FULL_BODY';
  if (daysPerWeek === 3) return 'FULL_BODY_ABC';
  return daysPerWeek === 4 ? 'UPPER_LOWER' : 'PUSH_PULL_LEGS';
}

/**
 * Ocho bloques por día, en orden (07 §6). El día 5 son las fórmulas de la hoja PRESCRIPCION, cortadas en la V3: sus
 * filas no llegan a mostrarse porque solo la primera lleva el número de día. Jeremy lo confirma en P-04.
 */
const SESSION_TEMPLATE: readonly (readonly MovementPattern[])[] = [
  [
    'SQUAT',
    'HORIZONTAL_PUSH',
    'HORIZONTAL_PULL',
    'HINGE',
    'SHOULDER',
    'CORE_ANTI_EXTENSION',
    'BICEPS',
    'TRICEPS',
  ],
  [
    'HINGE',
    'VERTICAL_PULL',
    'VERTICAL_PUSH',
    'UNILATERAL',
    'HIP_EXTENSION',
    'CORE_ANTI_ROTATION',
    'CALF',
    'CONDITIONING',
  ],
  [
    'SQUAT',
    'HORIZONTAL_PUSH',
    'HORIZONTAL_PULL',
    'HINGE',
    'VERTICAL_PULL',
    'SHOULDER',
    'BICEPS',
    'TRICEPS',
  ],
  [
    'HINGE',
    'UNILATERAL',
    'HIP_EXTENSION',
    'VERTICAL_PUSH',
    'VERTICAL_PULL',
    'CORE_ANTI_EXTENSION',
    'CALF',
    'CONDITIONING',
  ],
  [
    'HORIZONTAL_PUSH',
    'HORIZONTAL_PULL',
    'SQUAT',
    'HINGE',
    'SHOULDER',
    'BICEPS',
    'TRICEPS',
    'CONDITIONING',
  ],
];

export const MAX_DAYS_PER_WEEK = SESSION_TEMPLATE.length;

/** Los valores base de cada bloque (RN-F14): 3 series de 8 a 12 repeticiones, RIR 2, tempo 2-1-2 y 90 s. */
export const BASE_BLOCK = {
  sets: 3,
  repsMin: 8,
  repsMax: 12,
  loadKind: 'RIR',
  loadValue: 2,
  tempo: '2-1-2',
  restSeconds: 90,
} as const;

/** El nombre de cada sesión, como la hoja (07 §6): con 5 días, «Sesión 1» a «Sesión 5». */
export function sessionName(split: RoutineSplit, day: number): string {
  switch (split) {
    case 'FULL_BODY':
      return 'Cuerpo completo';
    case 'FULL_BODY_ABC':
      return `Cuerpo completo ${String.fromCharCode(64 + day)}`;
    case 'UPPER_LOWER':
      return day % 2 === 1 ? 'Superior' : 'Inferior';
    case 'PUSH_PULL_LEGS':
      return `Sesión ${String(day)}`;
  }
}

/** Una fila de la tabla patrón × nivel (exercise.pattern_choice). */
export interface PatternChoice {
  readonly pattern: MovementPattern;
  readonly level: TrainingLevel;
  readonly exerciseCode: string;
  readonly exerciseName: string;
}

/** El ejercicio de la tabla para un patrón y un nivel; null si la tabla no lo tiene. */
export function suggestedExercise<T extends Pick<PatternChoice, 'pattern' | 'level'>>(
  choices: readonly T[],
  pattern: MovementPattern,
  level: TrainingLevel,
): T | null {
  return choices.find((choice) => choice.pattern === pattern && choice.level === level) ?? null;
}

export interface ProposalBlock<T> {
  /** De 1 a 8, en el orden de la plantilla. */
  readonly order: number;
  readonly pattern: MovementPattern;
  /** El de la tabla patrón × nivel; null si la tabla no tiene ese patrón y nivel, y el coach lo elige. */
  readonly suggested: T | null;
  readonly sets: number;
  readonly repsMin: number;
  readonly repsMax: number;
  readonly loadKind: 'RIR';
  readonly loadValue: number;
  readonly tempo: string;
  readonly restSeconds: number;
}

export interface ProposalDay<T> {
  readonly day: number;
  readonly name: string;
  readonly blocks: readonly ProposalBlock<T>[];
}

export interface RoutineProposal<T> {
  readonly split: RoutineSplit;
  readonly templateVersion: string;
  readonly days: readonly ProposalDay<T>[];
}

/**
 * La propuesta automática (RN-F14, 07 §6): división por días, bloques por patrón y ejercicio por patrón y nivel, con
 * los valores base. El objetivo no la cambia: elige la tabla de fases. Es una propuesta: el coach aprueba o sustituye.
 */
export function proposeRoutine<T extends Pick<PatternChoice, 'pattern' | 'level'>>(
  profile: { readonly level: TrainingLevel; readonly daysPerWeek: number },
  choices: readonly T[],
): RoutineProposal<T> {
  const { level, daysPerWeek } = profile;
  if (!Number.isInteger(daysPerWeek) || daysPerWeek < 1 || daysPerWeek > MAX_DAYS_PER_WEEK) {
    throw new RangeError(`La plantilla no tiene ${String(daysPerWeek)} días por semana.`);
  }
  const split = routineSplit(daysPerWeek);
  return {
    split,
    templateVersion: ROUTINE_TEMPLATE_VERSION,
    days: SESSION_TEMPLATE.slice(0, daysPerWeek).map((patterns, index) => ({
      day: index + 1,
      name: sessionName(split, index + 1),
      blocks: patterns.map((pattern, position) => ({
        ...BASE_BLOCK,
        order: position + 1,
        pattern,
        suggested: suggestedExercise(choices, pattern, level),
      })),
    })),
  };
}

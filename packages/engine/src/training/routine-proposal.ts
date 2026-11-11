/**
 * Los 20 patrones de movimiento de la biblioteca (07 §5), con el mismo código que exercise.movement_pattern: los 15 de la V3, las
 * movilidades de hombro y torácica y la estabilidad lumbar de la hoja piloto (P-34; ADR-111), y la flexión y la extensión de
 * rodilla de sus sesiones de pierna (ADR-112).
 */
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
  'SHOULDER_MOBILITY',
  'THORACIC_MOBILITY',
  'LUMBAR_STABILITY',
  'KNEE_FLEXION',
  'KNEE_EXTENSION',
] as const;
export type MovementPattern = (typeof MOVEMENT_PATTERNS)[number];

export const TRAINING_LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as const;
export type TrainingLevel = (typeof TRAINING_LEVELS)[number];

/** `PUSH_PULL_LEGS` era la división de 5 días de la plantilla 1.0.0: queda para los programas que ya la guardaron. */
export const ROUTINE_SPLITS = [
  'FULL_BODY',
  'FULL_BODY_ABC',
  'UPPER_LOWER',
  'UPPER_LOWER_CONDITIONING',
  'PUSH_PULL_LEGS',
] as const;
export type RoutineSplit = (typeof ROUTINE_SPLITS)[number];

/**
 * Versión de la plantilla de bloques y de sus valores base. Cambiarlos la sube; cada programa propuesto la guarda en su
 * snapshot, como la versión de la tabla de fases (RN-F13). 2.0.0: las sesiones de 4 y 5 días y el tempo y el descanso de cada
 * patrón, de la hoja piloto (P-34; ADR-112).
 */
export const ROUTINE_TEMPLATE_VERSION = '2.0.0';

/**
 * División por días disponibles (RN-F14): 2 o menos, cuerpo completo; 3, cuerpo completo A, B y C; 4, superior e inferior;
 * 5, lo mismo con un día de acondicionamiento (P-34, decisión de Rodrigo del 2026-11-11).
 */
export function routineSplit(daysPerWeek: number): RoutineSplit {
  if (daysPerWeek <= 2) return 'FULL_BODY';
  if (daysPerWeek === 3) return 'FULL_BODY_ABC';
  return daysPerWeek === 4 ? 'UPPER_LOWER' : 'UPPER_LOWER_CONDITIONING';
}

/** Ocho bloques por día, en orden: los días 1 a 3 de la plantilla de la V3 (07 §6), para cuerpo completo. */
const FULL_BODY_TEMPLATE: readonly (readonly MovementPattern[])[] = [
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
];

/** Un bloque de la plantilla: su patrón y, si la hoja le da otro tempo u otro descanso que el del patrón, esos. */
interface TemplateBlock {
  readonly pattern: MovementPattern;
  readonly tempo?: string;
  readonly restSeconds?: number;
}

interface TemplateSession {
  readonly name: string;
  readonly blocks: readonly TemplateBlock[];
}

const blocksOf = (...patterns: MovementPattern[]): readonly TemplateBlock[] =>
  patterns.map((pattern) => ({ pattern }));

/**
 * Las sesiones de la prescripción de la hoja piloto (P-34), con sus bloques en orden: hasta 8, y se muestran los de la hoja, sin
 * los vacíos. «Brazos» son dos bloques, Bíceps y Tríceps, como en la app (ADR-111).
 */
const SUPERIOR_A: TemplateSession = {
  name: 'Superior A',
  blocks: blocksOf(
    'HORIZONTAL_PUSH',
    'HORIZONTAL_PULL',
    'VERTICAL_PUSH',
    'VERTICAL_PULL',
    'CORE_ANTI_ROTATION',
  ),
};
const INFERIOR_A: TemplateSession = {
  name: 'Inferior A',
  blocks: blocksOf('SQUAT', 'HIP_EXTENSION', 'KNEE_FLEXION', 'UNILATERAL', 'CALF'),
};
const SUPERIOR_B: TemplateSession = {
  name: 'Superior B',
  blocks: blocksOf(
    'HORIZONTAL_PUSH',
    'HORIZONTAL_PULL',
    'VERTICAL_PULL',
    'SHOULDER',
    'BICEPS',
    'TRICEPS',
  ),
};
const INFERIOR_B: TemplateSession = {
  name: 'Inferior B',
  blocks: blocksOf('SQUAT', 'HINGE', 'KNEE_EXTENSION', 'KNEE_FLEXION', 'CORE_ANTI_EXTENSION'),
};
/** El press Pallof del acondicionamiento es isométrico, con 45 s, como la movilidad de ese día. */
const CONDITIONING_DAY: TemplateSession = {
  name: 'Acondicionamiento',
  blocks: [
    ...blocksOf('CONDITIONING', 'SHOULDER_MOBILITY', 'THORACIC_MOBILITY', 'LUMBAR_STABILITY'),
    { pattern: 'CORE_ANTI_ROTATION', tempo: 'Isométrico', restSeconds: 45 },
  ],
};

/** La plantilla tiene hasta 5 días por semana. */
export const MAX_DAYS_PER_WEEK = 5;

/**
 * Los valores base de cada bloque (RN-F14): 3 series de 8 a 12 repeticiones y RIR 2, que la semana cambia por su factor y su RIR
 * (RN-F13). El tempo y el descanso son los del patrón (`PATTERN_BASE`).
 */
export const BASE_BLOCK = {
  sets: 3,
  repsMin: 8,
  repsMax: 12,
  loadKind: 'RIR',
  loadValue: 2,
} as const;

/**
 * El tempo y el descanso base de cada patrón, de la prescripción de la hoja piloto (P-34; respuesta de Jeremy del 2026-11-10 y
 * decisión de Rodrigo del 2026-11-11).
 */
export const PATTERN_BASE: Readonly<
  Record<MovementPattern, { readonly tempo: string; readonly restSeconds: number }>
> = {
  SQUAT: { tempo: '3-1-1', restSeconds: 120 },
  HINGE: { tempo: '3-1-1', restSeconds: 90 },
  HIP_EXTENSION: { tempo: '2-1-2', restSeconds: 120 },
  UNILATERAL: { tempo: '3-1-1', restSeconds: 90 },
  KNEE_FLEXION: { tempo: '2-1-2', restSeconds: 75 },
  KNEE_EXTENSION: { tempo: '2-1-2', restSeconds: 75 },
  HORIZONTAL_PUSH: { tempo: '3-1-1', restSeconds: 90 },
  VERTICAL_PUSH: { tempo: '2-1-2', restSeconds: 75 },
  HORIZONTAL_PULL: { tempo: '2-1-2', restSeconds: 90 },
  VERTICAL_PULL: { tempo: '2-1-2', restSeconds: 75 },
  SHOULDER: { tempo: '2-1-2', restSeconds: 60 },
  BICEPS: { tempo: '2-1-2', restSeconds: 60 },
  TRICEPS: { tempo: '2-1-2', restSeconds: 60 },
  CORE_ANTI_EXTENSION: { tempo: 'Controlado', restSeconds: 60 },
  CORE_ANTI_ROTATION: { tempo: '2-1-2', restSeconds: 60 },
  CALF: { tempo: '2-1-2', restSeconds: 60 },
  CONDITIONING: { tempo: 'Continuo', restSeconds: 0 },
  SHOULDER_MOBILITY: { tempo: '2-1-2', restSeconds: 45 },
  THORACIC_MOBILITY: { tempo: 'Controlado', restSeconds: 45 },
  LUMBAR_STABILITY: { tempo: 'Controlado', restSeconds: 45 },
};

/** Las sesiones de cada división, en orden. */
function templateSessions(split: RoutineSplit, daysPerWeek: number): readonly TemplateSession[] {
  switch (split) {
    case 'UPPER_LOWER':
      return [SUPERIOR_A, INFERIOR_A, SUPERIOR_B, INFERIOR_B];
    case 'UPPER_LOWER_CONDITIONING':
    case 'PUSH_PULL_LEGS':
      return [SUPERIOR_A, INFERIOR_A, CONDITIONING_DAY, SUPERIOR_B, INFERIOR_B];
    case 'FULL_BODY':
    case 'FULL_BODY_ABC':
      return FULL_BODY_TEMPLATE.slice(0, daysPerWeek).map((patterns, index) => ({
        name: sessionName(split, index + 1),
        blocks: blocksOf(...patterns),
      }));
  }
}

/** El nombre de cada sesión: con 4 días, Superior A, Inferior A, Superior B e Inferior B; con 5, el acondicionamiento en medio. */
export function sessionName(split: RoutineSplit, day: number): string {
  switch (split) {
    case 'FULL_BODY':
      return 'Cuerpo completo';
    case 'FULL_BODY_ABC':
      return `Cuerpo completo ${String.fromCharCode(64 + day)}`;
    case 'UPPER_LOWER':
      return (
        ['Superior A', 'Inferior A', 'Superior B', 'Inferior B'][day - 1] ?? `Sesión ${String(day)}`
      );
    case 'UPPER_LOWER_CONDITIONING':
      return (
        ['Superior A', 'Inferior A', 'Acondicionamiento', 'Superior B', 'Inferior B'][day - 1] ??
        `Sesión ${String(day)}`
      );
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
 * La propuesta automática (RN-F14, 07 §6): división por días, bloques por patrón y ejercicio por patrón y nivel, con los valores
 * base y el tempo y el descanso de cada patrón. El objetivo no la cambia: elige la tabla de fases. Es una propuesta: el coach
 * aprueba o sustituye.
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
    days: templateSessions(split, daysPerWeek).map((session, index) => ({
      day: index + 1,
      name: session.name,
      blocks: session.blocks.map((block, position) => ({
        ...BASE_BLOCK,
        tempo: block.tempo ?? PATTERN_BASE[block.pattern].tempo,
        restSeconds: block.restSeconds ?? PATTERN_BASE[block.pattern].restSeconds,
        order: position + 1,
        pattern: block.pattern,
        suggested: suggestedExercise(choices, block.pattern, level),
      })),
    })),
  };
}

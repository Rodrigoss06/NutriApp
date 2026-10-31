import {
  MEDICAL_CLEARANCES,
  MOVEMENT_PATTERNS,
  MOVEMENT_TEST_STATUSES,
  PRESCRIPTION_STATUSES,
  PROFILE_DOMAINS,
  REVIEW_KINDS,
  ROUTINE_SPLITS,
  SCREENING_DECISIONS,
  SCREENING_STATUSES,
  TRAINING_INTENSITIES,
  TRAINING_LEVELS,
  TRAINING_OBJECTIVES,
  type PerformanceClasses,
} from '@nutricoach/engine';
import { describe, expect, it } from 'vitest';
import {
  EXERCISE_BASE_MEASURES,
  EXERCISE_MODALITIES,
  MOVEMENT_PATTERNS as CONTRACT_PATTERNS,
  TRAINING_LEVELS as CONTRACT_LEVELS,
} from '../exercise/library.js';
import {
  EXERCISE_BASE_MEASURE_LABELS,
  EXERCISE_MODALITY_LABELS,
  MEDICAL_CLEARANCE_LABELS,
  MOVEMENT_PATTERN_LABELS,
  MOVEMENT_TEST_STATUS_LABELS,
  PERFORMANCE_CLASS_LABELS,
  PRESCRIPTION_STATUS_LABELS,
  PROFILE_DOMAIN_LABELS,
  REVIEW_KIND_LABELS,
  ROUTINE_SPLIT_LABELS,
  SCREENING_DECISION_LABELS,
  SCREENING_STATUS_LABELS,
  TRAINING_INTENSITY_LABELS,
  TRAINING_LEVEL_LABELS,
  TRAINING_OBJECTIVE_LABELS,
} from './labels.js';

// Si el motor agrega una clase o un valor, esto deja de compilar.
PERFORMANCE_CLASS_LABELS satisfies {
  readonly [K in keyof PerformanceClasses]: {
    readonly values: Record<NonNullable<PerformanceClasses[K]>, string>;
  };
};

describe('07 §5 · los códigos de los contratos son los del motor', () => {
  it('patrones y niveles', () => {
    expect(CONTRACT_PATTERNS).toEqual(MOVEMENT_PATTERNS);
    expect(CONTRACT_LEVELS).toEqual(TRAINING_LEVELS);
  });
});

describe('RN-D02 · cada código del motor tiene su texto', () => {
  it.each([
    ['objetivos', TRAINING_OBJECTIVE_LABELS, TRAINING_OBJECTIVES],
    ['niveles', TRAINING_LEVEL_LABELS, TRAINING_LEVELS],
    ['patrones', MOVEMENT_PATTERN_LABELS, MOVEMENT_PATTERNS],
    ['divisiones', ROUTINE_SPLIT_LABELS, ROUTINE_SPLITS],
    ['intensidades', TRAINING_INTENSITY_LABELS, TRAINING_INTENSITIES],
    ['revisiones', REVIEW_KIND_LABELS, REVIEW_KINDS],
    ['altas médicas', MEDICAL_CLEARANCE_LABELS, MEDICAL_CLEARANCES],
    ['cribados', SCREENING_STATUS_LABELS, SCREENING_STATUSES],
    ['decisiones del coach', SCREENING_DECISION_LABELS, SCREENING_DECISIONS],
    ['pruebas posturales', MOVEMENT_TEST_STATUS_LABELS, MOVEMENT_TEST_STATUSES],
    ['estados de la propuesta', PRESCRIPTION_STATUS_LABELS, PRESCRIPTION_STATUSES],
    ['dominios', PROFILE_DOMAIN_LABELS, PROFILE_DOMAINS],
    ['modalidades', EXERCISE_MODALITY_LABELS, EXERCISE_MODALITIES],
    ['medidas', EXERCISE_BASE_MEASURE_LABELS, EXERCISE_BASE_MEASURES],
  ] as const)('%s: ni falta ni sobra ninguno', (_name, labels, codes) => {
    expect(Object.keys(labels).sort()).toEqual([...codes].sort());
  });
});

/** Los códigos de los casos dorados se leen con las palabras de la plantilla V3 (Notion 03, G-29 a G-35 y G-40). */
describe('RN-D02 · los textos de los casos dorados son los de la V3', () => {
  it('G-29: moderada-alta y «Control y ajuste»', () => {
    expect(TRAINING_INTENSITY_LABELS.MODERATE_HIGH).toBe('Moderada-alta');
    expect(REVIEW_KIND_LABELS.CONTROL).toBe('Control y ajuste');
  });

  it('G-31: las cuatro divisiones', () => {
    expect(Object.values(ROUTINE_SPLIT_LABELS)).toEqual([
      'Cuerpo completo',
      'Cuerpo completo A/B/C',
      'Superior / inferior',
      'Push / pull / legs + complementos',
    ]);
  });

  it('G-33: los estados de la propuesta', () => {
    expect(PRESCRIPTION_STATUS_LABELS.BLOCKED_CLEARANCE).toBe('BLOQUEADO · ALTA PENDIENTE');
    expect(PRESCRIPTION_STATUS_LABELS.BLOCKED_PAIN).toBe('BLOQUEADO · REVISAR DOLOR');
    expect(PRESCRIPTION_STATUS_LABELS.BLOCKED_SCREENING).toBe('BLOQUEADO · CRIBADO SIN REVISAR');
    expect(PRESCRIPTION_STATUS_LABELS.PENDING_APPROVAL).toBe('PENDIENTE DE APROBACIÓN');
  });

  it('G-34: los estados de una prueba postural', () => {
    expect(MOVEMENT_TEST_STATUS_LABELS).toEqual({
      PENDING: 'PENDIENTE',
      REFER: 'DERIVAR / REVISAR',
      MODIFY: 'MODIFICAR',
      CAUTION: 'PRECAUCIÓN',
      FIT: 'APTO',
    });
  });

  it('G-35: rojo, ámbar y verde', () => {
    expect(SCREENING_STATUS_LABELS).toEqual({ GREEN: 'Verde', AMBER: 'Ámbar', RED: 'Rojo' });
  });

  it('G-40: las clases del perfil', () => {
    expect(PERFORMANCE_CLASS_LABELS.recoveryCapacity.values.HIGH).toBe('Alta');
    expect(PERFORMANCE_CLASS_LABELS.volumeTolerance.values.MODERATE).toBe('Moderada');
    expect(PERFORMANCE_CLASS_LABELS.supervision.values.MODERATE).toBe('Moderada');
    expect(PERFORMANCE_CLASS_LABELS.checkIn.values.WEEKLY_OR_BIWEEKLY).toBe('Semanal o quincenal');
    expect(PERFORMANCE_CLASS_LABELS.topPriority.values.LIFESTYLE).toBe('Estilo de vida');
  });
});

/**
 * Los textos del método de JV Fitness (07): el motor y la API hablan con códigos, y estos son los que ve el coach, en el
 * panel y en las fichas, con las palabras de la plantilla V3. La clave es el código del motor (labels.spec.ts lo compara).
 */
export const TRAINING_OBJECTIVE_LABELS = {
  FAT_LOSS: 'Pérdida de grasa o recomposición',
  HYPERTROPHY: 'Hipertrofia',
  STRENGTH: 'Fuerza',
  HEALTH: 'Salud y acondicionamiento',
} as const satisfies Record<string, string>;

export const TRAINING_LEVEL_LABELS = {
  BEGINNER: 'Principiante',
  INTERMEDIATE: 'Intermedio',
  ADVANCED: 'Avanzado',
} as const satisfies Record<string, string>;

export const MOVEMENT_PATTERN_LABELS = {
  SQUAT: 'Sentadilla',
  HINGE: 'Bisagra',
  HIP_EXTENSION: 'Extensión de cadera',
  UNILATERAL: 'Unilateral',
  HORIZONTAL_PUSH: 'Empuje horizontal',
  VERTICAL_PUSH: 'Empuje vertical',
  HORIZONTAL_PULL: 'Tracción horizontal',
  VERTICAL_PULL: 'Tracción vertical',
  SHOULDER: 'Hombro',
  BICEPS: 'Bíceps',
  TRICEPS: 'Tríceps',
  CORE_ANTI_EXTENSION: 'Tronco anti-extensión',
  CORE_ANTI_ROTATION: 'Tronco anti-rotación',
  CALF: 'Pantorrilla',
  CONDITIONING: 'Acondicionamiento',
} as const satisfies Record<string, string>;

export const EXERCISE_MODALITY_LABELS = {
  STRENGTH: 'Fuerza',
  CARDIO: 'Cardio',
  MOBILITY: 'Movilidad',
  PLYOMETRIC: 'Pliometría',
} as const satisfies Record<string, string>;

/** Con qué se miden los valores base de un ejercicio. */
export const EXERCISE_BASE_MEASURE_LABELS = {
  REPS: 'repeticiones',
  SECONDS: 'segundos',
  MINUTES: 'minutos',
} as const satisfies Record<string, string>;

export const ROUTINE_SPLIT_LABELS = {
  FULL_BODY: 'Cuerpo completo',
  FULL_BODY_ABC: 'Cuerpo completo A/B/C',
  UPPER_LOWER: 'Superior / inferior',
  PUSH_PULL_LEGS: 'Push / pull / legs + complementos',
} as const satisfies Record<string, string>;

export const TRAINING_INTENSITY_LABELS = {
  LOW: 'Baja',
  LOW_MODERATE: 'Baja-moderada',
  MODERATE: 'Moderada',
  MODERATE_HIGH: 'Moderada-alta',
  HIGH: 'Alta',
  VERY_HIGH: 'Muy alta',
} as const satisfies Record<string, string>;

export const REVIEW_KIND_LABELS = {
  DAILY: 'Seguimiento diario',
  CONTROL: 'Control y ajuste',
} as const satisfies Record<string, string>;

export const MEDICAL_CLEARANCE_LABELS = {
  PENDING: 'Pendiente',
  CLEARED: 'Apto',
  NOT_REQUIRED: 'No requerida',
} as const satisfies Record<string, string>;

export const SCREENING_STATUS_LABELS = {
  GREEN: 'Verde',
  AMBER: 'Ámbar',
  RED: 'Rojo',
} as const satisfies Record<string, string>;

export const SCREENING_DECISION_LABELS = {
  START: 'Iniciar',
  LIMIT: 'Limitar',
  REFER: 'Derivar',
} as const satisfies Record<string, string>;

export const MOVEMENT_TEST_STATUS_LABELS = {
  PENDING: 'PENDIENTE',
  REFER: 'DERIVAR / REVISAR',
  MODIFY: 'MODIFICAR',
  CAUTION: 'PRECAUCIÓN',
  FIT: 'APTO',
} as const satisfies Record<string, string>;

export const PRESCRIPTION_STATUS_LABELS = {
  BLOCKED_CLEARANCE: 'BLOQUEADO · ALTA PENDIENTE',
  BLOCKED_PAIN: 'BLOQUEADO · REVISAR DOLOR',
  BLOCKED_SCREENING: 'BLOQUEADO · CRIBADO SIN REVISAR',
  BLOCKED_REFERRED: 'BLOQUEADO · DERIVADO',
  PENDING_APPROVAL: 'PENDIENTE DE APROBACIÓN',
  APPROVED: 'APROBADA',
} as const satisfies Record<string, string>;

export const PROFILE_DOMAIN_LABELS = {
  OBJECTIVE: 'Objetivo',
  AVAILABILITY: 'Disponibilidad',
  EXPERIENCE: 'Experiencia',
  RECOVERY: 'Recuperación',
  LIFESTYLE: 'Estilo de vida',
  NUTRITION: 'Nutrición',
  ADHERENCE: 'Adherencia',
} as const satisfies Record<string, string>;

/** Las clases del perfil de rendimiento (07 §12), con el nombre de cada una y de sus valores. */
export const PERFORMANCE_CLASS_LABELS = {
  recoveryCapacity: {
    label: 'Capacidad de recuperación',
    values: { HIGH: 'Alta', MODERATE: 'Moderada', LOW: 'Baja' },
  },
  availability: {
    label: 'Disponibilidad',
    values: { HIGH: 'Alta', MODERATE: 'Moderada', LIMITED: 'Limitada' },
  },
  experience: {
    label: 'Nivel de experiencia',
    values: {
      ADVANCED: 'Avanzado o autónomo',
      INTERMEDIATE: 'Intermedio',
      BASIC: 'Básico o alta supervisión',
    },
  },
  adherenceRisk: {
    label: 'Riesgo de adherencia',
    values: { LOW: 'Bajo', MODERATE: 'Moderado', HIGH: 'Alto' },
  },
  volumeTolerance: {
    label: 'Tolerancia inicial al volumen',
    values: { HIGH: 'Alta', MODERATE: 'Moderada', CONSERVATIVE: 'Conservadora' },
  },
  supervision: {
    label: 'Necesidad de supervisión',
    values: { LOW: 'Baja', MODERATE: 'Moderada', HIGH: 'Alta' },
  },
  checkIn: {
    label: 'Frecuencia de check-in',
    values: { WEEKLY: 'Semanal', WEEKLY_OR_BIWEEKLY: 'Semanal o quincenal', BIWEEKLY: 'Quincenal' },
  },
  topPriority: { label: 'Prioridad principal', values: PROFILE_DOMAIN_LABELS },
} as const satisfies Record<
  string,
  { readonly label: string; readonly values: Record<string, string> }
>;

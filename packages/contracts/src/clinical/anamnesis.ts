import { z } from 'zod';

/**
 * Anamnesis integral de JV Fitness, versión 2 de la historia clínica (RF-43, 07 §12), según la hoja `01_Form_Anamnesis`.
 * No vuelve a pedir correo, nombre, teléfono ni fecha de nacimiento (ID01 a ID04): ya están en la ficha. Se guarda aunque
 * falten respuestas: las vacías no cuentan (RN-F16).
 */
export const ANAMNESIS_FORM = { code: 'JV_ANAMNESIS', version: 'V2' } as const;

export const ANAMNESIS_MODALITIES = ['IN_PERSON', 'ONLINE'] as const;
export type AnamnesisModality = (typeof ANAMNESIS_MODALITIES)[number];
export const ANAMNESIS_MODALITY_LABELS = {
  IN_PERSON: 'Presencial',
  ONLINE: 'Online',
} as const satisfies Record<AnamnesisModality, string>;

/** Objetivo principal: «Rendimiento» y «Otro» no tienen tabla de fases, el coach elige una de las cuatro (P-01). */
const G01_LABELS = {
  FAT_LOSS: 'Pérdida de grasa',
  HYPERTROPHY: 'Hipertrofia',
  STRENGTH: 'Fuerza',
  HEALTH: 'Salud / fitness',
  PERFORMANCE: 'Rendimiento',
  OTHER: 'Otro',
} as const;
const E01_LABELS = {
  LT_3M: 'Menos de 3 meses',
  M3_12: '3 a 12 meses',
  Y1_3: '1 a 3 años',
  GT_3Y: 'Más de 3 años',
} as const;
const E02_LABELS = {
  CONSISTENT: 'Consistente',
  INTERMITTENT: 'Intermitente',
  INACTIVE: 'Inactivo',
} as const;
const L03_LABELS = {
  NO: 'No',
  OCCASIONAL: 'Ocasional',
  WEEKLY: 'Semanal',
  FREQUENT: 'Frecuente',
} as const;
const L04_LABELS = { NO: 'No', YES: 'Sí' } as const;
const N01_LABELS = {
  STRUCTURED: 'Estructurado',
  VARIABLE: 'Variable',
  RESTRICTIVE: 'Restrictivo',
  OTHER: 'Otro',
} as const;
const N02_LABELS = { RARELY: 'Rara vez', SOMETIMES: 'A veces', USUALLY: 'Habitualmente' } as const;
const N03_LABELS = { LOW: 'Bajo', MODERATE: 'Moderado', HIGH: 'Alto' } as const;

const LIMITS = {
  A01: { min: 0, max: 7, integer: true },
  A02: { min: 0, max: 600, integer: true },
  R01: { min: 0, max: 24, integer: false },
  L01: { min: 0, max: 24, integer: false },
  L02: { min: 0, max: 100_000, integer: true },
  N04: { min: 0, max: 20, integer: false },
} as const;

const SHORT_TEXT = 200;
const LONG_TEXT = 2_000;

const scale = z.number().int().min(1).max(5).optional();
const short = z.string().trim().max(SHORT_TEXT).optional();
const long = z.string().trim().max(LONG_TEXT).optional();
const quantity = ({ min, max, integer }: { min: number; max: number; integer: boolean }) =>
  (integer ? z.number().int() : z.number()).min(min).max(max).optional();
const oneOf = <TLabels extends Record<string, string>>(labels: TLabels) =>
  z.enum(Object.keys(labels) as [keyof TLabels & string, ...(keyof TLabels & string)[]]).optional();

/** Cada código es el de la hoja. Lo que no se respondió no viaja. */
export const anamnesisAnswersV2Schema = z.strictObject({
  modality: z.enum(ANAMNESIS_MODALITIES),
  ID05: short,
  G01: oneOf(G01_LABELS),
  G02: long,
  G03: scale,
  G04: scale,
  G05: short,
  G06: long,
  A01: quantity(LIMITS.A01),
  A02: quantity(LIMITS.A02),
  A03: scale,
  A04: scale,
  A05: long,
  E01: oneOf(E01_LABELS),
  E02: oneOf(E02_LABELS),
  E03: scale,
  E04: scale,
  E05: long,
  E06: long,
  R01: quantity(LIMITS.R01),
  R02: scale,
  R03: scale,
  R04: scale,
  R05: scale,
  R06: scale,
  R07: long,
  L01: quantity(LIMITS.L01),
  L02: quantity(LIMITS.L02),
  L03: oneOf(L03_LABELS),
  L04: oneOf(L04_LABELS),
  L05: long,
  N01: oneOf(N01_LABELS),
  N02: oneOf(N02_LABELS),
  N03: oneOf(N03_LABELS),
  N04: quantity(LIMITS.N04),
  N05: long,
  N06: long,
  H01: scale,
  H02: scale,
  H03: scale,
  H04: scale,
  H05: scale,
  H06: long,
  H07: long,
});
export type AnamnesisAnswersV2 = z.infer<typeof anamnesisAnswersV2Schema>;
export type AnamnesisCode = Exclude<keyof AnamnesisAnswersV2, 'modality'>;

export type AnamnesisQuestion = {
  readonly code: AnamnesisCode;
  readonly label: string;
  readonly hint?: string;
} & (
  | { readonly kind: 'SCALE'; readonly low: string; readonly high: string }
  | {
      readonly kind: 'NUMBER';
      readonly min: number;
      readonly max: number;
      readonly integer: boolean;
    }
  | { readonly kind: 'OPTIONS'; readonly options: Readonly<Record<string, string>> }
  | { readonly kind: 'TEXT'; readonly long: boolean; readonly maxLength: number }
);

const scaleOf = (
  code: AnamnesisCode,
  label: string,
  low: string,
  high: string,
): AnamnesisQuestion => ({ code, label, kind: 'SCALE', low, high });
const textOf = (code: AnamnesisCode, label: string, hint?: string): AnamnesisQuestion => ({
  code,
  label,
  kind: 'TEXT',
  long: true,
  maxLength: LONG_TEXT,
  ...(hint ? { hint } : {}),
});

/** Las preguntas de la hoja, en su orden y con su texto: lo que ve el coach y lo que se muestra al leer una revisión. */
export const ANAMNESIS_SECTIONS: readonly {
  readonly title: string;
  readonly questions: readonly AnamnesisQuestion[];
}[] = [
  {
    title: 'Identificación',
    questions: [
      {
        code: 'ID05',
        label: 'Ocupación',
        kind: 'TEXT',
        long: false,
        maxLength: SHORT_TEXT,
      },
    ],
  },
  {
    title: 'Objetivos y expectativas',
    questions: [
      { code: 'G01', label: 'Objetivo principal', kind: 'OPTIONS', options: G01_LABELS },
      textOf('G02', 'Describe con precisión qué quieres conseguir'),
      scaleOf('G03', '¿Qué prioridad tiene este proceso para ti?', 'Muy baja', 'Máxima'),
      scaleOf('G04', '¿Qué confianza tienes en poder cumplir el proceso?', 'Muy baja', 'Muy alta'),
      {
        code: 'G05',
        label: '¿Tienes una fecha u horizonte objetivo?',
        kind: 'TEXT',
        long: false,
        maxLength: SHORT_TEXT,
      },
      textOf('G06', '¿Cómo sabremos objetivamente que el proceso funcionó?'),
    ],
  },
  {
    title: 'Disponibilidad y logística de entrenamiento',
    questions: [
      {
        code: 'A01',
        label: 'Días reales disponibles para entrenar por semana',
        kind: 'NUMBER',
        ...LIMITS.A01,
        hint: 'Número entero.',
      },
      {
        code: 'A02',
        label: 'Tiempo real disponible por sesión en minutos',
        kind: 'NUMBER',
        ...LIMITS.A02,
      },
      scaleOf('A03', 'Estabilidad de tus horarios', 'Muy inestables', 'Muy estables'),
      scaleOf('A04', 'Acceso al equipamiento que necesitas', 'Muy limitado', 'Completo'),
      textOf('A05', 'Días y horarios preferentes'),
    ],
  },
  {
    title: 'Historial de entrenamiento',
    questions: [
      {
        code: 'E01',
        label: 'Experiencia acumulada con entrenamiento de fuerza',
        kind: 'OPTIONS',
        options: E01_LABELS,
      },
      {
        code: 'E02',
        label: 'Consistencia en los últimos 12 meses',
        kind: 'OPTIONS',
        options: E02_LABELS,
      },
      scaleOf('E03', 'Confianza técnica en patrones básicos', 'Muy baja', 'Muy alta'),
      scaleOf('E04', 'Capacidad de entrenar sin supervisión constante', 'Muy baja', 'Muy alta'),
      textOf('E05', 'Ejercicios o métodos que te han funcionado bien'),
      textOf('E06', 'Ejercicios que evitas, no toleras o no disfrutas'),
    ],
  },
  {
    title: 'Sueño, recuperación y carga de vida',
    questions: [
      {
        code: 'R01',
        label: 'Horas promedio de sueño por noche',
        kind: 'NUMBER',
        ...LIMITS.R01,
        hint: 'Puede incluir decimales.',
      },
      scaleOf('R02', 'Calidad percibida del sueño', 'Muy mala', 'Muy buena'),
      scaleOf('R03', 'Energía diaria habitual', 'Muy baja', 'Muy alta'),
      scaleOf('R04', 'Estrés habitual', 'Muy bajo', 'Muy alto'),
      scaleOf('R05', 'Fatiga general actual', 'Muy baja', 'Muy alta'),
      scaleOf('R06', 'Motivación para entrenar', 'Muy baja', 'Muy alta'),
      textOf('R07', 'Principales fuentes de estrés o factores que afectan tu recuperación'),
    ],
  },
  {
    title: 'Estilo de vida y actividad cotidiana',
    questions: [
      { code: 'L01', label: 'Horas aproximadas sentado/a al día', kind: 'NUMBER', ...LIMITS.L01 },
      {
        code: 'L02',
        label: 'Pasos diarios aproximados (si los conoces)',
        kind: 'NUMBER',
        ...LIMITS.L02,
      },
      {
        code: 'L03',
        label: 'Frecuencia habitual de alcohol',
        kind: 'OPTIONS',
        options: L03_LABELS,
      },
      { code: 'L04', label: '¿Consumes tabaco o nicotina?', kind: 'OPTIONS', options: L04_LABELS },
      textOf('L05', 'Otras actividades que afecten carga o recuperación'),
    ],
  },
  {
    title: 'Nutrición e hidratación — revisión educativa',
    questions: [
      {
        code: 'N01',
        label: 'Estructura general de tu alimentación',
        kind: 'OPTIONS',
        options: N01_LABELS,
      },
      {
        code: 'N02',
        label: '¿Con qué frecuencia incluyes proteína en comidas principales?',
        kind: 'OPTIONS',
        options: N02_LABELS,
      },
      {
        code: 'N03',
        label: 'Consumo habitual de frutas y verduras',
        kind: 'OPTIONS',
        options: N03_LABELS,
      },
      { code: 'N04', label: 'Agua aproximada al día en litros', kind: 'NUMBER', ...LIMITS.N04 },
      textOf(
        'N05',
        'Alergias, intolerancias, preferencias o restricciones alimentarias',
        'Las alergias e intolerancias también se registran en «Condiciones, objetivos y notas».',
      ),
      textOf('N06', 'Principal dificultad actual con la alimentación'),
    ],
  },
  {
    title: 'Adherencia, barreras y soporte',
    questions: [
      scaleOf('H01', 'Capacidad histórica de sostener un plan', 'Muy baja', 'Muy alta'),
      scaleOf('H02', 'Apoyo de tu entorno para cumplir el proceso', 'Muy bajo', 'Muy alto'),
      scaleOf('H03', 'Impacto esperado de tus barreras actuales', 'Muy bajo', 'Muy alto'),
      scaleOf('H04', 'Capacidad para organizar horarios y tareas', 'Muy baja', 'Muy alta'),
      scaleOf('H05', 'Disposición a registrar y reportar tu progreso', 'Muy baja', 'Muy alta'),
      textOf(
        'H06',
        'Principales barreras previstas (trabajo, tiempo, viajes, familia, motivación, etc.)',
      ),
      textOf('H07', '¿Qué esperas del entrenador para que este proceso funcione?'),
    ],
  },
];

/** Los dominios del perfil, con el mismo código que el motor. */
export const PROFILE_DOMAIN_CODES = [
  'OBJECTIVE',
  'AVAILABILITY',
  'EXPERIENCE',
  'RECOVERY',
  'LIFESTYLE',
  'NUTRITION',
  'ADHERENCE',
] as const;

/** Perfil de rendimiento de una revisión (RN-F16): orienta al coach, no prescribe solo. Sin respuestas, null. */
export const performanceProfileSchema = z.object({
  methodCode: z.string(),
  methodVersion: z.string(),
  engineVersion: z.string(),
  pri: z.number().nullable(),
  domainScores: z.record(z.enum(PROFILE_DOMAIN_CODES), z.number().nullable()),
  classes: z.object({
    recoveryCapacity: z.enum(['HIGH', 'MODERATE', 'LOW']).nullable(),
    availability: z.enum(['HIGH', 'MODERATE', 'LIMITED']).nullable(),
    experience: z.enum(['ADVANCED', 'INTERMEDIATE', 'BASIC']).nullable(),
    adherenceRisk: z.enum(['LOW', 'MODERATE', 'HIGH']).nullable(),
    volumeTolerance: z.enum(['HIGH', 'MODERATE', 'CONSERVATIVE']).nullable(),
    supervision: z.enum(['LOW', 'MODERATE', 'HIGH']).nullable(),
    checkIn: z.enum(['WEEKLY', 'WEEKLY_OR_BIWEEKLY', 'BIWEEKLY']).nullable(),
    topPriority: z.enum(PROFILE_DOMAIN_CODES).nullable(),
  }),
  computedAt: z.iso.datetime(),
});
export type PerformanceProfileResponse = z.infer<typeof performanceProfileSchema>;

import { z } from 'zod';
import { upToDecimals } from '../decimals.js';
import { MEAL_SLOTS, PLAN_MODALITIES } from '../nutrition/plan.js';

const isoDate = z.iso.date();
const decimals = (digits: number) =>
  [upToDecimals(digits), `Usa hasta ${String(digits)} decimales.`] as const;

/** RN-G08: cada registro lleva el clientId que generó el celular; un reintento con el mismo no duplica. RN-G04: su día local. */
const recordBase = { clientId: z.uuid(), localDate: isoDate };

/**
 * Lo que el paciente eligió (RN-G05): de su plan (un alimento permitido por intercambios, un alimento de la composición o la
 * opción del menú) o, fuera del plan, del catálogo. Sin porciones ni gramos, los del plan (RN-G06).
 */
export const foodLogSourceSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('EXCHANGE'),
    mealId: z.uuid(),
    groupCode: z.string().trim().min(1).max(20),
    foodId: z.uuid(),
    servings: z
      .number()
      .gt(0)
      .max(20)
      .refine(...decimals(2))
      .nullable()
      .default(null),
  }),
  z.strictObject({
    kind: z.literal('FOOD'),
    mealId: z.uuid(),
    foodId: z.uuid(),
    grams: z
      .number()
      .gt(0)
      .max(5_000)
      .refine(...decimals(2))
      .nullable()
      .default(null),
  }),
  z.strictObject({ kind: z.literal('MENU'), mealId: z.uuid(), option: z.enum(['A', 'B']) }),
  z.strictObject({
    kind: z.literal('CATALOG'),
    mealSlotCode: z.enum(MEAL_SLOTS),
    foodId: z.uuid(),
    grams: z
      .number()
      .gt(0)
      .max(5_000)
      .refine(...decimals(2)),
  }),
]);
export type FoodLogSource = z.input<typeof foodLogSourceSchema>;

/** POST /api/v1/me/food-logs (RN-G05, RN-G06, RN-G10). La opción de un menú guarda un registro por alimento o receta. */
export const logFoodSchema = z.strictObject({ ...recordBase, source: foodLogSourceSchema });
export type LogFood = z.input<typeof logFoodSchema>;

/** POST /api/v1/me/food-logs/:id/correct: el anterior queda anulado y lo nuevo, en su mismo día, lo reemplaza (RN-G12). */
export const correctFoodLogSchema = z.strictObject({
  clientId: z.uuid(),
  source: foodLogSourceSchema,
});
export type CorrectFoodLog = z.input<typeof correctFoodLogSchema>;

/** POST /api/v1/me/hydration-logs: de 1 a 5 000 ml (05.2). */
export const logHydrationSchema = z.strictObject({
  ...recordBase,
  volumeMl: z.number().int().min(1).max(5_000),
});
export type LogHydration = z.input<typeof logHydrationSchema>;

/** POST /api/v1/me/notes: la lee el equipo de atención (RN-G13). Una nota no se anula. */
export const logNoteSchema = z.strictObject({
  ...recordBase,
  body: z.string().trim().min(1).max(2_000),
});
export type LogNote = z.input<typeof logNoteSchema>;

/** Métricas que el paciente registra a mano: el peso en casa, si su app lo permite (content.patient_app_setting). */
export const TRACKED_METRIC_CODES = ['BODY_WEIGHT'] as const;
export type TrackedMetricCode = (typeof TRACKED_METRIC_CODES)[number];

/** POST /api/v1/me/metrics: el peso, de 20 a 300 kg (RN-C04). */
export const logMetricSchema = z.strictObject({
  ...recordBase,
  metricCode: z.enum(TRACKED_METRIC_CODES),
  value: z
    .number()
    .min(20)
    .max(300)
    .refine(...decimals(2)),
});
export type LogMetric = z.input<typeof logMetricSchema>;

export const RECORD_STATUSES = ['ACTIVE', 'VOIDED'] as const;
export const FOOD_LOG_ITEM_TYPES = ['FOOD', 'RECIPE', 'EXCHANGE'] as const;

/** Un total con lo que falta a la vista (RN-I03): sin dato si falta en algún registro, con lo conocido aparte. */
export const dayTotalSchema = z.object({
  value: z.number().nullable(),
  known: z.number(),
  missing: z.number().int(),
});
export type DayTotal = z.infer<typeof dayTotalSchema>;

export const dayTotalsSchema = z.object({
  kcal: dayTotalSchema,
  choG: dayTotalSchema,
  proteinG: dayTotalSchema,
  fatG: dayTotalSchema,
});

export const foodLogSchema = z.object({
  id: z.uuid(),
  clientId: z.uuid(),
  localDate: isoDate,
  loggedAt: z.iso.datetime({ offset: true }),
  mealSlotCode: z.string(),
  planId: z.uuid().nullable(),
  itemType: z.enum(FOOD_LOG_ITEM_TYPES),
  itemName: z.string(),
  exchangeGroupCode: z.string().nullable(),
  servings: z.number().nullable(),
  grams: z.number().nullable(),
  householdText: z.string().nullable(),
  kcal: z.number().nullable(),
  choG: z.number().nullable(),
  proteinG: z.number().nullable(),
  fatG: z.number().nullable(),
  inPlan: z.boolean(),
  status: z.enum(RECORD_STATUSES),
});
export type FoodLog = z.infer<typeof foodLogSchema>;

/** Lo que quedó registrado; en un reintento con el mismo clientId, lo que ya estaba (RN-G08). */
export const foodLogsResponseSchema = z.object({ records: z.array(foodLogSchema) });
export type FoodLogsResponse = z.infer<typeof foodLogsResponseSchema>;

export const hydrationLogSchema = z.object({
  id: z.uuid(),
  clientId: z.uuid(),
  localDate: isoDate,
  loggedAt: z.iso.datetime({ offset: true }),
  volumeMl: z.number().int(),
  status: z.enum(RECORD_STATUSES),
});
export type HydrationLog = z.infer<typeof hydrationLogSchema>;

export const noteLogSchema = z.object({
  id: z.uuid(),
  clientId: z.uuid(),
  localDate: isoDate,
  body: z.string(),
  createdAt: z.iso.datetime({ offset: true }),
});
export type NoteLog = z.infer<typeof noteLogSchema>;

export const metricLogSchema = z.object({
  id: z.uuid(),
  clientId: z.uuid(),
  localDate: isoDate,
  metricCode: z.enum(TRACKED_METRIC_CODES),
  value: z.number(),
  status: z.enum(RECORD_STATUSES),
});
export type MetricLog = z.infer<typeof metricLogSchema>;

const score = z.number().int().min(1).max(5).nullable().default(null);

/**
 * POST /api/v1/me/checkins: el registro diario de entrenamiento y recuperación (RN-G11, 07 §9), uno por día; registrarlo otra vez
 * corrige el del día (RN-G12). Los datos del reloj se cargan a mano y son opcionales. Los síntomas del ciclo, solo con
 * MENSTRUAL_TRACKING (RN-G17).
 */
export const logCheckinSchema = z.strictObject({
  ...recordBase,
  sessionMinutes: z.number().int().min(0).max(600).nullable().default(null),
  sessionRpe: z
    .number()
    .min(0)
    .max(10)
    .refine(...decimals(1))
    .nullable()
    .default(null),
  sleepHours: z
    .number()
    .min(0)
    .max(24)
    .refine((value) => Number.isInteger(value * 2), 'En medias horas.')
    .nullable()
    .default(null),
  fatigue: score,
  soreness: score,
  stress: score,
  motivation: score,
  menstrualSymptoms: z.number().int().min(0).max(3).nullable().default(null),
  nutritionCompliancePct: z.number().int().min(0).max(100).nullable().default(null),
  carbsAroundTrainingG: z
    .number()
    .min(0)
    .max(2_000)
    .refine(...decimals(1))
    .nullable()
    .default(null),
  performancePlanned: z
    .number()
    .min(0)
    .max(99_999_999)
    .refine(...decimals(2))
    .nullable()
    .default(null),
  performanceActual: z
    .number()
    .min(0)
    .max(99_999_999)
    .refine(...decimals(2))
    .nullable()
    .default(null),
  restingHrBpm: z.number().int().min(25).max(220).nullable().default(null),
  hrvMs: z
    .number()
    .positive()
    .max(9_999)
    .refine(...decimals(1))
    .nullable()
    .default(null),
  steps: z.number().int().min(0).max(200_000).nullable().default(null),
  activeKcal: z
    .number()
    .min(0)
    .max(99_999)
    .refine(...decimals(1))
    .nullable()
    .default(null),
});
export type LogCheckin = z.input<typeof logCheckinSchema>;

export const READINESS_INDICATIONS = ['GREEN', 'YELLOW', 'RED', 'NO_DATA'] as const;
export type ReadinessIndication = (typeof READINESS_INDICATIONS)[number];
export const READINESS_COMPONENT_CODES = ['sleep', 'heartRate', 'hrv', 'subjective'] as const;

/** Lo que el paciente ve en Hoy de cada indicación (07 §9): un consejo para el día, que no cambia el plan. */
export const INDICATION_TEXTS: Readonly<
  Record<ReadinessIndication, { readonly label: string; readonly text: string }>
> = {
  GREEN: {
    label: 'Verde · mantener',
    text: 'Entrena según lo planificado. Cumple la sesión planificada.',
  },
  YELLOW: {
    label: 'Amarillo · ajustar 5–15 %',
    text: 'Reduce entre 5 % y 15 % la carga o el volumen, y cuida la recuperación.',
  },
  RED: {
    label: 'Rojo · recuperar / revisar',
    text: 'Prioriza la recuperación, evita forzar y avisa a tu coach si hay dolor o malestar.',
  },
  NO_DATA: {
    label: 'Sin datos suficientes',
    text: 'Completa tu registro diario para recibir una indicación.',
  },
};

/** La nota visible junto al registro diario (07 §9). */
export const READINESS_NOTE =
  'Tus datos de sueño, fatiga, rendimiento y alimentación se usan para ajustar tu semana. El ciclo menstrual solo se registra si tú lo autorizas.';

/** La recuperación e indicación del día, resultado del motor con su método (RN-G14, RN-G15, RN-D01). */
export const readinessSchema = z.object({
  indication: z.enum(READINESS_INDICATIONS),
  readinessScore: z.number().nullable(),
  components: z.object({
    sleep: z.number(),
    heartRate: z.number(),
    hrv: z.number(),
    subjective: z.number(),
  }),
  neutralComponents: z.array(z.enum(READINESS_COMPONENT_CODES)),
  srpeLoad: z.number().nullable(),
  performancePct: z.number().nullable(),
  methodCode: z.string(),
  methodVersion: z.string(),
});
export type Readiness = z.infer<typeof readinessSchema>;

export const checkinSchema = z.object({
  id: z.uuid(),
  clientId: z.uuid(),
  localDate: isoDate,
  sessionMinutes: z.number().nullable(),
  sessionRpe: z.number().nullable(),
  sleepHours: z.number().nullable(),
  fatigue: z.number().nullable(),
  soreness: z.number().nullable(),
  stress: z.number().nullable(),
  motivation: z.number().nullable(),
  menstrualSymptoms: z.number().nullable(),
  nutritionCompliancePct: z.number().nullable(),
  carbsAroundTrainingG: z.number().nullable(),
  performancePlanned: z.number().nullable(),
  performanceActual: z.number().nullable(),
  restingHrBpm: z.number().nullable(),
  hrvMs: z.number().nullable(),
  steps: z.number().nullable(),
  activeKcal: z.number().nullable(),
  status: z.enum(RECORD_STATUSES),
  readiness: readinessSchema.nullable(),
});
export type Checkin = z.infer<typeof checkinSchema>;

export const WORKOUT_OUTCOMES = ['COMPLETED', 'PARTIAL', 'SKIPPED'] as const;

/** Una serie hecha (RF-29): repeticiones, peso, RIR o RPE, estímulo y fatiga; el cardio, en segundos y con MET (RN-F10). */
export const loggedSetSchema = z.strictObject({
  exerciseId: z.uuid(),
  setNo: z.number().int().min(1).max(50),
  isWarmup: z.boolean().default(false),
  reps: z.number().int().min(0).max(600).nullable().default(null),
  loadKg: z
    .number()
    .min(0)
    .max(9_999)
    .refine(...decimals(2))
    .nullable()
    .default(null),
  rir: z.number().int().min(0).max(10).nullable().default(null),
  rpe: z
    .number()
    .min(0)
    .max(10)
    .refine(...decimals(1))
    .nullable()
    .default(null),
  durationSeconds: z.number().int().min(1).max(86_400).nullable().default(null),
  distanceM: z
    .number()
    .positive()
    .max(999_999)
    .refine(...decimals(1))
    .nullable()
    .default(null),
  met: z
    .number()
    .positive()
    .max(99)
    .refine(...decimals(1))
    .nullable()
    .default(null),
  stimulus: score,
  fatigue: score,
});

/** POST /api/v1/me/workouts: una sesión del programa vigente con sus series, su duración y su RPE (RF-29). */
export const logWorkoutSchema = z
  .strictObject({
    ...recordBase,
    sessionId: z.uuid().nullable().default(null),
    outcome: z.enum(WORKOUT_OUTCOMES),
    durationMinutes: z.number().int().min(0).max(600).nullable().default(null),
    sessionRpe: z
      .number()
      .min(0)
      .max(10)
      .refine(...decimals(1))
      .nullable()
      .default(null),
    stimulus: score,
    fatigue: score,
    notes: z.string().trim().max(2_000).nullable().default(null),
    sets: z.array(loggedSetSchema).max(200),
  })
  .refine(({ outcome, sets }) => outcome !== 'SKIPPED' || sets.length === 0, {
    path: ['sets'],
    message: 'Una sesión omitida no lleva series.',
  });
export type LogWorkout = z.input<typeof logWorkoutSchema>;

export const workoutLogSchema = z.object({
  id: z.uuid(),
  clientId: z.uuid(),
  localDate: isoDate,
  sessionId: z.uuid().nullable(),
  outcome: z.enum(WORKOUT_OUTCOMES),
  durationMinutes: z.number().nullable(),
  sessionRpe: z.number().nullable(),
  /** Peso × repeticiones de las series efectivas (RN-F03). */
  tonnageKg: z.number(),
  setCount: z.number().int(),
  status: z.enum(RECORD_STATUSES),
});
export type WorkoutLog = z.infer<typeof workoutLogSchema>;

/** GET /api/v1/me/days/:date: los registros vigentes del día y su total (RN-G09). */
export const meDaySchema = z.object({
  localDate: isoDate,
  /** Si el día todavía acepta registros, correcciones y anulaciones (RN-G10). */
  editable: z.boolean(),
  foods: z.array(foodLogSchema),
  hydration: z.array(hydrationLogSchema),
  notes: z.array(noteLogSchema),
  metrics: z.array(metricLogSchema),
  totals: dayTotalsSchema,
  waterMl: z.number().int(),
  /** El registro diario vigente del día, con su recuperación (RN-G11). */
  checkin: checkinSchema.nullable(),
  workouts: z.array(workoutLogSchema),
});
export type MeDay = z.infer<typeof meDaySchema>;

/** Una sesión del programa vigente para ese día (07 §8). */
export const daySessionSchema = z.object({
  position: z.number().int(),
  name: z.string(),
  dayOfWeek: z.number().int().min(1).max(7).nullable(),
  exerciseCount: z.number().int(),
});
export type DaySession = z.infer<typeof daySessionSchema>;

/** GET /api/v1/me/today: Hoy (RF-27, RF-28): la meta del día (RN-G03) frente a lo registrado, el agua y la sesión del día. */
export const meTodaySchema = z.object({
  localDate: isoDate,
  editWindowDays: z.number().int(),
  target: z
    .object({
      kcal: z.number(),
      choG: z.number(),
      proteinG: z.number(),
      fatG: z.number(),
      waterMl: z.number().int().nullable(),
      /** El tipo del día según el programa vigente (07 §8): su meta es la de ese tipo (07 §2). Sin programa, null. */
      dayKind: z.enum(['TRAINING', 'REST']).nullable(),
    })
    .nullable(),
  consumed: dayTotalsSchema,
  waterMl: z.number().int(),
  plan: z.object({ planId: z.uuid(), modality: z.enum(PLAN_MODALITIES) }).nullable(),
  /** Con programa vigente: sus sesiones de hoy, o ninguna en un día de descanso. Sin programa, null. */
  sessions: z.array(daySessionSchema).nullable(),
  /** La recuperación e indicación de hoy si ya completó su registro diario (RN-G15). */
  readiness: readinessSchema.nullable(),
});
export type MeToday = z.infer<typeof meTodaySchema>;

const planFoodChoiceSchema = z.object({
  foodId: z.uuid(),
  foodName: z.string(),
  /** Los gramos de una porción del grupo (RN-E08). */
  gramsPerServing: z.number(),
  householdText: z.string().nullable(),
});

/** Lo que se registra desde un tiempo del plan: un grupo de intercambio, un alimento o una opción del menú. */
export const planOptionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('EXCHANGE'),
    groupCode: z.string(),
    groupName: z.string(),
    /** Las porciones del grupo en este tiempo: la porción por defecto (RN-G06). */
    servings: z.number(),
    foods: z.array(planFoodChoiceSchema),
  }),
  z.object({
    kind: z.literal('FOOD'),
    foodId: z.uuid(),
    foodName: z.string(),
    grams: z.number(),
    householdText: z.string().nullable(),
  }),
  z.object({
    kind: z.literal('MENU'),
    option: z.enum(['A', 'B']),
    items: z.array(
      z.object({
        name: z.string(),
        grams: z.number().nullable(),
        servings: z.number().nullable(),
        householdText: z.string().nullable(),
      }),
    ),
  }),
]);
export type PlanOption = z.infer<typeof planOptionSchema>;

const planMacrosSchema = z.object({
  kcal: z.number(),
  choG: z.number(),
  proteinG: z.number(),
  fatG: z.number(),
});

/** GET /api/v1/me/plan?date=: el plan vigente por tiempos de comida, listo para registrar (RF-28). En el menú, el día pedido. */
export const mePlanSchema = z.object({
  plan: z
    .object({
      planId: z.uuid(),
      versionNo: z.number().int(),
      modality: z.enum(PLAN_MODALITIES),
      validFrom: isoDate,
      /** Las del plan: las del día de entrenamiento si tiene metas de descanso (07 §2). */
      targets: planMacrosSchema,
      /** Las del día de descanso; null: una sola meta. */
      restDayTargets: planMacrosSchema.nullable(),
      hydrationTargetMl: z.number().int().nullable(),
      instructions: z.string().nullable(),
      meals: z.array(
        z.object({
          /** El del tiempo; en el menú, el de la celda del día. */
          id: z.uuid(),
          slotCode: z.string(),
          name: z.string(),
          timeOfDay: z.string().nullable(),
          options: z.array(planOptionSchema),
        }),
      ),
    })
    .nullable(),
});
export type MePlan = z.infer<typeof mePlanSchema>;

const prescribedSetViewSchema = z.object({
  setNo: z.number().int(),
  setType: z.string(),
  repsMin: z.number().nullable(),
  repsMax: z.number().nullable(),
  loadKind: z.string().nullable(),
  loadValue: z.number().nullable(),
  restSeconds: z.number().nullable(),
  tempo: z.string().nullable(),
  durationSeconds: z.number().nullable(),
  distanceM: z.number().nullable(),
  met: z.number().nullable(),
});

/** GET /api/v1/me/training: las sesiones de hoy del programa vigente y lo ya registrado (RF-29). */
export const meTrainingSchema = z.object({
  localDate: isoDate,
  program: z
    .object({
      programId: z.uuid(),
      name: z.string(),
      weekNo: z.number().int(),
      isDeload: z.boolean(),
      phase: z.string().nullable(),
      targetRir: z.number().nullable(),
    })
    .nullable(),
  sessions: z.array(
    z.object({
      id: z.uuid(),
      position: z.number().int(),
      name: z.string(),
      dayOfWeek: z.number().int().nullable(),
      notes: z.string().nullable(),
      plannedTonnageKg: z.number().nullable(),
      exercises: z.array(
        z.object({
          id: z.uuid(),
          exerciseId: z.uuid(),
          name: z.string(),
          supersetGroup: z.string().nullable(),
          notes: z.string().nullable(),
          caution: z.string().nullable(),
          alternative: z.string().nullable(),
          easierVariant: z.string().nullable(),
          harderVariant: z.string().nullable(),
          mediaUrl: z.string().nullable(),
          instructions: z.string().nullable(),
          primaryMuscles: z.array(z.string()),
          secondaryMuscles: z.array(z.string()),
          sets: z.array(prescribedSetViewSchema),
        }),
      ),
    }),
  ),
  workouts: z.array(workoutLogSchema),
  checkin: checkinSchema.nullable(),
});
export type MeTraining = z.infer<typeof meTrainingSchema>;

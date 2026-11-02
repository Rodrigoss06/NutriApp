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

const dayTotalsSchema = z.object({
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
    })
    .nullable(),
  consumed: dayTotalsSchema,
  waterMl: z.number().int(),
  plan: z.object({ planId: z.uuid(), modality: z.enum(PLAN_MODALITIES) }).nullable(),
  /** Con programa vigente: sus sesiones de hoy, o ninguna en un día de descanso. Sin programa, null. */
  sessions: z.array(daySessionSchema).nullable(),
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

/** GET /api/v1/me/plan?date=: el plan vigente por tiempos de comida, listo para registrar (RF-28). En el menú, el día pedido. */
export const mePlanSchema = z.object({
  plan: z
    .object({
      planId: z.uuid(),
      versionNo: z.number().int(),
      modality: z.enum(PLAN_MODALITIES),
      validFrom: isoDate,
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

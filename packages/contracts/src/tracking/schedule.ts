import { z } from 'zod';
import { dayProfileCodeSchema } from '../nutrition/plan.js';

const isoDate = z.iso.date();
const profileSchema = z.object({ code: z.string(), name: z.string() });

/** Los cambios del día (P-20.3 y P-20.4, ADR-104): «no entreno hoy», «mover a mañana» y el perfil que elige el coach. */
export const DAY_CHANGE_KINDS = ['NOT_TRAINING', 'MOVED', 'PROFILE'] as const;
export type DayChangeKind = (typeof DAY_CHANGE_KINDS)[number];

/** Un día de la agenda, hoy o mañana: el perfil y las kcal que le tocan, sus sesiones y el cambio que lo decidió. */
export const scheduleDaySchema = z.object({
  localDate: isoDate,
  /** El perfil de día; null si no hay plan o el plan no tiene perfiles. */
  profile: profileSchema.nullable(),
  /** Las kcal de la meta de ese perfil; null sin plan vigente. */
  kcal: z.number().nullable(),
  /** Las sesiones del programa ese día; null fuera del programa. */
  sessions: z.number().int().nullable(),
  /** El último cambio que lo toca; null si manda el programa. */
  change: z.enum(DAY_CHANGE_KINDS).nullable(),
});
export type ScheduleDay = z.infer<typeof scheduleDaySchema>;

/** Hoy y mañana, y lo que hoy se puede hacer (P-20.3): nada se aplica solo. */
export const dayScheduleSchema = z.object({
  today: scheduleDaySchema,
  tomorrow: scheduleDaySchema,
  options: z.object({
    /** «No entreno hoy»: hoy tiene sesión y el día no cambió todavía. */
    notTraining: z.boolean(),
    /** «Mover a mañana»: la sesión es de hoy y mañana es un día del programa sin sesión. */
    moveToTomorrow: z.boolean(),
    /** «Sí entreno hoy»: el cambio de hoy que se puede deshacer, mientras no termine el día. */
    undo: z.enum(['NOT_TRAINING', 'MOVED']).nullable(),
  }),
});
export type DaySchedule = z.infer<typeof dayScheduleSchema>;

/** La agenda como la ve el coach, con los perfiles que puede poner hoy o mañana: Entrenamiento y los del plan (P-20.4). */
export const patientDayScheduleSchema = dayScheduleSchema.extend({
  choices: z.array(profileSchema),
});
export type PatientDaySchedule = z.infer<typeof patientDayScheduleSchema>;

/** «No entreno hoy», «mover a mañana» o «sí entreno hoy» (P-20.3), del paciente o del coach. */
export const TODAY_ACTIONS = ['NOT_TRAINING', 'MOVE_TO_TOMORROW', 'UNDO'] as const;
export const todayActionSchema = z.object({ action: z.enum(TODAY_ACTIONS) });
export type TodayActionInput = z.infer<typeof todayActionSchema>;

/** El perfil de hoy o de mañana que elige el coach; null vuelve a lo que pide el programa (P-20.4). */
export const dayProfileChoiceSchema = z.object({
  profileCode: dayProfileCodeSchema.nullable(),
});
export type DayProfileChoiceInput = z.infer<typeof dayProfileChoiceSchema>;

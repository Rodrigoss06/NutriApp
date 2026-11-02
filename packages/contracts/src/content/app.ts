import { z } from 'zod';

const isoDate = z.iso.date();

/** Secciones de la app del paciente (05.3, content.patient_app_setting.enabled_sections): el profesional elige cuáles ve. */
export const APP_SECTIONS = [
  'NUTRITION',
  'HYDRATION',
  'TRAINING',
  'CHECKIN',
  'NOTES',
  'EVOLUTION',
  'RESOURCES',
] as const;
export type AppSection = (typeof APP_SECTIONS)[number];

export const APP_SECTION_LABELS: Readonly<Record<AppSection, string>> = {
  NUTRITION: 'Alimentación',
  HYDRATION: 'Agua',
  TRAINING: 'Entrenamiento',
  CHECKIN: 'Registro diario',
  NOTES: 'Notas',
  EVOLUTION: 'Progreso',
  RESOURCES: 'Material educativo',
};

/** El color del tema del paciente (RF-27): pinta los tokens de marca de su app, como la marca de la organización (ADR-027). */
const themeColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Usa un color en formato #RRGGBB.')
  .transform((value) => value.toLowerCase());

/** Los ajustes de la app de un paciente: sin fila, los de por defecto (05.3). */
export const appSettingsSchema = z.object({
  themeColor: z.string().nullable(),
  welcomeMessage: z.string().nullable(),
  enabledSections: z.array(z.enum(APP_SECTIONS)),
  allowWeightLog: z.boolean(),
  updatedAt: z.iso.datetime({ offset: true }).nullable(),
});
export type AppSettings = z.infer<typeof appSettingsSchema>;

/** PUT /api/v1/patients/:id/app-settings: los cambia el equipo de atención con acceso de escritura. */
export const updateAppSettingsSchema = z.strictObject({
  themeColor: themeColor.nullable(),
  welcomeMessage: z.string().trim().min(1).max(280).nullable(),
  enabledSections: z
    .array(z.enum(APP_SECTIONS))
    .max(APP_SECTIONS.length)
    .refine((sections) => new Set(sections).size === sections.length, 'Hay secciones repetidas.'),
  allowWeightLog: z.boolean(),
});
export type UpdateAppSettings = z.input<typeof updateAppSettingsSchema>;

/** Un mensaje motivacional (RF-27): para un paciente o, sin paciente, para todos los de la organización. */
export const motivationalMessageSchema = z.object({
  id: z.uuid(),
  patientId: z.uuid().nullable(),
  body: z.string(),
  activeFrom: isoDate.nullable(),
  activeTo: isoDate.nullable(),
  createdAt: z.iso.datetime({ offset: true }),
});
export type MotivationalMessage = z.infer<typeof motivationalMessageSchema>;

export const motivationalMessagesResponseSchema = z.object({
  messages: z.array(motivationalMessageSchema),
});
export type MotivationalMessagesResponse = z.infer<typeof motivationalMessagesResponseSchema>;

const messageFields = {
  body: z.string().trim().min(1).max(280),
  /** Sin fecha de inicio vale desde hoy; sin fin, hasta que se termine. */
  activeFrom: isoDate.nullable(),
  activeTo: isoDate.nullable(),
};

const datesInOrder = (value: { activeFrom?: string | null; activeTo?: string | null }) =>
  !value.activeFrom || !value.activeTo || value.activeFrom <= value.activeTo;

/** POST /api/v1/motivational-messages (para todos) y /api/v1/patients/:id/motivational-messages (para uno). */
export const createMotivationalMessageSchema = z
  .strictObject({
    body: messageFields.body,
    activeFrom: messageFields.activeFrom.default(null),
    activeTo: messageFields.activeTo.default(null),
  })
  .refine(datesInOrder, { message: 'El fin no puede ser antes del inicio.', path: ['activeTo'] });
export type CreateMotivationalMessage = z.input<typeof createMotivationalMessageSchema>;

/** PATCH de un mensaje: cambia el texto o sus fechas. Para quitarlo, se le pone fin (nada se borra). */
export const updateMotivationalMessageSchema = z
  .strictObject(messageFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'No hay nada que cambiar.' })
  .refine(datesInOrder, { message: 'El fin no puede ser antes del inicio.', path: ['activeTo'] });
export type UpdateMotivationalMessage = z.input<typeof updateMotivationalMessageSchema>;

/** GET /api/v1/me/app: los ajustes de la app del paciente y el mensaje de hoy, si hay uno. */
export const meAppSchema = appSettingsSchema.omit({ updatedAt: true }).extend({
  message: z.object({ id: z.uuid(), body: z.string() }).nullable(),
});
export type MeApp = z.infer<typeof meAppSchema>;

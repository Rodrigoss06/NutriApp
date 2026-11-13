import { z } from 'zod';

/**
 * La agenda (RF-37; RN-J01 a RN-J03; ADR-125): la disponibilidad semanal de cada profesional y sus citas, presenciales o virtuales.
 * Las horas viajan como instantes ISO con su zona y se guardan en UTC; las pantallas las muestran en la zona de la organización
 * (RN-J03). Solo la asistencia a las sesiones: sin saldos, paquetes ni sincronización con Google Calendar (P-32).
 */
export const APPOINTMENT_KINDS = [
  'CONSULTATION',
  'FOLLOW_UP',
  'EVALUATION',
  'TRAINING',
  'OTHER',
] as const;
export type AppointmentKind = (typeof APPOINTMENT_KINDS)[number];

export const APPOINTMENT_KIND_LABELS = {
  CONSULTATION: 'Consulta',
  FOLLOW_UP: 'Control',
  EVALUATION: 'Evaluación',
  TRAINING: 'Sesión de entrenamiento',
  OTHER: 'Otro',
} as const satisfies Record<AppointmentKind, string>;

export const APPOINTMENT_MODES = ['IN_PERSON', 'VIRTUAL'] as const;
export type AppointmentMode = (typeof APPOINTMENT_MODES)[number];

export const APPOINTMENT_MODE_LABELS = {
  IN_PERSON: 'Presencial',
  VIRTUAL: 'Virtual',
} as const satisfies Record<AppointmentMode, string>;

/** Programada → confirmada → realizada; o cancelada; o no asistió. La asistencia se valida desde que empieza la cita. */
export const APPOINTMENT_STATUSES = [
  'SCHEDULED',
  'CONFIRMED',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const APPOINTMENT_STATUS_LABELS = {
  SCHEDULED: 'Programada',
  CONFIRMED: 'Confirmada',
  COMPLETED: 'Realizada',
  CANCELLED: 'Cancelada',
  NO_SHOW: 'No asistió',
} as const satisfies Record<AppointmentStatus, string>;

/** Una cita dura como mucho 12 horas (ADR-125). */
export const MAX_APPOINTMENT_MINUTES = 12 * 60;
/** La vista mensual pide hasta 6 semanas. */
export const MAX_AGENDA_DAYS = 42;

const instant = z.iso.datetime({ offset: true });
const localDate = z.iso.date();
const location = z.string().trim().min(1).max(200);
/** Un enlace externo para la cita virtual: solo https y sin sincronizar (P-32). La API nunca lo abre. */
const meetingUrl = z.url({ protocol: /^https$/ }).max(2000);
const notes = z.string().trim().min(1).max(1000);
const uuid = z.uuid();

/**
 * POST /api/v1/appointments. Sin memberId, la cita va en la agenda de quien la crea; el dueño y el administrador la ponen en la
 * agenda de cualquier profesional. Con paciente, exige acceso de escritura a su expediente (RN-A05). Un cruce con otra cita del
 * mismo profesional responde 422 con RN-J01.
 */
export const createAppointmentSchema = z
  .strictObject({
    memberId: uuid.optional(),
    patientId: uuid.optional(),
    kind: z.enum(APPOINTMENT_KINDS),
    mode: z.enum(APPOINTMENT_MODES),
    startsAt: instant,
    endsAt: instant,
    location: location.optional(),
    meetingUrl: meetingUrl.optional(),
    notes: notes.optional(),
  })
  .refine((input) => Date.parse(input.startsAt) < Date.parse(input.endsAt), {
    path: ['endsAt'],
    message: 'La cita termina después de empezar.',
  });
export type CreateAppointment = z.input<typeof createAppointmentSchema>;

/**
 * PATCH /api/v1/appointments/:id con If-Match: reprogramar o cambiar sus datos mientras esté programada o confirmada. null borra el
 * lugar, el enlace o la nota. Cambiar la hora vuelve a dejar pendiente el recordatorio.
 */
export const updateAppointmentSchema = z
  .strictObject({
    kind: z.enum(APPOINTMENT_KINDS).optional(),
    mode: z.enum(APPOINTMENT_MODES).optional(),
    startsAt: instant.optional(),
    endsAt: instant.optional(),
    location: location.nullable().optional(),
    meetingUrl: meetingUrl.nullable().optional(),
    notes: notes.nullable().optional(),
  })
  .refine((input) => Object.keys(input).length > 0, { message: 'No hay nada que cambiar.' })
  .refine((input) => (input.startsAt === undefined) === (input.endsAt === undefined), {
    path: ['endsAt'],
    message: 'Para reprogramar, envía el inicio y el fin.',
  });
export type UpdateAppointment = z.input<typeof updateAppointmentSchema>;

/** PUT /api/v1/appointments/:id/status con If-Match. Realizada o no asistió, solo desde que empezó la cita. */
export const changeAppointmentStatusSchema = z.strictObject({
  status: z.enum(['CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']),
});
export type ChangeAppointmentStatus = z.input<typeof changeAppointmentStatusSchema>;

/** GET /api/v1/appointments?from&to&memberId: las fechas son locales de la organización (RN-J03), ambas incluidas. */
export const agendaQuerySchema = z
  .object({ from: localDate, to: localDate, memberId: uuid.optional() })
  .refine((query) => query.from <= query.to, {
    path: ['to'],
    message: 'El rango termina después de empezar.',
  })
  .refine(
    (query) => (Date.parse(query.to) - Date.parse(query.from)) / 86_400_000 < MAX_AGENDA_DAYS,
    { path: ['to'], message: `Pide hasta ${String(MAX_AGENDA_DAYS)} días.` },
  );
export type AgendaQuery = z.input<typeof agendaQuerySchema>;

export const appointmentSchema = z.object({
  id: z.string(),
  memberId: z.string(),
  patientId: z.string().nullable(),
  kind: z.enum(APPOINTMENT_KINDS),
  mode: z.enum(APPOINTMENT_MODES),
  location: z.string().nullable(),
  meetingUrl: z.string().nullable(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  status: z.enum(APPOINTMENT_STATUSES),
  notes: z.string().nullable(),
  reminderSentAt: z.iso.datetime().nullable(),
  /** Ya empezó y sigue programada o confirmada: falta validar la asistencia. */
  attendancePending: z.boolean(),
  createdAt: z.iso.datetime(),
  /** Para If-Match. */
  version: z.int().nonnegative(),
});
export type Appointment = z.infer<typeof appointmentSchema>;

/** GET /api/v1/appointments y GET /api/v1/patients/:patientId/appointments. */
export const agendaResponseSchema = z.object({
  /** La zona horaria de la organización: la de las fechas del rango y la de las pantallas (RN-J03). */
  timezone: z.string(),
  appointments: z.array(appointmentSchema),
});
export type AgendaResponse = z.infer<typeof agendaResponseSchema>;

const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Usa HH:MM.');

/** Una franja semanal: 1 es lunes y 7 domingo, en la zona de la organización. */
export const availabilitySlotSchema = z
  .strictObject({
    dayOfWeek: z.int().min(1).max(7),
    startTime: clockTime,
    endTime: clockTime,
  })
  .refine((slot) => slot.startTime < slot.endTime, {
    path: ['endTime'],
    message: 'La franja termina después de empezar.',
  });
export type AvailabilitySlot = z.infer<typeof availabilitySlotSchema>;

/** PUT /api/v1/members/:memberId/availability: reemplaza la disponibilidad semanal entera. Sin franjas que se crucen el mismo día. */
export const putAvailabilitySchema = z.strictObject({
  slots: z.array(availabilitySlotSchema).max(35),
});
export type PutAvailability = z.input<typeof putAvailabilitySchema>;

export const availabilityResponseSchema = z.object({
  memberId: z.string(),
  timezone: z.string(),
  slots: z.array(z.object({ dayOfWeek: z.int(), startTime: z.string(), endTime: z.string() })),
});
export type AvailabilityResponse = z.infer<typeof availabilityResponseSchema>;

/** GET /api/v1/me/appointments: las citas del paciente, sin las notas del profesional. */
export const meAppointmentSchema = appointmentSchema.pick({
  id: true,
  kind: true,
  mode: true,
  location: true,
  meetingUrl: true,
  startsAt: true,
  endsAt: true,
  status: true,
});
export type MeAppointment = z.infer<typeof meAppointmentSchema>;

export const meAppointmentsResponseSchema = z.object({
  timezone: z.string(),
  /** Las próximas, de la más cercana a la más lejana. */
  upcoming: z.array(meAppointmentSchema),
  /** Las de los últimos 90 días, de la más reciente a la más antigua. */
  past: z.array(meAppointmentSchema),
});
export type MeAppointmentsResponse = z.infer<typeof meAppointmentsResponseSchema>;

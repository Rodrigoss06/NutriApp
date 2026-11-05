import {
  logCheckinSchema,
  type Checkin,
  type LogCheckin,
  type MeTraining,
} from '@nutricoach/contracts';

/** Lo que el paciente anota (07 §9): sin tocar queda null, que no es cero. */
export interface CheckinValues {
  sessionMinutes: number | null;
  sessionRpe: number | null;
  sleepHours: number | null;
  fatigue: number | null;
  soreness: number | null;
  stress: number | null;
  motivation: number | null;
  menstrualSymptoms: number | null;
  nutritionCompliancePct: number | null;
  carbsAroundTrainingG: number | null;
  performancePlanned: number | null;
  performanceActual: number | null;
  restingHrBpm: number | null;
  hrvMs: number | null;
  steps: number | null;
  activeKcal: number | null;
}

export type CheckinField = keyof CheckinValues;

const EMPTY: CheckinValues = {
  sessionMinutes: null,
  sessionRpe: null,
  sleepHours: null,
  fatigue: null,
  soreness: null,
  stress: null,
  motivation: null,
  menstrualSymptoms: null,
  nutritionCompliancePct: null,
  carbsAroundTrainingG: null,
  performancePlanned: null,
  performanceActual: null,
  restingHrBpm: null,
  hrvMs: null,
  steps: null,
  activeKcal: null,
};

/** Qué decir cuando un dato no pasa el contrato: también es su rango. */
const HINTS: Readonly<Record<CheckinField, string>> = {
  sessionMinutes: 'De 0 a 600 minutos, sin decimales.',
  sessionRpe: 'De 0 a 10, con hasta 1 decimal.',
  sleepHours: 'De 0 a 24 horas, en medias horas: 7 o 7.5.',
  fatigue: 'De 1 a 5.',
  soreness: 'De 1 a 5.',
  stress: 'De 1 a 5.',
  motivation: 'De 1 a 5.',
  menstrualSymptoms: 'De 0 a 3.',
  nutritionCompliancePct: 'De 0 a 100 %, sin decimales.',
  carbsAroundTrainingG: 'De 0 a 2000 g, con hasta 1 decimal.',
  performancePlanned: 'Un número de 0 en adelante, con hasta 2 decimales.',
  performanceActual: 'Un número de 0 en adelante, con hasta 2 decimales.',
  restingHrBpm: 'De 25 a 220 latidos por minuto, sin decimales.',
  hrvMs: 'Mayor que 0 y hasta 9999 ms, con hasta 1 decimal.',
  steps: 'De 0 a 200 000 pasos, sin decimales.',
  activeKcal: 'De 0 a 99 999 kcal, con hasta 1 decimal.',
};

/** Lo ya registrado hoy, para corregirlo (RN-G12); si no hay, la sesión registrada da la duración y el RPE. */
export function initialValues(
  current: Checkin | null,
  session: { readonly durationMinutes: number | null; readonly sessionRpe: number | null } | null,
): CheckinValues {
  if (current) {
    const values = { ...EMPTY };
    for (const field of Object.keys(EMPTY) as CheckinField[]) values[field] = current[field];
    return values;
  }
  return {
    ...EMPTY,
    sessionMinutes: session?.durationMinutes ?? null,
    sessionRpe: session?.sessionRpe ?? null,
  };
}

/** Valida con el contrato de la API: el cuerpo listo, o el problema de cada campo. */
export function parseCheckin(
  values: CheckinValues,
  day: { readonly clientId: string; readonly localDate: string },
  menstrualTracking: boolean,
): { ok: true; body: LogCheckin } | { ok: false; problems: Partial<Record<CheckinField, string>> } {
  const parsed = logCheckinSchema.safeParse({
    ...day,
    ...values,
    // Sin la autorización vigente no se envía (RN-G17): la API lo rechazaría.
    menstrualSymptoms: menstrualTracking ? values.menstrualSymptoms : null,
  });
  if (parsed.success) return { ok: true, body: parsed.data };
  const problems: Partial<Record<CheckinField, string>> = {};
  for (const issue of parsed.error.issues) {
    const field = String(issue.path[0]) as CheckinField;
    if (field in HINTS) problems[field] ??= HINTS[field];
  }
  return { ok: false, problems };
}

/** Un registro vacío no dice nada: se guarda con al menos un dato (07 §9). */
export const hasData = (values: Readonly<Partial<CheckinValues>>): boolean =>
  Object.values(values).some((value) => value !== null);

/**
 * El rendimiento que la API calculará con la sesión registrada hoy (P-09, ADR-083): lo prescrito frente a lo registrado de las
 * sesiones de hoy hechas con tonelaje. Si alguna no tiene kg y repeticiones fijas, o no hay ninguna, null: lo escribe el paciente.
 */
export function performanceFromTraining(
  training: Pick<MeTraining, 'sessions' | 'workouts'>,
): { readonly plannedKg: number; readonly loggedKg: number } | null {
  const done = training.workouts.filter(
    (workout) =>
      workout.sessionId !== null && workout.outcome !== 'SKIPPED' && workout.tonnageKg > 0,
  );
  if (done.length === 0) return null;
  let plannedKg = 0;
  for (const workout of done) {
    const planned = training.sessions.find(
      (session) => session.id === workout.sessionId,
    )?.plannedTonnageKg;
    if (planned === null || planned === undefined) return null;
    plannedKg += planned;
  }
  return { plannedKg, loggedKg: done.reduce((total, workout) => total + workout.tonnageKg, 0) };
}

/** La duración y el RPE de la sesión registrada hoy, para no escribirlos dos veces. */
export function sessionPrefill(
  workouts: MeTraining['workouts'],
): { readonly durationMinutes: number | null; readonly sessionRpe: number | null } | null {
  const logged = workouts.find(
    (workout) => workout.durationMinutes !== null || workout.sessionRpe !== null,
  );
  return logged ? { durationMinutes: logged.durationMinutes, sessionRpe: logged.sessionRpe } : null;
}

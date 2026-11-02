import { domainError } from '@nutricoach/shared-kernel';

/** Las secciones de la app del paciente, todas visibles por defecto (05.3, content.patient_app_setting). */
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

export interface AppSettingsView {
  /** #rrggbb: pinta los tokens de marca de la app del paciente (RF-27, ADR-027); null, la marca de la organización. */
  readonly themeColor: string | null;
  readonly welcomeMessage: string | null;
  readonly enabledSections: readonly AppSection[];
  /** Si el paciente registra su peso en casa (07 §9). */
  readonly allowWeightLog: boolean;
  readonly updatedAt: Date | null;
}

/** Los ajustes guardados, o los de por defecto si el profesional nunca los cambió. */
export function settingsOrDefault(saved: AppSettingsView | null): AppSettingsView {
  return (
    saved ?? {
      themeColor: null,
      welcomeMessage: null,
      enabledSections: APP_SECTIONS,
      allowWeightLog: true,
      updatedAt: null,
    }
  );
}

/** Un mensaje motivacional (05.3): de un paciente o, con patientId null, para todos los de la organización. */
export interface MessageRecord {
  readonly id: string;
  readonly patientId: string | null;
  readonly body: string;
  /** YYYY-MM-DD; null es sin límite de ese lado. Las dos inclusive. */
  readonly activeFrom: string | null;
  readonly activeTo: string | null;
  readonly createdAt: Date;
}

export const MESSAGE_NOT_FOUND = domainError({
  code: 'NC-CON-001',
  message: 'Ese mensaje no existe o no lo ves.',
});

/** Las fechas de un mensaje en orden: el contrato lo revisa en lo que llega; el caso de uso, contra lo que ya estaba. */
export const MESSAGE_DATES = domainError({
  code: 'NC-CON-002',
  message: 'El fin del mensaje no puede ser antes de su inicio.',
});

const isActive = (message: MessageRecord, today: string): boolean =>
  (message.activeFrom === null || message.activeFrom <= today) &&
  (message.activeTo === null || message.activeTo >= today);

const dayNumber = (date: string): number =>
  Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);

/** El día de un instante en la zona horaria del paciente (RN-G04), como YYYY-MM-DD. */
export function localDateIn(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/**
 * El mensaje de hoy (RF-27): de los vigentes, primero los del paciente y, si no tiene, los de todos. Rota cada día en el orden en
 * que se crearon, así el mismo día muestra siempre el mismo.
 */
export function messageOfTheDay(
  messages: readonly MessageRecord[],
  today: string,
): MessageRecord | null {
  const active = messages.filter((message) => isActive(message, today));
  const own = active.filter((message) => message.patientId !== null);
  const candidates = (own.length > 0 ? own : active).toSorted(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
  );
  if (candidates.length === 0) return null;
  return candidates[dayNumber(today) % candidates.length] ?? null;
}

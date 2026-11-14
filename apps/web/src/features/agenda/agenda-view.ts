import type { Appointment, AppointmentStatus, AvailabilitySlot } from '@nutricoach/contracts';
import { addDays } from '@/lib/dates';

/**
 * La agenda en pantalla (RF-37; RN-J03; ADR-125): las horas llegan en UTC y se muestran en la zona de la organización. La semana
 * empieza el lunes; el mes se dibuja en semanas completas, hasta 6, que es lo que la API acepta (42 días).
 */

export type AgendaView = 'week' | 'month';

/** 1 es lunes y 7 domingo, como la disponibilidad. */
export function isoWeekday(date: string): number {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

export function weekStart(date: string): string {
  return addDays(date, 1 - isoWeekday(date));
}

export function weekDays(date: string): string[] {
  const start = weekStart(date);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

/** Las semanas que cubren el mes de la fecha, de lunes a domingo. */
export function monthWeeks(date: string): string[][] {
  const first = `${date.slice(0, 7)}-01`;
  const last = addDays(`${addDays(first, 32).slice(0, 7)}-01`, -1);
  const weeks: string[][] = [];
  for (let start = weekStart(first); start <= last; start = addDays(start, 7)) {
    weeks.push(weekDays(start));
  }
  return weeks;
}

/** El rango que se le pide a la API para una vista. */
export function rangeFor(view: AgendaView, date: string): { from: string; to: string } {
  if (view === 'week') {
    const days = weekDays(date);
    return { from: days[0] as string, to: days[6] as string };
  }
  const weeks = monthWeeks(date);
  return { from: weeks[0]?.[0] as string, to: weeks.at(-1)?.[6] as string };
}

/** La fecha de la vista anterior o siguiente. */
export function shift(view: AgendaView, date: string, step: -1 | 1): string {
  if (view === 'week') return addDays(date, 7 * step);
  const month = new Date(`${date.slice(0, 7)}-15T12:00:00Z`);
  month.setUTCMonth(month.getUTCMonth() + step);
  return `${month.toISOString().slice(0, 7)}-01`;
}

const partsCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let format = partsCache.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    partsCache.set(timeZone, format);
  }
  return format;
}

/** La fecha y la hora locales de un instante: { date: YYYY-MM-DD, time: HH:MM }. */
export function localParts(iso: string, timeZone: string): { date: string; time: string } {
  const parts = Object.fromEntries(
    formatter(timeZone)
      .formatToParts(new Date(iso))
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year ?? ''}-${parts.month ?? ''}-${parts.day ?? ''}`,
    time: `${parts.hour ?? ''}:${parts.minute ?? ''}`,
  };
}

/** Las citas de cada día local, por hora de inicio. */
export function byLocalDate(
  appointments: readonly Appointment[],
  timeZone: string,
): Map<string, Appointment[]> {
  const days = new Map<string, Appointment[]>();
  for (const appointment of [...appointments].sort((a, b) =>
    a.startsAt.localeCompare(b.startsAt),
  )) {
    const { date } = localParts(appointment.startsAt, timeZone);
    days.set(date, [...(days.get(date) ?? []), appointment]);
  }
  return days;
}

export function durationMinutes(appointment: Pick<Appointment, 'startsAt' | 'endsAt'>): number {
  return Math.round((Date.parse(appointment.endsAt) - Date.parse(appointment.startsAt)) / 60_000);
}

/**
 * ¿Queda fuera de la disponibilidad? Si no cabe entera en una franja de su día. Sin franjas cargadas no se marca: la disponibilidad
 * orienta, no prohíbe (ADR-125). Una cancelada nunca se marca.
 */
export function outsideAvailability(
  appointment: Pick<Appointment, 'startsAt' | 'endsAt' | 'status'>,
  slots: readonly AvailabilitySlot[],
  timeZone: string,
): boolean {
  if (slots.length === 0 || appointment.status === 'CANCELLED') return false;
  const start = localParts(appointment.startsAt, timeZone);
  const end = localParts(appointment.endsAt, timeZone);
  if (start.date !== end.date && end.time !== '00:00') return true;
  const endTime = end.time === '00:00' && start.date !== end.date ? '24:00' : end.time;
  const day = isoWeekday(start.date);
  return !slots.some(
    (slot) => slot.dayOfWeek === day && slot.startTime <= start.time && endTime <= slot.endTime,
  );
}

/** El tono del estado: color, ícono y texto juntos (StatusBadge). */
export const STATUS_TONES: Readonly<
  Record<AppointmentStatus, 'info' | 'success' | 'warning' | 'danger'>
> = {
  SCHEDULED: 'info',
  CONFIRMED: 'info',
  COMPLETED: 'success',
  CANCELLED: 'warning',
  NO_SHOW: 'danger',
};

/** Lo que se puede hacer con una cita, como decide la API (ADR-076). */
export function availableActions(
  appointment: Pick<Appointment, 'status' | 'startsAt'>,
  now: Date,
): {
  confirm: boolean;
  cancel: boolean;
  attendance: boolean;
  reschedule: boolean;
} {
  const open = appointment.status === 'SCHEDULED' || appointment.status === 'CONFIRMED';
  const started = Date.parse(appointment.startsAt) <= now.getTime();
  const attended = appointment.status === 'COMPLETED' || appointment.status === 'NO_SHOW';
  return {
    confirm: appointment.status === 'SCHEDULED',
    cancel: open,
    attendance: (open && started) || attended,
    reschedule: open,
  };
}

/**
 * Las sesiones del macrociclo que dependen de una cita (07 §10, ADR-090): las verificadas (citas de entrenamiento realizadas) y
 * las por validar (ya empezaron y siguen programadas o confirmadas), de `from` a `to` en fechas locales.
 */
export function trainingAttendance(
  appointments: readonly Appointment[],
  from: string,
  to: string,
  timeZone: string,
): { verified: number; pending: number } {
  let verified = 0;
  let pending = 0;
  for (const appointment of appointments) {
    if (appointment.kind !== 'TRAINING') continue;
    const { date } = localParts(appointment.startsAt, timeZone);
    if (date < from || date > to) continue;
    if (appointment.status === 'COMPLETED') verified += 1;
    if (appointment.attendancePending) pending += 1;
  }
  return { verified, pending };
}

/** La hora local de fin para una duración, sin pasar de la medianoche. */
export function endTimeFor(startTime: string, minutes: number): string {
  const [hours, mins] = startTime.split(':').map(Number) as [number, number];
  const total = Math.min(hours * 60 + mins + minutes, 24 * 60 - 1);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

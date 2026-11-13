import { describe, expect, it } from 'vitest';
import {
  APPOINTMENT_TRANSITION_INVALID,
  APPOINTMENT_WINDOW_INVALID,
  ATTENDANCE_TOO_EARLY,
  attendancePending,
  canWriteAgenda,
  checkTransition,
  checkWindow,
  isClosed,
  reminderDue,
  type AppointmentRecord,
} from './appointment.js';
import { AVAILABILITY_OVERLAP, checkSlots } from './availability.js';
import { localDateOf, nextLocalDate, startOfLocalDay } from './zoned-time.js';

const NOW = new Date('2026-11-16T15:00:00Z');
const hours = (n: number): Date => new Date(NOW.getTime() + n * 3_600_000);

const appointment = (overrides: Partial<AppointmentRecord> = {}): AppointmentRecord => ({
  id: 'a-1',
  organizationId: 'o-1',
  memberId: 'm-1',
  patientId: 'p-1',
  kind: 'TRAINING',
  mode: 'IN_PERSON',
  location: null,
  meetingUrl: null,
  startsAt: hours(2),
  endsAt: hours(3),
  status: 'SCHEDULED',
  notes: null,
  reminderSentAt: null,
  createdBy: 'u-1',
  createdAt: hours(-48),
  version: 0,
  ...overrides,
});

describe('RF-37 · la cita y sus estados (ADR-125)', () => {
  it('termina después de empezar y dura como mucho 12 horas', () => {
    expect(checkWindow(hours(1), hours(2)).ok).toBe(true);
    expect(checkWindow(hours(1), hours(13)).ok).toBe(true);
    expect(checkWindow(hours(1), hours(13.01))).toEqual({
      ok: false,
      error: APPOINTMENT_WINDOW_INVALID,
    });
    expect(checkWindow(hours(2), hours(2))).toEqual({
      ok: false,
      error: APPOINTMENT_WINDOW_INVALID,
    });
  });

  it('programada → confirmada; programada o confirmada → cancelada', () => {
    expect(checkTransition(appointment(), 'CONFIRMED', NOW).ok).toBe(true);
    expect(checkTransition(appointment(), 'CANCELLED', NOW).ok).toBe(true);
    expect(checkTransition(appointment({ status: 'CONFIRMED' }), 'CANCELLED', NOW).ok).toBe(true);
    expect(checkTransition(appointment({ status: 'CONFIRMED' }), 'CONFIRMED', NOW)).toEqual({
      ok: false,
      error: APPOINTMENT_TRANSITION_INVALID,
    });
  });

  it('07 §10 · la asistencia se valida desde que empieza la cita, no antes', () => {
    expect(checkTransition(appointment(), 'COMPLETED', NOW)).toEqual({
      ok: false,
      error: ATTENDANCE_TOO_EARLY,
    });
    const started = appointment({ status: 'CONFIRMED', startsAt: hours(-1), endsAt: hours(0) });
    expect(checkTransition(started, 'COMPLETED', NOW).ok).toBe(true);
    expect(checkTransition(started, 'NO_SHOW', NOW).ok).toBe(true);
    expect(checkTransition({ ...started, startsAt: NOW }, 'COMPLETED', NOW).ok).toBe(true);
  });

  it('realizada y no asistió se corrigen entre sí; cancelada es final', () => {
    const past = { startsAt: hours(-3), endsAt: hours(-2) };
    expect(checkTransition(appointment({ ...past, status: 'COMPLETED' }), 'NO_SHOW', NOW).ok).toBe(
      true,
    );
    expect(checkTransition(appointment({ ...past, status: 'NO_SHOW' }), 'COMPLETED', NOW).ok).toBe(
      true,
    );
    expect(
      checkTransition(appointment({ ...past, status: 'COMPLETED' }), 'CANCELLED', NOW).ok,
    ).toBe(false);
    expect(
      checkTransition(appointment({ ...past, status: 'COMPLETED' }), 'CONFIRMED', NOW).ok,
    ).toBe(false);
    for (const next of ['CONFIRMED', 'COMPLETED', 'NO_SHOW'] as const) {
      expect(checkTransition(appointment({ ...past, status: 'CANCELLED' }), next, NOW).ok).toBe(
        false,
      );
    }
    expect(isClosed('CANCELLED') && isClosed('COMPLETED') && isClosed('NO_SHOW')).toBe(true);
    expect(isClosed('SCHEDULED') || isClosed('CONFIRMED')).toBe(false);
  });

  it('por validar: ya empezó y sigue programada o confirmada', () => {
    expect(attendancePending(appointment(), NOW)).toBe(false);
    expect(attendancePending(appointment({ startsAt: hours(-1) }), NOW)).toBe(true);
    expect(attendancePending(appointment({ startsAt: hours(-1), status: 'COMPLETED' }), NOW)).toBe(
      false,
    );
  });

  it('el dueño y el administrador escriben en cualquier agenda; el profesional, solo en la suya', () => {
    expect(canWriteAgenda({ role: 'OWNER', memberId: 'm-9' }, 'm-1')).toBe(true);
    expect(canWriteAgenda({ role: 'ADMIN', memberId: null }, 'm-1')).toBe(true);
    expect(canWriteAgenda({ role: 'PROFESSIONAL', memberId: 'm-1' }, 'm-1')).toBe(true);
    expect(canWriteAgenda({ role: 'PROFESSIONAL', memberId: 'm-2' }, 'm-1')).toBe(false);
  });
});

describe('RN-J02 · el recordatorio, 24 horas antes de la cita confirmada', () => {
  it('confirmada, sin recordatorio y dentro de las próximas 24 horas', () => {
    expect(reminderDue(appointment({ status: 'CONFIRMED', startsAt: hours(23) }), NOW)).toBe(true);
    expect(reminderDue(appointment({ status: 'CONFIRMED', startsAt: hours(24) }), NOW)).toBe(true);
    expect(reminderDue(appointment({ status: 'CONFIRMED', startsAt: hours(24.01) }), NOW)).toBe(
      false,
    );
  });

  it('una programada, una ya recordada o una que ya empezó no se recuerdan', () => {
    expect(reminderDue(appointment({ startsAt: hours(5) }), NOW)).toBe(false);
    expect(
      reminderDue(
        appointment({ status: 'CONFIRMED', startsAt: hours(5), reminderSentAt: hours(-1) }),
        NOW,
      ),
    ).toBe(false);
    expect(reminderDue(appointment({ status: 'CONFIRMED', startsAt: NOW }), NOW)).toBe(false);
  });
});

describe('RN-J03 · UTC en la base, la zona de la organización en pantalla', () => {
  it('el día local de Lima empieza a las 05:00 UTC', () => {
    expect(startOfLocalDay('2026-11-16', 'America/Lima').toISOString()).toBe(
      '2026-11-16T05:00:00.000Z',
    );
    expect(localDateOf(new Date('2026-11-17T04:59:00Z'), 'America/Lima')).toBe('2026-11-16');
    expect(localDateOf(new Date('2026-11-17T05:00:00Z'), 'America/Lima')).toBe('2026-11-17');
  });

  it('con cambio de horario, el día empieza a su medianoche local', () => {
    // Madrid pasa al horario de verano el 29 de marzo de 2026: ese día empieza a las 23:00 UTC del 28.
    expect(startOfLocalDay('2026-03-29', 'Europe/Madrid').toISOString()).toBe(
      '2026-03-28T23:00:00.000Z',
    );
    expect(startOfLocalDay('2026-03-30', 'Europe/Madrid').toISOString()).toBe(
      '2026-03-29T22:00:00.000Z',
    );
    expect(nextLocalDate('2026-12-31')).toBe('2027-01-01');
  });
});

describe('RF-37 · la disponibilidad semanal', () => {
  it('ordena las franjas y rechaza las que se cruzan el mismo día', () => {
    const slots = [
      { dayOfWeek: 3, startTime: '15:00', endTime: '19:00' },
      { dayOfWeek: 1, startTime: '08:00', endTime: '13:00' },
      { dayOfWeek: 3, startTime: '08:00', endTime: '12:00' },
    ];
    const checked = checkSlots(slots);
    expect(
      checked.ok && checked.value.map((slot) => `${String(slot.dayOfWeek)} ${slot.startTime}`),
    ).toEqual(['1 08:00', '3 08:00', '3 15:00']);
    expect(
      checkSlots([
        { dayOfWeek: 2, startTime: '08:00', endTime: '12:00' },
        { dayOfWeek: 2, startTime: '11:30', endTime: '14:00' },
      ]),
    ).toEqual({ ok: false, error: AVAILABILITY_OVERLAP });
    expect(
      checkSlots([
        { dayOfWeek: 2, startTime: '08:00', endTime: '12:00' },
        { dayOfWeek: 2, startTime: '12:00', endTime: '14:00' },
      ]).ok,
    ).toBe(true);
  });
});

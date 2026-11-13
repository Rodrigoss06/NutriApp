import type { Appointment } from '@nutricoach/contracts';
import { describe, expect, it } from 'vitest';
import {
  availableActions,
  byLocalDate,
  endTimeFor,
  isoWeekday,
  localParts,
  monthWeeks,
  outsideAvailability,
  rangeFor,
  shift,
  trainingAttendance,
  weekDays,
} from './agenda-view';

const LIMA = 'America/Lima';

const appointment = (overrides: Partial<Appointment> = {}): Appointment => ({
  id: 'a-1',
  memberId: 'm-1',
  patientId: 'p-1',
  kind: 'TRAINING',
  mode: 'IN_PERSON',
  location: null,
  meetingUrl: null,
  startsAt: '2026-11-16T14:00:00.000Z',
  endsAt: '2026-11-16T15:00:00.000Z',
  status: 'SCHEDULED',
  notes: null,
  reminderSentAt: null,
  attendancePending: false,
  createdAt: '2026-11-10T14:00:00.000Z',
  version: 0,
  ...overrides,
});

describe('RF-37 · RN-J03 · la agenda en pantalla', () => {
  it('la semana va de lunes a domingo', () => {
    expect(isoWeekday('2026-11-16')).toBe(1);
    expect(isoWeekday('2026-11-22')).toBe(7);
    expect(weekDays('2026-11-19')).toEqual([
      '2026-11-16',
      '2026-11-17',
      '2026-11-18',
      '2026-11-19',
      '2026-11-20',
      '2026-11-21',
      '2026-11-22',
    ]);
  });

  it('el mes en semanas completas, y el rango de cada vista cabe en los 42 días de la API', () => {
    const weeks = monthWeeks('2026-11-13');
    expect(weeks[0]?.[0]).toBe('2026-10-26');
    expect(weeks.at(-1)?.[6]).toBe('2026-12-06');
    expect(weeks).toHaveLength(6);
    expect(rangeFor('month', '2026-11-13')).toEqual({ from: '2026-10-26', to: '2026-12-06' });
    expect(rangeFor('week', '2026-11-13')).toEqual({ from: '2026-11-09', to: '2026-11-15' });
    expect(monthWeeks('2027-02-10')).toHaveLength(4);
  });

  it('anterior y siguiente: una semana o un mes', () => {
    expect(shift('week', '2026-11-13', 1)).toBe('2026-11-20');
    expect(shift('month', '2026-01-31', 1)).toBe('2026-02-01');
    expect(shift('month', '2026-01-15', -1)).toBe('2025-12-01');
  });

  it('las horas en la zona de la organización: las 14:00 UTC son las 09:00 en Lima', () => {
    expect(localParts('2026-11-16T14:00:00.000Z', LIMA)).toEqual({
      date: '2026-11-16',
      time: '09:00',
    });
    expect(localParts('2026-11-17T03:30:00.000Z', LIMA)).toEqual({
      date: '2026-11-16',
      time: '22:30',
    });
    const days = byLocalDate(
      [
        appointment({
          id: 'tarde',
          startsAt: '2026-11-17T03:30:00.000Z',
          endsAt: '2026-11-17T04:00:00.000Z',
        }),
        appointment({ id: 'mañana' }),
      ],
      LIMA,
    );
    expect(days.get('2026-11-16')?.map((a) => a.id)).toEqual(['mañana', 'tarde']);
  });

  it('fuera de la disponibilidad: si no cabe entera en una franja de su día; sin franjas, nunca', () => {
    const slots = [{ dayOfWeek: 1, startTime: '08:00', endTime: '13:00' }];
    expect(outsideAvailability(appointment(), slots, LIMA)).toBe(false);
    expect(
      outsideAvailability(
        appointment({ startsAt: '2026-11-16T17:30:00.000Z', endsAt: '2026-11-16T18:30:00.000Z' }),
        slots,
        LIMA,
      ),
    ).toBe(true);
    expect(
      outsideAvailability(appointment({ startsAt: '2026-11-17T14:00:00.000Z' }), slots, LIMA),
    ).toBe(true);
    expect(outsideAvailability(appointment(), [], LIMA)).toBe(false);
    expect(
      outsideAvailability(
        appointment({ status: 'CANCELLED', startsAt: '2026-11-17T14:00:00.000Z' }),
        slots,
        LIMA,
      ),
    ).toBe(false);
  });

  it('las acciones de cada cita, como decide la API: la asistencia desde que empieza', () => {
    const now = new Date('2026-11-16T14:30:00.000Z');
    expect(availableActions(appointment({ startsAt: '2026-11-16T16:00:00.000Z' }), now)).toEqual({
      confirm: true,
      cancel: true,
      attendance: false,
      reschedule: true,
    });
    expect(availableActions(appointment({ status: 'CONFIRMED' }), now)).toEqual({
      confirm: false,
      cancel: true,
      attendance: true,
      reschedule: true,
    });
    expect(availableActions(appointment({ status: 'COMPLETED' }), now)).toEqual({
      confirm: false,
      cancel: false,
      attendance: true,
      reschedule: false,
    });
    expect(availableActions(appointment({ status: 'CANCELLED' }), now)).toEqual({
      confirm: false,
      cancel: false,
      attendance: false,
      reschedule: false,
    });
  });

  it('07 §10 · sesiones verificadas y por validar: solo las de entrenamiento del rango', () => {
    const list = [
      appointment({ id: '1', status: 'COMPLETED' }),
      appointment({ id: '2', attendancePending: true }),
      appointment({ id: '3', kind: 'CONSULTATION', status: 'COMPLETED' }),
      appointment({ id: '4', status: 'COMPLETED', startsAt: '2026-12-20T14:00:00.000Z' }),
      appointment({ id: '5', status: 'NO_SHOW' }),
    ];
    expect(trainingAttendance(list, '2026-11-16', '2026-11-30', LIMA)).toEqual({
      verified: 1,
      pending: 1,
    });
  });

  it('la hora de fin según la duración, sin pasar de la medianoche', () => {
    expect(endTimeFor('09:00', 45)).toBe('09:45');
    expect(endTimeFor('23:30', 60)).toBe('23:59');
  });
});

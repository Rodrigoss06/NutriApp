import { describe, expect, it } from 'vitest';
import {
  agendaQuerySchema,
  changeAppointmentStatusSchema,
  createAppointmentSchema,
  putAvailabilitySchema,
  updateAppointmentSchema,
} from './appointments.js';

const base = {
  kind: 'CONSULTATION',
  mode: 'IN_PERSON',
  startsAt: '2026-11-16T09:00:00-05:00',
  endsAt: '2026-11-16T09:45:00-05:00',
} as const;

describe('RF-37 · RN-J03 · la agenda (ADR-125)', () => {
  it('una cita lleva instantes con su zona: la API los guarda en UTC', () => {
    expect(createAppointmentSchema.parse(base)).toEqual(base);
    expect(
      createAppointmentSchema.safeParse({ ...base, startsAt: '2026-11-16T09:00:00' }).success,
    ).toBe(false);
  });

  it('termina después de empezar', () => {
    expect(
      createAppointmentSchema.safeParse({ ...base, endsAt: '2026-11-16T09:00:00-05:00' }).success,
    ).toBe(false);
  });

  it('P-32 · el enlace de una cita virtual es externo y solo https, sin sincronizar', () => {
    expect(
      createAppointmentSchema.safeParse({
        ...base,
        mode: 'VIRTUAL',
        meetingUrl: 'https://meet.example.com/abc',
      }).success,
    ).toBe(true);
    expect(
      createAppointmentSchema.safeParse({ ...base, meetingUrl: 'http://meet.example.com/abc' })
        .success,
    ).toBe(false);
  });

  it('reprogramar pide el inicio y el fin juntos; null borra el lugar, el enlace o la nota', () => {
    expect(updateAppointmentSchema.safeParse({ startsAt: base.startsAt }).success).toBe(false);
    expect(updateAppointmentSchema.safeParse({}).success).toBe(false);
    expect(updateAppointmentSchema.parse({ location: null, notes: null })).toEqual({
      location: null,
      notes: null,
    });
  });

  it('el estado se cambia a confirmada, realizada, cancelada o no asistió; nunca de vuelta a programada', () => {
    expect(changeAppointmentStatusSchema.safeParse({ status: 'COMPLETED' }).success).toBe(true);
    expect(changeAppointmentStatusSchema.safeParse({ status: 'SCHEDULED' }).success).toBe(false);
  });

  it('la agenda pide fechas locales, de 1 a 42 días', () => {
    expect(agendaQuerySchema.safeParse({ from: '2026-11-16', to: '2026-11-22' }).success).toBe(
      true,
    );
    expect(agendaQuerySchema.safeParse({ from: '2026-11-16', to: '2026-12-27' }).success).toBe(
      true,
    );
    expect(agendaQuerySchema.safeParse({ from: '2026-11-16', to: '2026-12-28' }).success).toBe(
      false,
    );
    expect(agendaQuerySchema.safeParse({ from: '2026-11-22', to: '2026-11-16' }).success).toBe(
      false,
    );
  });

  it('la disponibilidad va por franjas de HH:MM, de lunes (1) a domingo (7)', () => {
    expect(
      putAvailabilitySchema.safeParse({
        slots: [{ dayOfWeek: 1, startTime: '08:00', endTime: '13:00' }],
      }).success,
    ).toBe(true);
    expect(
      putAvailabilitySchema.safeParse({
        slots: [{ dayOfWeek: 8, startTime: '08:00', endTime: '13:00' }],
      }).success,
    ).toBe(false);
    expect(
      putAvailabilitySchema.safeParse({
        slots: [{ dayOfWeek: 1, startTime: '13:00', endTime: '08:00' }],
      }).success,
    ).toBe(false);
    expect(
      putAvailabilitySchema.safeParse({
        slots: [{ dayOfWeek: 1, startTime: '8:00', endTime: '13:00' }],
      }).success,
    ).toBe(false);
  });
});

import {
  agendaResponseSchema,
  appointmentSchema,
  availabilityResponseSchema,
  meAppointmentsResponseSchema,
  type Appointment,
} from '@nutricoach/contracts';
import type { Clock } from '@nutricoach/shared-kernel';
import type request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RemindersHandler } from '../../src/modules/scheduling/index.js';
import { ApiHarness, PASSWORD, type StaffOrganization } from './support/api-harness.js';
import { id as uuid, pool } from './support/database.js';

/**
 * P15 · PR 1 · la agenda por la API, contra PostgreSQL como app_user (RF-37; RN-J01 a RN-J03; RN-A05; ADR-125): citas en la agenda
 * propia o, para el dueño y el administrador, en la de otro; los cruces los rechaza la base aunque lleguen a la vez; estados con
 * If-Match; la asistencia desde que empieza la cita; el paciente ve sus citas sin las notas; el recordatorio sale una sola vez 24
 * horas antes de una cita confirmada; la próxima cita llega al panel. El reloj de la API queda fijo. Datos sintéticos.
 */

class FakeClock implements Clock {
  current = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000);
  now(): Date {
    return new Date(this.current);
  }
}

const clock = new FakeClock();
const harness = new ApiHarness(clock);
const HOUR = 3_600_000;
const at = (hours: number): string =>
  new Date(clock.current.getTime() + hours * HOUR).toISOString();
const limaDate = (hours: number): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(
    new Date(clock.current.getTime() + hours * HOUR),
  );

let org: StaffOrganization;
let responsible: string;
let patientId: string;
let patientEmail: string;
let patientCookie: string;

const owner = async <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  (await pool('owner').query(sql, params)).rows as T[];

const sessionCookie = (response: request.Response): string => {
  const raw = response.headers['set-cookie'] as unknown as string[] | undefined;
  return raw?.find((c) => c.startsWith('nc_session='))?.split(';')[0] ?? '';
};

const book = (body: object, cookie = responsible): request.Test =>
  harness.post('/appointments', body, cookie);

async function booked(body: object, cookie = responsible): Promise<Appointment> {
  const response = await book(body, cookie);
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return appointmentSchema.parse(response.body);
}

const status = (appointment: Appointment, next: string, cookie = responsible): request.Test =>
  harness
    .put(`/appointments/${appointment.id}/status`, { status: next }, cookie)
    .set('If-Match', `"${String(appointment.version)}"`);

const training = (start: number, end: number, extra: object = {}) => ({
  patientId,
  kind: 'TRAINING',
  mode: 'IN_PERSON',
  startsAt: at(start),
  endsAt: at(end),
  ...extra,
});

beforeAll(async () => {
  await harness.start();
  org = await harness.createStaffOrganization();
  responsible = org.staff.responsible.cookie;
  patientEmail = `marta-${uuid()}@demo.test`;
  const registered = await harness.post(
    '/patients',
    {
      firstName: 'Marta',
      lastName: 'Sintética',
      sex: 'F',
      birthDate: '1990-04-12',
      email: patientEmail,
    },
    responsible,
  );
  expect(registered.status, JSON.stringify(registered.body)).toBe(201);
  patientId = (registered.body as { id: string }).id;
  const team = await harness.put(
    `/patients/${patientId}/care-team/${org.staff.team.memberId}`,
    { role: 'TRAINING', access: 'WRITE' },
    responsible,
  );
  expect(team.status, JSON.stringify(team.body)).toBeLessThan(300);
  const invited = await harness.post(
    `/patients/${patientId}/invitation`,
    { email: patientEmail },
    responsible,
  );
  expect(invited.status, JSON.stringify(invited.body)).toBeLessThan(300);
  const token = await harness.invitationTokenFor(patientEmail);
  const inspected = await harness.post('/invitations/inspect', { token });
  const consents = (inspected.body as { consents: { id: string }[] }).consents.map((c) => c.id);
  const accepted = await harness.post('/invitations/accept', {
    token,
    password: PASSWORD,
    acceptedConsentDocumentIds: consents,
  });
  expect(accepted.status, JSON.stringify(accepted.body)).toBe(200);
  patientCookie = sessionCookie(accepted);
}, 60_000);

afterAll(async () => {
  await harness.stop();
});

describe('RF-37 · RN-J03 · la agenda del profesional', () => {
  it('una cita en la agenda propia, con su paciente; la agenda la devuelve por fechas locales de Lima', async () => {
    const appointment = await booked(training(48, 49, { notes: 'Traer zapatillas' }));
    expect(appointment).toMatchObject({
      memberId: org.staff.responsible.memberId,
      status: 'SCHEDULED',
      version: 0,
      attendancePending: false,
      reminderSentAt: null,
    });
    const agenda = await harness.get(
      `/appointments?from=${limaDate(48)}&to=${limaDate(48)}&memberId=${org.staff.responsible.memberId}`,
      responsible,
    );
    expect(agenda.status, JSON.stringify(agenda.body)).toBe(200);
    const parsed = agendaResponseSchema.parse(agenda.body);
    expect(parsed.timezone).toBe('America/Lima');
    expect(parsed.appointments.map((a) => a.id)).toContain(appointment.id);
  });

  it('el profesional no pone citas en la agenda de otro; el administrador sí', async () => {
    const foreign = await book(
      {
        memberId: org.staff.responsible.memberId,
        kind: 'OTHER',
        mode: 'VIRTUAL',
        startsAt: at(60),
        endsAt: at(61),
      },
      org.staff.team.cookie,
    );
    expect(foreign.status).toBe(403);
    expect(foreign.body).toMatchObject({ code: 'NC-SCH-005' });
    const byAdmin = await booked(
      {
        memberId: org.staff.responsible.memberId,
        kind: 'OTHER',
        mode: 'VIRTUAL',
        meetingUrl: 'https://meet.example.com/sintetico',
        startsAt: at(60),
        endsAt: at(61),
      },
      org.staff.admin.cookie,
    );
    expect(byAdmin).toMatchObject({
      patientId: null,
      meetingUrl: 'https://meet.example.com/sintetico',
    });
  });

  it('RN-A05 · quien no ve al paciente no ve sus citas ni las pone', async () => {
    const outsider = org.staff.outsider.cookie;
    const denied = await book(
      { patientId, kind: 'CONSULTATION', mode: 'IN_PERSON', startsAt: at(70), endsAt: at(71) },
      outsider,
    );
    expect(denied.status).toBe(404);
    const agenda = await harness.get(
      `/appointments?from=${limaDate(48)}&to=${limaDate(48)}&memberId=${org.staff.responsible.memberId}`,
      outsider,
    );
    expect(agenda.status).toBe(200);
    expect(
      agendaResponseSchema.parse(agenda.body).appointments.filter((a) => a.patientId === patientId),
    ).toEqual([]);
    expect((await harness.get(`/patients/${patientId}/appointments`, outsider)).status).toBe(404);
  });

  it('la disponibilidad semanal se reemplaza entera y no admite franjas que se crucen', async () => {
    const path = `/members/${org.staff.responsible.memberId}/availability`;
    const saved = await harness.put(
      path,
      {
        slots: [
          { dayOfWeek: 3, startTime: '15:00', endTime: '19:00' },
          { dayOfWeek: 1, startTime: '08:00', endTime: '13:00' },
        ],
      },
      responsible,
    );
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(availabilityResponseSchema.parse(saved.body).slots).toEqual([
      { dayOfWeek: 1, startTime: '08:00', endTime: '13:00' },
      { dayOfWeek: 3, startTime: '15:00', endTime: '19:00' },
    ]);
    const overlap = await harness.put(
      path,
      {
        slots: [
          { dayOfWeek: 2, startTime: '08:00', endTime: '12:00' },
          { dayOfWeek: 2, startTime: '11:00', endTime: '14:00' },
        ],
      },
      responsible,
    );
    expect(overlap.status).toBe(422);
    expect(overlap.body).toMatchObject({ code: 'NC-SCH-010' });
    const foreign = await harness.put(path, { slots: [] }, org.staff.team.cookie);
    expect(foreign.status).toBe(403);
    const read = await harness.get(path, org.staff.team.cookie);
    expect(availabilityResponseSchema.parse(read.body).slots).toHaveLength(2);
  });
});

describe('RN-J01 · un profesional no tiene dos citas que se crucen', () => {
  it('la segunda falla con RN-J01; una que empieza cuando termina la otra, no', async () => {
    await booked(training(80, 81));
    const overlap = await book(training(80.5, 81.5));
    expect(overlap.status).toBe(422);
    expect(overlap.body).toMatchObject({ code: 'NC-SCH-002', rule: 'RN-J01' });
    await booked(training(81, 82));
  });

  it('aunque lleguen a la vez, solo una entra', async () => {
    const [first, second] = await Promise.all([
      book(training(90, 91)),
      book(training(90.25, 91.25)),
    ]);
    expect([first.status, second.status].sort()).toEqual([201, 422]);
    const failed = first.status === 422 ? first : second;
    expect(failed.body).toMatchObject({ rule: 'RN-J01' });
  });

  it('cancelar libera el horario; reprogramar encima de otra cita también falla con RN-J01', async () => {
    const appointment = await booked(training(100, 101));
    const cancelled = await status(appointment, 'CANCELLED');
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200);
    const again = await booked(training(100, 101));
    const other = await booked(training(102, 103));
    const moved = await harness
      .patch(`/appointments/${other.id}`, { startsAt: at(100.5), endsAt: at(101.5) }, responsible)
      .set('If-Match', `"${String(other.version)}"`);
    expect(moved.status).toBe(422);
    expect(moved.body).toMatchObject({ rule: 'RN-J01' });
    expect(again.status).toBe('SCHEDULED');
  });
});

describe('RF-37 · estados, reprogramación y asistencia (ADR-125)', () => {
  it('reprogramar pide If-Match y la versión vigente', async () => {
    const appointment = await booked(training(120, 121));
    const missing = await harness.patch(
      `/appointments/${appointment.id}`,
      { notes: 'Sin versión' },
      responsible,
    );
    expect(missing.status).toBe(428);
    const moved = await harness
      .patch(
        `/appointments/${appointment.id}`,
        { startsAt: at(122), endsAt: at(123), location: 'Sala 2' },
        responsible,
      )
      .set('If-Match', '"0"');
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
    expect(appointmentSchema.parse(moved.body)).toMatchObject({
      version: 1,
      location: 'Sala 2',
      startsAt: at(122),
    });
    const stale = await harness
      .patch(`/appointments/${appointment.id}`, { notes: 'Versión vieja' }, responsible)
      .set('If-Match', '"0"');
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ code: 'NC-SCH-009' });
  });

  it('07 §10 · la asistencia se valida desde que empieza la cita; antes, 409', async () => {
    const future = await booked(training(130, 131));
    const early = await status(future, 'COMPLETED');
    expect(early.status).toBe(409);
    expect(early.body).toMatchObject({ code: 'NC-SCH-008' });

    const started = await booked(training(-2, -1));
    expect(started.attendancePending).toBe(true);
    const attended = await status(started, 'COMPLETED');
    expect(attended.status, JSON.stringify(attended.body)).toBe(200);
    const corrected = await status(appointmentSchema.parse(attended.body), 'NO_SHOW');
    expect(appointmentSchema.parse(corrected.body)).toMatchObject({
      status: 'NO_SHOW',
      attendancePending: false,
    });
    const closed = await harness
      .patch(`/appointments/${started.id}`, { notes: 'Tarde' }, responsible)
      .set('If-Match', `"${String(appointmentSchema.parse(corrected.body).version)}"`);
    expect(closed.status).toBe(409);
    expect(closed.body).toMatchObject({ code: 'NC-SCH-007' });
  });

  it('el paciente ve sus citas próximas y pasadas, sin las notas del profesional', async () => {
    const response = await harness.get('/me/appointments', patientCookie);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const mine = meAppointmentsResponseSchema.parse(response.body);
    expect(mine.timezone).toBe('America/Lima');
    expect(mine.upcoming.length).toBeGreaterThan(0);
    expect(mine.past.some((a) => a.status === 'NO_SHOW')).toBe(true);
    expect(JSON.stringify(response.body)).not.toContain('Traer zapatillas');
    const staff = await harness.get(`/patients/${patientId}/appointments`, responsible);
    expect(JSON.stringify(staff.body)).toContain('Traer zapatillas');
    expect(
      (await harness.get('/appointments?from=2026-11-01&to=2026-11-02', patientCookie)).status,
    ).toBe(403);
  });
});

describe('RN-J02 · el recordatorio por correo, 24 horas antes de la cita confirmada', () => {
  it('sale una sola vez, al paciente con correo, solo si la cita está confirmada', async () => {
    const confirmed = await booked(training(20, 21, { location: 'Sede Miraflores' }));
    const waiting = await booked(training(22, 23));
    expect((await status(confirmed, 'CONFIRMED')).status).toBe(200);

    const handler = harness.app.get(RemindersHandler);
    expect(await handler.execute()).toBeGreaterThanOrEqual(1);
    await harness.deliver('scheduling.mailer');
    const mails = harness.sent.filter(
      (m) => m.to === patientEmail && m.subject.startsWith('Recordatorio'),
    );
    expect(mails).toHaveLength(1);
    expect(mails[0]?.text).toContain('Sede Miraflores');
    expect(mails[0]?.text).not.toContain('Traer zapatillas');

    const [row] = await owner<{ reminder_sent_at: Date | null }>(
      'SELECT reminder_sent_at FROM scheduling.appointment WHERE id = $1',
      [confirmed.id],
    );
    expect(row?.reminder_sent_at).not.toBeNull();
    const [notConfirmed] = await owner<{ reminder_sent_at: Date | null }>(
      'SELECT reminder_sent_at FROM scheduling.appointment WHERE id = $1',
      [waiting.id],
    );
    expect(notConfirmed?.reminder_sent_at).toBeNull();

    await handler.execute();
    await harness.deliver('scheduling.mailer');
    expect(
      harness.sent.filter((m) => m.to === patientEmail && m.subject.startsWith('Recordatorio')),
    ).toHaveLength(1);
  });

  it('reprogramar una cita ya recordada deja pendiente su recordatorio', async () => {
    const appointment = await booked(training(10, 11));
    const confirmed = appointmentSchema.parse((await status(appointment, 'CONFIRMED')).body);
    await harness.app.get(RemindersHandler).execute();
    const reminded = await harness.get(`/appointments/${appointment.id}`, responsible);
    const current = appointmentSchema.parse(reminded.body);
    expect(current.reminderSentAt).not.toBeNull();
    const moved = await harness
      .patch(`/appointments/${appointment.id}`, { startsAt: at(150), endsAt: at(151) }, responsible)
      .set('If-Match', `"${String(current.version)}"`);
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
    expect(appointmentSchema.parse(moved.body)).toMatchObject({
      reminderSentAt: null,
      status: confirmed.status,
    });
  });
});

describe('RF-34 · RN-B03 · la próxima cita en el panel y la auditoría', () => {
  it('el panel guarda la próxima cita programada o confirmada del paciente', async () => {
    await harness.deliver('analytics.overview');
    const [overview] = await owner<{ next_appointment_at: Date | null }>(
      'SELECT next_appointment_at FROM analytics.patient_overview WHERE patient_id = $1',
      [patientId],
    );
    const [next] = await owner<{ starts_at: Date }>(
      `SELECT min(starts_at) AS starts_at FROM scheduling.appointment
       WHERE patient_id = $1 AND status IN ('SCHEDULED','CONFIRMED') AND starts_at > $2`,
      [patientId, clock.now()],
    );
    expect(overview?.next_appointment_at?.toISOString()).toBe(next?.starts_at.toISOString());
  });

  it('cada cambio queda en la auditoría, sin la nota, el lugar ni el enlace', async () => {
    await harness.deliver('audit.events');
    const rows = await owner<{ action: string; changed_fields: string[] | null }>(
      `SELECT action, changed_fields FROM audit.audit_log
       WHERE organization_id = $1 AND resource_type = 'scheduling.appointment'`,
      [org.organizationId],
    );
    expect(rows.some((r) => r.action === 'CREATE')).toBe(true);
    expect(rows.some((r) => r.action === 'UPDATE' && r.changed_fields?.includes('status'))).toBe(
      true,
    );
    expect(JSON.stringify(rows)).not.toContain('Sede Miraflores');
  });
});

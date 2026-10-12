import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiHarness, type StaffOrganization } from './support/api-harness.js';

/**
 * P6 · consulta de auditoría del dueño (RF-06, RN-B03) por HTTP contra PostgreSQL como app_user: solo OWNER, rango de
 * fechas obligatorio de 90 días como máximo, filtros, nombre de quien actuó y código del paciente, y nada de otra
 * organización.
 */

const harness = new ApiHarness();
let org: StaffOrganization;
let other: StaffOrganization;

interface Problem {
  code: string;
  rule?: string;
}
interface AuditEvent {
  id: string;
  actorUserId: string | null;
  actorName: string | null;
  action: string;
  resourceType: string;
  patientId: string | null;
  patientCode: string | null;
}
interface AuditPage {
  events: AuditEvent[];
  nextCursor: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const range = (days = 1) => {
  const to = new Date(Date.now() + 60_000);
  return `from=${new Date(to.getTime() - days * DAY_MS).toISOString()}&to=${to.toISOString()}`;
};

async function patientOpenedBy(target: StaffOrganization): Promise<{ id: string; code: string }> {
  const { cookie } = target.staff.responsible;
  const created = await harness.post(
    '/patients',
    { firstName: 'Mario', lastName: 'Ccori Paz', sex: 'M', birthDate: '1979-02-17' },
    cookie,
  );
  expect(created.status).toBe(201);
  const { id } = created.body as { id: string };
  const opened = await harness.get(`/patients/${id}`, cookie);
  return { id, code: (opened.body as { code: string }).code };
}

const list = (query: string, cookie = org.staff.owner.cookie) =>
  harness.get(`/audit-events?${query}`, cookie);

beforeAll(async () => {
  await harness.start();
  org = await harness.createStaffOrganization();
  other = await harness.createStaffOrganization();
});

afterAll(async () => {
  await harness.stop();
});

describe('RF-06 · auditoría para el dueño', () => {
  it('solo OWNER; el rango de fechas es obligatorio y de 90 días como máximo', async () => {
    for (const key of ['admin', 'responsible'] as const) {
      const denied = await list(range(), org.staff[key].cookie);
      expect(denied.status).toBe(403);
      expect((denied.body as Problem).code).toBe('NC-TEN-015');
    }
    expect((await list('')).status).toBe(400);
    expect((await list(range(91))).status).toBe(400);
    const to = new Date();
    const reversed = `from=${to.toISOString()}&to=${new Date(to.getTime() - DAY_MS).toISOString()}`;
    expect((await list(reversed)).status).toBe(400);
    expect((await list(range(90))).status).toBe(200);
  });

  it('muestra quién actuó y el código del paciente; filtra por paciente, persona y acción; pagina', async () => {
    const patient = await patientOpenedBy(org);
    await harness.deliver('audit.events');
    const { responsible } = org.staff;

    const byPatient = await list(`${range()}&patientId=${patient.id}`);
    expect(byPatient.status).toBe(200);
    expect(byPatient.headers['cache-control']).toBe('no-store');
    const events = (byPatient.body as AuditPage).events;
    expect(events.map((e) => [e.action, e.resourceType])).toEqual(
      expect.arrayContaining([
        ['READ', 'clinical.patient'],
        ['CREATE', 'clinical.patient'],
      ]),
    );
    expect(events.every((e) => e.patientId === patient.id && e.patientCode === patient.code)).toBe(
      true,
    );
    const read = events.find((e) => e.action === 'READ');
    expect(read).toMatchObject({
      actorUserId: responsible.userId,
      actorName: 'Persona responsible',
    });

    const reads = await list(
      `${range()}&patientId=${patient.id}&userId=${responsible.userId}&action=READ`,
    );
    expect((reads.body as AuditPage).events.map((e) => e.action)).toEqual(['READ']);

    const first = await list(`${range()}&patientId=${patient.id}&limit=1`);
    const page = first.body as AuditPage;
    expect(page.events).toHaveLength(1);
    expect(page.nextCursor).not.toBeNull();
    const second = await list(
      `${range()}&patientId=${patient.id}&limit=1&cursor=${encodeURIComponent(page.nextCursor ?? '')}`,
    );
    const next = (second.body as AuditPage).events;
    expect(next).toHaveLength(1);
    expect(next[0]?.id).not.toBe(page.events[0]?.id);
  });

  it('RN-A01 · lo de otra organización no aparece, ni filtrando por su paciente', async () => {
    const foreign = await patientOpenedBy(other);
    await harness.deliver('audit.events');
    expect(((await list(`${range()}&patientId=${foreign.id}`)).body as AuditPage).events).toEqual(
      [],
    );
    const all = (await list(`${range()}&limit=100`)).body as AuditPage;
    expect(all.events.some((e) => e.patientId === foreign.id)).toBe(false);
    const theirs = await list(`${range()}&patientId=${foreign.id}`, other.staff.owner.cookie);
    expect((theirs.body as AuditPage).events.length).toBeGreaterThan(0);
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiHarness, type StaffMember, type StaffOrganization } from './support/api-harness.js';
import { errorCode, PG, pool, withContext } from './support/database.js';

/**
 * P6 · expediente por HTTP contra PostgreSQL como app_user: historia clínica versionada, condiciones, objetivos y notas
 * (RF-09), línea de tiempo (RF-10), consentimiento HEALTH_DATA (RN-B01), equipo de atención (RN-A05), notas
 * AUTHOR_ONLY y READ en la auditoría (RN-B03).
 */

const harness = new ApiHarness();
let org: StaffOrganization;

interface Created {
  id: string;
}
interface Problem {
  code: string;
  rule?: string;
}
interface History {
  current: { revision: number; answers: Record<string, string> } | null;
  revisions: { revision: number }[];
}
interface Timeline {
  items: {
    kind: string;
    occurredAt: string;
    refId: string;
    label: string;
    detail: string | null;
  }[];
  nextCursor: string | null;
}

const PERSON = {
  firstName: 'Carmen',
  lastName: 'Rojas Salas',
  sex: 'F',
  birthDate: '1985-11-02',
} as const;

async function register(cookie: string): Promise<string> {
  const response = await harness.post('/patients', PERSON, cookie);
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return (response.body as Created).id;
}

async function grantHealthData(cookie: string, patientId: string): Promise<void> {
  const listed = await harness.get('/patients/consent-documents', cookie);
  const { documents } = listed.body as { documents: { id: string; purpose: string }[] };
  const response = await harness
    .post(`/patients/${patientId}/consents`, undefined, cookie)
    .field('consentDocumentId', documents.find((d) => d.purpose === 'HEALTH_DATA')?.id ?? '')
    .field('channel', 'IN_PERSON_DIGITAL');
  expect(response.status).toBe(201);
}

async function join(patientId: string, member: StaffMember, access: 'READ' | 'WRITE') {
  const response = await harness.put(
    `/patients/${patientId}/care-team/${member.memberId}`,
    { role: 'COLLABORATOR', access },
    org.staff.responsible.cookie,
  );
  expect(response.status).toBe(204);
}

/** Lo que la auditoría registró de ese actor sobre el paciente, por tipo de recurso. */
async function reads(patientId: string, member: StaffMember): Promise<string[]> {
  const { rows } = await pool('owner').query<{ resource_type: string }>(
    `SELECT resource_type FROM audit.audit_log
     WHERE action = 'READ' AND patient_id = $1 AND actor_user_id = $2 ORDER BY occurred_at, id`,
    [patientId, member.userId],
  );
  return rows.map((r) => r.resource_type);
}

/** Contexto de base de un miembro, como lo fija la UnitOfWork. */
const contextOf = (member: StaffMember, role: 'OWNER' | 'PROFESSIONAL' = 'PROFESSIONAL') => ({
  orgId: org.organizationId,
  userId: member.userId,
  role,
  memberId: member.memberId,
});

beforeAll(async () => {
  await harness.start();
  org = await harness.createStaffOrganization();
});

afterAll(async () => {
  await harness.stop();
});

describe('RF-09 · historia clínica versionada', () => {
  it('criterio P6 · sin consentimiento, guardar la historia clínica devuelve 422 con rule RN-B01', async () => {
    const id = await register(org.staff.responsible.cookie);
    const response = await harness.put(
      `/patients/${id}/clinical-history`,
      { expectedRevision: 0, answers: { sleep: 'Duerme 6 horas.' } },
      org.staff.responsible.cookie,
    );
    expect(response.status).toBe(422);
    expect(response.body as Problem).toMatchObject({ code: 'NC-CLI-002', rule: 'RN-B01' });
    const { rows } = await pool('owner').query(
      `SELECT 1 FROM clinical.clinical_history WHERE patient_id = $1`,
      [id],
    );
    expect(rows).toHaveLength(0);
  });

  it('cada guardado es una revisión nueva; la desfasada es 409; leerla deja un READ', async () => {
    const { responsible, team } = org.staff;
    const id = await register(responsible.cookie);
    await grantHealthData(responsible.cookie, id);
    await join(id, team, 'READ');
    const save = (expectedRevision: number, answers: object) =>
      harness.put(
        `/patients/${id}/clinical-history`,
        { expectedRevision, answers },
        responsible.cookie,
      );

    expect((await save(0, { sleep: 'Duerme 6 horas.' })).body).toEqual({ revision: 1 });
    const stale = await save(0, { sleep: 'Duerme 8 horas.' });
    expect(stale.status).toBe(409);
    expect((stale.body as Problem).code).toBe('NC-CLI-019');
    expect(
      (await save(1, { sleep: 'Duerme 7 horas.', surgeries: 'Apendicectomía en 2010.' })).body,
    ).toEqual({ revision: 2 });
    expect((await save(2, { diagnosis: 'no es un bloque del formulario' })).status).toBe(400);

    const read = await harness.get(`/patients/${id}/clinical-history`, team.cookie);
    expect(read.status).toBe(200);
    expect(read.headers['cache-control']).toBe('no-store');
    const history = read.body as History;
    expect(history.current).toMatchObject({
      revision: 2,
      answers: { sleep: 'Duerme 7 horas.', surgeries: 'Apendicectomía en 2010.' },
    });
    expect(history.revisions.map((r) => r.revision)).toEqual([2, 1]);
    expect(await reads(id, team)).toEqual(['clinical.clinical_history']);
  });

  it('RN-A05 · fuera del equipo no existe; con READ, o siendo OWNER fuera del equipo, no escribe; archivado es 409', async () => {
    const { responsible, team, outsider } = org.staff;
    const id = await register(responsible.cookie);
    await grantHealthData(responsible.cookie, id);
    await join(id, team, 'READ');
    const body = { expectedRevision: 0, answers: {} };

    expect((await harness.get(`/patients/${id}/clinical-history`, outsider.cookie)).status).toBe(
      404,
    );
    expect(await reads(id, outsider)).toEqual([]);
    const byOutsider = await harness.put(`/patients/${id}/clinical-history`, body, outsider.cookie);
    expect(byOutsider.status).toBe(404);
    const byReader = await harness.put(`/patients/${id}/clinical-history`, body, team.cookie);
    expect(byReader.status).toBe(403);
    expect((byReader.body as Problem).code).toBe('NC-CLI-013');
    // OWNER ve a todos, pero lo clínico lo escribe el equipo que atiende.
    const { owner } = org.staff;
    expect((await harness.get(`/patients/${id}/clinical-history`, owner.cookie)).status).toBe(200);
    expect((await harness.put(`/patients/${id}/clinical-history`, body, owner.cookie)).status).toBe(
      403,
    );

    await harness.post(`/patients/${id}/archive`, undefined, responsible.cookie);
    const archived = await harness.put(
      `/patients/${id}/clinical-history`,
      body,
      responsible.cookie,
    );
    expect(archived.status).toBe(409);
    expect((archived.body as Problem).code).toBe('NC-CLI-018');
  });
});

describe('RF-09 · condiciones, objetivos y notas', () => {
  it('condiciones y objetivos son filas propias: solo cambian estado y notas, también en la base', async () => {
    const { responsible } = org.staff;
    const id = await register(responsible.cookie);
    await grantHealthData(responsible.cookie, id);

    const condition = await harness.post(
      `/patients/${id}/conditions`,
      { kind: 'DISEASE', label: 'Hipotiroidismo', codeSystem: 'CIE-10', code: 'E03.9' },
      responsible.cookie,
    );
    expect(condition.status).toBe(201);
    const conditionId = (condition.body as Created).id;
    const changed = await harness.patch(
      `/patients/${id}/conditions/${conditionId}`,
      { status: 'RESOLVED', notes: 'Controlado con tratamiento.' },
      responsible.cookie,
    );
    expect(changed.status).toBe(204);
    expect(
      (
        await harness.patch(
          `/patients/${id}/conditions/${conditionId}`,
          { label: 'Otro' },
          responsible.cookie,
        )
      ).status,
    ).toBe(400);
    const missing = await harness.patch(
      `/patients/${id}/conditions/${id}`,
      { status: 'ACTIVE' },
      responsible.cookie,
    );
    expect(missing.status).toBe(404);
    expect((missing.body as Problem).code).toBe('NC-CLI-020');
    const conditions = await harness.get(`/patients/${id}/conditions`, responsible.cookie);
    expect((conditions.body as { conditions: unknown[] }).conditions).toEqual([
      expect.objectContaining({
        id: conditionId,
        label: 'Hipotiroidismo',
        status: 'RESOLVED',
        notes: 'Controlado con tratamiento.',
      }),
    ]);

    const goal = await harness.post(
      `/patients/${id}/goals`,
      { kind: 'FAT_LOSS', metricCode: 'WEIGHT_KG', targetValue: 62.5, targetDate: '2027-01-31' },
      responsible.cookie,
    );
    expect(goal.status).toBe(201);
    const goalId = (goal.body as Created).id;
    expect(
      (
        await harness.patch(
          `/patients/${id}/goals/${goalId}`,
          { status: 'ACHIEVED' },
          responsible.cookie,
        )
      ).status,
    ).toBe(204);
    const goals = await harness.get(`/patients/${id}/goals`, responsible.cookie);
    expect((goals.body as { goals: unknown[] }).goals).toEqual([
      expect.objectContaining({ id: goalId, status: 'ACHIEVED', targetValue: 62.5 }),
    ]);
    expect(await reads(id, responsible)).toEqual(
      expect.arrayContaining(['clinical.condition', 'clinical.goal']),
    );

    // Lo registrado no se reescribe ni con SQL: app_user solo actualiza estado y notas.
    await withContext('user', contextOf(responsible), async (client) => {
      expect(
        await errorCode(client, `UPDATE clinical.condition SET label = 'Otro' WHERE id = $1`, [
          conditionId,
        ]),
      ).toBe(PG.insufficientPrivilege);
      expect(
        await errorCode(client, `UPDATE clinical.goal SET target_value = 50 WHERE id = $1`, [
          goalId,
        ]),
      ).toBe(PG.insufficientPrivilege);
    });
  });

  it('AUTHOR_ONLY la ve solo su autor, también frente a OWNER; una nota no se edita: se enmienda', async () => {
    const { responsible, team, owner } = org.staff;
    const id = await register(responsible.cookie);
    await grantHealthData(responsible.cookie, id);
    await join(id, team, 'WRITE');
    const write = (member: StaffMember, body: object) =>
      harness.post(`/patients/${id}/notes`, body, member.cookie);

    const privateNote = await write(responsible, {
      body: 'Impresión personal: ansiedad por la comida.',
      visibility: 'AUTHOR_ONLY',
    });
    expect(privateNote.status).toBe(201);
    const privateId = (privateNote.body as Created).id;
    const shared = await write(responsible, { body: 'Primera consulta, sin novedades.' });
    const sharedId = (shared.body as Created).id;

    const notesOf = async (member: StaffMember) =>
      (
        (await harness.get(`/patients/${id}/notes`, member.cookie)).body as {
          notes: { id: string; visibility: string; amendsNoteId: string | null }[];
        }
      ).notes.map((n) => n.id);
    expect(await notesOf(responsible)).toEqual(expect.arrayContaining([privateId, sharedId]));
    expect(await notesOf(team)).toEqual([sharedId]);
    expect(await notesOf(owner)).toEqual([sharedId]);

    // Enmendar una nota que no se ve es como enmendar una que no existe.
    const hidden = await write(team, { body: 'Corrijo.', amendsNoteId: privateId });
    expect(hidden.status).toBe(404);
    expect((hidden.body as Problem).code).toBe('NC-CLI-022');
    const amend = await write(team, { body: 'Corrijo: fue la segunda.', amendsNoteId: sharedId });
    expect(amend.status).toBe(201);

    const timeline = await harness.get(`/patients/${id}/timeline`, owner.cookie);
    const refIds = (timeline.body as Timeline).items.map((i) => i.refId);
    expect(refIds).toContain(sharedId);
    expect(refIds).not.toContain(privateId);

    await withContext('user', contextOf(responsible), async (client) => {
      expect(
        await errorCode(client, `UPDATE clinical.clinical_note SET body = 'Otro' WHERE id = $1`, [
          sharedId,
        ]),
      ).toBe(PG.insufficientPrivilege);
    });
  });
});

describe('RF-10 · línea de tiempo del expediente', () => {
  it('de lo más reciente a lo más antiguo, por páginas, con todo lo que pasó', async () => {
    const { responsible, team } = org.staff;
    const id = await register(responsible.cookie);
    await grantHealthData(responsible.cookie, id);
    await join(id, team, 'READ');
    await harness.put(
      `/patients/${id}/clinical-history`,
      { expectedRevision: 0, answers: { dietHabits: 'Tres comidas al día.' } },
      responsible.cookie,
    );
    await harness.post(
      `/patients/${id}/conditions`,
      { kind: 'ALLERGY', label: 'Maní' },
      responsible.cookie,
    );
    await harness.post(`/patients/${id}/goals`, { kind: 'HEALTH' }, responsible.cookie);
    await harness.post(`/patients/${id}/notes`, { body: 'Plan acordado.' }, responsible.cookie);

    const first = await harness.get(`/patients/${id}/timeline?limit=4`, team.cookie);
    expect(first.status).toBe(200);
    const page = first.body as Timeline;
    expect(page.items).toHaveLength(4);
    expect(page.nextCursor).not.toBeNull();
    const rest = (
      await harness.get(
        `/patients/${id}/timeline?limit=4&cursor=${encodeURIComponent(page.nextCursor ?? '')}`,
        team.cookie,
      )
    ).body as Timeline;
    expect(rest.nextCursor).toBeNull();
    const items = [...page.items, ...rest.items];
    expect(items.map((i) => i.kind).sort()).toEqual([
      'CONDITION_RECORDED',
      'CONSENT_GRANTED',
      'GOAL_RECORDED',
      'HISTORY_REVISED',
      'NOTE_WRITTEN',
      'PATIENT_REGISTERED',
    ]);
    const times = items.map((i) => i.occurredAt);
    expect(times).toEqual([...times].sort().reverse());
    expect(items.find((i) => i.kind === 'CONDITION_RECORDED')).toMatchObject({
      label: 'ALLERGY',
      detail: 'Maní',
    });
    expect((await harness.get(`/patients/${id}/timeline?limit=500`, team.cookie)).status).toBe(400);
    const garbage = await harness.get(`/patients/${id}/timeline?cursor=%25%25%25`, team.cookie);
    expect((garbage.body as Timeline).items).toHaveLength(6);
    expect(await reads(id, team)).toEqual([
      'clinical.timeline',
      'clinical.timeline',
      'clinical.timeline',
    ]);
  });
});

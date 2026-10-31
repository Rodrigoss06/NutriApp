import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiHarness, type StaffMember, type StaffOrganization } from './support/api-harness.js';
import { errorCode, id as uuid, PG, pool, withContext } from './support/database.js';

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
interface Revision {
  revision: number;
  formCode: string;
  formVersion: string;
  answers: Record<string, unknown>;
  profile: {
    methodCode: string;
    methodVersion: string;
    engineVersion: string;
    pri: number | null;
    domainScores: Record<string, number | null>;
    classes: Record<string, string | null>;
    computedAt: string;
  } | null;
}
interface History {
  current: Revision | null;
  revisions: { revision: number; formCode: string }[];
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

/** Respuestas que dan 80, 60, 70, 90, 50, 70 y 60, de objetivo a adherencia (G-40). */
const G40_ANSWERS = {
  G03: 4,
  G04: 4,
  A01: 3,
  A02: 45,
  A03: 3,
  A04: 3,
  E01: 'Y1_3',
  E02: 'INTERMITTENT',
  E03: 4,
  E04: 3,
  R01: 8,
  R02: 5,
  R03: 4,
  R04: 2,
  R05: 2,
  R06: 5,
  L01: 8,
  L02: 3000,
  L03: 'WEEKLY',
  L04: 'YES',
  N01: 'VARIABLE',
  N02: 'USUALLY',
  N03: 'MODERATE',
  N04: 1.5,
  H01: 3,
  H02: 3,
  H03: 3,
  H04: 3,
  H05: 3,
};

describe('RF-43 · RN-F16 · anamnesis V2 y perfil de rendimiento', () => {
  const saveAnamnesis = (id: string, expectedRevision: number, answers: object) =>
    harness.put(
      `/patients/${id}/clinical-history`,
      { expectedRevision, answers: { modality: 'ONLINE', ...answers } },
      org.staff.responsible.cookie,
    );

  it('G-40: la revisión queda como JV_ANAMNESIS V2 con su perfil, su método y sus insumos (RN-D01)', async () => {
    const { responsible } = org.staff;
    const id = await register(responsible.cookie);
    await grantHealthData(responsible.cookie, id);

    const saved = await saveAnamnesis(id, 0, { ...G40_ANSWERS, G02: 'Volver a correr.' });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);

    const history = (await harness.get(`/patients/${id}/clinical-history`, responsible.cookie))
      .body as History;
    expect(history.current).toMatchObject({
      revision: 1,
      formCode: 'JV_ANAMNESIS',
      formVersion: 'V2',
      answers: { modality: 'ONLINE', G02: 'Volver a correr.', R01: 8 },
      profile: {
        methodCode: 'PRI_JV',
        methodVersion: '2.0.0',
        pri: 69.5,
        domainScores: {
          OBJECTIVE: 80,
          AVAILABILITY: 60,
          EXPERIENCE: 70,
          RECOVERY: 90,
          LIFESTYLE: 50,
          NUTRITION: 70,
          ADHERENCE: 60,
        },
        classes: {
          recoveryCapacity: 'HIGH',
          volumeTolerance: 'MODERATE',
          supervision: 'MODERATE',
          checkIn: 'WEEKLY_OR_BIWEEKLY',
          topPriority: 'LIFESTYLE',
        },
      },
    });
    expect(history.revisions).toMatchObject([{ revision: 1, formCode: 'JV_ANAMNESIS' }]);
    const { rows } = await pool('owner').query<{
      inputs: { answers: Record<string, unknown> };
      hash_bytes: number;
    }>(
      `SELECT inputs, octet_length(inputs_hash) AS hash_bytes FROM clinical.performance_profile
       WHERE patient_id = $1`,
      [id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.hash_bytes).toBe(32);
    expect(Object.keys(rows[0]?.inputs.answers ?? {})).toHaveLength(29);
    expect(rows[0]?.inputs.answers).not.toHaveProperty('G02');
  });

  it('se guarda aunque falten respuestas: lo vacío no cuenta y sin puntaje no hay PRI (P-10)', async () => {
    const { responsible } = org.staff;
    const id = await register(responsible.cookie);
    await grantHealthData(responsible.cookie, id);

    await saveAnamnesis(id, 0, { G02: 'Solo texto.' });
    await saveAnamnesis(id, 1, { R01: 7 });

    const first = (
      await harness.get(`/patients/${id}/clinical-history/revisions/1`, responsible.cookie)
    ).body as Revision;
    const second = (
      await harness.get(`/patients/${id}/clinical-history/revisions/2`, responsible.cookie)
    ).body as Revision;
    expect(first.profile).toMatchObject({ pri: null, domainScores: { RECOVERY: null } });
    expect(first.profile?.classes['topPriority']).toBeNull();
    expect(second.profile).toMatchObject({
      pri: 80,
      domainScores: { RECOVERY: 80, ADHERENCE: null },
    });
    expect(second.profile?.classes['topPriority']).toBe('RECOVERY');
  });

  it('el contrato valida: una escala fuera de 1 a 5, sin modalidad o con un código que no existe es 400', async () => {
    const { responsible } = org.staff;
    const id = await register(responsible.cookie);
    await grantHealthData(responsible.cookie, id);

    expect((await saveAnamnesis(id, 0, { G03: 6 })).status).toBe(400);
    expect((await saveAnamnesis(id, 0, { A01: 2.5 })).status).toBe(400);
    expect((await saveAnamnesis(id, 0, { E01: 'MUCHA' })).status).toBe(400);
    const withoutModality = await harness.put(
      `/patients/${id}/clinical-history`,
      { expectedRevision: 0, answers: {} },
      responsible.cookie,
    );
    expect(withoutModality.status).toBe(400);
  });

  it('la historia v1 queda de solo lectura: se lee por su número y no se guarda otra; la V2 sigue su numeración', async () => {
    const { responsible, team } = org.staff;
    const id = await register(responsible.cookie);
    await grantHealthData(responsible.cookie, id);
    await join(id, team, 'READ');
    await pool('owner').query(
      `INSERT INTO clinical.clinical_history (id, organization_id, patient_id, revision, form_code, form_version,
                                              answers, recorded_by)
       VALUES ($1, $2, $3, 1, 'ANAMNESIS', '1', $4, $5)`,
      [
        uuid(),
        org.organizationId,
        id,
        JSON.stringify({ sleep: 'Duerme 6 horas.' }),
        responsible.userId,
      ],
    );

    const before = (await harness.get(`/patients/${id}/clinical-history`, team.cookie))
      .body as History;
    expect(before.current).toMatchObject({
      revision: 1,
      formCode: 'ANAMNESIS',
      formVersion: '1',
      answers: { sleep: 'Duerme 6 horas.' },
      profile: null,
    });
    const legacy = await harness.put(
      `/patients/${id}/clinical-history`,
      { expectedRevision: 1, answers: { sleep: 'Duerme 7 horas.' } },
      responsible.cookie,
    );
    expect(legacy.status).toBe(400);

    expect((await saveAnamnesis(id, 1, { R01: 7 })).body).toEqual({ revision: 2 });

    const after = (await harness.get(`/patients/${id}/clinical-history`, team.cookie))
      .body as History;
    expect(after.current).toMatchObject({ revision: 2, formCode: 'JV_ANAMNESIS' });
    expect(after.revisions.map((r) => r.formCode)).toEqual(['JV_ANAMNESIS', 'ANAMNESIS']);
    const v1 = await harness.get(`/patients/${id}/clinical-history/revisions/1`, team.cookie);
    expect(v1.status).toBe(200);
    expect(v1.headers['cache-control']).toBe('no-store');
    expect(v1.body).toMatchObject({ formCode: 'ANAMNESIS', answers: { sleep: 'Duerme 6 horas.' } });
  });

  it('RN-A05 · RN-B03: una revisión por su número deja su READ; fuera del equipo, o si no existe, 404', async () => {
    const { responsible, team, outsider } = org.staff;
    const id = await register(responsible.cookie);
    await grantHealthData(responsible.cookie, id);
    await join(id, team, 'READ');
    await saveAnamnesis(id, 0, { R01: 7 });
    const path = `/patients/${id}/clinical-history/revisions`;

    expect((await harness.get(`${path}/1`, team.cookie)).status).toBe(200);
    expect(await reads(id, team)).toEqual(['clinical.clinical_history']);
    expect((await harness.get(`${path}/1`, outsider.cookie)).status).toBe(404);
    expect(await reads(id, outsider)).toEqual([]);
    expect((await harness.get(`${path}/9`, team.cookie)).status).toBe(404);
    // Un número que no cabe en la columna tampoco es una revisión: no llega a la base.
    for (const invalid of ['uno', '0', '1.5', '2147483648']) {
      expect((await harness.get(`${path}/${invalid}`, team.cookie)).status, invalid).toBe(400);
    }
  });

  it('RN-A01 · RN-A05 · RN-D08: como app_user solo lo ve el equipo, ni el paciente ni otra organización, y no cambia', async () => {
    const { responsible, outsider } = org.staff;
    const id = await register(responsible.cookie);
    await grantHealthData(responsible.cookie, id);
    await saveAnamnesis(id, 0, { R01: 7 });
    const count = 'SELECT 1 FROM clinical.performance_profile WHERE patient_id = $1';

    await withContext('user', contextOf(responsible), async (client) => {
      expect((await client.query(count, [id])).rowCount).toBe(1);
      expect(await errorCode(client, `UPDATE clinical.performance_profile SET pri = 1`)).toBe(
        PG.insufficientPrivilege,
      );
      expect(await errorCode(client, `DELETE FROM clinical.performance_profile`)).toBe(
        PG.insufficientPrivilege,
      );
    });
    await withContext('user', contextOf(outsider), async (client) => {
      expect((await client.query(count, [id])).rowCount).toBe(0);
    });
    await withContext(
      'user',
      { orgId: org.organizationId, userId: uuid(), role: 'PATIENT', patientId: id },
      async (client) => {
        expect((await client.query(count, [id])).rowCount).toBe(0);
      },
    );
    await withContext(
      'user',
      { orgId: uuid(), userId: responsible.userId, role: 'OWNER' },
      async (client) => {
        expect((await client.query(count, [id])).rowCount).toBe(0);
      },
    );
  });
});

describe('RF-09 · historia clínica versionada', () => {
  it('criterio P6 · sin consentimiento, guardar la historia clínica devuelve 422 con rule RN-B01', async () => {
    const id = await register(org.staff.responsible.cookie);
    const response = await harness.put(
      `/patients/${id}/clinical-history`,
      { expectedRevision: 0, answers: { modality: 'IN_PERSON', R07: 'Duerme 6 horas.' } },
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
        { expectedRevision, answers: { modality: 'IN_PERSON', ...answers } },
        responsible.cookie,
      );

    expect((await save(0, { R01: 6 })).body).toEqual({ revision: 1 });
    const stale = await save(0, { R01: 8 });
    expect(stale.status).toBe(409);
    expect((stale.body as Problem).code).toBe('NC-CLI-019');
    expect((await save(1, { R01: 7, R07: 'Turnos de noche.' })).body).toEqual({ revision: 2 });
    expect((await save(2, { diagnosis: 'no es una pregunta del formulario' })).status).toBe(400);

    const read = await harness.get(`/patients/${id}/clinical-history`, team.cookie);
    expect(read.status).toBe(200);
    expect(read.headers['cache-control']).toBe('no-store');
    const history = read.body as History;
    expect(history.current).toMatchObject({
      revision: 2,
      answers: { R01: 7, R07: 'Turnos de noche.' },
    });
    expect(history.revisions.map((r) => r.revision)).toEqual([2, 1]);
    expect(await reads(id, team)).toEqual(['clinical.clinical_history']);
  });

  it('RN-A05 · fuera del equipo no existe; con READ, o siendo OWNER fuera del equipo, no escribe; archivado es 409', async () => {
    const { responsible, team, outsider } = org.staff;
    const id = await register(responsible.cookie);
    await grantHealthData(responsible.cookie, id);
    await join(id, team, 'READ');
    const body = { expectedRevision: 0, answers: { modality: 'IN_PERSON' } };

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

describe('RN-A05 · la población OBESITY es dato de salud', () => {
  it('la pone o la quita solo el equipo con WRITE; OWNER fuera del equipo edita el resto de la ficha', async () => {
    const { responsible, owner } = org.staff;
    const id = await register(responsible.cookie);
    await grantHealthData(responsible.cookie, id);
    const patch = async (member: StaffMember, body: object) => {
      const current = (await harness.get(`/patients/${id}`, member.cookie)).body as {
        version: number;
      };
      return harness
        .patch(`/patients/${id}`, body, member.cookie)
        .set('If-Match', `"${String(current.version)}"`);
    };

    const byOwner = await patch(owner, { population: 'OBESITY' });
    expect(byOwner.status).toBe(403);
    expect(byOwner.body as Problem).toMatchObject({ code: 'NC-CLI-027', rule: 'RN-A05' });
    expect((await patch(responsible, { population: 'OBESITY' })).status).toBe(200);
    const removed = await patch(owner, { population: 'ADULT' });
    expect(removed.status).toBe(403);
    expect((removed.body as Problem).code).toBe('NC-CLI-027');
    expect((await patch(owner, { lastName: 'Rojas Vega' })).status).toBe(200);
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
      { expectedRevision: 0, answers: { modality: 'IN_PERSON', N01: 'STRUCTURED' } },
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

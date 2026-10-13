import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import catalogSeed from '../../../../seeds/assessment/measurement-sites.json' with { type: 'json' };
import luisSeed from '../../../../seeds/luis/luis.json' with { type: 'json' };
import { ApiHarness, type StaffMember, type StaffOrganization } from './support/api-harness.js';
import { errorCode, PG, pool, withContext } from './support/database.js';

/**
 * P7 (PR 1) · evaluación por HTTP contra PostgreSQL como app_user: catálogo de sitios (ADR-044), tomas con validación
 * (RN-C02 a RN-C04), cierre (RF-14), enmienda (RN-C07), bioimpedancia (RN-C08), ETM (RN-C05), consentimiento
 * (RN-B01), equipo de atención (RN-A05), línea de tiempo (RF-10) y READ en la auditoría (RN-B03).
 */

const harness = new ApiHarness();
let org: StaffOrganization;

interface Problem {
  code: string;
  rule?: string;
}
interface Evaluation {
  id: string;
  status: string;
  revision: number;
  version: number;
  amendsEvaluationId: string | null;
  amendedByEvaluationId: string | null;
  measurements: { siteCode: string; consolidatedValue: number | null; needsThird: boolean }[];
  progress: { missingSites: string[]; needsThirdSites: string[]; canClose: boolean };
}

const CONDITIONS = { schemaVersion: 1, fasting: true, intenseActivityLast24h: false };
const PERSON = {
  firstName: 'Luis',
  lastName: 'Ejemplo Sintético',
  sex: 'M',
  birthDate: '1998-10-13',
} as const;

async function patient(cookie: string, consent = true): Promise<string> {
  const response = await harness.post('/patients', PERSON, cookie);
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  const id = (response.body as { id: string }).id;
  if (consent) {
    const listed = await harness.get('/patients/consent-documents', cookie);
    const { documents } = listed.body as { documents: { id: string; purpose: string }[] };
    const granted = await harness
      .post(`/patients/${id}/consents`, undefined, cookie)
      .field('consentDocumentId', documents.find((d) => d.purpose === 'HEALTH_DATA')?.id ?? '')
      .field('channel', 'IN_PERSON_DIGITAL');
    expect(granted.status).toBe(201);
  }
  return id;
}

async function evaluation(
  cookie: string,
  patientId: string,
  body: object = {},
): Promise<Evaluation> {
  const response = await harness.post(
    `/patients/${patientId}/evaluations`,
    { level: 'BASIC', measuredAt: '2026-10-13T13:30:00.000Z', conditions: CONDITIONS, ...body },
    cookie,
  );
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return response.body as Evaluation;
}

async function measure(
  cookie: string,
  current: Evaluation,
  siteCode: string,
  attempts: number[],
): Promise<{ status: number; body: unknown }> {
  const response = await harness
    .put(`/evaluations/${current.id}/measurements/${siteCode}`, { attempts }, cookie)
    .set('If-Match', String(current.version));
  return { status: response.status, body: response.body };
}

async function measureAll(
  cookie: string,
  start: Evaluation,
  measurements: Record<string, number[]>,
): Promise<Evaluation> {
  let current = start;
  for (const [siteCode, attempts] of Object.entries(measurements)) {
    const response = await measure(cookie, current, siteCode, attempts);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    current = response.body as Evaluation;
  }
  return current;
}

const BASIC = {
  BASIC_WEIGHT: [80, 80],
  BASIC_HEIGHT: [174.9, 175.1],
  GIRTH_WAIST: [85.8, 86.2],
  GIRTH_HIP: [98, 98],
};

async function close(cookie: string, current: Evaluation) {
  return harness
    .post(`/evaluations/${current.id}/close`, undefined, cookie)
    .set('If-Match', String(current.version));
}

async function join(patientId: string, member: StaffMember, access: 'READ' | 'WRITE') {
  const response = await harness.put(
    `/patients/${patientId}/care-team/${member.memberId}`,
    { role: 'COLLABORATOR', access },
    org.staff.responsible.cookie,
  );
  expect(response.status).toBe(204);
}

beforeAll(async () => {
  await harness.start();
  org = await harness.createStaffOrganization();
});

afterAll(async () => {
  await harness.stop();
});

describe('ADR-044 · el catálogo de la base es el de seeds/assessment/measurement-sites.json', () => {
  it('mismos 45 sitios con sus rangos, tolerancias y niveles; app_user solo lo lee', async () => {
    const { rows } = await pool('owner').query<{
      code: string;
      family: string;
      name_es: string;
      unit: string;
      min_value: string;
      max_value: string;
      tolerance_pct: string;
      min_attempts: number;
      in_basic: boolean;
      in_isak1: boolean;
      in_isak2: boolean;
      display_order: number;
    }>(`SELECT * FROM assessment.measurement_site ORDER BY display_order`);
    expect(
      rows.map((row) => ({
        code: row.code,
        family: row.family,
        nameEs: row.name_es,
        unit: row.unit,
        minValue: Number(row.min_value),
        maxValue: Number(row.max_value),
        tolerancePct: Number(row.tolerance_pct),
        minAttempts: row.min_attempts,
        levels: [
          ...(row.in_basic ? ['BASIC'] : []),
          ...(row.in_isak1 ? ['ISAK1'] : []),
          ...(row.in_isak2 ? ['ISAK2'] : []),
        ],
        displayOrder: row.display_order,
      })),
    ).toEqual(catalogSeed.sites);
    const listed = await harness.get('/measurement-sites', org.staff.responsible.cookie);
    expect((listed.body as { sites: unknown[] }).sites).toEqual(catalogSeed.sites);
    await withContext('user', { orgId: org.organizationId, role: 'OWNER' }, async (client) => {
      expect(
        await errorCode(client, `UPDATE assessment.measurement_site SET max_value = 999`),
      ).toBe(PG.insufficientPrivilege);
    });
  });
});

describe('RF-11 · RF-14 · captura, cierre y enmienda por HTTP', () => {
  it('RN-B01 · sin consentimiento HEALTH_DATA no se crea la evaluación', async () => {
    const id = await patient(org.staff.responsible.cookie, false);
    const response = await harness.post(
      `/patients/${id}/evaluations`,
      { level: 'BASIC', measuredAt: '2026-10-13T13:30:00.000Z', conditions: CONDITIONS },
      org.staff.responsible.cookie,
    );
    expect(response.status).toBe(422);
    expect(response.body as Problem).toMatchObject({ rule: 'RN-B01' });
  });

  it('criterio P7 · el caso Luis ISAK 2: 42 sitios, cierre y 409 al editar la cerrada', async () => {
    const { cookie } = org.staff.responsible;
    const id = await patient(cookie);
    const created = await evaluation(cookie, id, { level: 'ISAK2' });
    expect(created).toMatchObject({ status: 'DRAFT', revision: 1, version: 0 });
    const filled = await measureAll(cookie, created, luisSeed.evaluations.current.measurements);
    expect(filled.progress).toEqual({
      requiredSites: expect.any(Array) as unknown,
      missingSites: [],
      needsThirdSites: [],
      canClose: true,
    });
    const triceps = filled.measurements.find((m) => m.siteCode === 'SKF_TRICEPS');
    expect(triceps?.consolidatedValue).toBeCloseTo(12, 9);
    const closed = await close(cookie, filled);
    expect(closed.status, JSON.stringify(closed.body)).toBe(200);
    expect((closed.body as Evaluation).status).toBe('CLOSED');
    const late = await measure(cookie, closed.body as Evaluation, 'BASIC_WEIGHT', [81, 81]);
    expect(late.status).toBe(409);
    expect(late.body as Problem).toMatchObject({ code: 'NC-ASM-007', rule: 'RN-C07' });
  });

  it('RN-C02 · RN-C04 · 422 fuera de rango, tercera toma pendiente al cerrar; If-Match obligatorio', async () => {
    const { cookie } = org.staff.responsible;
    const created = await evaluation(cookie, await patient(cookie));
    const out = await measure(cookie, created, 'BASIC_WEIGHT', [301]);
    expect(out.status).toBe(422);
    expect(out.body as Problem).toMatchObject({ code: 'NC-ASM-003', rule: 'RN-C04' });
    const withoutVersion = await harness.put(
      `/evaluations/${created.id}/measurements/BASIC_WEIGHT`,
      { attempts: [80, 80] },
      cookie,
    );
    expect(withoutVersion.status).toBe(428);
    let current = await measureAll(cookie, created, { ...BASIC, GIRTH_HIP: [98, 100] });
    const stale = await measure(cookie, created, 'BASIC_WEIGHT', [80, 80]);
    expect(stale.status).toBe(409);
    const pending = await close(cookie, current);
    expect(pending.status).toBe(422);
    expect(pending.body as Problem).toMatchObject({ code: 'NC-ASM-004', rule: 'RN-C02' });
    current = await measureAll(cookie, current, { GIRTH_HIP: [98, 100, 98.1] });
    expect((await close(cookie, current)).status).toBe(200);
  });

  it('RN-C07 · la enmienda copia las tomas, pide motivo y deja la original como AMENDED', async () => {
    const { cookie } = org.staff.responsible;
    const id = await patient(cookie);
    const original = await measureAll(cookie, await evaluation(cookie, id), BASIC);
    expect((await close(cookie, original)).status).toBe(200);
    const short = await harness.post(
      `/evaluations/${original.id}/amendments`,
      { reason: 'Error' },
      cookie,
    );
    expect(short.status).toBe(400);
    const amended = await harness.post(
      `/evaluations/${original.id}/amendments`,
      { reason: 'Peso mal digitado en la consulta' },
      cookie,
    );
    expect(amended.status, JSON.stringify(amended.body)).toBe(201);
    const revision = amended.body as Evaluation;
    expect(revision).toMatchObject({
      status: 'DRAFT',
      revision: 2,
      amendsEvaluationId: original.id,
    });
    expect(revision.measurements).toHaveLength(4);
    const fixed = await measureAll(cookie, revision, { BASIC_WEIGHT: [81, 81] });
    expect((await close(cookie, fixed)).status).toBe(200);
    const before = await harness.get(`/evaluations/${original.id}`, cookie);
    expect(before.body as Evaluation).toMatchObject({
      status: 'AMENDED',
      amendedByEvaluationId: revision.id,
    });
    const timeline = await harness.get(`/patients/${id}/timeline?limit=10`, cookie);
    const kinds = (timeline.body as { items: { kind: string; refId: string }[] }).items
      .filter((item) => item.kind === 'EVALUATION_CLOSED')
      .map((item) => item.refId);
    expect(kinds).toEqual([revision.id, original.id]);
  });

  it('RN-C07 · la revisión vigente se vuelve a enmendar y la base acepta la cadena', async () => {
    const { cookie } = org.staff.responsible;
    const original = await measureAll(
      cookie,
      await evaluation(cookie, await patient(cookie)),
      BASIC,
    );
    expect((await close(cookie, original)).status).toBe(200);
    const amend = async (id: string, reason: string) => {
      const response = await harness.post(`/evaluations/${id}/amendments`, { reason }, cookie);
      expect(response.status, JSON.stringify(response.body)).toBe(201);
      return response.body as Evaluation;
    };
    const second = await amend(original.id, 'Peso mal digitado en la consulta');
    expect(
      (await close(cookie, await measureAll(cookie, second, { BASIC_WEIGHT: [81, 81] }))).status,
    ).toBe(200);
    const third = await amend(second.id, 'Cintura mal digitada en la consulta');
    expect(third).toMatchObject({ revision: 3, amendsEvaluationId: second.id });
    expect(
      (await close(cookie, await measureAll(cookie, third, { GIRTH_WAIST: [87, 87] }))).status,
    ).toBe(200);
    const statuses = await Promise.all(
      [original.id, second.id, third.id].map(
        async (id) => ((await harness.get(`/evaluations/${id}`, cookie)).body as Evaluation).status,
      ),
    );
    expect(statuses).toEqual(['AMENDED', 'AMENDED', 'CLOSED']);
    const again = await harness.post(
      `/evaluations/${original.id}/amendments`,
      { reason: 'Otra vez la original' },
      cookie,
    );
    expect(again.status).toBe(409);
  });

  it('RN-C08 · bioimpedancia en una evaluación mixta, con marca, modelo y el nombre del equipo', async () => {
    const { cookie } = org.staff.responsible;
    const created = await evaluation(cookie, await patient(cookie), { kind: 'MIXED' });
    const current = await measureAll(cookie, created, BASIC);
    expect((await close(cookie, current)).body as Problem).toMatchObject({ code: 'NC-ASM-012' });
    const added = await harness.post(
      `/evaluations/${created.id}/bia-readings`,
      {
        deviceBrand: 'Marca',
        deviceModel: 'Modelo X',
        readings: [
          { metric: 'FAT_PCT', value: 21.4, unit: '%', deviceLabel: 'Grasa corporal' },
          { metric: 'TOTAL_BODY_WATER', value: 44.1, unit: 'L', deviceLabel: 'Agua total' },
        ],
      },
      cookie,
    );
    expect(added.status, JSON.stringify(added.body)).toBe(201);
    expect((await close(cookie, added.body as Evaluation)).status).toBe(200);
  });
});

describe('RN-A05 · equipo de atención en evaluaciones, tomas y bioimpedancia', () => {
  it('fuera del equipo no existe (404); con lectura se ve y no se escribe (403); la base lo confirma', async () => {
    const { responsible, team, outsider } = org.staff;
    const id = await patient(responsible.cookie);
    await join(id, team, 'READ');
    const created = await measureAll(
      responsible.cookie,
      await evaluation(responsible.cookie, id),
      BASIC,
    );
    expect((await harness.get(`/evaluations/${created.id}`, outsider.cookie)).status).toBe(404);
    expect((await harness.get(`/patients/${id}/evaluations`, outsider.cookie)).status).toBe(404);
    expect((await harness.get(`/evaluations/${created.id}`, team.cookie)).status).toBe(200);
    const write = await measure(team.cookie, created, 'BASIC_WEIGHT', [81, 81]);
    expect(write.status).toBe(403);

    const asMember = (member: StaffMember) => ({
      orgId: org.organizationId,
      userId: member.userId,
      role: 'PROFESSIONAL' as const,
      memberId: member.memberId,
    });
    await withContext('user', asMember(outsider), async (client) => {
      const { rows } = await client.query(
        `SELECT site_code FROM assessment.measurement WHERE evaluation_id = $1`,
        [created.id],
      );
      expect(rows).toEqual([]);
    });
    await withContext('user', asMember(team), async (client) => {
      const { rows } = await client.query(
        `SELECT site_code FROM assessment.measurement WHERE evaluation_id = $1`,
        [created.id],
      );
      expect(rows).toHaveLength(4);
    });
  });

  it('RN-C07 · la base rechaza cambiar tomas o bioimpedancia de una evaluación cerrada', async () => {
    const { responsible } = org.staff;
    const created = await measureAll(
      responsible.cookie,
      await evaluation(responsible.cookie, await patient(responsible.cookie), { kind: 'MIXED' }),
      BASIC,
    );
    await harness.post(
      `/evaluations/${created.id}/bia-readings`,
      {
        deviceBrand: 'Marca',
        deviceModel: 'Modelo X',
        readings: [{ metric: 'FAT_PCT', value: 21.4, unit: '%', deviceLabel: 'Grasa corporal' }],
      },
      responsible.cookie,
    );
    const current = (await harness.get(`/evaluations/${created.id}`, responsible.cookie))
      .body as Evaluation;
    expect((await close(responsible.cookie, current)).status).toBe(200);
    await withContext(
      'user',
      {
        orgId: org.organizationId,
        userId: responsible.userId,
        role: 'PROFESSIONAL',
        memberId: responsible.memberId,
      },
      async (client) => {
        expect(
          await errorCode(
            client,
            `UPDATE assessment.measurement SET attempt_1 = 90 WHERE evaluation_id = $1`,
            [created.id],
          ),
        ).toBe(PG.integrityViolation);
        expect(
          await errorCode(client, `DELETE FROM assessment.bia_reading WHERE evaluation_id = $1`, [
            created.id,
          ]),
        ).toBe(PG.integrityViolation);
        expect(
          await errorCode(client, `UPDATE assessment.evaluation SET notes = 'x' WHERE id = $1`, [
            created.id,
          ]),
        ).toBe(PG.integrityViolation);
      },
    );
  });
});

describe('RN-C05 · RF-12 · ETM del evaluador por HTTP', () => {
  it('G-04 · el estudio de Luis da 0.374 mm (2.35 %) agrupado; otro profesional no lo registra', async () => {
    const { responsible, team } = org.staff;
    const study = {
      source: 'CALCULATED',
      validFrom: '2026-07-15',
      sites: luisSeed.technicalErrorStudy.sites,
    };
    const forbidden = await harness.post(
      `/members/${responsible.memberId}/technical-errors`,
      study,
      team.cookie,
    );
    expect(forbidden.status).toBe(403);
    const recorded = await harness.post(
      `/members/${responsible.memberId}/technical-errors`,
      study,
      responsible.cookie,
    );
    expect(recorded.status, JSON.stringify(recorded.body)).toBe(201);
    const view = (
      await harness.get(`/members/${responsible.memberId}/technical-errors`, team.cookie)
    ).body as {
      current: unknown[];
      pooled: { temAbs: number; temRelPct: number; mdc95: number }[];
    };
    expect(view.current).toHaveLength(6);
    // Los pares son números del evaluador, no de un paciente: sin patient_id no son datos de salud.
    const { rows: columns } = await pool('owner').query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'assessment' AND table_name = 'evaluator_error' AND column_name = 'patient_id'`,
    );
    expect(columns).toEqual([]);
    expect(view.pooled[0]?.temAbs).toBeCloseTo(0.374, 3);
    expect(view.pooled[0]?.temRelPct).toBeCloseTo(2.35, 2);
    expect(view.pooled[0]?.mdc95).toBeCloseTo(1.04, 2);
  });
});

describe('RN-B03 · auditoría', () => {
  it('leer una evaluación deja un READ y las escrituras se auditan desde sus eventos', async () => {
    const { responsible } = org.staff;
    const id = await patient(responsible.cookie);
    const created = await measureAll(responsible.cookie, await evaluation(responsible.cookie, id), {
      BASIC_WEIGHT: [80, 80],
    });
    await harness.get(`/evaluations/${created.id}`, responsible.cookie);
    await harness.deliver('audit.events');
    const { rows } = await pool('owner').query<{ action: string; resource_type: string }>(
      `SELECT action, resource_type FROM audit.audit_log
       WHERE patient_id = $1 AND resource_type LIKE 'assessment.%' ORDER BY occurred_at, id`,
      [id],
    );
    const seen = rows.map((r) => `${r.action} ${r.resource_type}`);
    expect(seen).toContain('READ assessment.evaluation');
    expect(seen).toContain('CREATE assessment.evaluation');
    expect(seen).toContain('UPDATE assessment.measurement');
  });
});

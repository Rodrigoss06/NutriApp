import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import luisSeed from '../../../../seeds/luis/luis.json' with { type: 'json' };
import { ApiHarness, type StaffOrganization } from './support/api-harness.js';
import { errorCode, PG, pool, withContext } from './support/database.js';

/**
 * P7 (PR 2) · cálculo por HTTP y en el worker contra PostgreSQL como app_user: resultados inmutables al cerrar
 * (RN-D01), recálculo explícito (RN-D08), interpretación con fuente desde la base (RN-D10), comparación con CMD95
 * (RN-C06), peso objetivo (RN-E06), preferencias (RN-D05) y equipo de atención (RN-A05).
 */

const harness = new ApiHarness();
let org: StaffOrganization;
let patientId: string;
let previousId: string;
let currentId: string;

interface Evaluation {
  id: string;
  version: number;
}
interface Results {
  status: string;
  results: {
    id: string;
    methodCode: string;
    principalFor: string[];
    metrics: {
      metricCode: string;
      value: number;
      methodCode: string;
      interpretation: { label: string; source: string } | null;
    }[];
  }[];
  siteInterpretations: { siteCode: string; interpretation: { label: string; source: string } }[];
}

const CONDITIONS = { schemaVersion: 1, fasting: true, intenseActivityLast24h: false };

async function closedEvaluation(measuredAt: string, measurements: Record<string, number[]>) {
  const { cookie } = org.staff.responsible;
  const created = await harness.post(
    `/patients/${patientId}/evaluations`,
    { level: 'ISAK2', measuredAt, conditions: CONDITIONS },
    cookie,
  );
  expect(created.status).toBe(201);
  let current = created.body as Evaluation;
  for (const [siteCode, attempts] of Object.entries(measurements)) {
    const response = await harness
      .put(`/evaluations/${current.id}/measurements/${siteCode}`, { attempts }, cookie)
      .set('If-Match', String(current.version));
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    current = response.body as Evaluation;
  }
  const closed = await harness
    .post(`/evaluations/${current.id}/close`, undefined, cookie)
    .set('If-Match', String(current.version));
  expect(closed.status).toBe(200);
  return current.id;
}

const results = async (id: string, cookie = org.staff.responsible.cookie) =>
  (await harness.get(`/evaluations/${id}/results`, cookie)).body as Results;
const metric = (view: Results, method: string, code: string) =>
  view.results.find((r) => r.methodCode === method)?.metrics.find((m) => m.metricCode === code);

beforeAll(async () => {
  await harness.start();
  org = await harness.createStaffOrganization();
  const { owner, responsible } = org.staff;
  expect(
    (
      await harness.put(
        '/organization/settings/assessment.lee_reference_group_coefficient',
        { value: 0 },
        owner.cookie,
      )
    ).status,
  ).toBe(200);
  const registered = await harness.post(
    '/patients',
    { firstName: 'Luis', lastName: 'Ejemplo Sintético', sex: 'M', birthDate: '1998-10-13' },
    responsible.cookie,
  );
  patientId = (registered.body as { id: string }).id;
  const listed = await harness.get('/patients/consent-documents', responsible.cookie);
  const { documents } = listed.body as { documents: { id: string; purpose: string }[] };
  await harness
    .post(`/patients/${patientId}/consents`, undefined, responsible.cookie)
    .field('consentDocumentId', documents.find((d) => d.purpose === 'HEALTH_DATA')?.id ?? '')
    .field('channel', 'IN_PERSON_DIGITAL');
  const study = await harness.post(
    `/members/${responsible.memberId}/technical-errors`,
    { source: 'CALCULATED', validFrom: '2026-07-15', sites: luisSeed.technicalErrorStudy.sites },
    responsible.cookie,
  );
  expect(study.status).toBe(201);
  previousId = await closedEvaluation(
    '2026-09-15T13:30:00.000Z',
    luisSeed.evaluations.previous.measurements,
  );
  currentId = await closedEvaluation(
    '2026-10-13T13:30:00.000Z',
    luisSeed.evaluations.current.measurements,
  );
  expect((await results(currentId)).status).toBe('PENDING');
  await harness.deliver('assessment.calculation');
});

afterAll(async () => {
  await harness.stop();
});

describe('RF-15 · el worker calcula al cerrar', () => {
  it('RN-D01 · G-06 y G-08 desde la base: cada número con su método e interpretación con fuente (RN-D10)', async () => {
    const view = await results(currentId);
    expect(view.status).toBe('READY');
    expect(view.results).toHaveLength(12);
    expect(metric(view, 'FAT_DW1974_SIRI1961', 'FAT_PCT')?.value).toBeCloseTo(20.26, 2);
    expect(metric(view, 'FAT_DW1974_SIRI1961', 'FAT_PCT')?.interpretation).toEqual({
      label: 'Promedio',
      tone: 'NEUTRAL',
      source: 'ACE',
    });
    expect(metric(view, 'BMI', 'BMI')?.interpretation).toMatchObject({
      label: 'Sobrepeso',
      source: 'OMS',
    });
    expect(metric(view, 'WAIST_HEIGHT', 'WAIST_HEIGHT_RATIO')?.interpretation?.label).toBe(
      'Sin riesgo aumentado',
    );
    expect(metric(view, 'COMP4_DEROSE_GUIMARAES', 'BONE_MASS_KG')).toMatchObject({
      methodCode: 'BONE_ROCHA1975',
    });
    expect(metric(view, 'COMP4_DEROSE_GUIMARAES', 'BONE_MASS_KG')?.value).toBeCloseTo(12.02, 2);
    expect(view.siteInterpretations).toEqual([
      {
        siteCode: 'GIRTH_WAIST',
        value: expect.closeTo(86, 9) as unknown,
        unit: 'cm',
        methodCode: 'CONSOLIDATE_ISAK',
        interpretation: { label: 'Sin riesgo aumentado', tone: 'NEUTRAL', source: 'OMS 2008' },
      },
    ]);
    for (const result of view.results) {
      for (const m of result.metrics)
        expect(m.methodCode, `${result.methodCode} ${m.metricCode}`).toBeTruthy();
    }
  });

  it('entregar otra vez el evento no duplica nada (processed_event y la UNIQUE de resultados)', async () => {
    await harness.deliver('assessment.calculation');
    const { rows } = await pool('owner').query(
      `SELECT method_code FROM assessment.calculation_result WHERE evaluation_id = $1`,
      [currentId],
    );
    expect(rows).toHaveLength(12);
  });

  it('RN-D01 · un resultado y sus indicadores no se editan; solo cambia su estado', async () => {
    const { responsible } = org.staff;
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
            `UPDATE assessment.calculation_result SET outputs = '{}' WHERE evaluation_id = $1`,
            [currentId],
          ),
        ).toBe(PG.insufficientPrivilege);
        expect(
          await errorCode(
            client,
            `UPDATE assessment.result_metric SET value = 0 WHERE patient_id = $1`,
            [patientId],
          ),
        ).toBe(PG.insufficientPrivilege);
      },
    );
  });
});

describe('RN-D08 · recalcular es explícito', () => {
  it('criterio P7 · otro coeficiente de Lee crea un resultado nuevo y deja el anterior como SUPERSEDED', async () => {
    const before = (await results(currentId)).results.find(
      (r) => r.methodCode === 'MUSCLE_LEE2000',
    );
    const response = await harness.post(
      `/evaluations/${currentId}/recalculate`,
      { leeReferenceGroupCoefficient: -2 },
      org.staff.responsible.cookie,
    );
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body).toMatchObject({ created: 1, superseded: 1 });
    const after = (await results(currentId)).results.find((r) => r.methodCode === 'MUSCLE_LEE2000');
    expect(after?.id).not.toBe(before?.id);
    const { rows } = await pool('owner').query<{ status: string; superseded_by: string }>(
      `SELECT status, superseded_by FROM assessment.calculation_result WHERE id = $1`,
      [before?.id],
    );
    expect(rows[0]).toEqual({ status: 'SUPERSEDED', superseded_by: after?.id });
  });

  it('el equipo con solo lectura no recalcula; fuera del equipo, la evaluación no existe', async () => {
    const { team, outsider, responsible } = org.staff;
    await harness.put(
      `/patients/${patientId}/care-team/${team.memberId}`,
      { role: 'COLLABORATOR', access: 'READ' },
      responsible.cookie,
    );
    expect(
      (await harness.post(`/evaluations/${currentId}/recalculate`, {}, team.cookie)).status,
    ).toBe(403);
    expect((await harness.get(`/evaluations/${currentId}/results`, team.cookie)).status).toBe(200);
    expect((await harness.get(`/evaluations/${currentId}/results`, outsider.cookie)).status).toBe(
      404,
    );
  });
});

describe('RN-C06 · RN-E06 · comparación y peso objetivo', () => {
  it('G-04 · la suma de 6 pliegues cambia más que su CMD95 de 6.18 mm', async () => {
    const response = await harness.get(
      `/evaluations/${currentId}/comparison`,
      org.staff.responsible.cookie,
    );
    expect(response.status).toBe(200);
    const view = response.body as {
      previous: { id: string };
      skinfoldSum6: { delta: number; mdc95: number; significance: string };
      sites: { siteCode: string; significance: string }[];
    };
    expect(view.previous.id).toBe(previousId);
    expect(view.skinfoldSum6.delta).toBeCloseTo(-6.9, 9);
    expect(view.skinfoldSum6.mdc95).toBeCloseTo(6.18, 2);
    expect(view.skinfoldSum6.significance).toBe('CHANGE');
    expect(view.sites.find((s) => s.siteCode === 'SKF_ABDOMINAL')?.significance).toBe(
      'NO_SIGNIFICANT_CHANGE',
    );
  });

  it('G-12 · peso objetivo para 15 % de grasa: 75.05 kg', async () => {
    const response = await harness.get(
      `/evaluations/${currentId}/target-weight?targetFatPct=15`,
      org.staff.responsible.cookie,
    );
    expect(response.status).toBe(200);
    expect((response.body as { targetWeightKg: number }).targetWeightKg).toBeCloseTo(75.05, 2);
    expect(
      (
        await harness.get(
          `/evaluations/${currentId}/target-weight?targetFatPct=0`,
          org.staff.responsible.cookie,
        )
      ).status,
    ).toBe(400);
  });
});

describe('RN-D05 · RF-16 · preferencias por HTTP', () => {
  it('la organización (OWNER) fija el método por población; un profesional no; el paciente ve lo vigente', async () => {
    const { owner, responsible } = org.staff;
    const denied = await harness.put(
      '/organization/method-preferences/ADULT/FAT_PCT',
      { methodCode: 'FAT_YUHASZ1974' },
      responsible.cookie,
    );
    expect(denied.status).toBe(403);
    const set = await harness.put(
      '/organization/method-preferences/ADULT/FAT_PCT',
      { methodCode: 'FAT_YUHASZ1974' },
      owner.cookie,
    );
    expect(set.status, JSON.stringify(set.body)).toBe(200);
    const patient = await harness.get(
      `/patients/${patientId}/method-preferences`,
      responsible.cookie,
    );
    expect(patient.body).toMatchObject({ population: 'ADULT' });
    expect(
      (
        patient.body as { preferences: { purpose: string; methodCode: string; source: string }[] }
      ).preferences.find((p) => p.purpose === 'FAT_PCT'),
    ).toEqual({ purpose: 'FAT_PCT', methodCode: 'FAT_YUHASZ1974', source: 'ORGANIZATION' });
    const invalid = await harness.put(
      '/organization/method-preferences/ADULT/FAT_PCT',
      { methodCode: 'RMR_MIFFLIN1990' },
      owner.cookie,
    );
    expect(invalid.status).toBe(422);
    expect(invalid.body).toMatchObject({ code: 'NC-ASM-019', rule: 'RN-D05' });
    expect(
      (await harness.delete('/organization/method-preferences/ADULT/FAT_PCT', owner.cookie)).status,
    ).toBe(200);
  });

  it('RN-D10 · los rangos de referencia globales vienen de la migración, con su fuente', async () => {
    const { rows } = await pool('owner').query<{ source: string; count: string }>(
      `SELECT source, count(*) FROM assessment.reference_range WHERE organization_id IS NULL
       GROUP BY source ORDER BY source`,
    );
    expect(rows.map((r) => [r.source, Number(r.count)])).toEqual([
      ['ACE', 10],
      ['OMS', 8],
      ['OMS 2008', 6],
      ['Umbral habitual 0.5 (guía de dominio)', 2],
    ]);
  });
});

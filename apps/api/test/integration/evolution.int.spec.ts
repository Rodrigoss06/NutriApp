import { createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pdfText } from '../support/pdf-text.js';
import luisSeed from '../../../../seeds/luis/luis.json' with { type: 'json' };
import { ApiHarness, PASSWORD, type StaffOrganization } from './support/api-harness.js';
import { id, pool, withContext } from './support/database.js';
import { patientWithConsent } from './support/luis.js';

/**
 * P14 (PR 5a) · la evolución antropométrica por HTTP contra PostgreSQL como app_user (RF-35, RF-30): las dos evaluaciones de
 * Luis con el estudio de ETM de su evaluador. El cambio de una medida se compara con el CMD95 (RN-C06, G-04), cada indicador
 * va por método (RN-D03) y el paciente ve lo principal desde su sesión, por funciones que solo le devuelven lo suyo (ADR-091).
 */

const harness = new ApiHarness();
let org: StaffOrganization;
let patientId: string;
let previousId: string;
let currentId: string;
let patientCookie: string;

interface Series {
  points: {
    evaluationId: string;
    value: number;
    change: number | null;
    significance: string | null;
  }[];
  overall: { change: number; mdc95: number | null; significance: string | null } | null;
}
interface Evolution {
  evaluations: { evaluationId: string; conditionDifferences: string[] }[];
  sites: (Series & { siteCode: string; name: string; unit: string })[];
  skinfoldSum6: Series | null;
  metrics: (Series & { metricCode: string; methodCode: string })[];
  bia: unknown[];
}
interface PatientEvolution {
  evaluationCount: number;
  items: (Series & { item: string; unit: string; methodCode: string })[];
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
  let current = created.body as { id: string; version: number };
  for (const [siteCode, attempts] of Object.entries(measurements)) {
    const response = await harness
      .put(`/evaluations/${current.id}/measurements/${siteCode}`, { attempts }, cookie)
      .set('If-Match', String(current.version));
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    current = response.body as { id: string; version: number };
  }
  const closed = await harness
    .post(`/evaluations/${current.id}/close`, undefined, cookie)
    .set('If-Match', String(current.version));
  expect(closed.status).toBe(200);
  return current.id;
}

const sessionCookie = (response: request.Response): string => {
  const raw = response.headers['set-cookie'] as unknown as string[] | undefined;
  return raw?.find((c) => c.startsWith('nc_session='))?.split(';')[0] ?? '';
};

/** El acceso de Luis a su app (RN-A06): invitación, cada finalidad que falta y la sesión PATIENT. */
async function appSession(): Promise<string> {
  const email = `luis-${id()}@demo.test`;
  const { cookie } = org.staff.responsible;
  const invited = await harness.post(`/patients/${patientId}/invitation`, { email }, cookie);
  expect(invited.status, JSON.stringify(invited.body)).toBeLessThan(300);
  const token = await harness.invitationTokenFor(email);
  const inspected = await harness.post('/invitations/inspect', { token });
  const consents = (inspected.body as { consents: { id: string }[] }).consents.map((c) => c.id);
  const accepted = await harness.post('/invitations/accept', {
    token,
    password: PASSWORD,
    acceptedConsentDocumentIds: consents,
  });
  expect(accepted.status, JSON.stringify(accepted.body)).toBe(200);
  return sessionCookie(accepted);
}

const evolution = async (cookie = org.staff.responsible.cookie) =>
  (await harness.get(`/patients/${patientId}/evolution`, cookie)).body as Evolution;

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
  patientId = await patientWithConsent(harness, org, {
    firstName: 'Luis',
    lastName: 'Ejemplo Sintético',
    sex: 'M',
    birthDate: '1998-10-13',
  });
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
  await harness.deliver('assessment.calculation');
  patientCookie = await appSession();
});

afterAll(async () => {
  await harness.stop();
});

describe('RF-35 · la evolución para el equipo de atención', () => {
  it('las evaluaciones cerradas en orden de medición, con lo que cambió en sus condiciones (RN-C09)', async () => {
    const view = await evolution();
    expect(view.evaluations.map((e) => [e.evaluationId, e.conditionDifferences])).toEqual([
      [previousId, []],
      [currentId, []],
    ]);
  });

  it('RN-C06 · G-04: la suma de 6 pliegues bajó 6.9 mm contra un CMD95 de 6.18 mm (cambio real); el abdominal, sin cambio significativo', async () => {
    const view = await evolution();
    expect(view.skinfoldSum6?.overall?.change).toBeCloseTo(-6.9, 9);
    expect(view.skinfoldSum6?.overall?.mdc95).toBeCloseTo(6.18, 2);
    expect(view.skinfoldSum6?.overall?.significance).toBe('CHANGE');
    const abdominal = view.sites.find((site) => site.siteCode === 'SKF_ABDOMINAL');
    expect(abdominal?.points.at(-1)?.significance).toBe('NO_SIGNIFICANT_CHANGE');
    expect(abdominal?.unit).toBe('mm');
    // Lo mismo que la comparación de P7 contra la evaluación anterior.
    const comparison = await harness.get(
      `/evaluations/${currentId}/comparison`,
      org.staff.responsible.cookie,
    );
    const { skinfoldSum6 } = comparison.body as { skinfoldSum6: { delta: number } };
    expect(view.skinfoldSum6?.overall?.change).toBeCloseTo(skinfoldSum6.delta, 9);
  });

  it('RN-D03 · RN-C05: cada indicador va por método, sin compararse con el CMD95', async () => {
    const view = await evolution();
    const fat = view.metrics.filter((metric) => metric.metricCode === 'FAT_PCT');
    const methods = fat.map((metric) => metric.methodCode);
    expect(new Set(methods).size).toBe(methods.length);
    expect(methods).toContain('FAT_DW1974_SIRI1961');
    for (const series of fat) {
      expect(series.points.map((p) => p.evaluationId)).toEqual([previousId, currentId]);
      expect(series.overall?.significance).toBeNull();
    }
  });

  it('RN-A05 · RN-B03: fuera del equipo de atención es 404, y cada lectura queda en la auditoría', async () => {
    const outside = await harness.get(
      `/patients/${patientId}/evolution`,
      org.staff.outsider.cookie,
    );
    expect(outside.status).toBe(404);
    expect(
      (await harness.get(`/patients/${id()}/evolution`, org.staff.responsible.cookie)).status,
    ).toBe(404);
    const { rows } = await pool('owner').query<{ count: string }>(
      `SELECT count(*) FROM audit.audit_log
       WHERE organization_id = $1 AND patient_id = $2 AND resource_type = 'assessment.evolution' AND action = 'READ'`,
      [org.organizationId, patientId],
    );
    expect(Number(rows[0]?.count)).toBeGreaterThan(0);
  });
});

describe('RF-30 · ADR-091 · la evolución del paciente en su app', () => {
  it('peso, cintura y suma de 6 pliegues con el CMD95; % de grasa y masa muscular del método principal', async () => {
    const response = await harness.get('/me/evolution', patientCookie);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const view = response.body as PatientEvolution;
    expect(view.evaluationCount).toBe(2);
    expect(view.items.map((item) => item.item)).toEqual([
      'WEIGHT',
      'WAIST',
      'HIP',
      'SKINFOLD_SUM6',
      'FAT_PCT',
      'MUSCLE_MASS',
    ]);
    const staff = await evolution();
    const item = (code: string) => view.items.find((entry) => entry.item === code);
    // Las medidas, iguales que las del equipo: mismos valores y misma comparación con el CMD95.
    expect(item('SKINFOLD_SUM6')?.overall).toEqual(staff.skinfoldSum6?.overall);
    expect(item('WEIGHT')?.points).toEqual(
      staff.sites.find((site) => site.siteCode === 'BASIC_WEIGHT')?.points,
    );
    expect(item('WEIGHT')).toMatchObject({ unit: 'kg', methodCode: 'CONSOLIDATE_ISAK' });
    // El método principal es el que el equipo ve marcado en los resultados (RN-D05).
    const results = (
      await harness.get(`/evaluations/${currentId}/results`, org.staff.responsible.cookie)
    ).body as { results: { methodCode: string; principalFor: string[] }[] };
    const principal = (purpose: string) =>
      results.results.find((r) => r.principalFor.includes(purpose))?.methodCode;
    expect(item('FAT_PCT')?.methodCode).toBe(principal('FAT_PCT'));
    expect(item('MUSCLE_MASS')?.methodCode).toBe(principal('MUSCLE'));
    expect(item('FAT_PCT')?.overall?.significance).toBeNull();
  });

  it('solo desde la sesión del paciente: el equipo recibe 403 en /me y las funciones no le devuelven nada', async () => {
    expect((await harness.get('/me/evolution', org.staff.responsible.cookie)).status).toBe(403);
    const staff = {
      orgId: org.organizationId,
      userId: org.staff.responsible.userId,
      role: 'PROFESSIONAL' as const,
      memberId: org.staff.responsible.memberId,
    };
    const counted = await withContext('user', staff, async (client) => {
      const sites = await client.query<{ count: string }>(
        'SELECT count(*) FROM app.patient_evolution_sites()',
      );
      const preferences = await client.query<{ count: string }>(
        'SELECT count(*) FROM app.patient_method_preferences()',
      );
      return [Number(sites.rows[0]?.count), Number(preferences.rows[0]?.count)];
    });
    expect(counted).toEqual([0, 0]);
    // Otro paciente de la misma organización no ve las tomas de Luis.
    const other = await withContext(
      'user',
      { orgId: org.organizationId, userId: id(), role: 'PATIENT', patientId: id() },
      async (client) =>
        (
          await client.query<{ count: string }>(
            'SELECT count(*) FROM app.patient_evolution_sites()',
          )
        ).rows[0]?.count,
    );
    expect(Number(other)).toBe(0);
  });
});

/** Los bytes de una respuesta binaria: supertest no junta un application/pdf por su cuenta. */
type BodyParser = Extract<
  Parameters<request.Test['parse']>[0],
  (res: never, callback: never) => void
>;
const collect: BodyParser = (res, done) => {
  const stream = res as unknown as IncomingMessage;
  const chunks: Buffer[] = [];
  stream.on('data', (chunk: Buffer) => chunks.push(chunk));
  stream.on('end', () => {
    done(null, Buffer.concat(chunks));
  });
};
const binary = (req: request.Test) => req.buffer(true).parse(collect);

interface Status {
  status: 'READY' | 'PENDING';
  document?: { id: string; kind: string; sha256: string; fileName: string };
}

describe('RN-H01 · RN-H02 · ADR-091 · la ficha de evolución', () => {
  const evolutionSource = () => ({
    sourceType: 'EVALUATION',
    sourceId: currentId,
    kind: 'EVOLUTION',
  });
  const status = async (query: string): Promise<Status> =>
    (
      await harness.get(
        `/patients/${patientId}/documents/status?${query}`,
        org.staff.responsible.cookie,
      )
    ).body as Status;

  it('se pide desde la última evaluación, la genera el worker y otra vez da el mismo PDF', async () => {
    const { cookie } = org.staff.responsible;
    const requested = await harness.post(
      `/patients/${patientId}/documents`,
      evolutionSource(),
      cookie,
    );
    expect(requested.status, JSON.stringify(requested.body)).toBe(202);
    await harness.deliver('documents.sheets');

    const query = `sourceType=EVALUATION&sourceId=${currentId}&kind=EVOLUTION`;
    const ready = await status(query);
    expect(ready).toMatchObject({
      status: 'READY',
      document: { kind: 'EVOLUTION', fileName: 'ficha-evolucion.pdf' },
    });
    const again = await harness.post(`/patients/${patientId}/documents`, evolutionSource(), cookie);
    expect(again.status).toBe(200);
    expect((again.body as Status).document?.id).toBe(ready.document?.id);

    const pdf = (await binary(harness.get(`/documents/${ready.document?.id ?? ''}/file`, cookie)))
      .body as Buffer;
    expect(createHash('sha256').update(pdf).digest('hex')).toBe(ready.document?.sha256);
    const text = await pdfText(pdf);
    expect(text).toContain('Evolución antropométrica');
    expect(text).toContain('Suma de 6 pliegues');
    expect(text).toContain('Cambio real');
    expect(text).toContain('Durnin');
  });

  it('la misma evaluación sigue dando su ficha de resultados; un plan no tiene ficha de evolución', async () => {
    const results = await status(`sourceType=EVALUATION&sourceId=${currentId}`);
    expect(results.document?.kind ?? 'ANTHROPOMETRY').toBe('ANTHROPOMETRY');
    const wrong = await harness.post(
      `/patients/${patientId}/documents`,
      { sourceType: 'NUTRITION_PLAN', sourceId: currentId, kind: 'EVOLUTION' },
      org.staff.responsible.cookie,
    );
    expect(wrong.status).toBe(400);
    const outside = await harness.post(
      `/patients/${patientId}/documents`,
      evolutionSource(),
      org.staff.outsider.cookie,
    );
    expect(outside.status).toBe(404);
  });
});

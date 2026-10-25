import { createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pdfText } from '../support/pdf-text.js';
import { ApiHarness, type StaffOrganization } from './support/api-harness.js';
import { pool } from './support/database.js';
import { luisWithPrescription } from './support/luis.js';

/**
 * P11 (PR 1) · fichas PDF por HTTP y en el worker contra PostgreSQL como app_user: al publicar un plan por intercambios
 * se genera su ficha (RF-24); regenerarla da el mismo PDF (RN-H02, criterio 1); si nada cambió se reutiliza; otra marca
 * da otro PDF sin tocar el anterior; la descarga respeta el equipo de atención (RN-A05) y queda auditada (RN-B03).
 */

const DEMO = '01926200-0000-7000-8000-000000000001';
const GROUPS = ['VEG', 'FRU', 'MILK', 'STA', 'MEAT', 'FAT'] as const;
const harness = new ApiHarness();
let org: StaffOrganization;
let cookie: string;
let patientId: string;
let prescriptionId: string;
let plan: Plan;
const foods: Record<string, string> = {};

interface Plan {
  id: string;
  version: number;
  meals: {
    slotCode: string;
    name: string;
    timeOfDay: string | null;
    sharePct: number;
    servings: Record<string, number>;
  }[];
}

interface Status {
  status: 'READY' | 'PENDING';
  document?: {
    id: string;
    kind: string;
    sha256: string;
    templateVersion: string;
    fileName: string;
  };
}

const owner = async <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  (await pool('owner').query(sql, params)).rows as T[];

/** Los bytes de una respuesta binaria: supertest no junta un application/pdf por su cuenta. */
type BodyParser = Extract<
  Parameters<request.Test['parse']>[0],
  (res: never, callback: never) => void
>;

const collect: BodyParser = (res, done) => {
  // En Node, la respuesta de superagent es el IncomingMessage.
  const stream = res as unknown as IncomingMessage;
  const chunks: Buffer[] = [];
  stream.on('data', (chunk: Buffer) => chunks.push(chunk));
  stream.on('end', () => {
    done(null, Buffer.concat(chunks));
  });
};

const binary = (req: request.Test) => req.buffer(true).parse(collect);

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

const source = () => ({ sourceType: 'NUTRITION_PLAN', sourceId: plan.id });
const requestSheet = (who = cookie, body: object = source()) =>
  harness.post(`/patients/${patientId}/documents`, body, who);
const statusOf = async (who = cookie): Promise<Status> =>
  (
    await harness.get(
      `/patients/${patientId}/documents/status?sourceType=NUTRITION_PLAN&sourceId=${plan.id}`,
      who,
    )
  ).body as Status;
const documentsOfPlan = () =>
  owner<{ id: string; sha: string; generated_by: string; template_version: string }>(
    `SELECT id, encode(sha256, 'hex') AS sha, generated_by, template_version
     FROM documents.generated_document WHERE source_id = $1 ORDER BY generated_at, id`,
    [plan.id],
  );

/** G-18 con un alimento permitido de cada grupo donde hay intercambios, hidratación e indicaciones. */
async function publishedPlan(): Promise<Plan> {
  const created = await harness.post(
    `/patients/${patientId}/nutrition-plans`,
    { modality: 'EXCHANGES', energyPrescriptionId: prescriptionId, exchangeListId: DEMO },
    cookie,
  );
  const draft = created.body as Plan;
  const body = (p: Plan) => ({
    modality: 'EXCHANGES',
    fixedServings: { VEG: 4, FRU: 3, MILK: 3 },
    overrides: {},
    meals: p.meals.map(({ slotCode, name, timeOfDay, sharePct, servings }) => ({
      slotCode,
      name,
      timeOfDay,
      sharePct,
      allowedFoods: GROUPS.filter((group) => (servings[group] ?? 0) > 0).map((group) => ({
        groupCode: group,
        foodId: foods[group],
        grams: 50,
        householdText: '1 porción',
      })),
    })),
    splitOverrides: {},
    hydrationTargetMl: 2_500,
    instructions: 'Tomar agua durante el día.',
  });
  // Primero el reparto de G-18; luego los alimentos de cada tiempo con intercambios.
  const g18 = (
    await harness
      .put(
        `/nutrition-plans/${draft.id}`,
        { ...body(draft), meals: body(draft).meals.map((m) => ({ ...m, allowedFoods: [] })) },
        cookie,
      )
      .set('If-Match', String(draft.version))
  ).body as Plan;
  const ready = (
    await harness
      .put(`/nutrition-plans/${g18.id}`, body(g18), cookie)
      .set('If-Match', String(g18.version))
  ).body as Plan;
  const published = await harness
    .post(`/nutrition-plans/${ready.id}/publish`, undefined, cookie)
    .set('If-Match', String(ready.version));
  expect(published.status, JSON.stringify(published.body)).toBe(200);
  return published.body as Plan;
}

beforeAll(async () => {
  await harness.start();
  org = await harness.createStaffOrganization();
  cookie = org.staff.responsible.cookie;
  ({ patientId, prescriptionId } = await luisWithPrescription(harness, org));
  for (const group of GROUPS) {
    const created = await harness.post(
      '/foods',
      {
        name: `Alimento ${group} (fichas)`,
        state: 'READY',
        nutrients: { ENERC_KCAL: 150, PROCNT: 10, FAT: 5, CHOCDF: 15 },
      },
      cookie,
    );
    foods[group] = (created.body as { id: string }).id;
  }
  plan = await publishedPlan();
});

afterAll(async () => {
  await harness.stop();
});

describe('RF-24 · la ficha se genera al publicar', () => {
  it('antes de que corra el worker está pendiente; después, lista para descargar', async () => {
    expect(await statusOf()).toEqual({ status: 'PENDING' });
    await harness.deliver('documents.sheets');

    const status = await statusOf();
    expect(status).toMatchObject({
      status: 'READY',
      document: {
        kind: 'EXCHANGE_DIET',
        templateVersion: '1.0.0',
        fileName: 'ficha-dieta-por-intercambios.pdf',
      },
    });
    const [row] = await documentsOfPlan();
    // Sin pedido, la firma quien publicó el plan.
    expect(row).toMatchObject({
      generated_by: org.staff.responsible.userId,
      template_version: '1.0.0',
    });
    const [file] = await owner<{ purpose: string; mime_type: string }>(
      `SELECT f.purpose, f.mime_type FROM platform.file_object f
       JOIN documents.generated_document d ON d.file_id = f.id WHERE d.id = $1`,
      [row?.id],
    );
    expect(file).toEqual({ purpose: 'GENERATED_DOCUMENT', mime_type: 'application/pdf' });
  });

  it('RN-D02 · RN-H04 · la descarga es un PDF que dice el paciente, sus metas y sus métodos', async () => {
    const status = await statusOf();
    const download = await binary(
      harness.get(`/documents/${status.document?.id ?? ''}/file`, cookie),
    );
    expect(download.status).toBe(200);
    expect(download.headers['content-type']).toBe('application/pdf');
    expect(download.headers['content-disposition']).toBe(
      'attachment; filename="ficha-dieta-por-intercambios.pdf"',
    );
    const pdf = download.body as Buffer;
    expect(sha256(pdf)).toBe(status.document?.sha256);
    const text = await pdfText(pdf);
    for (const expected of [
      'Dieta por intercambios',
      'Luis Ejemplo Sintético',
      'Mifflin-St Jeor (1990)',
      '1,835 kcal',
      'Intercambios (método clásico)',
      'Alimento STA (fichas) · 50 g (1 porción)',
      'Meta de agua: 2,500 ml al día',
    ]) {
      expect(text).toContain(expected);
    }
  });

  it('RN-B03 · cada descarga queda auditada como exportación, y la ficha nueva como creada', async () => {
    const status = await statusOf();
    await harness.deliver('audit.events');
    const actions = await owner<{ action: string; actor: string | null }>(
      `SELECT action, actor_user_id AS actor FROM audit.audit_log
       WHERE resource_type = 'documents.generated_document' AND resource_id = $1 ORDER BY occurred_at`,
      [status.document?.id],
    );
    expect(actions.map((a) => a.action).sort()).toEqual(['CREATE', 'EXPORT']);
    expect(actions.every((a) => a.actor === org.staff.responsible.userId)).toBe(true);
  });
});

describe('RN-H02 · la misma ficha es el mismo PDF', () => {
  it('si nada cambió, pedirla devuelve la que ya existe y no genera otra', async () => {
    const before = await documentsOfPlan();
    const response = await requestSheet();
    expect(response.status).toBe(200);
    expect((response.body as Status).document?.id).toBe(before[0]?.id);
    await harness.deliver('documents.sheets');
    expect(await documentsOfPlan()).toEqual(before);
  });

  it('criterio 1 · regenerar la ficha de un plan publicado da el mismo hash', async () => {
    const [original] = await documentsOfPlan();
    // Sin la fila (solo el dueño de la base puede borrarla), la ficha se vuelve a generar desde el snapshot.
    await owner('DELETE FROM documents.generated_document WHERE id = $1', [original?.id]);
    const pending = await requestSheet();
    expect(pending.status).toBe(202);
    expect(pending.body).toEqual({ status: 'PENDING' });
    await harness.deliver('documents.sheets');

    const [regenerated] = await documentsOfPlan();
    expect(regenerated?.id).not.toBe(original?.id);
    expect(regenerated?.sha).toBe(original?.sha);
    // Pedida desde el panel: la firma quien la pidió.
    expect(regenerated?.generated_by).toBe(org.staff.responsible.userId);
  });

  it('otra marca da otro PDF; el anterior se queda como estaba', async () => {
    const before = await documentsOfPlan();
    await owner(
      `INSERT INTO tenancy.branding (id, organization_id, member_id, display_name, primary_color, contact)
       VALUES (uuidv7(), $1, NULL, 'Nutrición Sintética', '#1d4ed8', '{"phone": "999 000 111"}')`,
      [org.organizationId],
    );
    expect(await statusOf()).toEqual({ status: 'PENDING' });
    expect((await requestSheet()).status).toBe(202);
    await harness.deliver('documents.sheets');

    const after = await documentsOfPlan();
    expect(after).toHaveLength(before.length + 1);
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after.at(-1)?.sha).not.toBe(before.at(-1)?.sha);
    const status = await statusOf();
    const pdf = (await binary(harness.get(`/documents/${status.document?.id ?? ''}/file`, cookie)))
      .body as Buffer;
    expect(await pdfText(pdf)).toContain('Nutrición Sintética');
  });
});

describe('RN-A05 · RN-H02 · quién y desde qué', () => {
  it('un profesional fuera del equipo de atención no pide ni descarga la ficha', async () => {
    const { outsider } = org.staff;
    const status = await statusOf();
    const denied = await requestSheet(outsider.cookie);
    expect(denied.status).toBe(404);
    expect(denied.body).toMatchObject({ code: 'NC-DOC-001' });
    expect(
      (await harness.get(`/documents/${status.document?.id ?? ''}/file`, outsider.cookie)).status,
    ).toBe(404);
  });

  it('la ficha es del paciente del plan: con otro paciente en la ruta no existe', async () => {
    const response = await harness.post(
      `/patients/${org.staff.responsible.userId}/documents`,
      source(),
      cookie,
    );
    expect(response.status).toBe(404);
  });

  it('un borrador no tiene ficha: 422 con RN-H02', async () => {
    const created = await harness.post(
      `/patients/${patientId}/nutrition-plans`,
      { modality: 'EXCHANGES', energyPrescriptionId: prescriptionId, exchangeListId: DEMO },
      cookie,
    );
    const draft = created.body as Plan;
    const response = await requestSheet(cookie, {
      sourceType: 'NUTRITION_PLAN',
      sourceId: draft.id,
    });
    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ code: 'NC-DOC-002', rule: 'RN-H02' });
  });

  it('un origen mal escrito es 400', async () => {
    const response = await requestSheet(cookie, { sourceType: 'PLAN', sourceId: plan.id });
    expect(response.status).toBe(400);
  });
});

describe('RNF-04 · criterio 3 · cada ficha se genera en 3 s o menos', () => {
  it(
    'p95 de 20 fichas generadas por el worker, con la base, por debajo de 3 s',
    { timeout: 180_000 },
    async () => {
      const durations: number[] = [];
      for (let i = 0; i < 20; i += 1) {
        // Otro color de la marca: el mismo plan da otro PDF que hay que dibujar y guardar.
        await owner(
          `UPDATE tenancy.branding SET primary_color = $2
           WHERE organization_id = $1 AND member_id IS NULL`,
          [org.organizationId, `#1d4e${(16 + i).toString(16)}`],
        );
        expect((await requestSheet()).status).toBe(202);
        const started = performance.now();
        await harness.deliver('documents.sheets');
        durations.push(performance.now() - started);
        expect((await statusOf()).status).toBe('READY');
      }
      durations.sort((a, b) => a - b);
      expect(durations[Math.ceil(durations.length * 0.95) - 1]).toBeLessThan(3_000);
    },
  );
});

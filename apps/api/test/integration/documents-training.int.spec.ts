import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import type { UserId } from '@nutricoach/shared-kernel';
import type request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CatalogImporter } from '../../src/platform/index.js';
import { pdfText } from '../support/pdf-text.js';
import { ApiHarness, type StaffOrganization } from './support/api-harness.js';
import { id as uuid, pool } from './support/database.js';
import { patientWithConsent } from './support/luis.js';

/**
 * P12 (PR 7) · la ficha de la rutina por HTTP y en el worker contra PostgreSQL como app_user (RN-H01 a RN-H04, ADR-079): al
 * publicar un programa el worker genera su ficha (RF-24, 02 §8); el PDF dice la rutina, sus semanas y el método de las series;
 * pedirla otra vez la reutiliza (RN-H02); un borrador no tiene ficha; fuera del equipo de atención no existe (RN-A05).
 */

const SEEDS = new URL('../../../../seeds/', import.meta.url);
const harness = new ApiHarness();
let org: StaffOrganization;
let cookie: string;
let patientId: string;

interface Program {
  id: string;
  version: number;
  status: string;
  document: { mesocycles: { weeks: { id: string }[] }[] };
}

interface Status {
  status: 'READY' | 'PENDING';
  document?: {
    id: string;
    kind: string;
    sourceType: string;
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

const exerciseByCode = async (code: string): Promise<string> => {
  const [row] = await owner<{ id: string }>(
    `SELECT id FROM exercise.exercise WHERE organization_id IS NULL AND code = $1`,
    [code],
  );
  return row?.id ?? '';
};

const source = (programId: string) => ({ sourceType: 'TRAINING_PROGRAM', sourceId: programId });
const requestSheet = (programId: string, who = cookie) =>
  harness.post(`/patients/${patientId}/documents`, source(programId), who);
const statusOf = async (programId: string, who = cookie): Promise<Status> =>
  (
    await harness.get(
      `/patients/${patientId}/documents/status?sourceType=TRAINING_PROGRAM&sourceId=${programId}`,
      who,
    )
  ).body as Status;
const documentsOf = (programId: string) =>
  owner<{ id: string; generated_by: string }>(
    `SELECT id, generated_by FROM documents.generated_document WHERE source_id = $1 ORDER BY generated_at, id`,
    [programId],
  );

const SET = {
  repsMin: 8,
  repsMax: 12,
  loadKind: 'RIR',
  loadValue: 2,
  restSeconds: 90,
  tempo: '2-1-2',
};

/** Un borrador a mano de 2 semanas iguales: «Superior» con una sentadilla de 3 series y sus notas. */
async function draftProgram(name: string): Promise<Program> {
  const squat = await exerciseByCode('SQ01');
  const created = await harness.post(`/patients/${patientId}/training-programs`, { name }, cookie);
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const empty = (
    await harness.get(`/training-programs/${(created.body as { id: string }).id}`, cookie)
  ).body as Program;
  const added = await harness
    .post(`/training-programs/${empty.id}/mesocycles`, { name: 'Base', weeks: 2 }, cookie)
    .set('If-Match', String(empty.version));
  expect(added.status, JSON.stringify(added.body)).toBe(201);
  let program = added.body as Program;
  const [first, second] = program.document.mesocycles.flatMap((mesocycle) => mesocycle.weeks);
  const saved = await harness
    .put(
      `/training-programs/${program.id}/weeks/${first?.id ?? ''}`,
      {
        sessions: [
          {
            name: 'Superior',
            notes: 'Calienta 10 minutos.',
            exercises: [{ exerciseId: squat, notes: 'Baja controlado.', sets: [SET, SET, SET] }],
          },
        ],
      },
      cookie,
    )
    .set('If-Match', String(program.version));
  expect(saved.status, JSON.stringify(saved.body)).toBe(200);
  program = saved.body as Program;
  const copied = await harness
    .post(
      `/training-programs/${program.id}/weeks/${first?.id ?? ''}/duplicate`,
      { targetWeekIds: [second?.id ?? ''] },
      cookie,
    )
    .set('If-Match', String(program.version));
  expect(copied.status, JSON.stringify(copied.body)).toBe(200);
  return copied.body as Program;
}

async function publishedProgram(name: string): Promise<Program> {
  const draft = await draftProgram(name);
  const published = await harness
    .post(`/training-programs/${draft.id}/publish`, undefined, cookie)
    .set('If-Match', String(draft.version));
  expect(published.status, JSON.stringify(published.body)).toBe(200);
  return published.body as Program;
}

let program: Program;

beforeAll(async () => {
  await harness.start();
  org = await harness.createStaffOrganization();
  cookie = org.staff.responsible.cookie;
  // Con dos líneas en blanco al final: otro hash, así este lote se aplica aunque otra prueba ya cargó el archivo.
  const report = await harness.app.get(CatalogImporter).run({
    kind: 'EXERCISE_LIBRARY',
    fileName: 'exercise/ejercicios-base.csv',
    content: Buffer.concat([
      await readFile(new URL('exercise/ejercicios-base.csv', SEEDS)),
      Buffer.from('\n\n'),
    ]),
    organizationId: null,
    startedBy: uuid() as UserId,
  });
  expect(['COMPLETED', 'DUPLICATE']).toContain(report.status);
  patientId = await patientWithConsent(harness, org, {
    firstName: 'Ana',
    lastName: 'Sintética',
    sex: 'F',
    birthDate: '1995-03-02',
  });
  program = await publishedProgram('Rutina impresa');
});

afterAll(async () => {
  await harness.stop();
});

describe('RF-24 · la ficha de la rutina se genera al publicar', () => {
  it('antes de que corra el worker está pendiente; después, lista, firmada por quien publicó', async () => {
    expect(await statusOf(program.id)).toEqual({ status: 'PENDING' });
    await harness.deliver('documents.sheets');

    expect(await statusOf(program.id)).toMatchObject({
      status: 'READY',
      document: {
        kind: 'TRAINING',
        sourceType: 'TRAINING_PROGRAM',
        templateVersion: '1.0.0',
        fileName: 'ficha-rutina.pdf',
      },
    });
    const [row] = await documentsOf(program.id);
    expect(row?.generated_by).toBe(org.staff.responsible.userId);
  });

  it('RN-H01 · RN-H04: el PDF dice la rutina, sus semanas juntas y el método de las series', async () => {
    const status = await statusOf(program.id);
    const download = await binary(
      harness.get(`/documents/${status.document?.id ?? ''}/file`, cookie),
    );
    expect(download.status).toBe(200);
    expect(download.headers['content-type']).toBe('application/pdf');
    expect(download.headers['content-disposition']).toBe('attachment; filename="ficha-rutina.pdf"');
    const pdf = download.body as Buffer;
    expect(sha256(pdf)).toBe(status.document?.sha256);
    const text = await pdfText(pdf);
    for (const expected of [
      'Rutina de entrenamiento',
      'Ana Sintética',
      'Programa: Rutina impresa · versión 1 · armado a mano',
      'Semanas 1 y 2',
      'Superior · Día 1',
      'Calienta 10 minutos.',
      '1. Sentadilla goblet · 3 series · 8 a 12 rep · RIR 2 · 90 s de descanso · tempo 2-1-2',
      'Baja controlado.',
      'Series de la semana por grupo muscular (Series fraccionadas)',
      'Precaución: Dolor de rodilla o lumbar',
    ]) {
      expect(text).toContain(expected);
    }
    // A mano no hay tabla de fases: no hay macrociclo.
    expect(text).not.toContain('Tabla de fases');
  });

  it('RN-H02: pedirla otra vez devuelve la misma y no genera otra', async () => {
    const before = await statusOf(program.id);
    const again = await requestSheet(program.id);
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ status: 'READY', document: { id: before.document?.id } });
    await harness.deliver('documents.sheets');
    expect(await documentsOf(program.id)).toHaveLength(1);
  });
});

describe('RN-H02 · RN-A05 · desde qué y quién', () => {
  it('un borrador no tiene ficha: 422 con RN-H02', async () => {
    const draft = await draftProgram('Rutina en borrador');

    const denied = await requestSheet(draft.id);

    expect(denied.status).toBe(422);
    expect(denied.body).toMatchObject({ code: 'NC-DOC-002', rule: 'RN-H02' });
  });

  it('un profesional fuera del equipo de atención no la pide ni la descarga', async () => {
    const { outsider } = org.staff;
    const status = await statusOf(program.id);

    const denied = await requestSheet(program.id, outsider.cookie);

    expect(denied.status).toBe(404);
    expect(denied.body).toMatchObject({ code: 'NC-DOC-001' });
    expect(
      (await harness.get(`/documents/${status.document?.id ?? ''}/file`, outsider.cookie)).status,
    ).toBe(404);
  });
});

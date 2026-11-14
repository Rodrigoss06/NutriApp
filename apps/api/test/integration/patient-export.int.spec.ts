import { readFile } from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import {
  patientExportListResponseSchema,
  patientExportSchema,
  type PatientExport,
} from '@nutricoach/contracts';
import type { UserId } from '@nutricoach/shared-kernel';
import { strFromU8, unzipSync } from 'fflate';
import type request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  NOT_EXPORTED,
  PatientExportCommands,
  PatientExportSources,
} from '../../src/modules/clinical/index.js';
import { CatalogImporter } from '../../src/platform/index.js';
import { ApiHarness, PASSWORD, type StaffOrganization } from './support/api-harness.js';
import { id as uuid, pool } from './support/database.js';
import { luisWithPrescription } from './support/luis.js';

/**
 * P15 (PR 5a) · la exportación del paciente, contra PostgreSQL como app_user (RF-07, RN-B04, RN-B03; ADR-131). Criterio 4 de P15 en su
 * parte de exportación: la de Luis trae todos sus datos y sus fichas, con sus documentos del expediente y sus fotos de progreso. La
 * piden el responsable, el dueño o el propio paciente; las notas «Solo el autor» van solo a su autor; cada uno descarga solo la suya,
 * auditada, durante 24 horas. Y la prueba del catálogo: ninguna tabla con datos del paciente queda fuera sin su motivo. Datos
 * sintéticos: la foto y el PDF son unos pocos bytes con su firma.
 */

const SEEDS = new URL('../../../../seeds/', import.meta.url);
const harness = new ApiHarness();
let org: StaffOrganization;
let cookie: string;
let patientId: string;
let patientCookie: string;
let privateNoteId: string;
let sharedNoteId: string;
let responsibleExport: PatientExport;

const PHOTO = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 7)]);
const PDF = Buffer.from('%PDF-1.4\n%contrato sintético\n');

const DAY_MS = 86_400_000;
const today = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
const addDays = (date: string, days: number): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

const owner = async <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  (await pool('owner').query(sql, params)).rows as T[];

type BodyParser = Extract<
  Parameters<request.Test['parse']>[0],
  (res: never, callback: never) => void
>;

/** El ZIP como bytes: supertest no lo junta solo. En Node, la respuesta de superagent es el IncomingMessage. */
const collect: BodyParser = (res, done) => {
  const stream = res as unknown as IncomingMessage;
  const chunks: Buffer[] = [];
  stream.on('data', (chunk: Buffer) => chunks.push(chunk));
  stream.on('end', () => {
    done(null, Buffer.concat(chunks));
  });
};

const download = (path: string, as: string): request.Test =>
  harness.get(path, as).buffer(true).parse(collect);

interface Opened {
  readonly files: Record<string, Uint8Array>;
  readonly tables: Record<string, Record<string, unknown>[]>;
}

async function opened(path: string, as: string): Promise<Opened> {
  const response = await download(path, as);
  expect(response.status, String(response.body)).toBe(200);
  expect(response.headers['content-type']).toBe('application/zip');
  expect(response.headers['content-disposition']).toMatch(
    /^attachment; filename="exportacion-[a-z0-9-]+-\d{4}-\d{2}-\d{2}\.zip"$/,
  );
  expect(response.headers['x-content-type-options']).toBe('nosniff');
  expect(response.headers['cache-control']).toBe('no-store');
  const files = unzipSync(new Uint8Array(response.body as Buffer));
  const data = JSON.parse(text(files, 'datos.json')) as {
    tables: Record<string, Record<string, unknown>[]>;
  };
  return { files, tables: data.tables };
}

const ready = async (path: string, as: string): Promise<PatientExport[]> => {
  const response = await harness.get(path, as);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return patientExportListResponseSchema.parse(response.body).exports;
};

/** El texto de una entrada del ZIP; vacío si no está. */
const text = (files: Record<string, Uint8Array>, path: string | undefined): string =>
  strFromU8((path ? files[path] : undefined) ?? new Uint8Array());

const bytes = (files: Record<string, Uint8Array>, path: string | undefined): Buffer =>
  Buffer.from((path ? files[path] : undefined) ?? new Uint8Array());

const noteIds = (tables: Opened['tables']): unknown[] =>
  (tables['clinical.clinical_note'] ?? []).map((row) => row.id);

const folder = (files: Opened['files'], name: string): string[] =>
  Object.keys(files).filter((path) => path.startsWith(`${name}/`));

/** Un programa de dos mesociclos de 4 semanas desde hace 21 días: hoy empieza la última semana del primero, y se suben fotos. */
async function publishedProgram(squatId: string): Promise<void> {
  const created = await harness.post(
    `/patients/${patientId}/training-programs`,
    { name: 'Macrociclo de Luis', startDate: addDays(today(), -21) },
    cookie,
  );
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  type Program = {
    id: string;
    version: number;
    document: { mesocycles: { weeks: { id: string }[] }[] };
  };
  let program = (
    await harness.get(`/training-programs/${(created.body as { id: string }).id}`, cookie)
  ).body as Program;
  for (const name of ['Base', 'Carga']) {
    const added = await harness
      .post(`/training-programs/${program.id}/mesocycles`, { name, weeks: 4 }, cookie)
      .set('If-Match', String(program.version));
    program = added.body as Program;
  }
  const set = { repsMin: 8, repsMax: 8, loadKind: 'KG', loadValue: 60, restSeconds: 90 };
  for (const week of program.document.mesocycles.flatMap((mesocycle) => mesocycle.weeks)) {
    const saved = await harness
      .put(
        `/training-programs/${program.id}/weeks/${week.id}`,
        { sessions: [{ name: 'Sesión 1', exercises: [{ exerciseId: squatId, sets: [set] }] }] },
        cookie,
      )
      .set('If-Match', String(program.version));
    program = saved.body as Program;
  }
  const published = await harness
    .post(`/training-programs/${program.id}/publish`, undefined, cookie)
    .set('If-Match', String(program.version));
  expect(published.status, JSON.stringify(published.body)).toBe(200);
  await harness.deliver('tracking.programs');
}

async function grant(purpose: string): Promise<void> {
  const listed = await harness.get('/patients/consent-documents', cookie);
  const { documents } = listed.body as { documents: { id: string; purpose: string }[] };
  const granted = await harness
    .post(`/patients/${patientId}/consents`, undefined, cookie)
    .field('consentDocumentId', documents.find((d) => d.purpose === purpose)?.id ?? '')
    .field('channel', 'IN_PERSON_DIGITAL');
  expect(granted.status, JSON.stringify(granted.body)).toBeLessThan(300);
}

async function patientSession(): Promise<string> {
  const email = `luis-${uuid()}@demo.test`;
  const invited = await harness.post(`/patients/${patientId}/invitation`, { email }, cookie);
  expect(invited.status, JSON.stringify(invited.body)).toBeLessThan(300);
  const token = await harness.invitationTokenFor(email);
  const inspected = await harness.post('/invitations/inspect', { token });
  const accepted = await harness.post('/invitations/accept', {
    token,
    password: PASSWORD,
    acceptedConsentDocumentIds: (inspected.body as { consents: { id: string }[] }).consents.map(
      (consent) => consent.id,
    ),
  });
  expect(accepted.status, JSON.stringify(accepted.body)).toBe(200);
  const raw = accepted.headers['set-cookie'] as unknown as string[] | undefined;
  return raw?.find((c) => c.startsWith('nc_session='))?.split(';')[0] ?? '';
}

beforeAll(async () => {
  await harness.start();
  org = await harness.createStaffOrganization();
  cookie = org.staff.responsible.cookie;
  const report = await harness.app.get(CatalogImporter).run({
    kind: 'EXERCISE_LIBRARY',
    fileName: 'exercise/ejercicios-base.csv',
    content: Buffer.concat([
      await readFile(new URL('exercise/ejercicios-base.csv', SEEDS)),
      Buffer.from('\n\n\n\n\n\n\n\n'),
    ]),
    organizationId: null,
    startedBy: uuid() as UserId,
  });
  expect(['COMPLETED', 'DUPLICATE']).toContain(report.status);
  const [squat] = await owner<{ id: string }>(
    `SELECT id FROM exercise.exercise WHERE organization_id IS NULL AND code = 'SQ01'`,
  );

  // Luis con su evaluación cerrada y calculada y su prescripción (G-12 a G-17), un programa publicado, dos notas, un documento del
  // expediente y una foto de progreso.
  ({ patientId } = await luisWithPrescription(harness, org));
  await publishedProgram(squat?.id ?? '');
  const privateNote = await harness.post(
    `/patients/${patientId}/notes`,
    { body: 'Impresión personal del responsable.', visibility: 'AUTHOR_ONLY' },
    cookie,
  );
  privateNoteId = (privateNote.body as { id: string }).id;
  const sharedNote = await harness.post(
    `/patients/${patientId}/notes`,
    { body: 'Primera consulta.' },
    cookie,
  );
  sharedNoteId = (sharedNote.body as { id: string }).id;
  const document = await harness
    .post(`/patients/${patientId}/record-documents`, undefined, cookie)
    .field('title', 'Contrato firmado')
    .field('category', 'ADMINISTRATIVE')
    .attach('file', PDF, { filename: 'contrato.pdf' });
  expect(document.status, JSON.stringify(document.body)).toBe(201);
  await grant('PROGRESS_PHOTOS');
  const photo = await harness
    .post(`/patients/${patientId}/progress-photos/1/FRONT`, undefined, cookie)
    .attach('photo', PHOTO, { filename: 'foto.jpg', contentType: 'image/jpeg' });
  expect(photo.status, JSON.stringify(photo.body)).toBe(201);
  patientCookie = await patientSession();
}, 120_000);

afterAll(async () => {
  await harness.stop();
});

describe('RN-B04 · la exportación cubre toda tabla con datos del paciente', () => {
  it('cada tabla con patient_id, o hija de una que entra, está en una fuente o tiene su motivo para no estar', async () => {
    const exported = harness.app
      .get(PatientExportSources)
      .all()
      .flatMap((source) => source.tables.map((t) => t.table));
    const withPatient = await owner<{ name: string }>(
      `SELECT c.table_schema || '.' || c.table_name AS name
       FROM information_schema.columns c
       JOIN information_schema.tables t USING (table_schema, table_name)
       WHERE c.column_name = 'patient_id' AND t.table_type = 'BASE TABLE'
         AND c.table_schema NOT IN ('part', 'pgboss')`,
    );
    const children = await owner<{ name: string }>(
      `WITH RECURSIVE included AS (
         SELECT unnest($1::text[])::regclass AS rel
         UNION
         SELECT con.conrelid::regclass FROM pg_constraint con JOIN included i ON con.confrelid = i.rel
         WHERE con.contype = 'f' AND con.conrelid <> con.confrelid
       )
       SELECT rel::text AS name FROM included`,
      [exported],
    );
    const required = new Set([...withPatient, ...children].map((row) => row.name));
    const missing = [...required].filter(
      (name) => !exported.includes(name) && !(name in NOT_EXPORTED),
    );
    expect(missing).toEqual([]);
    expect(Object.keys(NOT_EXPORTED).filter((name) => exported.includes(name))).toEqual([]);
    expect(exported).toContain('training.progress_photo');
    expect(exported).toContain('clinical.record_document');
  });
});

describe('RN-B04 · quién pide la exportación', () => {
  it('fuera del equipo de atención, 404 (RN-A05); del equipo, solo el responsable y el dueño', async () => {
    const outsider = await harness.post(
      `/patients/${patientId}/exports`,
      undefined,
      org.staff.outsider.cookie,
    );
    expect(outsider.status).toBe(404);
    const joined = await harness.put(
      `/patients/${patientId}/care-team/${org.staff.team.memberId}`,
      { role: 'COLLABORATOR', access: 'WRITE' },
      cookie,
    );
    expect(joined.status).toBe(204);
    const team = await harness.post(
      `/patients/${patientId}/exports`,
      undefined,
      org.staff.team.cookie,
    );
    expect(team.status).toBe(403);
    expect(team.body).toMatchObject({ code: 'NC-CLI-041', rule: 'RN-B04' });
  });
});

describe('RN-B04 · la exportación de Luis (criterio 4 de P15)', () => {
  it('el responsable la pide: queda pendiente y pedirla otra vez devuelve la misma', async () => {
    const first = await harness.post(`/patients/${patientId}/exports`, undefined, cookie);
    expect(first.status, JSON.stringify(first.body)).toBe(202);
    responsibleExport = patientExportSchema.parse(first.body);
    expect(responsibleExport).toMatchObject({ status: 'PENDING', readyAt: null, sizeBytes: null });
    const again = await harness.post(`/patients/${patientId}/exports`, undefined, cookie);
    expect(again.status).toBe(200);
    expect((again.body as PatientExport).id).toBe(responsibleExport.id);
    const early = await download(
      `/patients/${patientId}/exports/${responsibleExport.id}/file`,
      cookie,
    );
    expect(early.status).toBe(409);
  });

  it('el worker la arma una vez: lista por 24 horas', async () => {
    await harness.deliver('clinical.exports');
    await harness.deliver('clinical.exports');
    const [listed] = await ready(`/patients/${patientId}/exports`, cookie);
    expect(listed).toMatchObject({ id: responsibleExport.id, status: 'READY' });
    expect(Date.parse(listed?.expiresAt ?? '') - Date.parse(listed?.readyAt ?? '')).toBe(DAY_MS);
    expect(listed?.sizeBytes).toBeGreaterThan(0);
    const [files] = await owner<{ n: number }>(
      `SELECT count(*)::int AS n FROM platform.file_object WHERE purpose = 'PATIENT_EXPORT' AND patient_id = $1`,
      [patientId],
    );
    expect(files?.n).toBe(1);
  });

  it('trae todas sus tablas, sus fichas, el documento del expediente y la foto; y sus notas «Solo el autor»', async () => {
    const zip = await opened(`/patients/${patientId}/exports/${responsibleExport.id}/file`, cookie);
    const exported = harness.app
      .get(PatientExportSources)
      .all()
      .flatMap((source) => source.tables.map((t) => t.table));
    expect(Object.keys(zip.tables).sort()).toEqual([...exported].sort());
    for (const table of [
      'clinical.patient',
      'clinical.consent',
      'assessment.evaluation',
      'assessment.measurement',
      'assessment.calculation_result',
      'nutrition.energy_prescription',
      'training.program',
      'training.prescribed_set',
      'training.progress_photo',
      'clinical.record_document',
      'documents.generated_document',
    ]) {
      expect(zip.tables[table]?.length, table).toBeGreaterThan(0);
      expect(zip.files[`csv/${table}.csv`], table).toBeDefined();
    }
    const [patient] = zip.tables['clinical.patient'] ?? [];
    expect(patient).toMatchObject({ id: patientId, first_name: 'Luis' });
    expect(Object.keys(patient ?? {})).not.toContain('document_number_enc');
    expect(Object.keys(patient ?? {})).not.toContain('document_number_bidx');
    expect(noteIds(zip.tables)).toEqual(expect.arrayContaining([privateNoteId, sharedNoteId]));

    // Las fichas vigentes: la rutina publicada y los resultados de la evaluación, generados al exportar si faltaban.
    expect(folder(zip.files, 'fichas').length).toBeGreaterThanOrEqual(2);
    const [document] = folder(zip.files, 'expediente');
    expect(bytes(zip.files, document).equals(PDF)).toBe(true);
    const [photo] = folder(zip.files, 'fotos-de-progreso');
    expect(bytes(zip.files, photo).equals(PHOTO)).toBe(true);
    expect(text(zip.files, 'archivos.csv')).toContain(photo);
    expect(text(zip.files, 'LEEME.txt')).toContain('Exportación de los datos del paciente');
    expect(folder(zip.files, 'otros')).toEqual([]);
  });

  it('la descarga queda en la auditoría como EXPORT; nadie más la descarga, tampoco el dueño', async () => {
    const [audited] = await owner<{ n: number }>(
      `SELECT count(*)::int AS n FROM audit.audit_log
       WHERE action = 'EXPORT' AND resource_type = 'clinical.patient_export' AND resource_id = $1
         AND patient_id = $2 AND actor_user_id = $3`,
      [responsibleExport.id, patientId, org.staff.responsible.userId],
    );
    expect(audited?.n).toBe(1);
    const theirs = await download(
      `/patients/${patientId}/exports/${responsibleExport.id}/file`,
      org.staff.owner.cookie,
    );
    expect(theirs.status).toBe(404);
    expect(await ready(`/patients/${patientId}/exports`, org.staff.owner.cookie)).toEqual([]);
  });

  it('el dueño la pide para él: sin las notas «Solo el autor» del responsable', async () => {
    const requested = await harness.post(
      `/patients/${patientId}/exports`,
      undefined,
      org.staff.owner.cookie,
    );
    expect(requested.status).toBe(202);
    await harness.deliver('clinical.exports');
    const zip = await opened(
      `/patients/${patientId}/exports/${(requested.body as PatientExport).id}/file`,
      org.staff.owner.cookie,
    );
    expect(noteIds(zip.tables)).toContain(sharedNoteId);
    expect(noteIds(zip.tables)).not.toContain(privateNoteId);
    expect(text(zip.files, 'LEEME.txt')).toContain('van solo si las escribió quien pidió');
  });

  it('el paciente la pide desde su app: la suya, sin notas «Solo el autor», y no ve ni descarga las del equipo', async () => {
    const requested = await harness.post('/me/exports', undefined, patientCookie);
    expect(requested.status, JSON.stringify(requested.body)).toBe(202);
    const mine = patientExportSchema.parse(requested.body);
    await harness.deliver('clinical.exports');
    expect((await ready('/me/exports', patientCookie)).map((e) => [e.id, e.status])).toEqual([
      [mine.id, 'READY'],
    ]);
    const listed = await harness.get('/me/exports', patientCookie);
    expect((listed.body as { timezone: string }).timezone).toBe('America/Lima');
    const zip = await opened(`/me/exports/${mine.id}/file`, patientCookie);
    expect(zip.tables['clinical.patient']?.[0]).toMatchObject({ id: patientId });
    expect(noteIds(zip.tables)).toEqual([sharedNoteId]);
    expect(folder(zip.files, 'fotos-de-progreso')).toHaveLength(1);
    expect((await download(`/me/exports/${responsibleExport.id}/file`, patientCookie)).status).toBe(
      404,
    );
  });
});

describe('RN-B04 · 24 horas y después se borra', () => {
  it('vencida: el trabajo de cada hora borra su archivo y la descarga responde 410', async () => {
    await owner(
      `UPDATE clinical.patient_export
       SET created_at = now() - interval '26 hours', ready_at = now() - interval '25 hours', expires_at = now() - interval '1 hour'
       WHERE id = $1`,
      [responsibleExport.id],
    );
    const path = `/patients/${patientId}/exports/${responsibleExport.id}/file`;
    expect((await download(path, cookie)).status).toBe(410);
    const done = await harness.app.get(PatientExportCommands).closeDue();
    expect(done.closed).toBeGreaterThanOrEqual(1);
    expect(done.notDiscarded).toBe(0);
    const [closed] = await owner<{ status: string; deleted: boolean }>(
      `SELECT e.status, f.deleted_at IS NOT NULL AS deleted
       FROM clinical.patient_export e JOIN platform.file_object f ON f.id = e.file_id WHERE e.id = $1`,
      [responsibleExport.id],
    );
    expect(closed).toEqual({ status: 'EXPIRED', deleted: true });
    const gone = await download(path, cookie);
    expect(gone.status).toBe(410);
    expect(JSON.parse(String(gone.body))).toMatchObject({ code: 'NC-CLI-044', rule: 'RN-B04' });
    expect((await ready(`/patients/${patientId}/exports`, cookie))[0]?.status).toBe('EXPIRED');
  });

  it('una pendiente de hace más de una hora queda fallida, ya no se arma, y se puede pedir otra', async () => {
    const requested = await harness.post(`/patients/${patientId}/exports`, undefined, cookie);
    expect(requested.status).toBe(202);
    const stale = (requested.body as PatientExport).id;
    await owner(
      `UPDATE clinical.patient_export SET created_at = now() - interval '2 hours' WHERE id = $1`,
      [stale],
    );
    await harness.app.get(PatientExportCommands).closeDue();
    await harness.deliver('clinical.exports');
    const [row] = await owner<{ status: string }>(
      `SELECT status FROM clinical.patient_export WHERE id = $1`,
      [stale],
    );
    expect(row?.status).toBe('FAILED');
    const another = await harness.post(`/patients/${patientId}/exports`, undefined, cookie);
    expect(another.status).toBe(202);
    expect((another.body as PatientExport).id).not.toBe(stale);
  });

  it('nadie cambia un pedido salvo el worker, y cada uno pide a su nombre (RLS)', async () => {
    const client = await pool('user').connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `SELECT set_config('app.org_id', $1, true), set_config('app.user_id', $2, true),
                set_config('app.role', 'OWNER', true), set_config('app.member_id', $3, true)`,
        [org.organizationId, org.staff.owner.userId, org.staff.owner.memberId],
      );
      const updated = await client.query(
        `UPDATE clinical.patient_export SET status = 'FAILED' WHERE patient_id = $1`,
        [patientId],
      );
      expect(updated.rowCount).toBe(0);
      await expect(
        client.query(
          `INSERT INTO clinical.patient_export (id, organization_id, patient_id, requested_by, requested_by_role, requested_by_member)
           VALUES ($1, $2, $3, $4, 'STAFF', $5)`,
          [
            uuid(),
            org.organizationId,
            patientId,
            org.staff.responsible.userId,
            org.staff.owner.memberId,
          ],
        ),
      ).rejects.toThrow(/row-level security/);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});

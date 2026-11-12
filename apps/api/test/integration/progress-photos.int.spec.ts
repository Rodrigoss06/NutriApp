import { readFile } from 'node:fs/promises';
import { progressPhotosResponseSchema, type ProgressPhotosResponse } from '@nutricoach/contracts';
import type { UserId } from '@nutricoach/shared-kernel';
import type request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CatalogImporter } from '../../src/platform/index.js';
import { ApiHarness, PASSWORD, type StaffOrganization } from './support/api-harness.js';
import { id as uuid, pool } from './support/database.js';
import { patientWithConsent } from './support/luis.js';

/**
 * P14.5 (PR 6b-1) · las fotos de progreso, contra PostgreSQL como app_user (P-30; RN-G20, RN-B01, RN-B03; ADR-119): su
 * consentimiento propio, la subida del coach y del alumno desde la última semana del mesociclo, el reemplazo que borra el archivo
 * anterior, la lectura auditada como adjunto, el equipo de atención, y el borrado al revocar y al archivar. Datos sintéticos: las
 * fotos son unos pocos bytes con la firma de un JPEG.
 */

const SEEDS = new URL('../../../../seeds/', import.meta.url);
const harness = new ApiHarness();
let org: StaffOrganization;
let cookie: string;
let patientId: string;
let patientCookie: string;
let frontId: string;

const jpeg = (fill: number) =>
  Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, fill)]);
const FRONT = jpeg(7);
const FRONT_AGAIN = jpeg(9);
const PDF = Buffer.from('%PDF-1.4\n%sintético\n');

const DAY_MS = 86_400_000;
const today = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
const addDays = (date: string, days: number): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

const owner = async <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  (await pool('owner').query(sql, params)).rows as T[];

interface Program {
  id: string;
  version: number;
  document: { mesocycles: { weeks: { id: string }[] }[] };
}

/** Dos mesociclos de 4 semanas desde hace 21 días: hoy empieza la última semana del primero; el segundo todavía no. */
async function publishedProgram(squatId: string): Promise<void> {
  const created = await harness.post(
    `/patients/${patientId}/training-programs`,
    { name: 'Macrociclo con fotos', startDate: addDays(today(), -21) },
    cookie,
  );
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  let program = (
    await harness.get(`/training-programs/${(created.body as { id: string }).id}`, cookie)
  ).body as Program;
  for (const name of ['Base', 'Carga']) {
    const added = await harness
      .post(`/training-programs/${program.id}/mesocycles`, { name, weeks: 4 }, cookie)
      .set('If-Match', String(program.version));
    expect(added.status, JSON.stringify(added.body)).toBe(201);
    program = added.body as Program;
  }
  const set = { repsMin: 8, repsMax: 8, loadKind: 'KG', loadValue: 60, restSeconds: 90 };
  for (const week of program.document.mesocycles.flatMap((mesocycle) => mesocycle.weeks)) {
    const saved = await harness
      .put(
        `/training-programs/${program.id}/weeks/${week.id}`,
        {
          sessions: [{ name: 'Sesión 1', exercises: [{ exerciseId: squatId, sets: [set, set] }] }],
        },
        cookie,
      )
      .set('If-Match', String(program.version));
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    program = saved.body as Program;
  }
  const published = await harness
    .post(`/training-programs/${program.id}/publish`, undefined, cookie)
    .set('If-Match', String(program.version));
  expect(published.status, JSON.stringify(published.body)).toBe(200);
  await harness.deliver('tracking.programs');
}

async function grantPhotosConsent(): Promise<void> {
  const listed = await harness.get('/patients/consent-documents', cookie);
  const { documents } = listed.body as { documents: { id: string; purpose: string }[] };
  const granted = await harness
    .post(`/patients/${patientId}/consents`, undefined, cookie)
    .field('consentDocumentId', documents.find((d) => d.purpose === 'PROGRESS_PHOTOS')?.id ?? '')
    .field('channel', 'IN_PERSON_DIGITAL');
  expect(granted.status, JSON.stringify(granted.body)).toBeLessThan(300);
}

const upload = (
  position: number | string,
  view: string,
  file: Buffer = FRONT,
  as: string = cookie,
  base = `/patients/${patientId}/progress-photos`,
): request.Test =>
  harness
    .post(`${base}/${String(position)}/${view}`, undefined, as)
    .attach('photo', file, { filename: 'foto.jpg', contentType: 'image/jpeg' });

const list = async (path = `/patients/${patientId}/progress-photos`, as = cookie) => {
  const response = await harness.get(path, as);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return progressPhotosResponseSchema.parse(response.body);
};

const photosInDb = async (): Promise<number> =>
  (
    await owner<{ n: number }>(
      `SELECT count(*)::int AS n FROM training.progress_photo WHERE patient_id = $1`,
      [patientId],
    )
  )[0]?.n ?? -1;

beforeAll(async () => {
  await harness.start();
  org = await harness.createStaffOrganization();
  cookie = org.staff.responsible.cookie;
  const report = await harness.app.get(CatalogImporter).run({
    kind: 'EXERCISE_LIBRARY',
    fileName: 'exercise/ejercicios-base.csv',
    content: Buffer.concat([
      await readFile(new URL('exercise/ejercicios-base.csv', SEEDS)),
      Buffer.from('\n\n\n\n\n\n\n'),
    ]),
    organizationId: null,
    startedBy: uuid() as UserId,
  });
  expect(['COMPLETED', 'DUPLICATE']).toContain(report.status);
  const [squat] = await owner<{ id: string }>(
    `SELECT id FROM exercise.exercise WHERE organization_id IS NULL AND code = 'SQ01'`,
  );
  patientId = await patientWithConsent(harness, org, {
    firstName: 'Rosa',
    lastName: 'Sintética',
    sex: 'F',
    birthDate: '1994-03-02',
  });
  await publishedProgram(squat?.id ?? '');
});

afterAll(async () => {
  await harness.stop();
});

describe('RN-G20 · P-30 · subir las fotos de progreso', () => {
  it('sin su consentimiento propio, no se suben', async () => {
    const response = await upload(1, 'FRONT');
    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ code: 'NC-CLI-033', rule: 'RN-G20' });
  });

  it('con su consentimiento, el coach sube la frontal del primer mesociclo; el segundo todavía no; un PDF tampoco', async () => {
    await grantPhotosConsent();
    const front = await upload(1, 'FRONT');
    expect(front.status, JSON.stringify(front.body)).toBe(201);
    frontId = (front.body as { id: string }).id;

    const early = await upload(2, 'FRONT');
    expect(early.status).toBe(409);
    expect(early.body).toMatchObject({ code: 'NC-TRA-038', rule: 'RN-G20' });
    const pdf = await upload(1, 'SIDE', PDF);
    expect(pdf.status).toBe(415);
    expect(pdf.body).toMatchObject({ code: 'NC-TRA-039' });
    expect((await upload(1, 'TOP')).status).toBe(400);
    expect((await upload(9, 'FRONT')).status).toBe(404);
  });

  it('la lista dice qué mesociclo ya recibe fotos; la foto sale por la API como adjunto, y queda en la auditoría', async () => {
    const view: ProgressPhotosResponse = await list();
    expect(view.consentActive).toBe(true);
    expect(view.programs.map((p) => [p.name, p.current, p.mesocycles.map((m) => m.open)])).toEqual([
      ['Macrociclo con fotos', true, [true, false]],
    ]);
    expect(view.photos).toMatchObject([
      { id: frontId, mesocyclePosition: 1, view: 'FRONT', uploadedByRole: 'STAFF' },
    ]);
    const file = await harness.get(`/progress-photos/${frontId}/file`, cookie).buffer(true);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('image/jpeg');
    expect(file.headers['content-disposition']).toBe('attachment; filename="foto-frontal.jpg"');
    expect(file.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.from(file.body as Buffer).equals(FRONT)).toBe(true);
    const [read] = await owner<{ n: number }>(
      `SELECT count(*)::int AS n FROM audit.audit_log
       WHERE action = 'READ' AND resource_type = 'training.progress_photo' AND resource_id = $1`,
      [frontId],
    );
    expect(read?.n).toBe(1);
  });

  it('fuera del equipo de atención no se ven (RN-A05)', async () => {
    const response = await harness.get(
      `/patients/${patientId}/progress-photos`,
      org.staff.outsider.cookie,
    );
    expect(response.status).toBe(404);
  });

  it('el alumno ve las suyas y sube otra frontal: la reemplaza y el archivo anterior queda borrado', async () => {
    const email = `rosa-${uuid()}@demo.test`;
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
    patientCookie = raw?.find((c) => c.startsWith('nc_session='))?.split(';')[0] ?? '';

    expect((await list('/me/progress-photos', patientCookie)).photos.map((p) => p.id)).toEqual([
      frontId,
    ]);
    const [before] = await owner<{ file_id: string }>(
      `SELECT file_id FROM training.progress_photo WHERE id = $1`,
      [frontId],
    );
    const again = await upload(1, 'FRONT', FRONT_AGAIN, patientCookie, '/me/progress-photos');
    expect(again.status, JSON.stringify(again.body)).toBe(201);
    expect(again.body).toEqual({ id: frontId });
    const [old] = await owner<{ deleted: boolean }>(
      `SELECT deleted_at IS NOT NULL AS deleted FROM platform.file_object WHERE id = $1`,
      [before?.file_id],
    );
    expect(old?.deleted).toBe(true);
    const file = await harness
      .get(`/me/progress-photos/${frontId}/file`, patientCookie)
      .buffer(true);
    expect(file.status).toBe(200);
    expect(Buffer.from(file.body as Buffer).equals(FRONT_AGAIN)).toBe(true);
    expect((await list()).photos[0]?.uploadedByRole).toBe('PATIENT');
  });
});

describe('RN-G20 · se borran al revocar o al archivar, sin días de gracia', () => {
  it('al revocar desde la app dejan de verse en el acto, y el consumidor las borra con sus archivos', async () => {
    const revoked = await harness.post(
      '/me/consents/PROGRESS_PHOTOS/revoke',
      undefined,
      patientCookie,
    );
    expect(revoked.status, JSON.stringify(revoked.body)).toBeLessThan(300);
    expect((await harness.get(`/progress-photos/${frontId}/file`, cookie)).status).toBe(404);
    const view = await list();
    expect({ consentActive: view.consentActive, photos: view.photos }).toEqual({
      consentActive: false,
      photos: [],
    });
    expect(await photosInDb()).toBe(1);
    await harness.deliver('training.progress-photos');
    expect(await photosInDb()).toBe(0);
    const [files] = await owner<{ alive: number }>(
      `SELECT count(*)::int AS alive FROM platform.file_object
       WHERE purpose = 'PROGRESS_PHOTO' AND organization_id = $1 AND deleted_at IS NULL`,
      [org.organizationId],
    );
    expect(files?.alive).toBe(0);
  });

  it('al archivarlo, también; y sin fotos el consumidor no hace nada', async () => {
    await grantPhotosConsent();
    expect((await upload(1, 'BACK')).status).toBe(201);
    expect(await photosInDb()).toBe(1);
    const archived = await harness.post(`/patients/${patientId}/archive`, undefined, cookie);
    expect(archived.status, JSON.stringify(archived.body)).toBe(204);
    await harness.deliver('training.progress-photos');
    expect(await photosInDb()).toBe(0);
  });
});

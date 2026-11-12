import { recordDocumentsResponseSchema, type RecordDocumentsResponse } from '@nutricoach/contracts';
import type request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiHarness, PASSWORD, type StaffOrganization } from './support/api-harness.js';
import { errorCode, id as uuid, PG, pool, withContext } from './support/database.js';
import { patientWithConsent } from './support/luis.js';

/**
 * P14.5 (PR 8a) · el expediente de documentos, contra PostgreSQL como app_user (P-31; RN-G21, RN-A05, RN-B01, RN-B03; ADR-122): el
 * coach pide y agrega, el alumno sube y completa, el coach valida o devuelve con una nota; las fotos y los enlaces piden el
 * consentimiento de imágenes; cada archivo sale por la API, auditado; borrar es lógico y borra el archivo. La base asegura que el
 * alumno nunca valida. Datos sintéticos: los archivos son unos pocos bytes con la firma de un PDF o de un JPEG.
 */

const harness = new ApiHarness();
let org: StaffOrganization;
let cookie: string;
let patientId: string;
let patientCookie: string;
let requestId: string;
let contractId: string;

const PDF = Buffer.from('%PDF-1.4\n%sintético\n');
const PDF_AGAIN = Buffer.from('%PDF-1.4\n%otra versión sintética\n');
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, 7)]);
const MP4 = Buffer.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]);
const LINK = 'https://videos.example.com/sentadilla-goblet';

/** Como la app: toda escritura en /me lleva su Idempotency-Key (06 §5). */
const key = (): string => `test:${uuid()}`;

const owner = async <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  (await pool('owner').query(sql, params)).rows as T[];

const withFile = (
  test: request.Test,
  fields: Readonly<Record<string, string>>,
  file: Buffer,
  name = 'documento.pdf',
): request.Test => {
  for (const [key, value] of Object.entries(fields)) void test.field(key, value);
  return test.attach('file', file, { filename: name });
};

const list = async (
  path = `/patients/${patientId}/record-documents`,
  as = cookie,
): Promise<RecordDocumentsResponse> => {
  const response = await harness.get(path, as);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return recordDocumentsResponseSchema.parse(response.body);
};

const versionOf = async (documentId: string): Promise<number> =>
  (
    await owner<{ version: number }>(`SELECT version FROM clinical.record_document WHERE id = $1`, [
      documentId,
    ])
  )[0]?.version ?? -1;

async function grantImagesConsent(): Promise<void> {
  const listed = await harness.get('/patients/consent-documents', cookie);
  const { documents } = listed.body as { documents: { id: string; purpose: string }[] };
  const granted = await harness
    .post(`/patients/${patientId}/consents`, undefined, cookie)
    .field('consentDocumentId', documents.find((d) => d.purpose === 'IMAGES')?.id ?? '')
    .field('channel', 'IN_PERSON_DIGITAL');
  expect(granted.status, JSON.stringify(granted.body)).toBeLessThan(300);
}

beforeAll(async () => {
  await harness.start();
  org = await harness.createStaffOrganization();
  cookie = org.staff.responsible.cookie;
  patientId = await patientWithConsent(harness, org, {
    firstName: 'Rosa',
    lastName: 'Sintética',
    sex: 'F',
    birthDate: '1994-03-02',
  });
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
});

afterAll(async () => {
  await harness.stop();
});

describe('RN-G21 · P-31 · el coach pide y agrega documentos', () => {
  it('un pedido sin contenido queda «Pendiente»; un PDF que agrega el coach entra «Validado»', async () => {
    const asked = await harness.post(
      `/patients/${patientId}/record-documents`,
      { title: 'Análisis de sangre', category: 'CLINICAL' },
      cookie,
    );
    expect(asked.status, JSON.stringify(asked.body)).toBe(201);
    expect(asked.body).toMatchObject({ status: 'PENDING', version: 1 });
    requestId = (asked.body as { id: string }).id;

    const added = await withFile(
      harness.post(`/patients/${patientId}/record-documents`, undefined, cookie),
      { title: 'Contrato firmado', category: 'ADMINISTRATIVE' },
      PDF,
    );
    expect(added.status, JSON.stringify(added.body)).toBe(201);
    expect(added.body).toMatchObject({ status: 'VALIDATED', version: 1 });
    contractId = (added.body as { id: string }).id;
  });

  it('07 · un enlace o una foto sin el consentimiento de imágenes: 422; con él, entran', async () => {
    const link = { title: 'Video de técnica', category: 'TECHNIQUE', linkUrl: LINK };
    const denied = await harness.post(`/patients/${patientId}/record-documents`, link, cookie);
    expect(denied.status).toBe(422);
    expect(denied.body).toMatchObject({ code: 'NC-CLI-031' });
    const photo = await withFile(
      harness.post(`/patients/${patientId}/record-documents`, undefined, cookie),
      { title: 'Foto de postura', category: 'PROGRESS' },
      JPEG,
      'postura.jpg',
    );
    expect(photo.status).toBe(422);

    await grantImagesConsent();
    const allowed = await harness.post(`/patients/${patientId}/record-documents`, link, cookie);
    expect(allowed.status, JSON.stringify(allowed.body)).toBe(201);
    // Un archivo rechazado no deja nada guardado.
    const [files] = await owner<{ n: number }>(
      `SELECT count(*)::int AS n FROM platform.file_object
       WHERE purpose = 'RECORD_DOCUMENT' AND organization_id = $1`,
      [org.organizationId],
    );
    expect(files?.n).toBe(1);
  });

  it('un enlace http, un enlace con un archivo o un video como archivo no entran', async () => {
    const http = await harness.post(
      `/patients/${patientId}/record-documents`,
      { title: 'Video', category: 'TECHNIQUE', linkUrl: 'http://videos.example.com/a' },
      cookie,
    );
    expect(http.status).toBe(400);
    const both = await withFile(
      harness.post(`/patients/${patientId}/record-documents`, undefined, cookie),
      { title: 'Video', category: 'TECHNIQUE', linkUrl: LINK },
      PDF,
    );
    expect(both.status).toBe(422);
    expect(both.body).toMatchObject({ code: 'NC-CLI-036', rule: 'RN-G21' });
    const video = await withFile(
      harness.post(`/patients/${patientId}/record-documents`, undefined, cookie),
      { title: 'Video', category: 'TECHNIQUE' },
      MP4,
      'video.mp4',
    );
    expect(video.status).toBe(415);
    expect(video.body).toMatchObject({ code: 'NC-CLI-037' });
  });

  it('RN-A05 · fuera del equipo de atención, 404: ni la lista ni los archivos', async () => {
    const outsider = org.staff.outsider.cookie;
    expect((await harness.get(`/patients/${patientId}/record-documents`, outsider)).status).toBe(
      404,
    );
    expect((await harness.get(`/record-documents/${contractId}/file`, outsider)).status).toBe(404);
  });

  it('RN-B03 · la lista trae cada documento y los consentimientos; ver la lista y descargar quedan en la auditoría', async () => {
    const view = await list();
    expect(view.consents).toEqual({ healthData: true, images: true });
    expect(view.documents.map((d) => [d.title, d.status, d.content?.kind ?? null])).toEqual([
      ['Video de técnica', 'VALIDATED', 'LINK'],
      ['Contrato firmado', 'VALIDATED', 'FILE'],
      ['Análisis de sangre', 'PENDING', null],
    ]);
    const file = await harness.get(`/record-documents/${contractId}/file`, cookie).buffer(true);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('application/pdf');
    expect(file.headers['content-disposition']).toBe('attachment; filename="contrato-firmado.pdf"');
    expect(file.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.from(file.body as Buffer).equals(PDF)).toBe(true);
    const reads = await owner<{ resource_id: string }>(
      `SELECT resource_id FROM audit.audit_log
       WHERE action = 'READ' AND resource_type = 'clinical.record_document' AND patient_id = $1`,
      [patientId],
    );
    expect(reads.map((r) => r.resource_id).sort()).toEqual([contractId, patientId].sort());
    expect((await harness.get(`/record-documents/${requestId}/file`, cookie)).status).toBe(404);
  });
});

describe('RN-G21 · P-31 · el alumno sube y el coach revisa', () => {
  it('el alumno ve su expediente y sube un PDF: queda «Por revisar»', async () => {
    const mine = await list('/me/record-documents', patientCookie);
    expect(mine.documents).toHaveLength(3);
    const added = await withFile(
      harness.post('/me/record-documents', undefined, patientCookie),
      { title: 'Receta médica', category: 'CLINICAL' },
      PDF,
    );
    expect(added.status, JSON.stringify(added.body)).toBe(201);
    expect(added.body).toMatchObject({ status: 'IN_REVIEW', version: 1 });
    const empty = await harness.post(
      '/me/record-documents',
      { title: 'Sin archivo', category: 'CLINICAL' },
      patientCookie,
    );
    expect(empty.status).toBe(422);
    expect(empty.body).toMatchObject({ code: 'NC-CLI-035' });
  });

  it('completa el pedido, el coach lo devuelve con una nota, lo reemplaza y el coach lo valida', async () => {
    const filled = await withFile(
      harness.put(`/me/record-documents/${requestId}/content`, undefined, patientCookie),
      {},
      PDF,
    )
      .set('If-Match', '1')
      .set('Idempotency-Key', key());
    expect(filled.status, JSON.stringify(filled.body)).toBe(200);
    expect(filled.body).toEqual({ id: requestId, status: 'IN_REVIEW', version: 2 });

    const returned = await harness
      .put(
        `/record-documents/${requestId}/review`,
        { decision: 'RETURN', note: 'Falta la segunda página' },
        cookie,
      )
      .set('If-Match', '2');
    expect(returned.status, JSON.stringify(returned.body)).toBe(200);
    expect(returned.body).toMatchObject({ status: 'PENDING', version: 3 });
    const pending = (await list('/me/record-documents', patientCookie)).documents.find(
      (d) => d.id === requestId,
    );
    expect(pending).toMatchObject({ status: 'PENDING', reviewNote: 'Falta la segunda página' });

    const [before] = await owner<{ file_id: string }>(
      `SELECT file_id FROM clinical.record_document WHERE id = $1`,
      [requestId],
    );
    const again = await withFile(
      harness.put(`/me/record-documents/${requestId}/content`, undefined, patientCookie),
      {},
      PDF_AGAIN,
    )
      .set('If-Match', '3')
      .set('Idempotency-Key', key());
    expect(again.status, JSON.stringify(again.body)).toBe(200);
    const [old] = await owner<{ deleted: boolean }>(
      `SELECT deleted_at IS NOT NULL AS deleted FROM platform.file_object WHERE id = $1`,
      [before?.file_id],
    );
    expect(old?.deleted).toBe(true);

    const validated = await harness
      .put(`/record-documents/${requestId}/review`, { decision: 'VALIDATE' }, cookie)
      .set('If-Match', '4');
    expect(validated.status, JSON.stringify(validated.body)).toBe(200);
    expect(validated.body).toEqual({ id: requestId, status: 'VALIDATED', version: 5 });
    const file = await harness
      .get(`/me/record-documents/${requestId}/file`, patientCookie)
      .buffer(true);
    expect(file.status).toBe(200);
    expect(Buffer.from(file.body as Buffer).equals(PDF_AGAIN)).toBe(true);
  });

  it('lo validado ya no lo cambia el alumno; sin If-Match, 428; con una versión vieja, 409', async () => {
    const locked = await withFile(
      harness.put(`/me/record-documents/${requestId}/content`, undefined, patientCookie),
      {},
      PDF,
    )
      .set('If-Match', '5')
      .set('Idempotency-Key', key());
    expect(locked.status).toBe(409);
    expect(locked.body).toMatchObject({ code: 'NC-CLI-038', rule: 'RN-G21' });
    const missing = await harness.put(
      `/record-documents/${requestId}/review`,
      { decision: 'VALIDATE' },
      cookie,
    );
    expect(missing.status).toBe(428);
    const stale = await harness
      .put(`/record-documents/${contractId}/review`, { decision: 'VALIDATE' }, cookie)
      .set('If-Match', '9');
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ code: 'NC-CLI-040' });
  });
});

describe('RN-G21 · P-31 · borrar, con auditoría', () => {
  it('el alumno borra lo suyo mientras está por revisar; lo validado o lo del coach, no', async () => {
    const mine = (await list('/me/record-documents', patientCookie)).documents.find(
      (d) => d.title === 'Receta médica',
    );
    const lockedCoach = await harness
      .delete(`/me/record-documents/${contractId}`, patientCookie)
      .set('If-Match', '1')
      .set('Idempotency-Key', key());
    expect(lockedCoach.status).toBe(409);
    const removed = await harness
      .delete(`/me/record-documents/${mine?.id ?? ''}`, patientCookie)
      .set('If-Match', String(mine?.version))
      .set('Idempotency-Key', key());
    expect(removed.status, JSON.stringify(removed.body)).toBe(204);
    const [row] = await owner<{
      deleted: boolean;
      link_url: string | null;
      file_id: string | null;
    }>(
      `SELECT deleted_at IS NOT NULL AS deleted, link_url, file_id FROM clinical.record_document WHERE id = $1`,
      [mine?.id],
    );
    expect(row).toEqual({ deleted: true, link_url: null, file_id: null });
    expect((await list()).documents.map((d) => d.title)).not.toContain('Receta médica');
  });

  it('el coach borra un documento validado; la auditoría guarda el borrado sin el título', async () => {
    const removed = await harness
      .delete(`/record-documents/${contractId}`, cookie)
      .set('If-Match', String(await versionOf(contractId)));
    expect(removed.status, JSON.stringify(removed.body)).toBe(204);
    expect((await harness.get(`/record-documents/${contractId}/file`, cookie)).status).toBe(404);
    await harness.deliver('audit.events');
    const entries = await owner<{ action: string; changed_fields: string[] | null }>(
      `SELECT action, changed_fields FROM audit.audit_log
       WHERE resource_type = 'clinical.record_document' AND resource_id = $1 AND action <> 'READ'
       ORDER BY occurred_at`,
      [contractId],
    );
    expect(entries).toEqual([
      { action: 'CREATE', changed_fields: [] },
      { action: 'UPDATE', changed_fields: ['deleted_at'] },
    ]);
  });
});

describe('RN-G21 · la base asegura que el alumno nunca valida ni borra filas', () => {
  it('como alumno: insertar algo validado, validar lo suyo o borrar una fila falla', async () => {
    await withContext(
      'user',
      { orgId: org.organizationId, role: 'PATIENT', patientId, userId: uuid() },
      async (client) => {
        const insert = (status: string) =>
          errorCode(
            client,
            `INSERT INTO clinical.record_document
               (id, organization_id, patient_id, category, title, status, link_url, created_by, created_by_role,
                content_by, content_by_role, content_at)
             VALUES ($1, $2, $3, 'CLINICAL', 'Prueba', $4, $5, $6, 'PATIENT', $6, 'PATIENT', now())`,
            [uuid(), org.organizationId, patientId, status, LINK, uuid()],
          );
        expect(await insert('VALIDATED')).toBe(PG.insufficientPrivilege);
        expect(await insert('IN_REVIEW')).toBeUndefined();
        expect(
          await errorCode(
            client,
            `UPDATE clinical.record_document SET status = 'VALIDATED' WHERE patient_id = $1`,
            [patientId],
          ),
        ).toBe(PG.insufficientPrivilege);
        expect(
          await errorCode(client, `DELETE FROM clinical.record_document WHERE patient_id = $1`, [
            patientId,
          ]),
        ).toBe(PG.insufficientPrivilege);
      },
    );
  });
});

import {
  assignedResourcesSchema,
  meResourceDetailSchema,
  meResourcesSchema,
  resourceDetailSchema,
  resourceListSchema,
} from '@nutricoach/contracts';
import type request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiHarness, type StaffOrganization } from './support/api-harness.js';
import { id as uuid, pool } from './support/database.js';
import { patientWithConsent } from './support/luis.js';

/**
 * P14 (PR 6b) · material educativo contra PostgreSQL como app_user (RF-30, ADR-094): la biblioteca de la organización con sus cuatro
 * tipos, la asignación por el equipo de atención (RN-A05), lo que ve el paciente en su app y la hora en que lo abrió (ADR-086), y la
 * auditoría (RN-B03). Datos sintéticos.
 */

const PASSWORD = 'un-cielo-gris-sobre-lima';
const PDF = Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n');
const harness = new ApiHarness();
let org: StaffOrganization;
let cookie: string;
let luisId: string;
let luis: string;
let ines: string;
let linkId: string;
let articleId: string;
let pdfId: string;

const owner = async <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  (await pool('owner').query(sql, params)).rows as T[];

const sessionCookie = (response: request.Response): string => {
  const raw = response.headers['set-cookie'] as unknown as string[] | undefined;
  return raw?.find((c) => c.startsWith('nc_session='))?.split(';')[0] ?? '';
};

async function appSession(patientId: string): Promise<string> {
  const email = `app-${uuid()}@demo.test`;
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

async function created(response: request.Response): Promise<string> {
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return Promise.resolve(resourceDetailSchema.parse(response.body).id);
}

const mine = async (as: string) => {
  const response = await harness.get('/me/resources', as);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return meResourcesSchema.parse(response.body).resources;
};

beforeAll(async () => {
  await harness.start();
  org = await harness.createStaffOrganization();
  cookie = org.staff.responsible.cookie;
  luisId = await patientWithConsent(harness, org, {
    firstName: 'Luis',
    lastName: 'Sintético',
    sex: 'M',
    birthDate: '1998-03-14',
  });
  const inesId = await patientWithConsent(harness, org, {
    firstName: 'Inés',
    lastName: 'Sintética',
    sex: 'F',
    birthDate: '1993-07-21',
  });
  luis = await appSession(luisId);
  ines = await appSession(inesId);
});

afterAll(async () => {
  await harness.stop();
});

describe('RF-30 · la biblioteca de material de la organización', () => {
  it('un enlace, un artículo y un PDF; el tipo del PDF sale de sus bytes', async () => {
    linkId = await created(
      await harness.post(
        '/resources',
        {
          kind: 'LINK',
          title: 'Guía de porciones',
          url: 'https://example.com/guia',
          tags: ['porciones'],
        },
        cookie,
      ),
    );
    articleId = await created(
      await harness.post(
        '/resources',
        {
          kind: 'ARTICLE',
          title: 'Hidratación',
          bodyMarkdown: '# Agua\n\nToma agua a lo largo del día.',
        },
        cookie,
      ),
    );
    pdfId = await created(
      await harness
        .postWithoutIdempotencyKey('/resources/file', undefined, cookie)
        .field('title', 'Recetario de cenas')
        .field('tags', 'cena, rápido')
        .attach('file', PDF, { filename: 'recetario de Luis.pdf', contentType: 'application/pdf' }),
    );

    const fake = await harness
      .postWithoutIdempotencyKey('/resources/file', undefined, cookie)
      .field('title', 'No es un PDF')
      .attach('file', Buffer.from('<script>alert(1)</script>'), {
        filename: 'x.pdf',
        contentType: 'application/pdf',
      });
    expect(fake.status).toBe(415);
    expect((fake.body as { code: string }).code).toBe('NC-CON-005');

    const library = resourceListSchema.parse((await harness.get('/resources', cookie)).body);
    expect(library.resources.map((r) => [r.kind, r.title, r.tags])).toEqual([
      ['FILE', 'Recetario de cenas', ['cena', 'rápido']],
      ['ARTICLE', 'Hidratación', []],
      ['LINK', 'Guía de porciones', ['porciones']],
    ]);
  });

  it('el tipo no cambia: la URL solo en un enlace; el equipo descarga el PDF como adjunto', async () => {
    const wrong = await harness.patch(
      `/resources/${articleId}`,
      { url: 'https://example.com' },
      cookie,
    );
    expect(wrong.status).toBe(422);
    expect((wrong.body as { code: string }).code).toBe('NC-CON-006');

    const renamed = await harness.patch(`/resources/${linkId}`, { title: 'Porciones' }, cookie);
    expect(resourceDetailSchema.parse(renamed.body).title).toBe('Porciones');

    const file = await harness.get(`/resources/${pdfId}/file`, cookie);
    expect(file.status).toBe(200);
    expect(file.headers['content-disposition']).toBe('attachment; filename="material.pdf"');
    expect(file.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('RF-30 · RN-A05 · lo asignado a Luis y lo que ve en su app', () => {
  it('el equipo asigna; repetirlo no duplica; alguien fuera del equipo no puede', async () => {
    for (const resourceId of [articleId, pdfId, articleId]) {
      const assigned = await harness.post(`/patients/${luisId}/resources`, { resourceId }, cookie);
      expect(assigned.status, JSON.stringify(assigned.body)).toBe(204);
    }
    const outsider = await harness.post(
      `/patients/${luisId}/resources`,
      { resourceId: linkId },
      org.staff.outsider.cookie,
    );
    expect(outsider.status).toBe(404);

    const list = assignedResourcesSchema.parse(
      (await harness.get(`/patients/${luisId}/resources`, cookie)).body,
    );
    expect(list.resources.map((r) => r.title).sort()).toEqual([
      'Hidratación',
      'Recetario de cenas',
    ]);
    expect(list.resources.every((r) => r.viewedAt === null)).toBe(true);
  });

  it('Luis ve lo suyo, abre el artículo y queda la primera hora (ADR-086); Inés no lo ve', async () => {
    expect((await mine(luis)).map((r) => r.title).sort()).toEqual([
      'Hidratación',
      'Recetario de cenas',
    ]);
    expect(await mine(ines)).toEqual([]);

    const article = meResourceDetailSchema.parse(
      (await harness.get(`/me/resources/${articleId}`, luis)).body,
    );
    expect(article.bodyMarkdown).toBe('# Agua\n\nToma agua a lo largo del día.');
    expect((await harness.get(`/me/resources/${articleId}`, ines)).status).toBe(404);
    expect((await harness.get(`/me/resources/${linkId}`, luis)).status).toBe(404);

    expect((await harness.post(`/me/resources/${articleId}/view`, undefined, luis)).status).toBe(
      204,
    );
    const [first] = await owner<{ viewed_at: Date }>(
      'SELECT viewed_at FROM content.resource_assignment WHERE resource_id = $1 AND patient_id = $2',
      [articleId, luisId],
    );
    expect((await harness.post(`/me/resources/${articleId}/view`, undefined, luis)).status).toBe(
      204,
    );
    const [again] = await owner<{ viewed_at: Date }>(
      'SELECT viewed_at FROM content.resource_assignment WHERE resource_id = $1 AND patient_id = $2',
      [articleId, luisId],
    );
    expect(again?.viewed_at).toEqual(first?.viewed_at);
    expect((await harness.post(`/me/resources/${articleId}/view`, undefined, ines)).status).toBe(
      404,
    );
    expect((await mine(luis)).find((r) => r.id === articleId)?.viewedAt).not.toBeNull();
  });

  it('Luis descarga su PDF como adjunto; uno que no tiene, no; la descarga queda auditada (RN-B03)', async () => {
    const file = await harness.get(`/me/resources/${pdfId}/file`, luis);
    expect(file.status).toBe(200);
    expect(
      Buffer.from(file.body as Buffer)
        .subarray(0, 5)
        .toString(),
    ).toBe('%PDF-');
    expect((await harness.get(`/me/resources/${pdfId}/file`, ines)).status).toBe(404);

    const audited = await owner<{ action: string; resource_type: string }>(
      `SELECT action, resource_type FROM audit.audit_log
       WHERE organization_id = $1 AND resource_type IN ('content.educational_resource', 'content.resource_assignment')
       ORDER BY occurred_at`,
      [org.organizationId],
    );
    expect(audited.map((row) => row.action)).toEqual(expect.arrayContaining(['EXPORT']));
  });

  it('archivar lo quita de la app y no se asigna; quitar la asignación también', async () => {
    const archived = await harness.patch(`/resources/${pdfId}`, { status: 'ARCHIVED' }, cookie);
    expect(resourceDetailSchema.parse(archived.body).status).toBe('ARCHIVED');
    expect((await mine(luis)).map((r) => r.id)).toEqual([articleId]);
    expect((await harness.get(`/me/resources/${pdfId}/file`, luis)).status).toBe(404);
    const again = await harness.post(
      `/patients/${luisId}/resources`,
      { resourceId: pdfId },
      cookie,
    );
    expect(again.status).toBe(409);

    expect(
      (await harness.delete(`/patients/${luisId}/resources/${articleId}`, cookie)).status,
    ).toBe(204);
    expect(await mine(luis)).toEqual([]);
    expect(
      (await harness.delete(`/patients/${luisId}/resources/${articleId}`, cookie)).status,
    ).toBe(404);
  });
});

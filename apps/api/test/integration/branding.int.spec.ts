import { LOGO_LIMITS } from '@nutricoach/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JPEG_BASELINE, pngImage } from '../support/images.js';
import { ApiHarness, ORIGIN, type StaffOrganization } from './support/api-harness.js';
import { pool } from './support/database.js';

/**
 * P11 (PR 3) · marca de las fichas por HTTP contra PostgreSQL como app_user (RN-H03, ADR-066): la ven todos los
 * miembros y la cambian el dueño y los administradores; el logo se revisa entero, queda como archivo de la organización
 * y se descarga solo por la API; cada cambio se audita con los nombres de los campos; otra organización no la ve
 * (RN-A01).
 */

const harness = new ApiHarness();
let org: StaffOrganization;
let other: StaffOrganization;

interface Branding {
  displayName: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  contact: { phone: string | null; email: string | null; website: string | null };
  pdfFooter: string | null;
  logoFileId: string | null;
  updatedAt: string | null;
}
interface Problem {
  code: string;
  details?: { fields: { path: string }[] };
}

const BRAND = {
  displayName: '  Nutrición Sintética ',
  primaryColor: '#1D4ED8',
  secondaryColor: null,
  contact: { phone: '+51 999 000 111', email: 'citas@demo.test', website: 'demo.test' },
  pdfFooter: 'Colegiatura CNP 0000',
};
const EMPTY: Branding = {
  displayName: null,
  primaryColor: null,
  secondaryColor: null,
  contact: { phone: null, email: null, website: null },
  pdfFooter: null,
  logoFileId: null,
  updatedAt: null,
};
const PNG = pngImage({ width: 64, height: 32 });

const branding = async (cookie = org.staff.owner.cookie): Promise<Branding> =>
  (await harness.get('/organization/branding', cookie)).body as Branding;
const save = (body: object, cookie = org.staff.owner.cookie) =>
  harness.put('/organization/branding', body, cookie);
const upload = (content: Buffer, cookie = org.staff.owner.cookie) =>
  request(harness.app.getHttpServer())
    .put('/api/v1/organization/branding/logo')
    .set('Origin', ORIGIN)
    .set('Cookie', cookie)
    .attach('logo', content, { filename: 'logo de la consulta.png', contentType: 'image/png' });

beforeAll(async () => {
  await harness.start();
  org = await harness.createStaffOrganization();
  other = await harness.createStaffOrganization();
});

afterAll(async () => {
  await harness.stop();
});

describe('RN-H03 · la marca de las fichas de la organización', () => {
  it('sin marca, todos los miembros la ven vacía', async () => {
    const response = await harness.get('/organization/branding', org.staff.responsible.cookie);
    expect(response.status).toBe(200);
    expect(response.body).toEqual(EMPTY);
  });

  it('el dueño la fija y el administrador la cambia; la respuesta trae lo guardado', async () => {
    const created = await save(BRAND);
    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({
      ...BRAND,
      displayName: 'Nutrición Sintética',
      primaryColor: '#1d4ed8',
      logoFileId: null,
    });
    const changed = await save(
      { ...BRAND, secondaryColor: '#FFE600', pdfFooter: '' },
      org.staff.admin.cookie,
    );
    expect(changed.status).toBe(200);
    expect(changed.body).toMatchObject({ secondaryColor: '#ffe600', pdfFooter: null });
    expect(await branding(org.staff.responsible.cookie)).toEqual(changed.body);
  });

  it('un profesional la ve, pero no la cambia ni toca el logo', async () => {
    const { cookie } = org.staff.responsible;
    expect((await save(BRAND, cookie)).status).toBe(403);
    expect((await upload(PNG, cookie)).status).toBe(403);
    expect((await harness.delete('/organization/branding/logo', cookie)).status).toBe(403);
  });

  it('el cuerpo se valida con su contrato: el 400 dice qué campo falla', async () => {
    const response = await save({ ...BRAND, primaryColor: 'azul' });
    expect(response.status).toBe(400);
    expect((response.body as Problem).details?.fields.map((f) => f.path)).toEqual(['primaryColor']);
  });

  it('RN-A01 · otra organización no la ve', async () => {
    expect(await branding(other.staff.owner.cookie)).toEqual(EMPTY);
  });
});

describe('ADR-066 · el logo', () => {
  it('un PNG entero queda como logo; se descarga solo por la API, como adjunto y con su tipo', async () => {
    const uploaded = await upload(PNG);
    expect(uploaded.status).toBe(200);
    const { logoFileId } = uploaded.body as Branding;
    expect(logoFileId).toMatch(/^[0-9a-f-]{36}$/);
    expect(uploaded.body).toMatchObject({ displayName: 'Nutrición Sintética' });

    const download = await harness.get('/organization/branding/logo', org.staff.responsible.cookie);
    expect(download.status).toBe(200);
    expect(download.headers['content-type']).toBe('image/png');
    expect(download.headers['content-disposition']).toBe('attachment; filename="logo.png"');
    expect(download.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.from(download.body as Buffer)).toEqual(PNG);

    const { rows } = await pool('owner').query<{
      organization_id: string;
      purpose: string;
      mime_type: string;
      size_bytes: string;
      uploaded_by: string;
      storage_key: string;
    }>(
      `SELECT organization_id, purpose, mime_type, size_bytes, uploaded_by, storage_key
       FROM platform.file_object WHERE id = $1`,
      [logoFileId],
    );
    expect(rows[0]).toMatchObject({
      organization_id: org.organizationId,
      purpose: 'BRANDING_LOGO',
      mime_type: 'image/png',
      size_bytes: String(PNG.length),
      uploaded_by: org.staff.owner.userId,
    });
    // La clave es aleatoria: nunca el nombre original del archivo.
    expect(rows[0]?.storage_key).toBe(`${org.organizationId}/${logoFileId ?? ''}`);
  });

  it('RN-A01 · el logo de una organización no se descarga desde otra', async () => {
    const response = await harness.get('/organization/branding/logo', other.staff.owner.cookie);
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ code: 'NC-TEN-044' });
  });

  it('un JPEG reemplaza al PNG y el texto de la marca no cambia', async () => {
    const before = await branding();
    const replaced = await upload(JPEG_BASELINE);
    expect(replaced.status).toBe(200);
    expect((replaced.body as Branding).logoFileId).not.toBe(before.logoFileId);
    expect(replaced.body).toMatchObject({
      ...before,
      logoFileId: expect.any(String) as string,
      updatedAt: expect.any(String) as string,
    });
    const download = await harness.get('/organization/branding/logo', org.staff.owner.cookie);
    expect(download.headers['content-type']).toBe('image/jpeg');
  });

  it.each([
    ['un PDF con nombre de PNG', Buffer.from('%PDF-1.7\n%falso\n'), 415, 'NC-TEN-040'],
    ['un PNG cortado', PNG.subarray(0, PNG.length - 20), 415, 'NC-TEN-040'],
    ['un PNG de 2001 px de ancho', pngImage({ width: 2001, height: 1 }), 422, 'NC-TEN-041'],
    [
      'más de 1 MB (lo corta el parser)',
      Buffer.concat([PNG, Buffer.alloc(LOGO_LIMITS.maxBytes)]),
      413,
      'NC-PLT-413',
    ],
  ])('%s se rechaza y el logo vigente sigue', async (_, content, status, code) => {
    const before = await branding();
    const response = await upload(content);
    expect(response.status).toBe(status);
    expect(response.body).toMatchObject({ code });
    expect((await branding()).logoFileId).toBe(before.logoFileId);
  });

  it('el lado más largo que entra: 2000 px', async () => {
    const response = await upload(pngImage({ width: LOGO_LIMITS.maxSidePx, height: 1 }));
    expect(response.status).toBe(200);
  });

  it('sin archivo, 400', async () => {
    const response = await request(harness.app.getHttpServer())
      .put('/api/v1/organization/branding/logo')
      .set('Origin', ORIGIN)
      .set('Cookie', org.staff.owner.cookie);
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'NC-TEN-043' });
  });

  it('quitar el logo: 204, y ya no se descarga', async () => {
    const removed = await harness.delete('/organization/branding/logo', org.staff.admin.cookie);
    expect(removed.status).toBe(204);
    expect((await branding()).logoFileId).toBeNull();
    const download = await harness.get('/organization/branding/logo', org.staff.owner.cookie);
    expect(download.status).toBe(404);
  });
});

describe('02 §8 · cada cambio queda auditado con los nombres de los campos, nunca los valores', () => {
  it('quién cambió qué', async () => {
    await harness.deliver('audit.events');
    const { rows } = await pool('owner').query<{
      action: string;
      actor_user_id: string;
      changed_fields: string[];
    }>(
      `SELECT action, actor_user_id, changed_fields FROM audit.audit_log
       WHERE organization_id = $1 AND resource_type = 'tenancy.branding'
       ORDER BY occurred_at, id`,
      [org.organizationId],
    );
    const { owner, admin } = org.staff;
    expect(rows).toEqual([
      {
        action: 'UPDATE',
        actor_user_id: owner.userId,
        changed_fields: [
          'displayName',
          'primaryColor',
          'contact.phone',
          'contact.email',
          'contact.website',
          'pdfFooter',
        ],
      },
      {
        action: 'UPDATE',
        actor_user_id: admin.userId,
        changed_fields: ['secondaryColor', 'pdfFooter'],
      },
      { action: 'UPDATE', actor_user_id: owner.userId, changed_fields: ['logo'] },
      { action: 'UPDATE', actor_user_id: owner.userId, changed_fields: ['logo'] },
      { action: 'UPDATE', actor_user_id: owner.userId, changed_fields: ['logo'] },
      { action: 'UPDATE', actor_user_id: admin.userId, changed_fields: ['logo'] },
    ]);
    expect(JSON.stringify(rows)).not.toContain('citas@demo.test');
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiHarness, type StaffOrganization } from './support/api-harness.js';
import { pool } from './support/database.js';

/**
 * P6 · pacientes y consentimiento por HTTP, contra PostgreSQL como app_user: equipo de atención (RN-A05), documento
 * cifrado con índice ciego (RN-B06), consentimiento con evidencia (RN-B01), cupo (RN-A03) y auditoría (RN-B03).
 */

const harness = new ApiHarness();
let org: StaffOrganization;

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

interface Created {
  id: string;
}
interface Patient {
  id: string;
  code: string;
  version: number;
  documentLast4: string | null;
  careTeam: { memberId: string; role: string; access: string }[];
  population: string;
}
interface Page {
  patients: { id: string }[];
  nextCursor: string | null;
}
interface Problem {
  code: string;
  rule?: string;
}

const PERSON = {
  firstName: 'José',
  lastName: 'Quispe Huamán',
  sex: 'M',
  birthDate: '1990-05-20',
} as const;

async function register(cookie: string, extra: object = {}): Promise<string> {
  const response = await harness.post('/patients', { ...PERSON, ...extra }, cookie);
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return (response.body as Created).id;
}

async function documents(cookie: string): Promise<Record<string, string>> {
  const response = await harness.get('/patients/consent-documents', cookie);
  const { documents: list } = response.body as {
    documents: { id: string; purpose: string; provisional: boolean }[];
  };
  expect(list.every((d) => d.provisional)).toBe(true);
  return Object.fromEntries(list.map((d) => [d.purpose, d.id]));
}

beforeAll(async () => {
  await harness.start();
  org = await harness.createStaffOrganization({ maxActivePatients: 3 });
});

afterAll(async () => {
  await harness.stop();
});

describe('RF-08 · alta, búsqueda y ficha', () => {
  it('RN-B06 · el documento se guarda cifrado; se busca por DNI exacto y por nombre sin tildes', async () => {
    const { responsible } = org.staff;
    const id = await register(responsible.cookie, {
      document: { type: 'DNI', number: '4567 8912' },
    });

    const { rows } = await pool('owner').query<{ enc: Buffer; bidx: Buffer; code: string }>(
      `SELECT document_number_enc AS enc, document_number_bidx AS bidx, code FROM clinical.patient WHERE id = $1`,
      [id],
    );
    expect(rows[0]?.enc.toString('latin1')).not.toContain('45678912');
    expect(rows[0]?.bidx.toString('latin1')).not.toContain('45678912');
    expect(rows[0]?.code).toMatch(/^P-\d{6}$/);

    const byDocument = await harness.get(
      '/patients?documentType=DNI&documentNumber=45678912',
      responsible.cookie,
    );
    expect((byDocument.body as Page).patients.map((p) => p.id)).toEqual([id]);
    const byName = await harness.get('/patients?q=jose%20quispe', responsible.cookie);
    expect((byName.body as Page).patients.map((p) => p.id)).toContain(id);

    const patient = await harness.get(`/patients/${id}`, responsible.cookie);
    expect(patient.body as Patient).toMatchObject({ documentLast4: '8912' });
    expect((patient.body as Patient).careTeam).toEqual([
      { memberId: responsible.memberId, role: 'RESPONSIBLE', access: 'WRITE' },
    ]);

    const duplicate = await harness.post(
      '/patients',
      { ...PERSON, firstName: 'Otro', document: { type: 'DNI', number: '45678912' } },
      org.staff.outsider.cookie,
    );
    expect(duplicate.status).toBe(409);
    expect((duplicate.body as Problem & { title: string }).title).toBe(
      'Ya existe un paciente con ese documento; pide acceso a su responsable.',
    );
    // El sí/no funciona como oráculo: el intento queda en la auditoría con el paciente encontrado y el actor.
    const attempts = await pool('owner').query(
      `SELECT 1 FROM audit.audit_log WHERE patient_id = $1 AND actor_user_id = $2 AND outcome = 'DENIED'
         AND changed_fields = ARRAY['document_check']`,
      [id, org.staff.outsider.userId],
    );
    expect(attempts.rows).toHaveLength(1);
  });

  it('RN-B03 · abrir la ficha deja un READ en la auditoría', async () => {
    const id = await register(org.staff.responsible.cookie);
    await harness.get(`/patients/${id}`, org.staff.responsible.cookie);
    const { rows } = await pool('owner').query(
      `SELECT 1 FROM audit.audit_log WHERE action = 'READ' AND resource_type = 'clinical.patient' AND patient_id = $1
         AND actor_user_id = $2`,
      [id, org.staff.responsible.userId],
    );
    expect(rows).toHaveLength(1);
    await harness.post(`/patients/${id}/archive`, undefined, org.staff.responsible.cookie);
  });

  it('RN-B01 · OBESITY no entra en el alta: es dato de salud', async () => {
    const response = await harness.post(
      '/patients',
      { ...PERSON, population: 'OBESITY' },
      org.staff.team.cookie,
    );
    expect(response.status).toBe(422);
    expect((response.body as Problem).rule).toBe('RN-B01');
  });
});

describe('RN-A05 · equipo de atención con visibilidad CARE_TEAM', () => {
  it('fuera del equipo no se ve; OWNER sí; ADMIN no; al sumarlo al equipo, sí', async () => {
    const { responsible, outsider, owner, admin } = org.staff;
    const id = await register(responsible.cookie);
    expect((await harness.get(`/patients/${id}`, outsider.cookie)).status).toBe(404);
    expect(
      ((await harness.get('/patients', outsider.cookie)).body as Page).patients.map((p) => p.id),
    ).not.toContain(id);
    expect((await harness.get(`/patients/${id}`, admin.cookie)).status).toBe(404);
    expect((await harness.get(`/patients/${id}`, owner.cookie)).status).toBe(200);

    // Fuera del equipo tampoco se edita su equipo: para él no existe.
    expect(
      (
        await harness.put(
          `/patients/${id}/care-team/${outsider.memberId}`,
          { role: 'COLLABORATOR', access: 'READ' },
          outsider.cookie,
        )
      ).status,
    ).toBe(404);
    const added = await harness.put(
      `/patients/${id}/care-team/${outsider.memberId}`,
      { role: 'COLLABORATOR', access: 'READ' },
      responsible.cookie,
    );
    expect(added.status).toBe(204);
    expect((await harness.get(`/patients/${id}`, outsider.cookie)).status).toBe(200);

    // Con acceso READ no escribe: ni la ficha ni el consentimiento.
    const docs = await documents(outsider.cookie);
    const grant = await harness
      .post(`/patients/${id}/consents`, undefined, outsider.cookie)
      .field('consentDocumentId', docs['HEALTH_DATA'] ?? '')
      .field('channel', 'IN_PERSON_DIGITAL');
    expect(grant.status).toBe(403);
    expect(
      (await harness.delete(`/patients/${id}/care-team/${responsible.memberId}`, owner.cookie))
        .status,
    ).toBe(422);
    await harness.post(`/patients/${id}/archive`, undefined, responsible.cookie);
  });
});

describe('RF-05 · consentimiento con evidencia', () => {
  it('en consulta, en papel con escaneo; uno vigente no se repite; la evidencia se descarga auditada', async () => {
    const { responsible } = org.staff;
    const id = await register(responsible.cookie);
    const docs = await documents(responsible.cookie);

    const digital = await harness
      .post(`/patients/${id}/consents`, undefined, responsible.cookie)
      .field('consentDocumentId', docs['HEALTH_DATA'] ?? '')
      .field('channel', 'IN_PERSON_DIGITAL');
    expect(digital.status).toBe(201);
    const again = await harness
      .post(`/patients/${id}/consents`, undefined, responsible.cookie)
      .field('consentDocumentId', docs['HEALTH_DATA'] ?? '')
      .field('channel', 'IN_PERSON_DIGITAL');
    expect(again.status).toBe(409);

    const paperWithout = await harness
      .post(`/patients/${id}/consents`, undefined, responsible.cookie)
      .field('consentDocumentId', docs['APP_ACCESS'] ?? '')
      .field('channel', 'PAPER_SCANNED');
    expect(paperWithout.body as Problem).toMatchObject({ code: 'NC-CLI-009', rule: 'RN-B01' });

    const fake = await harness
      .post(`/patients/${id}/consents`, undefined, responsible.cookie)
      .field('consentDocumentId', docs['APP_ACCESS'] ?? '')
      .field('channel', 'PAPER_SCANNED')
      .attach('evidence', Buffer.from('<script>alert(1)</script>'), {
        filename: 'escaneo.png',
        contentType: 'image/png',
      });
    expect(fake.status).toBe(415);

    const paper = await harness
      .post(`/patients/${id}/consents`, undefined, responsible.cookie)
      .field('consentDocumentId', docs['APP_ACCESS'] ?? '')
      .field('channel', 'PAPER_SCANNED')
      .attach('evidence', PNG, { filename: 'firma de José.png', contentType: 'image/png' });
    expect(paper.status).toBe(201);
    const consentId = (paper.body as Created).id;

    const { rows } = await pool('owner').query<{
      storage_key: string;
      original_name: string | null;
    }>(
      `SELECT f.storage_key, f.original_name FROM platform.file_object f
       JOIN clinical.consent c ON c.evidence_file_id = f.id WHERE c.id = $1`,
      [consentId],
    );
    expect(rows[0]?.original_name).toBeNull();
    expect(rows[0]?.storage_key).not.toContain('José');

    const download = await harness.get(
      `/patients/${id}/consents/${consentId}/evidence`,
      responsible.cookie,
    );
    expect(download.status).toBe(200);
    expect(download.headers['content-disposition']).toBe(
      'attachment; filename="evidencia-consentimiento.png"',
    );
    expect(download.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.from(download.body as Buffer)).toEqual(PNG);
    expect(
      (
        await harness.get(
          `/patients/${id}/consents/${consentId}/evidence`,
          org.staff.outsider.cookie,
        )
      ).status,
    ).toBe(404);

    // Con HEALTH_DATA vigente ya se puede registrar la población OBESITY.
    const current = (await harness.get(`/patients/${id}`, responsible.cookie)).body as Patient;
    const updated = await harness
      .patch(`/patients/${id}`, { population: 'OBESITY' }, responsible.cookie)
      .set('If-Match', `"${String(current.version)}"`);
    expect(updated.status).toBe(200);
    expect((updated.body as Patient).population).toBe('OBESITY');

    const listed = await harness.get(`/patients/${id}/consents`, responsible.cookie);
    const healthData = (
      listed.body as { consents: { id: string; purpose: string }[] }
    ).consents.find((c) => c.purpose === 'HEALTH_DATA');
    const revoked = await harness.post(
      `/patients/${id}/consents/${healthData?.id ?? ''}/revoke`,
      undefined,
      responsible.cookie,
    );
    expect(revoked.status).toBe(204);
    await harness.post(`/patients/${id}/archive`, undefined, responsible.cookie);
  });
});

describe('RN-A03 · cupo de pacientes activos', () => {
  it('superar el cupo es 422; archivar libera; reactivar vuelve a contar; cuenta también a los que no se ven', async () => {
    const small = await harness.createStaffOrganization({ maxActivePatients: 2 });
    const { responsible, outsider } = small.staff;
    const first = await register(responsible.cookie);
    await register(responsible.cookie);
    // El de fuera no ve a ninguno, pero el cupo los cuenta a todos.
    const over = await harness.post('/patients', PERSON, outsider.cookie);
    expect(over.status).toBe(422);
    expect((over.body as Problem).rule).toBe('RN-A03');

    expect(
      (await harness.post(`/patients/${first}/archive`, undefined, responsible.cookie)).status,
    ).toBe(204);
    await register(outsider.cookie);
    const reactivate = await harness.post(
      `/patients/${first}/reactivate`,
      undefined,
      responsible.cookie,
    );
    expect(reactivate.status).toBe(422);
    expect((reactivate.body as Problem).rule).toBe('RN-A03');
  });
});

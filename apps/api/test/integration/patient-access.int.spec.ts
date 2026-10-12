import type request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiHarness, PASSWORD, type StaffOrganization } from './support/api-harness.js';
import { id, pool } from './support/database.js';

/**
 * P6 · acceso del paciente a la app (RN-A06) contra PostgreSQL como app_user: invitación de un solo uso, aceptación
 * con un consentimiento por finalidad (RN-B01), sesión PATIENT resuelta en cada petición y acceso suspendido al
 * revocar APP_ACCESS o HEALTH_DATA o al archivar (RN-B02).
 */

const harness = new ApiHarness();
let org: StaffOrganization;

interface Created {
  id: string;
}
interface Problem {
  code: string;
  rule?: string;
}
interface Problem410 {
  status: number;
  code: string;
  title: string;
}
interface Inspected {
  role: string;
  email: string;
  firstName: string | null;
  accountExists: boolean;
  needsGuardianConsent: boolean;
  consents: {
    id: string;
    purpose: string;
    version: string;
    bodyMarkdown: string;
    provisional: boolean;
  }[];
}
interface Account {
  id: string;
  kind: string;
  activeOrganizationId: string | null;
}
interface PatientView {
  appAccess: { linked: boolean; invitation: { email: string; expiresAt: string } | null };
}

const PERSON = { firstName: 'Lucía', lastName: 'Huanca Ríos', sex: 'F', birthDate: '1993-07-08' };
const PDF = Buffer.from('%PDF-1.4\n% consentimiento firmado de prueba\n%%EOF\n');
const uniqueEmail = () => `paciente-${id()}@demo.test`;
/** Fecha de nacimiento con esa edad cumplida hoy (el 31 de diciembre, un año más: no cruza los 14 en las pruebas). */
const bornYearsAgo = (age: number) => `${String(new Date().getUTCFullYear() - age - 1)}-12-31`;

const sessionCookie = (response: request.Response): string => {
  const raw = response.headers['set-cookie'] as unknown as string[] | undefined;
  return raw?.find((c) => c.startsWith('nc_session='))?.split(';')[0] ?? '';
};

async function register(extra: object = {}): Promise<string> {
  const response = await harness.post(
    '/patients',
    { ...PERSON, ...extra },
    org.staff.responsible.cookie,
  );
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return (response.body as Created).id;
}

async function documentIds(): Promise<Record<string, string>> {
  const listed = await harness.get('/patients/consent-documents', org.staff.responsible.cookie);
  const { documents } = listed.body as { documents: { id: string; purpose: string }[] };
  return Object.fromEntries(documents.map((d) => [d.purpose, d.id]));
}

/** Consentimiento en consulta: digital o en papel firmado y escaneado (un PDF de prueba). */
async function grant(
  patientId: string,
  purpose: 'HEALTH_DATA' | 'APP_ACCESS',
  channel: 'IN_PERSON_DIGITAL' | 'PAPER_SCANNED',
) {
  // El id del texto se pide antes de armar la petición: supertest comparte el servidor entre peticiones.
  const documentId = (await documentIds())[purpose] ?? '';
  const request = harness
    .post(`/patients/${patientId}/consents`, undefined, org.staff.responsible.cookie)
    .field('consentDocumentId', documentId)
    .field('channel', channel);
  return channel === 'PAPER_SCANNED'
    ? request.attach('evidence', PDF, { filename: 'firma.pdf', contentType: 'application/pdf' })
    : request;
}

async function grantInPerson(patientId: string, purpose: 'HEALTH_DATA' | 'APP_ACCESS') {
  expect((await grant(patientId, purpose, 'IN_PERSON_DIGITAL')).status).toBe(201);
}

async function revoke(patientId: string, purpose: string): Promise<void> {
  const { cookie } = org.staff.responsible;
  const listed = await harness.get(`/patients/${patientId}/consents`, cookie);
  const consent = (
    listed.body as { consents: { id: string; purpose: string; revokedAt: string | null }[] }
  ).consents.find((c) => c.purpose === purpose && c.revokedAt === null);
  const response = await harness.post(
    `/patients/${patientId}/consents/${consent?.id ?? ''}/revoke`,
    undefined,
    cookie,
  );
  expect(response.status).toBe(204);
}

const invite = (patientId: string, body: object = {}, cookie = org.staff.responsible.cookie) =>
  harness.post(`/patients/${patientId}/invitation`, body, cookie);
const inspect = (token: string) => harness.post('/invitations/inspect', { token });
const accept = (token: string, acceptedConsentDocumentIds: string[]) =>
  harness.post('/invitations/accept', { token, password: PASSWORD, acceptedConsentDocumentIds });
const login = (email: string) => harness.post('/auth/login', { email, password: PASSWORD });

async function aliveSessions(userId: string): Promise<number> {
  const { rows } = await pool('owner').query<{ alive: number }>(
    `SELECT count(*)::int AS alive FROM iam.session WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId],
  );
  return rows[0]?.alive ?? 0;
}

beforeAll(async () => {
  await harness.start();
  org = await harness.createStaffOrganization();
});

afterAll(async () => {
  await harness.stop();
});

describe('RN-A06 · invitar y aceptar el acceso a la app', () => {
  it('invitar → correo → ver → aceptar cada finalidad pendiente → sesión PATIENT; todo o nada', async () => {
    const email = uniqueEmail();
    const patientId = await register({ email });
    await grantInPerson(patientId, 'HEALTH_DATA');

    expect((await invite(patientId)).status).toBe(201);
    const view = (await harness.get(`/patients/${patientId}`, org.staff.responsible.cookie))
      .body as PatientView;
    expect(view.appAccess).toMatchObject({ linked: false, invitation: { email } });
    const days =
      (new Date(view.appAccess.invitation?.expiresAt ?? 0).getTime() - Date.now()) / 86_400_000;
    expect(Math.round(days)).toBe(7);
    // La invitación del paciente no se lista ni cuenta como invitación de staff.
    const staffInvitations = await harness.get('/organization/invitations', org.staff.owner.cookie);
    expect(staffInvitations.status).toBe(200);
    expect(
      (staffInvitations.body as { invitations: { email: string }[] }).invitations.map(
        (i) => i.email,
      ),
    ).not.toContain(email);

    const token = await harness.invitationTokenFor(email);
    expect(harness.sent.filter((m) => m.to === email).at(-1)?.subject).toBe(
      'Tu acceso a la app de Consultorio',
    );
    const inspected = await inspect(token);
    expect(inspected.status).toBe(200);
    const page = inspected.body as Inspected;
    expect(page).toMatchObject({
      role: 'PATIENT',
      email,
      firstName: 'Lucía',
      accountExists: false,
      needsGuardianConsent: false,
    });
    // Solo lo que falta: HEALTH_DATA ya se registró en consulta.
    expect(page.consents.map((c) => [c.purpose, c.version, c.provisional])).toEqual([
      ['APP_ACCESS', '0.1-provisional', true],
    ]);
    expect(page.consents[0]?.bodyMarkdown).toContain(
      'Texto provisional, pendiente de revisión legal',
    );

    const refused = await accept(token, []);
    expect(refused.status).toBe(422);
    expect(refused.body as Problem).toMatchObject({ code: 'NC-CLI-025', rule: 'RN-B01' });
    const leftovers = await pool('owner').query(
      `SELECT (SELECT count(*)::int FROM iam.user_account WHERE email = $1) AS accounts,
              (SELECT count(*)::int FROM iam.invitation WHERE email = $1 AND accepted_at IS NOT NULL) AS used,
              (SELECT user_id FROM clinical.patient WHERE id = $2) AS linked`,
      [email, patientId],
    );
    expect(leftovers.rows[0]).toEqual({ accounts: 0, used: 0, linked: null });

    const accepted = await accept(token, [page.consents[0]?.id ?? '']);
    expect(accepted.status).toBe(200);
    const account = accepted.body as Account;
    expect(account).toMatchObject({ kind: 'PATIENT', activeOrganizationId: org.organizationId });
    const cookie = sessionCookie(accepted);
    expect((await harness.get('/account', cookie)).body).toMatchObject({ kind: 'PATIENT' });
    const staffOnly = await harness.get('/patients', cookie);
    expect(staffOnly.status).toBe(403);
    expect((staffOnly.body as Problem).code).toBe('NC-TEN-010');

    const { rows } = await pool('owner').query<{ purpose: string; channel: string; by: string }>(
      `SELECT c.purpose, c.channel, c.granted_by_user_id AS by FROM clinical.consent c
       WHERE c.patient_id = $1 ORDER BY c.granted_at`,
      [patientId],
    );
    expect(rows.map((r) => [r.purpose, r.channel])).toEqual([
      ['HEALTH_DATA', 'IN_PERSON_DIGITAL'],
      ['APP_ACCESS', 'APP'],
    ]);
    expect(rows[1]?.by).toBe(account.id);
    expect((await inspect(token)).status).toBe(410);
    const linked = (await harness.get(`/patients/${patientId}`, org.staff.responsible.cookie))
      .body as PatientView;
    expect(linked.appAccess).toEqual({ linked: true, invitation: null });
    const again = await invite(patientId);
    expect(again.status).toBe(409);
    expect((again.body as Problem).code).toBe('NC-CLI-023');

    const entered = await login(email);
    expect(entered.status).toBe(200);
    expect((entered.body as Account).kind).toBe('PATIENT');
  });

  it('⚠️ menor de 14: solo vale el papel firmado por su tutor; sin las dos finalidades no se invita y sus casillas se rechazan', async () => {
    const email = uniqueEmail();
    const patientId = await register({ email, birthDate: bornYearsAgo(12), population: 'CHILD' });
    const early = await invite(patientId);
    expect(early.status).toBe(422);
    expect(early.body as Problem).toMatchObject({ code: 'NC-CLI-010', rule: 'RN-B01' });

    // En consulta solo vale el papel firmado por su padre, madre o tutor, con su escaneo: la API rechaza el digital
    // de cualquier finalidad y no guarda nada.
    for (const purpose of ['HEALTH_DATA', 'APP_ACCESS'] as const) {
      const digital = await grant(patientId, purpose, 'IN_PERSON_DIGITAL');
      expect(digital.status).toBe(422);
      expect(digital.body as Problem).toMatchObject({ code: 'NC-CLI-026', rule: 'RN-B01' });
    }
    const none = await pool('owner').query(
      `SELECT count(*)::int AS consents FROM clinical.consent WHERE patient_id = $1`,
      [patientId],
    );
    expect(none.rows[0]).toEqual({ consents: 0 });
    expect((await grant(patientId, 'HEALTH_DATA', 'PAPER_SCANNED')).status).toBe(201);
    expect((await grant(patientId, 'APP_ACCESS', 'PAPER_SCANNED')).status).toBe(201);
    expect((await invite(patientId)).status).toBe(201);
    const token = await harness.invitationTokenFor(email);

    // Si una finalidad deja de estar vigente antes de aceptar: la página no tiene casillas y la API rechaza las que
    // lleguen.
    await revoke(patientId, 'APP_ACCESS');
    const page = (await inspect(token)).body as Inspected;
    expect(page).toMatchObject({ needsGuardianConsent: true, consents: [] });
    const ids = await documentIds();
    const refused = await accept(token, [ids['APP_ACCESS'] ?? '', ids['HEALTH_DATA'] ?? '']);
    expect(refused.status).toBe(422);
    expect(refused.body as Problem).toMatchObject({ code: 'NC-CLI-010', rule: 'RN-B01' });
    // La API, no solo la página: sin cuenta, sin consentimiento desde la app, sin vínculo y con el enlace intacto.
    const untouched = await pool('owner').query(
      `SELECT (SELECT count(*)::int FROM iam.user_account WHERE email = $1) AS accounts,
              (SELECT count(*)::int FROM clinical.consent WHERE patient_id = $2 AND channel = 'APP') AS from_app,
              (SELECT user_id FROM clinical.patient WHERE id = $2) AS linked,
              (SELECT count(*)::int FROM iam.invitation
                WHERE email = $1 AND accepted_at IS NULL AND revoked_at IS NULL) AS pending`,
      [email, patientId],
    );
    expect(untouched.rows[0]).toEqual({ accounts: 0, from_app: 0, linked: null, pending: 1 });

    // Con las dos firmadas en papel, entra sin casillas.
    expect((await grant(patientId, 'APP_ACCESS', 'PAPER_SCANNED')).status).toBe(201);
    const signed = (await inspect(token)).body as Inspected;
    expect(signed).toMatchObject({ needsGuardianConsent: false, consents: [] });
    const accepted = await accept(token, []);
    expect(accepted.status).toBe(200);
    expect((accepted.body as Account).kind).toBe('PATIENT');
  });

  it('desde los 14 años consiente como un adulto: en consulta y desde la app, con sus casillas', async () => {
    const email = uniqueEmail();
    const patientId = await register({
      email,
      birthDate: bornYearsAgo(15),
      population: 'ADOLESCENT',
    });
    await grantInPerson(patientId, 'HEALTH_DATA');
    expect((await invite(patientId)).status).toBe(201);
    const token = await harness.invitationTokenFor(email);
    const page = (await inspect(token)).body as Inspected;
    expect(page.needsGuardianConsent).toBe(false);
    expect(page.consents.map((c) => c.purpose)).toEqual(['APP_ACCESS']);
    const accepted = await accept(
      token,
      page.consents.map((c) => c.id),
    );
    expect(accepted.status).toBe(200);
    expect((accepted.body as Account).kind).toBe('PATIENT');
  });

  it('un correo con cuenta o con otra invitación pendiente no sirve; reenviar anula el enlace anterior', async () => {
    const patientId = await register();
    const noEmail = await invite(patientId);
    expect(noEmail.status).toBe(422);
    expect((noEmail.body as Problem).code).toBe('NC-CLI-024');

    const taken = await invite(patientId, { email: org.staff.team.email });
    expect(taken.status).toBe(409);
    expect((taken.body as Problem).code).toBe('NC-IAM-044');
    const staffEmail = uniqueEmail();
    const staffInvite = await harness.post(
      '/organization/invitations',
      { email: staffEmail, role: 'PROFESSIONAL' },
      org.staff.owner.cookie,
    );
    expect(staffInvite.status).toBe(201);
    const pending = await invite(patientId, { email: staffEmail });
    expect(pending.status).toBe(409);
    expect((pending.body as Problem).code).toBe('NC-IAM-045');

    // Fuera del equipo, el paciente no existe; con acceso READ, no se invita.
    expect((await invite(patientId, {}, org.staff.outsider.cookie)).status).toBe(404);
    await harness.put(
      `/patients/${patientId}/care-team/${org.staff.team.memberId}`,
      { role: 'COLLABORATOR', access: 'READ' },
      org.staff.responsible.cookie,
    );
    const byReader = await invite(patientId, { email: uniqueEmail() }, org.staff.team.cookie);
    expect(byReader.status).toBe(403);
    expect((byReader.body as Problem).code).toBe('NC-CLI-013');

    const email = uniqueEmail();
    expect((await invite(patientId, { email })).status).toBe(201);
    const first = await harness.invitationTokenFor(email);
    expect((await invite(patientId, { email })).status).toBe(201);
    const second = await harness.invitationTokenFor(email);
    expect(second).not.toBe(first);
    expect((await inspect(first)).status).toBe(410);
    expect((await inspect(second)).status).toBe(200);
    // Y al revés: una invitación de staff no pisa la pendiente del paciente.
    const clash = await harness.post(
      '/organization/invitations',
      { email, role: 'PROFESSIONAL' },
      org.staff.owner.cookie,
    );
    expect(clash.status).toBe(409);
    expect((clash.body as Problem).code).toBe('NC-IAM-045');
    expect((await inspect(second)).status).toBe(200);

    // Si el correo consiguió una cuenta entretanto, aceptar no la reutiliza.
    await pool('owner').query(
      `INSERT INTO iam.user_account (id, email, display_name, status) VALUES ($1, $2, 'Otra persona', 'PENDING')`,
      [id(), email],
    );
    const exists = await accept(second, []);
    expect(exists.status).toBe(409);
    expect((exists.body as Problem).code).toBe('NC-IAM-044');
  });
});

describe('RN-A06 · enlaces que ya no sirven y correos con cuenta', () => {
  it('si el correo ya es de una cuenta de staff o de plataforma, aceptar responde 409', async () => {
    const other = await harness.createStaffOrganization();
    for (const isPlatformAdmin of [false, true]) {
      const email = uniqueEmail();
      const patientId = await register({ email });
      expect((await invite(patientId)).status).toBe(201);
      const token = await harness.invitationTokenFor(email);
      // La cuenta aparece después de invitar: staff de otra organización, o de la plataforma.
      const userId = id();
      await pool('owner').query(
        `INSERT INTO iam.user_account (id, email, display_name, status, is_platform_admin)
         VALUES ($1, $2, 'Cuenta existente', 'ACTIVE', $3)`,
        [userId, email, isPlatformAdmin],
      );
      if (!isPlatformAdmin) {
        await pool('owner').query(
          `INSERT INTO tenancy.member (id, organization_id, user_id, role) VALUES ($1, $2, $3, 'PROFESSIONAL')`,
          [id(), other.organizationId, userId],
        );
      }
      const response = await accept(token, []);
      expect(response.status).toBe(409);
      expect((response.body as Problem).code).toBe('NC-IAM-044');
      const again = await invite(patientId, { email });
      expect(again.status).toBe(409);
      expect((again.body as Problem).code).toBe('NC-IAM-044');
    }
  });

  it('vencido, usado, revocado, archivado o vinculado: 410 con el mismo code y el mismo mensaje', async () => {
    const tokenFor = async (patientId: string, email: string) => {
      expect((await invite(patientId, { email })).status).toBe(201);
      return harness.invitationTokenFor(email);
    };
    const tokens: string[] = [];

    const expiredEmail = uniqueEmail();
    tokens.push(await tokenFor(await register(), expiredEmail));
    await pool('owner').query(
      `UPDATE iam.invitation SET expires_at = now() - interval '1 minute' WHERE email = $1`,
      [expiredEmail],
    );

    const usedEmail = uniqueEmail();
    const used = await tokenFor(await register(), usedEmail);
    const usedPage = (await inspect(used)).body as Inspected;
    expect(
      (
        await accept(
          used,
          usedPage.consents.map((c) => c.id),
        )
      ).status,
    ).toBe(200);
    tokens.push(used);

    const revokedPatient = await register();
    const revokedEmail = uniqueEmail();
    tokens.push(await tokenFor(revokedPatient, revokedEmail));
    await tokenFor(revokedPatient, revokedEmail);

    const archivedPatient = await register();
    tokens.push(await tokenFor(archivedPatient, uniqueEmail()));
    await harness.post(
      `/patients/${archivedPatient}/archive`,
      undefined,
      org.staff.responsible.cookie,
    );

    // Vinculado entretanto a otra cuenta (una carrera): el enlace pendiente ya no sirve.
    const linkedPatient = await register();
    tokens.push(await tokenFor(linkedPatient, uniqueEmail()));
    const otherAccount = id();
    await pool('owner').query(
      `INSERT INTO iam.user_account (id, email, display_name, status) VALUES ($1, $2, 'Otra cuenta', 'ACTIVE')`,
      [otherAccount, uniqueEmail()],
    );
    await pool('owner').query(`UPDATE clinical.patient SET user_id = $1 WHERE id = $2`, [
      otherAccount,
      linkedPatient,
    ]);

    const answers: Problem410[] = [];
    for (const token of tokens) {
      for (const response of [await inspect(token), await accept(token, [])]) {
        const body = response.body as Problem410;
        answers.push({ status: response.status, code: body.code, title: body.title });
      }
    }
    expect(answers).toHaveLength(10);
    expect(new Set(answers.map((a) => JSON.stringify(a)))).toEqual(
      new Set([
        JSON.stringify({
          status: 410,
          code: 'NC-IAM-040',
          title: 'La invitación venció, ya se usó o fue anulada. Pide una nueva a quien te invitó.',
        }),
      ]),
    );
  });

  it('el plazo del enlace lo ajusta la organización: patient_invitation.ttl_days, de 1 a 30', async () => {
    const { cookie } = org.staff.owner;
    const tooLong = await harness.put(
      '/organization/settings/patient_invitation.ttl_days',
      { value: 31 },
      cookie,
    );
    expect((tooLong.body as Problem).code).toBe('NC-TEN-030');
    const changed = await harness.put(
      '/organization/settings/patient_invitation.ttl_days',
      { value: 3 },
      cookie,
    );
    expect(changed.status).toBe(200);
    expect(changed.body).toMatchObject({
      'patient_invitation.ttl_days': 3,
      'invitation.ttl_days': 7,
    });
    const email = uniqueEmail();
    const patientId = await register({ email });
    expect((await invite(patientId)).status).toBe(201);
    const view = (await harness.get(`/patients/${patientId}`, org.staff.responsible.cookie))
      .body as PatientView;
    const days =
      (new Date(view.appAccess.invitation?.expiresAt ?? 0).getTime() - Date.now()) / 86_400_000;
    expect(Math.round(days)).toBe(3);
    await harness.put('/organization/settings/patient_invitation.ttl_days', { value: 7 }, cookie);
  });
});

describe('RN-B02 · revocar o archivar suspende el acceso', () => {
  it('sin HEALTH_DATA la sesión deja de valer al instante, el worker la cierra y entrar es 403; archivar igual', async () => {
    const email = uniqueEmail();
    const patientId = await register({ email });
    expect((await invite(patientId)).status).toBe(201);
    const token = await harness.invitationTokenFor(email);
    const page = (await inspect(token)).body as Inspected;
    expect(page.consents.map((c) => c.purpose).sort()).toEqual(['APP_ACCESS', 'HEALTH_DATA']);
    const accepted = await accept(
      token,
      page.consents.map((c) => c.id),
    );
    expect(accepted.status).toBe(200);
    const { id: userId } = accepted.body as Account;
    const cookie = sessionCookie(accepted);
    expect((await harness.get('/account', cookie)).status).toBe(200);

    await revoke(patientId, 'HEALTH_DATA');
    expect((await harness.get('/account', cookie)).status).toBe(401);
    expect(await aliveSessions(userId)).toBe(1);
    await harness.deliver('iam.patient-sessions');
    expect(await aliveSessions(userId)).toBe(0);
    const closed = await pool('owner').query(
      `SELECT 1 FROM audit.audit_log WHERE action = 'LOGOUT' AND actor_role = 'SYSTEM' AND organization_id = $1
         AND patient_id = $2 AND changed_fields = ARRAY['all_sessions']`,
      [org.organizationId, patientId],
    );
    expect(closed.rows).toHaveLength(1);
    const suspended = await login(email);
    expect(suspended.status).toBe(403);
    expect(suspended.body as Problem).toMatchObject({ code: 'NC-IAM-046', rule: 'RN-B02' });

    // Con HEALTH_DATA otra vez vigente, vuelve a entrar; archivado, ya no.
    await grantInPerson(patientId, 'HEALTH_DATA');
    const back = await login(email);
    expect(back.status).toBe(200);
    expect(
      (
        await harness.post(
          `/patients/${patientId}/archive`,
          undefined,
          org.staff.responsible.cookie,
        )
      ).status,
    ).toBe(204);
    expect((await harness.get('/account', sessionCookie(back))).status).toBe(401);
    await harness.deliver('iam.patient-sessions');
    expect(await aliveSessions(userId)).toBe(0);
    expect((await login(email)).status).toBe(403);
  });
});

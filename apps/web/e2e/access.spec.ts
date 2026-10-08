import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { ORGANIZATION_B_FILE } from './global-setup';
import { seriousViolations } from './support/axe';
import {
  acceptByApi,
  apiContext,
  apiLogin,
  createOrganization,
  inviteByApi,
  linkFromMail,
  loginInPage,
  PASSWORD,
  uniqueEmail,
  type TestOrganization,
} from './support/stack';

/**
 * P5 de punta a punta (RF-01 a RF-04, RN-A01, RN-A07, RN-A08) en escritorio y en el celular (WebKit), sobre el
 * build de producción con API, worker y Mailpit.
 */

const organizationB = (): TestOrganization =>
  JSON.parse(readFileSync(ORGANIZATION_B_FILE, 'utf8')) as TestOrganization;

async function setPasswordFromInvitation(page: Page, link: string, name: string) {
  await page.goto(link);
  await expect(page.getByText(/Te invitaron a/)).toBeVisible();
  // El token se borra de la barra en cuanto se lee (ADR-032).
  await expect.poll(() => new URL(page.url()).hash).toBe('');
  await page.getByLabel('Tu nombre').fill(name);
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Aceptar invitación' }).click();
  await page.waitForURL(/\/panel$/);
}

test.describe('RF-01 · acceso por invitación', () => {
  test('el dueño invita, el profesional fija su contraseña y entra; el enlace falla la segunda vez', async ({
    page,
    browser,
  }) => {
    const organization = await createOrganization();
    const professional = uniqueEmail();

    await loginInPage(page, organization.ownerEmail);
    await page.goto('/panel/organizacion');
    expect(await seriousViolations(page)).toEqual([]);
    await page.getByLabel('Correo de la persona').fill(professional);
    await page.getByRole('button', { name: 'Invitar' }).click();
    await expect(page.getByText('Invitación enviada')).toBeVisible();
    await expect(page.getByText(professional)).toBeVisible();

    const link = await linkFromMail(professional, '/invitacion');
    const guest = await browser.newContext();
    const guestPage = await guest.newPage();
    await setPasswordFromInvitation(guestPage, link, 'Profesional E2E');
    await expect(guestPage.getByRole('heading', { name: 'Inicio' })).toBeVisible();
    await expect(guestPage.getByText('Completa tu perfil profesional')).toBeVisible();

    const again = await browser.newContext();
    const againPage = await again.newPage();
    await againPage.goto(link);
    await expect(againPage.getByText('No podemos usar esta invitación')).toBeVisible();
    await expect(againPage.getByText(/venció, ya se usó o fue anulada/)).toBeVisible();
    await Promise.all([guest.close(), again.close()]);
  });

  test('una cuenta existente acepta con su contraseña actual, que no cambia', async ({ page }) => {
    const first = await createOrganization('Primera');
    const second = await createOrganization('Segunda');
    const email = uniqueEmail();
    await acceptByApi(await inviteByApi(first.ownerEmail, email), 'Persona E2E');

    const link = await inviteByApi(second.ownerEmail, email, 'ADMIN');
    await page.goto(link);
    await expect(page.getByText(/Ya tienes una cuenta con este correo/)).toBeVisible();
    await expect(page.getByLabel('Tu nombre')).toHaveCount(0);
    await page.getByLabel('Contraseña actual').fill(PASSWORD);
    await page.getByRole('button', { name: 'Aceptar invitación' }).click();
    await page.waitForURL(/\/panel$/);

    // Con dos membresías aparece el selector de organización.
    await expect(page.getByRole('combobox', { name: 'Organización activa' })).toBeVisible();
    const api = await apiContext();
    await apiLogin(api, email, PASSWORD);
    await api.dispose();
  });

  test('recuperar: correo, contraseña nueva, sesiones anteriores cerradas y la vieja ya no entra', async ({
    page,
  }) => {
    const organization = await createOrganization();
    const email = uniqueEmail();
    await acceptByApi(await inviteByApi(organization.ownerEmail, email), 'Persona E2E');
    const before = await apiContext();
    await apiLogin(before, email, PASSWORD);

    await page.goto('/recuperar');
    expect(await seriousViolations(page)).toEqual([]);
    await page.getByLabel('Correo').fill(email);
    await page.getByRole('button', { name: 'Enviar enlace' }).click();
    await expect(
      page.getByText('Si el correo está registrado, te enviamos un enlace que vence en 1 hora.'),
    ).toBeVisible();

    const newPassword = 'otra-tarde-de-garua-en-miraflores';
    await page.goto(await linkFromMail(email, '/recuperar/nueva'));
    await expect.poll(() => new URL(page.url()).hash).toBe('');
    await page.getByLabel('Nueva contraseña').fill(newPassword);
    await page.getByRole('button', { name: 'Guardar contraseña' }).click();
    await expect(page.getByText('Contraseña actualizada')).toBeVisible();

    expect((await before.get('/api/v1/account')).status()).toBe(401);
    await before.dispose();
    const old = await apiContext();
    expect(
      (await old.post('/api/v1/auth/login', { data: { email, password: PASSWORD } })).status(),
    ).toBe(401);
    await apiLogin(old, email, newPassword);
    await old.dispose();
  });

  test('/entrar muestra una sola falla y lleva a ?next= solo si es interno', async ({ page }) => {
    const organization = await createOrganization();
    await page.goto('/entrar?next=//evil.example');
    expect(await seriousViolations(page)).toEqual([]);
    await page.getByLabel('Correo').fill(organization.ownerEmail);
    await page.getByLabel('Contraseña', { exact: true }).fill('no-es-la-contraseña');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByText(/Correo o contraseña incorrectos/)).toBeVisible();
    await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.waitForURL(/\/panel$/);

    await page.context().clearCookies();
    await page.goto('/panel/cuenta');
    await page.waitForURL(/\/entrar\?next=%2Fpanel%2Fcuenta/);
    await page.getByLabel('Correo').fill(organization.ownerEmail);
    await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.waitForURL(/\/panel\/cuenta$/);
    expect(await seriousViolations(page)).toEqual([]);
  });
});

test.describe('RN-A01 y RN-A04 · aislamiento y roles', () => {
  test('un profesional de A recibe 404 en los recursos de B y no ve B en el selector', async ({
    page,
  }) => {
    const a = await createOrganization();
    const b = organizationB();
    const professional = uniqueEmail();
    await acceptByApi(await inviteByApi(a.ownerEmail, professional), 'Profesional A');

    const api = await apiContext();
    await apiLogin(api, professional, PASSWORD);
    const switched = await api.post('/api/v1/session/active-organization', {
      data: { organizationId: b.id },
    });
    expect(switched.status()).toBe(404);
    const members = (await (await api.get('/api/v1/organization/members')).json()) as {
      members: { email: string | null }[];
    };
    expect(members.members).toHaveLength(2);
    await api.dispose();

    // El dueño de A tampoco alcanza a los miembros de B: no existen para él.
    const ownerB = await apiContext();
    await apiLogin(ownerB, b.ownerEmail, PASSWORD);
    const bMembers = (await (await ownerB.get('/api/v1/organization/members')).json()) as {
      members: { id: string }[];
    };
    await ownerB.dispose();
    const ownerA = await apiContext();
    await apiLogin(ownerA, a.ownerEmail, PASSWORD);
    const foreign = await ownerA.patch(
      `/api/v1/organization/members/${bMembers.members[0]?.id ?? ''}`,
      {
        data: { status: 'SUSPENDED' },
      },
    );
    expect(foreign.status()).toBe(404);
    await ownerA.dispose();

    await loginInPage(page, professional);
    await expect(page.getByRole('combobox', { name: 'Organización activa' })).toHaveCount(0);
    await expect(page.getByText('Organización B')).toHaveCount(0);
  });

  test('un PROFESSIONAL no ve invitaciones ni suscripción, y la API se lo niega', async ({
    page,
  }) => {
    const organization = await createOrganization();
    const professional = uniqueEmail();
    await acceptByApi(await inviteByApi(organization.ownerEmail, professional), 'Profesional');

    await loginInPage(page, professional);
    await page.goto('/panel/organizacion');
    await expect(page.getByRole('heading', { name: 'Miembros' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Invitaciones pendientes' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Suscripción y cupo' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Guardar cambios' })).toHaveCount(0);

    const api = await apiContext();
    await apiLogin(api, professional, PASSWORD);
    expect((await api.get('/api/v1/organization/invitations')).status()).toBe(403);
    expect((await api.get('/api/v1/organization/subscription')).status()).toBe(403);
    await api.dispose();
  });

  test('/panel/cuenta: perfil profesional, sesiones y cerrar todas', async ({ page }) => {
    const organization = await createOrganization();
    await loginInPage(page, organization.ownerEmail);
    await expect(page.getByText('Completa tu perfil profesional')).toBeVisible();
    await page.goto('/panel/cuenta');
    await page.getByRole('combobox', { name: 'Profesión' }).click();
    await page.getByRole('option', { name: 'Nutricionista', exact: true }).click();
    await page.getByLabel('Colegiatura').fill('CNP 0000');
    await page.getByRole('button', { name: 'Guardar perfil' }).click();
    await expect(page.getByText('Perfil guardado')).toBeVisible();
    await expect(page.getByText('Completa tu perfil profesional')).toHaveCount(0);

    await expect(page.getByText('Este equipo')).toBeVisible();
    await page.getByRole('button', { name: 'Cerrar todas las sesiones' }).click();
    await page.getByRole('button', { name: 'Cerrar todas', exact: true }).click();
    await page.waitForURL(/\/entrar/);
  });
});

import { randomBytes, randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { seriousViolations } from './support/axe';
import {
  apiContext,
  apiLogin,
  createOrganization,
  DEMO_PASSWORD,
  DEMO_PLATFORM_ADMIN,
  loginAsPatientInPage,
  loginInPage,
  PASSWORD,
  patientWithAccess,
} from './support/stack';

/**
 * P15 (PR 3b) de punta a punta, en escritorio y en el celular (RF-39; RN-A03, RN-A09; ADR-127): el soporte de la plataforma ve
 * cada organización con el uso de su cupo, crea un plan y apaga las fotos de progreso de una organización; su dueña ya no ve la
 * pestaña Fotos en el expediente, y el paciente que las había autorizado todavía puede retirar su autorización (ADR-128). axe en
 * cada pantalla. Datos sintéticos.
 */

test.describe('P15 · Panel interno', () => {
  test('RF-39: el cupo de cada organización, un plan nuevo y una función apagada que desaparece del panel', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const suffix = randomBytes(4).toString('hex');
    const name = `Consultorio plataforma ${suffix}`;
    const organization = await createOrganization(name);
    const patient = await patientWithAccess(organization.ownerEmail);
    // El paciente autorizó sus fotos de progreso desde la app.
    const asPatient = await apiContext();
    await apiLogin(asPatient, patient.email, PASSWORD);
    const granted = await asPatient.post('/api/v1/me/consents', {
      headers: { 'Idempotency-Key': `consent:${randomUUID()}` },
      data: { purpose: 'PROGRESS_PHOTOS' },
    });
    expect(granted.status(), 'autorizar las fotos de progreso').toBe(201);
    await asPatient.dispose();

    // El soporte entra al panel interno y ve el cupo de la organización: 1 paciente activo de 50.
    await page.goto('/entrar');
    await page.getByLabel('Correo').fill(DEMO_PLATFORM_ADMIN);
    await page.getByLabel('Contraseña', { exact: true }).fill(DEMO_PASSWORD);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.waitForURL(/\/admin\/plataforma$/);
    const row = page.getByRole('row').filter({ hasText: name });
    await expect(row).toContainText('TRAMO_50');
    await expect(row).toContainText('1 de 50');
    expect(await seriousViolations(page)).toEqual([]);

    // Un plan nuevo.
    await page.getByRole('link', { name: 'Planes' }).click();
    await page.waitForURL(/\/admin\/plataforma\/planes$/);
    const form = page.getByRole('form', { name: 'Nuevo plan' });
    const code = `TRAMO_E2E_${suffix.toUpperCase()}`;
    await form.getByLabel('Código').fill(code);
    await form.getByLabel('Nombre').fill(`Tramo de prueba ${suffix}`);
    await form.getByLabel('Pacientes activos').fill('20');
    await form.getByLabel('Precio (S/)').fill('99.90');
    await form.getByRole('button', { name: 'Crear plan' }).click();
    const plan = page
      .getByRole('list', { name: 'Planes' })
      .getByRole('listitem')
      .filter({ hasText: code });
    await expect(plan).toContainText('20 pacientes');
    await expect(plan).toContainText('S/ 99.90');
    expect(await seriousViolations(page)).toEqual([]);

    // Las fotos de progreso apagadas para esa organización.
    await page.getByRole('link', { name: 'Organizaciones' }).click();
    await page.getByRole('link', { name }).click();
    await page.waitForURL(/\/admin\/plataforma\/organizaciones\//);
    await expect(page.getByText('1 de 50 pacientes')).toBeVisible();
    const photos = page.getByRole('listitem').filter({ hasText: 'Fotos de progreso' });
    // La casilla es optimista: se espera a que la API la guarde antes de salir de la página.
    const saved = page.waitForResponse(
      (response) =>
        response.url().endsWith('/flags/PROGRESS_PHOTOS') && response.request().method() === 'PUT',
    );
    await photos.getByRole('checkbox').uncheck();
    expect((await saved).status()).toBe(200);
    await expect(photos).toContainText('Apagada');
    expect(await seriousViolations(page)).toEqual([]);

    // La dueña ya no ve la pestaña Fotos; el informe sigue.
    await page.context().clearCookies();
    await loginInPage(page, organization.ownerEmail);
    await page.goto(`/panel/pacientes/${patient.id}/entrenamiento`);
    const tabs = page.getByRole('navigation', { name: 'Secciones de entrenamiento' });
    await expect(tabs.getByRole('link', { name: 'Informes' })).toBeVisible();
    await expect(tabs.getByRole('link', { name: 'Fotos' })).toHaveCount(0);

    // El paciente ya no sube ni ve fotos, pero puede retirar su autorización, y al retirarla el enlace se va.
    await page.context().clearCookies();
    await loginAsPatientInPage(page, patient.email);
    await page.goto('/mi/progreso');
    await page.getByRole('link', { name: 'Fotos de progreso' }).click();
    await page.waitForURL(/\/mi\/progreso\/fotos$/);
    await expect(page.getByText('Tu organización pausó las fotos de progreso')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Subir la foto/ })).toHaveCount(0);
    expect(await seriousViolations(page)).toEqual([]);
    await page.getByRole('button', { name: 'Retirar la autorización' }).click();
    await page.getByRole('button', { name: 'Retirar y borrar' }).click();
    await expect(page.getByText('Consulta a tu profesional.')).toBeVisible();
    await page.goto('/mi/progreso');
    await expect(page.getByRole('heading', { name: 'Progreso' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Fotos de progreso' })).toHaveCount(0);
  });
});

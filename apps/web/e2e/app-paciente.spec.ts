import { expect, test, type Page } from '@playwright/test';
import { seriousViolations } from './support/axe';
import { luisWithPrescription } from './support/luis';
import { appAccessByApi, publishedExchangePlanByApi } from './support/patient-app';
import { createOrganization, loginAsPatientInPage, loginInPage } from './support/stack';

/**
 * P13 (PR 3) de punta a punta, en escritorio y en el celular (RF-27, RF-28; RN-G05, RN-G06, RN-G08): Luis, con su plan por
 * intercambios publicado y su acceso a la app (preparados por la API), registra el desayuno de su plan en tres toques desde Hoy,
 * agua, una nota y su peso. Su equipo cambia el tema y le deja un mensaje, que Hoy muestra. axe en cada pantalla. Datos
 * sintéticos de seeds/luis.
 */

/** Hoy con las comidas del plan: el worker copia el plan publicado a la app (tracking.plans). */
async function hoyWithPlan(page: Page) {
  const breakfast = page.getByRole('button', { name: /^Desayuno/ });
  await expect(async () => {
    await page.goto('/mi/hoy');
    await expect(breakfast).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  return breakfast;
}

test.describe('P13 · App del paciente: Hoy y el plan', () => {
  test('RN-G06: Luis registra el desayuno de su plan en tres toques desde Hoy', async ({
    page,
  }) => {
    const organization = await createOrganization();
    const patientId = await luisWithPrescription(organization.ownerEmail);
    await publishedExchangePlanByApi(organization.ownerEmail, patientId);
    const email = await appAccessByApi(organization.ownerEmail, patientId);

    await loginAsPatientInPage(page, email);
    const breakfast = await hoyWithPlan(page);
    await expect(page.getByRole('heading', { level: 2, name: 'Tu día' })).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    // Tres toques: el tiempo de comida, un alimento permitido y Registrar con la porción del plan.
    await breakfast.click();
    const region = page.locator(`[id="${(await breakfast.getAttribute('aria-controls')) ?? ''}"]`);
    const food = region.locator('button[aria-pressed]').first();
    const foodName = ((await food.locator('span').first().textContent()) ?? '').trim();
    await food.click();
    await region.getByRole('button', { name: 'Registrar', exact: true }).click();

    await expect(region.getByRole('status').getByText('Registrado')).toBeVisible();
    const logged = page.getByRole('region', { name: 'Lo que registraste hoy' });
    await expect(logged.getByText(foodName)).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    // Anular no borra: sale del día (RN-G12).
    await logged.getByRole('button', { name: `Anular ${foodName}` }).click();
    await expect(logged.getByText(foodName)).toHaveCount(0);
  });

  test('agua, una nota y el peso; el equipo cambia el tema y el mensaje, y Hoy los muestra', async ({
    page,
    browser,
  }) => {
    const organization = await createOrganization();
    const patientId = await luisWithPrescription(organization.ownerEmail);
    await publishedExchangePlanByApi(organization.ownerEmail, patientId);
    const email = await appAccessByApi(organization.ownerEmail, patientId);

    await loginAsPatientInPage(page, email);
    await hoyWithPlan(page);
    const water = page.getByRole('region', { name: 'Agua' });
    await water.getByRole('button', { name: '+ 250 ml' }).click();
    await expect(water.getByRole('status').getByText('250 ml de agua.')).toBeVisible();

    await page.goto('/mi/mas');
    await page.getByLabel('Escribe a tu equipo').fill('Hoy me costó la cena.');
    await page.getByRole('button', { name: 'Enviar nota' }).click();
    await expect(page.getByRole('status').getByText('Nota enviada')).toBeVisible();
    await page.getByLabel('Peso de hoy').fill('79.4');
    await page.getByRole('button', { name: 'Registrar peso' }).click();
    await expect(page.getByRole('status').getByText('Peso registrado')).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    const staffContext = await browser.newContext();
    const panel = await staffContext.newPage();
    await loginInPage(panel, organization.ownerEmail);
    await panel.goto(`/panel/pacientes/${patientId}/app`);
    await expect(panel.getByRole('heading', { name: 'Ajustes de la app' })).toBeVisible();
    expect(await seriousViolations(panel)).toEqual([]);
    await panel.getByLabel('Color del tema').fill('#1f8a70');
    await panel.getByRole('button', { name: 'Guardar ajustes' }).click();
    await expect(panel.getByRole('status').getByText('Ajustes guardados')).toBeVisible();
    await panel.getByLabel('Mensaje nuevo').fill('Luis, vas muy bien.');
    await panel.getByRole('button', { name: 'Agregar mensaje' }).click();
    await expect(panel.getByText('Luis, vas muy bien.')).toBeVisible();
    await staffContext.close();

    await page.goto('/mi/hoy');
    await expect(page.getByText('Luis, vas muy bien.')).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
  });
});

import { expect, test, type Page } from '@playwright/test';
import { seriousViolations } from './support/axe';
import {
  appReady,
  editWindowByApi,
  hundredKcalFoodByApi,
  limaDate,
  patientPostsByApi,
} from './support/analytics';
import { luisWithPrescription } from './support/luis';
import { appAccessByApi, publishedExchangePlanByApi } from './support/patient-app';
import { createOrganization, loginInPage } from './support/stack';

/**
 * P14 (PR 6a) de punta a punta, en escritorio y en el celular (RF-34, RN-G13; ADR-093): Luis registra su comida de hoy y deja una
 * nota desde su app (por la API); el worker recalcula el panel y su equipo ve la alerta en Inicio, la atiende en su seguimiento y la
 * alerta se apaga. axe en Inicio. Datos sintéticos.
 */

/** Vuelve a cargar la página hasta que el worker deje lista la vista (los eventos se procesan aparte). */
async function gotoUntil(page: Page, path: string, ready: () => Promise<void>) {
  await expect(async () => {
    await page.goto(path);
    await ready();
  }).toPass({ timeout: 45_000 });
}

test.describe('P14 · Inicio con alertas', () => {
  test('RF-34: la nota sin leer de Luis aparece en Inicio y se apaga al leerla', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const organization = await createOrganization();
    const owner = organization.ownerEmail;
    const luis = await luisWithPrescription(owner);
    const email = await appAccessByApi(owner, luis);
    await publishedExchangePlanByApi(owner, luis);
    await editWindowByApi(owner, 7);
    const foodId = await hundredKcalFoodByApi(owner);
    await appReady(email, (today) => today.target !== null);

    await patientPostsByApi(email, [
      {
        path: '/me/food-logs',
        localDate: limaDate(0),
        body: { source: { kind: 'CATALOG', mealSlotCode: 'LUNCH', foodId, grams: 800 } },
      },
      { path: '/me/notes', localDate: limaDate(0), body: { body: 'Hoy me costó la cena.' } },
    ]);
    await loginInPage(page, owner);

    // RN-G13: la nota sin leer, con el número que la calculó y su enlace al seguimiento.
    const alerts = page.getByRole('list', { name: 'Alertas de Luis Ejemplo Sintético' });
    await gotoUntil(page, '/panel', async () => {
      await expect(alerts.getByText('Notas sin leer')).toBeVisible({ timeout: 2_000 });
    });
    await expect(page.getByText('1 nota sin leer')).toBeVisible();
    await expect(page.getByRole('link', { name: /Notas sin leer/ }).first()).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    // El filtro va en la URL.
    await page
      .getByRole('navigation', { name: 'Filtrar por alerta' })
      .getByRole('link', { name: /Notas sin leer/ })
      .click();
    await expect(page).toHaveURL(/\?alerta=UNREAD_NOTES$/);
    await expect(alerts).toBeVisible();

    // Atenderla: el seguimiento muestra la nota y la marca leída; la alerta se apaga.
    await alerts.getByRole('link', { name: /Notas sin leer/ }).click();
    await expect(
      page
        .getByRole('region', { name: 'Notas nuevas del paciente' })
        .getByText('Hoy me costó la cena.'),
    ).toBeVisible();
    await gotoUntil(page, '/panel', async () => {
      await expect(page.getByRole('heading', { name: /con alertas/ })).toBeVisible({
        timeout: 2_000,
      });
    });
    expect(await seriousViolations(page)).toEqual([]);
  });
});

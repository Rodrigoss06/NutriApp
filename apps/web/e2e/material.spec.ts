import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { seriousViolations } from './support/axe';
import { luisWithPrescription } from './support/luis';
import { appAccessByApi } from './support/patient-app';
import { createOrganization, loginAsPatientInPage, loginInPage } from './support/stack';

/**
 * P14 (PR 6b) de punta a punta, en escritorio y en el celular (RF-30; ADR-086, ADR-094): el equipo agrega un artículo y un PDF a la
 * biblioteca, se los asigna a Luis desde su app, Luis los abre en Más › Material y su equipo ve que los abrió. axe en cada pantalla.
 * Datos sintéticos.
 */

const PDF = Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n');

/** Vuelve a cargar la página hasta que la vista refleje lo último (la marca de visto llega aparte). */
async function gotoUntil(page: Page, path: string, ready: () => Promise<void>) {
  await expect(async () => {
    await page.goto(path);
    await ready();
  }).toPass({ timeout: 30_000 });
}

async function choose(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option }).click();
}

test.describe('P14 · Material educativo', () => {
  test('RF-30: el artículo y el PDF que el equipo asigna a Luis, y la hora en que los abre', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const organization = await createOrganization();
    const owner = organization.ownerEmail;
    const luis = await luisWithPrescription(owner);
    const email = await appAccessByApi(owner, luis);
    await loginInPage(page, owner);

    // La biblioteca: un artículo con formato simple y un PDF.
    await page.goto('/panel/biblioteca/material');
    await choose(page, 'Tipo', 'Artículo');
    await page.getByLabel('Título').fill('Hidratación en el día');
    await page
      .getByLabel('Texto')
      .fill(
        '# Cuánta agua\n\nToma **8 vasos** al día.\n\n- Uno al despertar\n- Uno con cada comida',
      );
    await page.getByRole('button', { name: 'Agregar a la biblioteca' }).click();
    const library = page.getByRole('list', { name: 'Material de la organización' });
    await expect(library.getByText('Hidratación en el día').first()).toBeVisible();

    await choose(page, 'Tipo', 'PDF');
    await page.getByLabel('Título').fill('Recetario de cenas');
    await page.getByLabel('Archivo PDF').setInputFiles({
      name: 'recetario.pdf',
      mimeType: 'application/pdf',
      buffer: PDF,
    });
    await page.getByRole('button', { name: 'Agregar a la biblioteca' }).click();
    await expect(library.getByText('Recetario de cenas').first()).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    // Se asignan desde la app de Luis.
    await page.goto(`/panel/pacientes/${luis}/app`);
    const assigned = page.getByRole('list', { name: 'Material asignado' });
    for (const title of ['Hidratación en el día', 'Recetario de cenas']) {
      await choose(page, 'Material de la biblioteca', title);
      await page.getByRole('button', { name: 'Asignar' }).click();
      await expect(assigned.getByText(title).first()).toBeVisible();
    }
    await expect(assigned.getByText('Sin abrir')).toHaveCount(2);
    expect(await seriousViolations(page)).toEqual([]);

    // Luis los ve en Más › Material y abre el artículo.
    await page.context().clearCookies();
    await loginAsPatientInPage(page, email);
    await page.goto('/mi/mas');
    await page.getByRole('link', { name: 'Guías, artículos y videos de tu equipo' }).click();
    const mine = page.getByRole('list', { name: 'Tu material' });
    await expect(mine.getByRole('link')).toHaveCount(2);
    expect(await seriousViolations(page)).toEqual([]);
    await mine.getByRole('link', { name: /Hidratación en el día/ }).click();
    await expect(
      page.getByRole('heading', { name: 'Hidratación en el día', level: 1 }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Cuánta agua', level: 2 })).toBeVisible();
    await expect(page.getByText('8 vasos', { exact: true })).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: 'Uno al despertar' })).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    // El PDF se descarga por la API.
    await page.goto('/mi/material');
    await mine.getByRole('link', { name: /Recetario de cenas/ }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('link', { name: 'Descargar el PDF' }).click(),
    ]);
    expect((await readFile(await download.path())).subarray(0, 5).toString()).toBe('%PDF-');

    // Su equipo ve que los abrió.
    await page.context().clearCookies();
    await loginInPage(page, owner);
    await gotoUntil(page, `/panel/pacientes/${luis}/app`, async () => {
      await expect(assigned.getByText('Abierto', { exact: true })).toHaveCount(2, {
        timeout: 2_000,
      });
    });
  });
});

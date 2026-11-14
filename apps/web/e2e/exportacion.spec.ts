import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { seriousViolations } from './support/axe';
import {
  createOrganization,
  loginAsPatientInPage,
  loginInPage,
  patientWithAccess,
} from './support/stack';

/**
 * P15 (PR 5b) de punta a punta, en escritorio y en el celular (RF-07, RN-B04; ADR-131, ADR-132): el responsable prepara la
 * exportación del paciente desde su ficha y descarga el ZIP; el paciente descarga la suya desde Más › Tus datos. axe en cada pantalla.
 * Datos sintéticos.
 */

/** Prepara la exportación, espera a que el worker la arme y la descarga: un ZIP con su nombre. */
async function prepareAndDownload(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Preparar la exportación' }).click();
  const exports = page.getByRole('list', { name: 'Exportaciones' });
  await expect(exports.getByRole('listitem').first()).toContainText('Lista para descargar', {
    timeout: 60_000,
  });
  expect(await seriousViolations(page)).toEqual([]);
  const downloading = page.waitForEvent('download');
  await exports
    .getByRole('link', { name: /Descargar el ZIP/ })
    .first()
    .click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^exportacion-[a-z0-9-]+-\d{4}-\d{2}-\d{2}\.zip$/);
  const path = await download.path();
  const bytes = await readFile(path);
  // «PK»: la firma de un ZIP.
  expect(bytes.subarray(0, 2).toString('latin1')).toBe('PK');
}

test.describe('P15 · Exportación del paciente', () => {
  test('RN-B04: el responsable la descarga desde la ficha, y el paciente desde su app', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const organization = await createOrganization('Consultorio exportación');
    const patient = await patientWithAccess(organization.ownerEmail);

    // La dueña registró al paciente: es su responsable.
    await loginInPage(page, organization.ownerEmail);
    await page.goto(`/panel/pacientes/${patient.id}`);
    const section = page.getByRole('region', { name: 'Exportar sus datos' });
    await expect(section).toContainText('Queda 24 horas');
    expect(await seriousViolations(page)).toEqual([]);
    await prepareAndDownload(page);

    // El paciente, desde Más › Tus datos.
    await page.context().clearCookies();
    await loginAsPatientInPage(page, patient.email);
    await page.goto('/mi/mas');
    await page
      .getByRole('link', { name: 'Descargar todo lo que tu equipo guarda sobre ti' })
      .click();
    await page.waitForURL(/\/mi\/datos$/);
    await expect(page.getByRole('heading', { name: 'Tus datos' })).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
    await prepareAndDownload(page);
  });
});

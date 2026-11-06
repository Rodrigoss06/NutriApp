import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { seriousViolations } from './support/axe';
import { luisWithTwoEvaluationsByApi } from './support/evolution';
import { appAccessByApi } from './support/patient-app';
import { createOrganization, loginAsPatientInPage, loginInPage } from './support/stack';

/**
 * P14 (PR 5b) de punta a punta, en escritorio y en el celular (RF-35, RF-30; RN-C06, RN-D03, RN-G09, RN-H01). Luis tiene sus dos
 * evaluaciones ISAK 2 con el estudio de ETM de su evaluadora (preparado por la API): el equipo ve su evolución con el cambio
 * frente al CMD95 y cada método aparte, y descarga la ficha de evolución; Luis ve su Progreso en la app. axe en cada pantalla.
 * Datos sintéticos.
 */

/** Descarga una ficha con su botón: el nombre del archivo y sus bytes. */
async function download(page: Page, name: string) {
  const button = page.getByRole('button', { name });
  const [file] = await Promise.all([page.waitForEvent('download'), button.click()]);
  return { name: file.suggestedFilename(), pdf: await readFile(await file.path()) };
}

test.describe('P14 · Evolución antropométrica', () => {
  test('RF-35 y RF-30: la evolución de Luis frente al CMD95, su ficha y su Progreso', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const organization = await createOrganization();
    const owner = organization.ownerEmail;
    const { luisId } = await luisWithTwoEvaluationsByApi(owner);
    const email = await appAccessByApi(owner, luisId);
    await loginInPage(page, owner);

    // El equipo entra desde sus evaluaciones.
    await page.goto(`/panel/pacientes/${luisId}/evaluaciones`);
    await page.getByRole('link', { name: 'Ver la evolución' }).click();
    await expect(page.getByRole('heading', { name: 'Evolución', level: 2 })).toBeVisible();
    await expect(
      page.getByText('2 evaluaciones, del 15 de setiembre de 2026 al 13 de octubre de 2026.'),
    ).toBeVisible();

    // RN-C06 · G-04: la suma de 6 pliegues bajó 6.9 mm, más que su CMD95 (cambio real); el abdominal, no.
    const measurements = page.getByRole('region', { name: 'Medidas en el tiempo' });
    const sum = measurements.getByRole('row', { name: /^Suma de 6 pliegues/ });
    await expect(sum).toContainText('−6.9 mm');
    await expect(sum).toContainText('Cambio real');
    await expect(measurements.getByRole('row', { name: /^Pliegue abdominal/ })).toContainText(
      'Sin cambio significativo',
    );

    // RN-D03: cada indicador con su método, en su propia fila; y la tendencia por mes (RN-G09).
    await expect(page.getByRole('region', { name: 'Indicadores en el tiempo' })).toContainText(
      '% de grasa (Durnin & Womersley (1974) + Siri)',
    );
    await expect(page.getByRole('region', { name: 'Tendencia de cada mes' })).toContainText(
      'octubre de 2026',
    );
    expect(await seriousViolations(page)).toEqual([]);

    // RN-H01: la ficha de evolución, desde la última evaluación.
    const sheet = await download(page, 'Descargar ficha de evolución (PDF)');
    expect(sheet.name).toBe('ficha-evolucion.pdf');
    expect(sheet.pdf.subarray(0, 5).toString()).toBe('%PDF-');

    // RF-30: Luis ve su Progreso en la app, con el cambio real o «sin cambio significativo».
    await page.context().clearCookies();
    await loginAsPatientInPage(page, email);
    await page.goto('/mi/progreso');
    await expect(page.getByRole('heading', { name: 'Progreso', level: 1 })).toBeVisible();
    await expect(page.getByText('De tus 2 evaluaciones.', { exact: false })).toBeVisible();
    const sum6 = page.getByRole('region', { name: 'Suma de 6 pliegues' });
    await expect(sum6).toContainText('Cambio real');
    await expect(sum6).toContainText('desde el 15 de setiembre de 2026');
    await expect(page.getByRole('region', { name: '% de grasa' })).toContainText(
      'Durnin & Womersley (1974) + Siri',
    );
    await expect(page.getByRole('region', { name: 'Peso' })).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
  });
});

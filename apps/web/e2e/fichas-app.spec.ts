import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { seriousViolations } from './support/axe';
import { appReady } from './support/analytics';
import { luisWithPrescription } from './support/luis';
import { appAccessByApi, publishedExchangePlanByApi } from './support/patient-app';
import { createOrganization, loginAsPatientInPage } from './support/stack';

/**
 * P14 (PR 6c) de punta a punta, en escritorio y en el celular (ADR-080, ADR-095): Luis descarga desde Más las fichas vigentes, la de
 * su plan y la de los resultados de su evaluación, con la marca de su profesional. La API elige el origen; axe en la pantalla. Datos
 * sintéticos.
 */

async function download(page: Page, name: string) {
  const [file] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    page.getByRole('button', { name }).click(),
  ]);
  return { name: file.suggestedFilename(), pdf: await readFile(await file.path()) };
}

test.describe('P14 · Fichas en la app', () => {
  test('ADR-095: Luis descarga la ficha de su plan vigente y la de sus resultados', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const organization = await createOrganization();
    const owner = organization.ownerEmail;
    const luis = await luisWithPrescription(owner);
    const email = await appAccessByApi(owner, luis);
    await publishedExchangePlanByApi(owner, luis);
    await appReady(email, (today) => today.target !== null);

    await loginAsPatientInPage(page, email);
    await page.goto('/mi/mas');
    const sheets = page.getByRole('region', { name: 'Fichas en PDF' });
    await expect(sheets.getByRole('button')).toHaveCount(2);
    expect(await seriousViolations(page)).toEqual([]);

    const plan = await download(page, 'Mi plan de alimentación (PDF)');
    expect(plan.name).toMatch(/\.pdf$/);
    expect(plan.pdf.subarray(0, 5).toString()).toBe('%PDF-');

    const results = await download(page, 'Mis resultados de la última evaluación (PDF)');
    expect(results.pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});

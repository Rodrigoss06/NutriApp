import { expect, test } from '@playwright/test';
import { startedProgramByApi } from './support/analytics';
import { seriousViolations } from './support/axe';
import { luisWithPrescription } from './support/luis';
import { appAccessByApi } from './support/patient-app';
import { createOrganization, loginAsPatientInPage, loginInPage } from './support/stack';

/**
 * P14.5 (PR 6b-2) de punta a punta, en escritorio y en el celular (P-30; RN-G20, RN-B01, RN-B03): el programa de Luis empezó hace 7
 * días y hoy empieza la última semana de su mesociclo «Base». Luis autoriza sus fotos de progreso con el texto del abogado y sube su
 * foto frontal; su coach la ve en Entrenamiento › Fotos y sube la lateral. Luis retira la autorización y sus fotos se borran. axe en
 * cada pantalla. Datos sintéticos: la foto es una imagen PNG de 1 × 1 píxel.
 */

const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
const photo = (name: string) => ({ name, mimeType: 'image/png', buffer: PIXEL });

test.describe('P14.5 · Fotos de progreso', () => {
  test('RN-G20: Luis autoriza y sube su foto, el coach la ve y sube otra; al retirar la autorización se borran', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const organization = await createOrganization();
    const owner = organization.ownerEmail;
    const luis = await luisWithPrescription(owner);
    const email = await appAccessByApi(owner, luis);
    await startedProgramByApi(owner, luis, 7);

    await loginAsPatientInPage(page, email);
    await page.goto('/mi/progreso');
    await page.getByRole('link', { name: 'Fotos de progreso' }).click();
    await page.waitForURL(/\/mi\/progreso\/fotos$/);
    await expect(page.getByRole('region', { name: 'Texto de la autorización' })).toContainText(
      'fotografías corporales de progreso',
    );
    expect(await seriousViolations(page)).toEqual([]);
    await page.getByRole('button', { name: 'Autorizar mis fotos de progreso' }).click();
    await expect(page.getByText('Lo autorizaste')).toBeVisible();
    await page.getByLabel('Subir la foto frontal de «Base»').setInputFiles(photo('frontal.png'));
    const mine = page.getByRole('list', { name: 'Fotos de «Base»' });
    await expect(mine.getByRole('img', { name: 'Foto frontal de «Base»' })).toBeVisible();
    await expect(page.getByLabel('Reemplazar la foto frontal de «Base»')).toBeAttached();
    expect(await seriousViolations(page)).toEqual([]);

    await page.context().clearCookies();
    await loginInPage(page, owner);
    await page.goto(`/panel/pacientes/${luis}/entrenamiento/fotos`);
    const comparison = page.getByRole('list', { name: 'Comparativa por vista' });
    await expect(comparison.getByRole('img', { name: 'Foto frontal de «Base»' })).toBeVisible();
    await expect(comparison.getByText('Falta otra foto para comparar')).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
    await page.getByLabel('Subir la foto lateral de «Base»').setInputFiles(photo('lateral.png'));
    await expect(
      page
        .getByRole('list', { name: 'Fotos de «Base»' })
        .getByRole('img', { name: 'Foto lateral de «Base»' }),
    ).toBeVisible();

    await page.context().clearCookies();
    await loginAsPatientInPage(page, email);
    await page.goto('/mi/progreso/fotos');
    await expect(
      page
        .getByRole('list', { name: 'Fotos de «Base»' })
        .getByRole('img', { name: 'Foto lateral de «Base»' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Retirar la autorización' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Retirar y borrar' }).click();
    await expect(
      page.getByRole('button', { name: 'Autorizar mis fotos de progreso' }),
    ).toBeVisible();
    await expect(page.getByRole('img', { name: /Foto (frontal|lateral)/ })).toHaveCount(0);
  });
});

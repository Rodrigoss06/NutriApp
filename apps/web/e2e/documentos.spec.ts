import { expect, test } from '@playwright/test';
import { seriousViolations } from './support/axe';
import {
  createOrganization,
  grantInPersonByApi,
  loginAsPatientInPage,
  loginInPage,
  patientWithAccess,
} from './support/stack';

/**
 * P14.5 (PR 8b) de punta a punta, en escritorio y en el celular (P-31; RN-G21, RN-B01, RN-B03): el coach le pide al paciente su
 * análisis de sangre; el paciente lo sube desde su app como PDF y agrega el enlace de un video de técnica (tiene la autorización
 * de imágenes); el coach valida el enlace, devuelve el PDF con una nota y borra el enlace. axe en cada pantalla. Datos
 * sintéticos: el PDF son unos pocos bytes con su firma.
 */

const PDF = {
  name: 'analisis.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4\n%sintético para la prueba\n'),
};

test.describe('P14.5 · Expediente de documentos', () => {
  test('RN-G21: el coach pide, el paciente sube y el coach valida, devuelve con una nota y borra', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const organization = await createOrganization();
    const owner = organization.ownerEmail;
    const patient = await patientWithAccess(owner);
    await grantInPersonByApi(owner, patient.id, 'IMAGES');

    // El coach pide el análisis: queda «Pendiente» en Clínico.
    await loginInPage(page, owner);
    await page.goto(`/panel/pacientes/${patient.id}/documentos`);
    await page.getByLabel('Título', { exact: true }).fill('Análisis de sangre');
    await page.getByRole('button', { name: 'Pedir documento' }).click();
    const clinical = page.getByRole('list', { name: 'Documentos de Clínico' });
    await expect(
      clinical.getByRole('listitem').filter({ hasText: 'Análisis de sangre' }),
    ).toContainText('Pendiente');
    expect(await seriousViolations(page)).toEqual([]);

    // El paciente lo ve desde Más, sube el PDF y agrega el enlace de un video de técnica.
    await page.context().clearCookies();
    await loginAsPatientInPage(page, patient.email);
    await page.goto('/mi/mas');
    await page.getByRole('link', { name: 'Tu coach te pide 1 documento' }).click();
    await page.waitForURL(/\/mi\/documentos$/);
    const pending = page.getByRole('list', { name: 'Documentos pendientes' });
    await pending.getByLabel('Archivo', { exact: true }).setInputFiles(PDF);
    await pending.getByRole('button', { name: 'Subir', exact: true }).click();
    const mine = page.getByRole('list', { name: 'Tus documentos' });
    await expect(
      mine.getByRole('listitem').filter({ hasText: 'Análisis de sangre' }),
    ).toContainText('Por revisar');
    expect(await seriousViolations(page)).toEqual([]);

    const add = page.getByRole('form', { name: 'Agregar un documento' });
    await add.getByLabel('Título', { exact: true }).fill('Video de sentadilla');
    await add.getByRole('combobox', { name: 'Categoría' }).click();
    await page.getByRole('option', { name: 'Técnica', exact: true }).click();
    await add.getByLabel('Pegar un enlace').check();
    await add
      .getByLabel('Enlace', { exact: true })
      .fill('https://videos.example.com/sentadilla-goblet');
    await add.getByRole('button', { name: 'Subir documento' }).click();
    await expect(
      mine.getByRole('listitem').filter({ hasText: 'Video de sentadilla' }),
    ).toContainText('Por revisar');

    // El coach valida el enlace, devuelve el PDF con una nota y borra el enlace.
    await page.context().clearCookies();
    await loginInPage(page, owner);
    await page.goto(`/panel/pacientes/${patient.id}/documentos`);
    const technique = page.getByRole('list', { name: 'Documentos de Técnica' });
    const video = technique.getByRole('listitem').filter({ hasText: 'Video de sentadilla' });
    await expect(video.getByRole('link', { name: /Abrir el enlace/ })).toHaveAttribute(
      'href',
      'https://videos.example.com/sentadilla-goblet',
    );
    await video.getByRole('button', { name: 'Validar «Video de sentadilla»' }).click();
    await expect(video).toContainText('Validado');

    const analysis = page
      .getByRole('list', { name: 'Documentos de Clínico' })
      .getByRole('listitem')
      .filter({ hasText: 'Análisis de sangre' });
    await expect(analysis.getByRole('link', { name: /Descargar/ })).toHaveAttribute(
      'href',
      /\/api\/v1\/record-documents\/.+\/file$/,
    );
    await analysis.getByRole('button', { name: 'Devolver «Análisis de sangre»' }).click();
    await analysis.getByLabel('Qué tiene que corregir').fill('Falta la segunda página');
    await analysis.getByRole('button', { name: 'Devolver con esta nota' }).click();
    await expect(analysis).toContainText('Pendiente');
    await expect(analysis).toContainText('Falta la segunda página');
    expect(await seriousViolations(page)).toEqual([]);

    await video.getByRole('button', { name: 'Borrar «Video de sentadilla»' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Borrar' }).click();
    await expect(technique).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Técnica (0)' })).toContainText(
      'Sin documentos.',
    );
  });
});

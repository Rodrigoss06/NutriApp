import { expect, test } from '@playwright/test';
import { startedProgramByApi } from './support/analytics';
import { seriousViolations } from './support/axe';
import { luisWithPrescription } from './support/luis';
import { appAccessByApi } from './support/patient-app';
import { createOrganization, loginAsPatientInPage, loginInPage } from './support/stack';

/**
 * P14.5 (PR 7b) de punta a punta, en escritorio y en el celular (P-28 y P-29; RN-G19, RN-D08): el programa de Luis empezó hace 15
 * días y su mesociclo «Base», de 2 semanas, ya cerró. Su coach crea el informe, ve sus números (0 de 18 series: no registró
 * entrenos), escribe el logro, la limitante, el ajuste y la prioridad, y lo envía. Luis lo lee en su app y comenta; el coach ve el
 * comentario. axe en cada pantalla. Datos sintéticos.
 */

const TEXTS = {
  'Logro principal': 'Arrancó el programa con sus tres sesiones planificadas.',
  Limitante: 'No registró sus entrenos en la app.',
  'Ajuste principal': 'Registrar cada sesión al terminarla.',
  'Prioridad siguiente': 'Tres sesiones por semana, cada una con su registro.',
} as const;

test.describe('P14.5 · Informe del mesociclo', () => {
  test('RN-G19: el coach envía el informe del mesociclo cerrado y Luis lo comenta desde su app', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const organization = await createOrganization();
    const owner = organization.ownerEmail;
    const luis = await luisWithPrescription(owner);
    const email = await appAccessByApi(owner, luis);
    await startedProgramByApi(owner, luis, 15);

    await loginInPage(page, owner);
    await page.goto(`/panel/pacientes/${luis}/entrenamiento/informes`);
    const mesocycles = page.getByRole('list', { name: 'Mesociclos del programa' });
    await expect(mesocycles.getByText('Cerrado')).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
    await mesocycles.getByRole('button', { name: 'Crear el informe de «Base»' }).click();
    await page.waitForURL(/\/entrenamiento\/informes\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { name: 'Informe de «Base»' })).toBeVisible();
    const summary = page.getByRole('region', { name: 'Resumen del mesociclo' });
    await expect(summary.getByText('0 de 18 series')).toBeVisible();
    await expect(summary.getByText('0 de 6')).toBeVisible();
    await expect(summary.getByText('Informe del mesociclo (JV Fitness)')).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    const form = page.getByRole('form', { name: 'Textos del informe' });
    for (const [label, text] of Object.entries(TEXTS)) {
      await form.getByLabel(label).fill(text);
    }
    await form.getByRole('button', { name: 'Guardar borrador' }).click();
    await expect(form.getByRole('button', { name: 'Guardar borrador' })).toBeDisabled();
    await page.getByRole('button', { name: 'Enviar informe' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Enviar' }).click();
    await expect(page.getByText(/^Enviado el /)).toBeVisible();
    await expect(page.getByRole('form', { name: 'Textos del informe' })).toHaveCount(0);
    await expect(page.getByText(TEXTS.Limitante)).toBeVisible();
    const reportUrl = page.url();

    await page.context().clearCookies();
    await loginAsPatientInPage(page, email);
    await page.goto('/mi/mas');
    await page
      .getByRole('region', { name: 'Informes' })
      .getByRole('link', { name: 'Los informes de cada mesociclo que te envió tu coach' })
      .click();
    await page.waitForURL(/\/mi\/informes$/);
    const mine = page.getByRole('list', { name: 'Tus informes' });
    await expect(mine.getByText('Falta tu comentario')).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
    await mine.getByRole('link').click();
    await expect(page.getByRole('heading', { name: 'Informe de «Base»' })).toBeVisible();
    await expect(
      page
        .getByRole('region', { name: 'Lo que dice tu coach' })
        .getByText(TEXTS['Prioridad siguiente']),
    ).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
    await page.getByLabel('Tu comentario').fill('Esta semana registro cada sesión.');
    await page.getByRole('button', { name: 'Guardar comentario' }).click();
    await expect(page.getByText('Tu comentario quedó guardado')).toBeVisible();

    await page.context().clearCookies();
    await loginInPage(page, owner);
    await page.goto(reportUrl);
    await expect(page.getByText('Esta semana registro cada sesión.')).toBeVisible();
  });
});

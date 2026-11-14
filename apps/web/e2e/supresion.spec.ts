import { expect, test } from '@playwright/test';
import { seriousViolations } from './support/axe';
import { apiAs, createOrganization, loginInPage, registerPatientByApi } from './support/stack';

/**
 * P15 (PR 6b) de punta a punta, en escritorio y en el celular (RN-B05; ADR-133, ADR-134): la dueña suprime los datos de un paciente
 * archivado escribiendo su código; el expediente queda «Suprimido», con «Anonimizado» y sin «Reactivar». axe en cada pantalla. Datos
 * sintéticos.
 */

test.describe('P15 · Supresión del paciente', () => {
  test('RN-B05: la dueña suprime a un paciente archivado con su código, y ya no se reactiva', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const organization = await createOrganization('Consultorio supresión');
    const patient = await registerPatientByApi(organization.ownerEmail, {
      firstName: 'Rosa',
      lastName: 'Sintética Supresión',
    });
    const owner = await apiAs(organization.ownerEmail);
    const shown = await owner.get(`/api/v1/patients/${patient.id}`);
    const { code } = (await shown.json()) as { code: string };
    expect((await owner.post(`/api/v1/patients/${patient.id}/archive`)).status()).toBe(204);
    await owner.dispose();

    await loginInPage(page, organization.ownerEmail);
    await page.goto(`/panel/pacientes/${patient.id}`);
    const form = page.getByRole('form', { name: 'Suprimir sus datos' });
    const suppress = form.getByRole('button', { name: 'Suprimir para siempre' });
    await expect(suppress).toBeDisabled();
    expect(await seriousViolations(page)).toEqual([]);

    await form.getByLabel(/Escribe el código/).fill(code.toLowerCase());
    await suppress.click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Suprimir' }).click();

    await expect(page.getByRole('heading', { name: 'Anonimizado Anonimizado' })).toBeVisible();
    await expect(page.getByText('Suprimido', { exact: true })).toBeVisible();
    await expect(page.getByText(/Sus datos se suprimieron el/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reactivar' })).toHaveCount(0);
    await expect(page.getByText('Rosa')).toHaveCount(0);
    expect(await seriousViolations(page)).toEqual([]);
  });
});

import { expect, test, type Page } from '@playwright/test';
import { seriousViolations } from './support/axe';
import { luisWithPrescription } from './support/luis';
import { createOrganization, loginInPage } from './support/stack';

/**
 * P14.5 (PR 1d) de punta a punta: los perfiles de día del plan (07 §2; P-20, respuestas de Jeremy; ADR-100, ADR-101) en
 * escritorio y en el celular. Entrenamiento es la meta de la prescripción (G-17); Descanso y los perfiles propios llevan sus
 * gramos, con la proteína y la grasa de Entrenamiento ya puestas (P-20.1), y las kcal salen de los gramos (P-20.2). axe en
 * cada paso. Datos sintéticos de seeds/luis.
 */

async function recordTab(page: Page, name: string): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Secciones del expediente' })
    .getByRole('link', { name, exact: true })
    .click();
}

test.describe('P14.5 · Perfiles de día del plan', () => {
  test('el coach agrega Descanso y un perfil propio con sus gramos, ve sus kcal con su método y quedan guardados', async ({
    page,
  }) => {
    test.setTimeout(2 * 60_000);
    const organization = await createOrganization();
    const luisId = await luisWithPrescription(organization.ownerEmail);
    await loginInPage(page, organization.ownerEmail);
    await page.goto(`/panel/pacientes/${luisId}`);
    await recordTab(page, 'Dieta');
    await page.getByRole('link', { name: 'Nuevo plan' }).click();
    await page.getByRole('button', { name: 'Crear borrador' }).click();
    await page.waitForURL(/\/dieta\/[0-9a-f-]{36}$/);
    const profiles = page.getByRole('region', { name: 'Perfiles de día' });

    await test.step('Descanso trae la proteína y la grasa de Entrenamiento (P-20.1)', async () => {
      await profiles.getByRole('button', { name: 'Agregar Descanso' }).click();
      const rest = profiles.getByRole('group', { name: 'Descanso' });
      await expect(rest.getByLabel('Proteína (g)')).toHaveValue('160');
      await expect(rest.getByLabel('Grasa (g)')).toHaveValue('51');
      await expect(rest.getByLabel('Carbohidratos (g)')).toHaveValue('');
      await expect(profiles.getByRole('button', { name: 'Agregar Descanso' })).toHaveCount(0);
      expect(await seriousViolations(page)).toEqual([]);
    });

    await test.step('las kcal salen de los gramos, con su método (P-20.2, RN-D02)', async () => {
      const rest = profiles.getByRole('group', { name: 'Descanso' });
      await rest.getByLabel('Carbohidratos (g)').fill('120');
      // 120 × 4 + 160 × 4 + 51 × 9 = 1,579 kcal.
      await expect(rest).toContainText('1,579 kcal');
      await expect(rest).toContainText('Perfil de día (gramos y Atwater)');

      await profiles.getByRole('button', { name: 'Agregar perfil' }).click();
      const added = profiles.getByRole('group', { name: 'Perfil nuevo' });
      await added.getByLabel('Nombre').fill('Alto');
      const high = profiles.getByRole('group', { name: 'Alto' });
      await high.getByLabel('Carbohidratos (g)').fill('250');
      // 250 × 4 + 160 × 4 + 51 × 9 = 2,099 kcal.
      await expect(high).toContainText('2,099 kcal');
      expect(await seriousViolations(page)).toEqual([]);
    });

    await test.step('se guardan y vuelven igual', async () => {
      await page.getByRole('button', { name: 'Guardar borrador' }).click();
      await expect(page.getByText('Guardado', { exact: true })).toBeVisible();
      await page.reload();
      await expect(
        profiles.getByRole('group', { name: 'Descanso' }).getByLabel('Carbohidratos (g)'),
      ).toHaveValue('120');
      await expect(
        profiles.getByRole('group', { name: 'Alto' }).getByLabel('Carbohidratos (g)'),
      ).toHaveValue('250');
      await expect(profiles.getByRole('group', { name: 'Alto' })).toContainText('2,099 kcal');
      expect(await seriousViolations(page)).toEqual([]);
    });
  });
});

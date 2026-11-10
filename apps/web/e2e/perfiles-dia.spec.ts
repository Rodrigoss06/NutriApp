import { expect, test, type Page } from '@playwright/test';
import { seriousViolations } from './support/axe';
import { luisWithPrescription } from './support/luis';
import {
  appAccessByApi,
  publishedExchangePlanByApi,
  publishedProgramByApi,
} from './support/patient-app';
import { createOrganization, loginAsPatientInPage, loginInPage } from './support/stack';

/**
 * P14.5 (PR 1d, 1f y 1g) de punta a punta: los perfiles de día del plan (07 §2; P-20, respuestas de Jeremy; ADR-100, ADR-101,
 * ADR-103 y ADR-104) en escritorio y en el celular. Entrenamiento es la meta de la prescripción (G-17); Descanso y los perfiles propios
 * llevan sus gramos, con la proteína y la grasa de Entrenamiento ya puestas (P-20.1), y las kcal salen de los gramos (P-20.2).
 * Cada perfil es el mismo plan con menos (o más) del alimento fuente (P-20.5). axe en cada paso. Datos sintéticos de seeds/luis
 * y la TPCA que carga catalog:load.
 */

const RICE = 'Arroz pilado o pulido cocido';

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

async function newPlan(page: Page, patientId: string, modality: string): Promise<void> {
  await page.goto(`/panel/pacientes/${patientId}/dieta/nuevo`);
  await page.getByRole('combobox', { name: 'Modalidad' }).click();
  await page.getByRole('option', { name: modality }).click();
  await page.getByRole('button', { name: 'Crear borrador' }).click();
  await expect(page.getByRole('heading', { name: 'Plan nutricional' })).toBeVisible();
}

async function addRest(page: Page, choG: string): Promise<void> {
  const profiles = page.getByRole('region', { name: 'Perfiles de día' });
  await profiles.getByRole('button', { name: 'Agregar Descanso' }).click();
  await profiles
    .getByRole('group', { name: 'Descanso' })
    .getByLabel('Carbohidratos (g)')
    .fill(choG);
}

async function saved(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(page.getByText('Guardado', { exact: true })).toBeVisible();
}

test.describe('P14.5 · Porciones de cada perfil de día (P-20.5)', () => {
  test('intercambios: Descanso sugiere menos almidones con su método; el coach los ajusta y quedan guardados', async ({
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
    await addRest(page, '120');
    const toSplit = async () => {
      await page.getByRole('button', { name: 'Siguiente: Intercambios' }).click();
      await page.getByRole('button', { name: 'Siguiente: Reparto y alimentos' }).click();
    };
    await toSplit();
    const rest = page.getByRole('region', { name: /^Descanso/ });

    await test.step('la sugerencia, con su método y la adecuación de Descanso (RN-D02, RN-E10)', async () => {
      await expect(rest).toContainText('Sugerencia');
      await expect(rest).toContainText('Almidones del perfil de día');
      await expect(rest.getByRole('table', { name: 'Adecuación de Descanso' })).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);
    });

    await test.step('ajustada a mano, se guarda y vuelve igual', async () => {
      await rest.getByRole('button', { name: 'Ajustar a mano Descanso' }).click();
      await rest.getByLabel('Almidones en Desayuno, Descanso').fill('1');
      await expect(rest).toContainText('Ajustado a mano');
      expect(await seriousViolations(page)).toEqual([]);
      await saved(page);
      await page.reload();
      await toSplit();
      await expect(rest.getByLabel('Almidones en Desayuno, Descanso')).toHaveValue('1');
      await expect(rest).toContainText('Ajustado a mano');
    });
  });

  test('composición: los gramos de Descanso de un alimento, su adecuación, y en el plan publicado', async ({
    page,
  }) => {
    test.setTimeout(3 * 60_000);
    const organization = await createOrganization();
    const luisId = await luisWithPrescription(organization.ownerEmail);
    await loginInPage(page, organization.ownerEmail);
    await newPlan(page, luisId, 'Composición');
    await page.getByRole('button', { name: 'Usar 2,500 ml (EFSA 2010)' }).click();
    for (const meal of ['Desayuno', 'Media mañana', 'Media tarde', 'Cena']) {
      await page.getByRole('button', { name: `Quitar ${meal}`, exact: true }).click();
    }
    await page.getByLabel('% del día de Almuerzo').fill('100');
    await page.getByRole('button', { name: 'Agregar a Almuerzo' }).click();
    await page
      .getByRole('searchbox', { name: 'Buscar alimento para Almuerzo' })
      .fill('arroz pilado cocido');
    await page.getByRole('button', { name: `Agregar ${RICE}` }).click();
    await page.getByRole('button', { name: 'Listo' }).click();
    await page.getByLabel(`Gramos de ${RICE}`).fill('200');
    await addRest(page, '120');
    const showRest = async () => {
      // Con la vista previa al día: si llega con el menú abierto, el editor se vuelve a dibujar y el toque se pierde.
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
      const select = page.getByRole('combobox', { name: 'Porciones de' });
      await select.click();
      await page.getByRole('option', { name: 'Descanso' }).click();
      await expect(select).toContainText('Descanso');
    };

    await test.step('en Descanso se escriben solo sus gramos, con su día y su adecuación', async () => {
      await showRest();
      await expect(page.getByRole('button', { name: 'Agregar a Almuerzo' })).toHaveCount(0);
      await page.getByLabel(`Gramos en Descanso de ${RICE}`).fill('100');
      await expect(
        page.getByRole('heading', { name: 'Lo que aporta un día de Descanso' }),
      ).toBeVisible();
      await expect(page.getByRole('table', { name: 'Adecuación de Descanso' })).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);
    });

    await test.step('se guardan, vuelven igual y el plan publicado dice la cantidad de Descanso', async () => {
      await saved(page);
      await page.reload();
      await showRest();
      await expect(page.getByLabel(`Gramos en Descanso de ${RICE}`)).toHaveValue('100');
      await page.getByRole('button', { name: 'Publicar plan' }).click();
      await page.getByRole('button', { name: 'Publicar', exact: true }).click();
      await expect(page.getByText('Vigente', { exact: true })).toBeVisible();
      await expect(page.getByText('Descanso: 100 g')).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);
    });
  });
});

test.describe('P14.5 · Cambiar el día: «no entreno hoy» y «mover a mañana» (P-20.3, ADR-104)', () => {
  test('el paciente pasa su sesión a mañana y lo deshace; el coach elige el perfil de mañana', async ({
    page,
    browser,
  }) => {
    const organization = await createOrganization();
    const patientId = await luisWithPrescription(organization.ownerEmail);
    await publishedExchangePlanByApi(organization.ownerEmail, patientId, [
      { code: 'REST', name: 'Descanso', choG: 120, proteinG: 160, fatG: 51 },
    ]);
    // Una sola sesión, hoy: mañana queda libre para moverla.
    await publishedProgramByApi(organization.ownerEmail, patientId, 1);
    const email = await appAccessByApi(organization.ownerEmail, patientId);
    await loginAsPatientInPage(page, email);

    const card = page.getByRole('region', { name: 'Hoy y mañana' });
    const move = card.getByRole('button', { name: 'Mover a mañana' });
    await expect(async () => {
      await page.goto('/mi/hoy');
      await expect(move).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    await expect(card.getByText('Descanso · 1,579 kcal · sin sesión')).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    await move.click();
    await expect(card.getByText('Tu sesión de hoy pasó a mañana.')).toBeVisible();
    await expect(card.getByText(/^Entrenamiento · .+ kcal · 1 sesión$/)).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
    await card.getByRole('button', { name: 'Sí entreno hoy' }).click();
    await expect(card.getByRole('button', { name: 'No entreno hoy' })).toBeVisible();
    await expect(card.getByText('Tu sesión de hoy pasó a mañana.')).toHaveCount(0);

    const staffContext = await browser.newContext();
    const panel = await staffContext.newPage();
    await loginInPage(panel, organization.ownerEmail);
    await panel.goto(`/panel/pacientes/${patientId}/seguimiento`);
    const agenda = panel.getByRole('region', { name: 'Hoy y mañana' });
    await expect(agenda.getByText('Descanso · 1,579 kcal · sin sesión')).toBeVisible();
    expect(await seriousViolations(panel)).toEqual([]);
    const tomorrow = agenda.getByRole('combobox', { name: 'Perfil de mañana' });
    await tomorrow.click();
    await panel.getByRole('option', { name: 'Entrenamiento' }).click();
    await expect(agenda.getByText('Perfil elegido por el coach')).toBeVisible();
    await expect(tomorrow).toContainText('Entrenamiento');
    expect(await seriousViolations(panel)).toEqual([]);
    await staffContext.close();
  });
});

import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { seriousViolations } from './support/axe';
import { luisWithPrescription } from './support/luis';
import { apiAs, createOrganization, loginInPage } from './support/stack';

/**
 * P10 de punta a punta (RF-20, RF-21, RF-23; RN-E10, RN-E12, RN-E13, RN-E15, RN-E16) en escritorio y en el celular:
 * Luis con una dieta por composición y, después, un menú semanal con una receta del recetario, los dos publicados. Luis,
 * su prescripción y la receta se preparan por la API (el recetario tiene su propia E2E). axe en cada pantalla nueva.
 * Datos sintéticos de seeds/luis y la TPCA que carga catalog:load.
 */

const RICE = 'Arroz pilado o pulido cocido';
const CHICKEN = 'Pollo, carne pulpa';
const RECIPE = 'Arroz con pollo';

async function foodIdOf(api: APIRequestContext, search: string, name: string): Promise<string> {
  const found = await api.get(`/api/v1/foods?q=${encodeURIComponent(search)}&limit=10`);
  const { foods } = (await found.json()) as { foods: { id: string; name: string }[] };
  const food = foods.find((f) => f.name === name);
  if (!food) throw new Error(`La TPCA no trae «${name}».`);
  return food.id;
}

/** La receta de P10: 200 g de arroz cocido y 150 g de pollo en 2 porciones (204 kcal por porción). */
async function recipeByApi(ownerEmail: string): Promise<void> {
  const api = await apiAs(ownerEmail);
  const created = await api.post('/api/v1/recipes', {
    data: {
      name: RECIPE,
      servings: 2,
      ingredients: [
        { foodId: await foodIdOf(api, 'arroz pilado cocido', RICE), grams: 200 },
        { foodId: await foodIdOf(api, 'pollo carne pulpa', CHICKEN), grams: 150 },
      ],
    },
  });
  expect(created.status(), 'crear la receta').toBe(201);
  await api.dispose();
}

async function newPlan(page: Page, patientId: string, modality: string): Promise<void> {
  await page.goto(`/panel/pacientes/${patientId}/dieta/nuevo`);
  await page.getByRole('combobox', { name: 'Modalidad' }).click();
  await page.getByRole('option', { name: modality }).click();
  await expect(page.getByRole('combobox', { name: 'Lista de intercambio' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Crear borrador' }).click();
  await expect(page.getByRole('heading', { name: 'Plan nutricional' })).toBeVisible();
}

/** Deja solo el almuerzo, con el 100 % del día. */
async function onlyLunch(page: Page): Promise<void> {
  for (const meal of ['Desayuno', 'Media mañana', 'Media tarde', 'Cena']) {
    await page.getByRole('button', { name: `Quitar ${meal}`, exact: true }).click();
  }
  await page.getByLabel('% del día de Almuerzo').fill('100');
  await expect(page.getByText('Completo')).toBeVisible();
}

async function addFood(page: Page, context: string, search: string, name: string) {
  await page.getByRole('button', { name: `Agregar a ${context}` }).click();
  await page.getByRole('searchbox', { name: `Buscar alimento para ${context}` }).fill(search);
  await page.getByRole('button', { name: `Agregar ${name}` }).click();
  await page.getByRole('button', { name: 'Listo' }).click();
}

async function saveAndPublish(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(page.getByText('Guardado', { exact: true })).toBeVisible();
  await expect(page.getByText('Para publicar falta:')).toHaveCount(0);
  await page.getByRole('button', { name: 'Publicar plan' }).click();
  await page.getByRole('button', { name: 'Publicar', exact: true }).click();
  await expect(page.getByText('Vigente', { exact: true })).toBeVisible();
}

test.describe('P10 · Composición y menú semanal', () => {
  test('RN-E17: el alimento enlazado a una alergia no se guarda en la dieta, tampoco dentro de una receta', async ({
    page,
  }) => {
    test.setTimeout(3 * 60_000);
    const organization = await createOrganization();
    const patientId = await luisWithPrescription(organization.ownerEmail);
    await recipeByApi(organization.ownerEmail);
    await loginInPage(page, organization.ownerEmail);

    // La condición se registra y se enlaza con su alimento desde el expediente.
    await page.goto(`/panel/pacientes/${patientId}/registros`);
    const newCondition = page.getByRole('form', { name: 'Registrar una condición' });
    await newCondition.getByRole('combobox', { name: 'Tipo' }).click();
    await page.getByRole('option', { name: 'Alergia' }).click();
    await newCondition.getByLabel('Descripción').fill('Pollo');
    await page.getByRole('button', { name: 'Registrar condición' }).click();
    await expect(page.getByText('Ningún alimento enlazado')).toBeVisible();
    await page.getByRole('button', { name: 'Agregar alimento a Pollo' }).click();
    await page
      .getByRole('searchbox', { name: 'Buscar alimento para Pollo' })
      .fill('pollo carne pulpa');
    await page.getByRole('button', { name: `Excluir ${CHICKEN}` }).click();
    await expect(page.getByRole('list', { name: 'Alimentos excluidos por Pollo' })).toContainText(
      CHICKEN,
    );
    await expect(page.getByText('Ningún alimento enlazado')).toHaveCount(0);
    expect(await seriousViolations(page)).toEqual([]);

    // En la composición, no se guarda con ese alimento; se avisa antes de guardar y dice dónde está.
    await newPlan(page, patientId, 'Composición');
    await expect(page.getByText('Alergias e intolerancias registradas')).toBeVisible();
    await expect(page.getByText(`Alergia: Pollo · no se puede usar: ${CHICKEN}`)).toBeVisible();
    await addFood(page, 'Almuerzo', 'pollo carne pulpa', CHICKEN);
    await page.getByLabel(`Gramos de ${CHICKEN}`).fill('150');
    const problem = `${CHICKEN} (Almuerzo): excluido por una alergia, «Pollo» (RN-E17).`;
    await expect(page.getByText(problem)).toBeVisible();
    await page.getByRole('button', { name: 'Guardar borrador' }).click();
    await expect(page.getByText('No se guardó el borrador')).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    await page.getByRole('button', { name: `Quitar ${CHICKEN} de Almuerzo` }).click();
    await addFood(page, 'Almuerzo', 'arroz pilado cocido', RICE);
    await page.getByLabel(`Gramos de ${RICE}`).fill('200');
    await page.getByRole('button', { name: 'Guardar borrador' }).click();
    await expect(page.getByText('Guardado', { exact: true })).toBeVisible();
    await expect(page.getByText(problem)).toHaveCount(0);

    // En el menú, tampoco dentro de una receta: el recetario la tiene, porque no es de un paciente.
    await newPlan(page, patientId, 'Menú semanal');
    await page.getByRole('button', { name: 'Agregar a Almuerzo del lunes, opción A' }).click();
    await page.getByRole('button', { name: `Agregar la receta ${RECIPE}` }).click();
    await page.getByRole('button', { name: 'Listo' }).click();
    await expect(
      page.getByText(/Receta «Arroz con pollo» .*lleva Pollo, carne pulpa/),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Guardar borrador' }).click();
    await expect(page.getByText('No se guardó el borrador')).toBeVisible();
  });

  test('RF-20 · RF-21 · criterio 2: Luis con una dieta por composición y un menú semanal con una receta, publicados', async ({
    page,
  }) => {
    test.slow();
    const organization = await createOrganization();
    const patientId = await luisWithPrescription(organization.ownerEmail);
    await recipeByApi(organization.ownerEmail);
    await loginInPage(page, organization.ownerEmail);

    await test.step('composición: arroz y pollo en el almuerzo, con «al menos» y la adecuación (RN-E16)', async () => {
      await newPlan(page, patientId, 'Composición');
      await expect(page.getByText(/Dieta por composición\./)).toBeVisible();
      await page.getByRole('button', { name: 'Usar 2,500 ml (EFSA 2010)' }).click();
      await onlyLunch(page);
      await addFood(page, 'Almuerzo', 'arroz pilado cocido', RICE);
      await page.getByLabel(`Gramos de ${RICE}`).fill('200');
      await addFood(page, 'Almuerzo', 'pollo carne pulpa', CHICKEN);
      await page.getByLabel(`Gramos de ${CHICKEN}`).fill('150');

      // 200 × 1.15 + 150 × 1.19 = 408.5 kcal. La TPCA no trae la fibra del arroz ni el sodio del pollo (RN-I03).
      const day = page.getByRole('table', { name: 'Día: otros nutrientes' });
      await expect(day.getByRole('row', { name: /^Sodio/ })).toContainText('falta en 1 de 2');
      await expect(
        page.getByRole('table', { name: 'Día: energía y macronutrientes' }).getByRole('row', {
          name: /^Energía/,
        }),
      ).toContainText(/40[89] kcal/);
      await expect(page.locator('[data-adequacy="kcal"]')).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);

      await saveAndPublish(page);
      await expect(page.getByRole('heading', { name: 'Alimentos por tiempo' })).toBeVisible();
      await expect(page.getByText(`${RICE} · 200 g`)).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);
    });

    await test.step('menú semanal: la receta en la opción A, pollo en la B y el lunes copiado a la semana', async () => {
      await newPlan(page, patientId, 'Menú semanal');
      await expect(page.getByText(/Menú semanal\./)).toBeVisible();
      await page.getByRole('button', { name: 'Usar 2,500 ml (EFSA 2010)' }).click();
      await onlyLunch(page);

      const optionA = 'Almuerzo del lunes, opción A';
      await page.getByRole('button', { name: `Agregar a ${optionA}` }).click();
      await page.getByRole('button', { name: `Agregar la receta ${RECIPE}` }).click();
      await page.getByRole('button', { name: 'Listo' }).click();
      await expect(page.getByLabel(`Porciones de ${RECIPE}`)).toHaveValue('1');
      await addFood(page, 'Almuerzo del lunes, opción B', 'pollo carne pulpa', CHICKEN);
      await page.getByLabel(`Gramos de ${CHICKEN}`).fill('120');

      await page.getByRole('button', { name: 'Copiar el lunes a los demás días' }).click();
      await page.getByRole('button', { name: 'Copiar', exact: true }).click();
      await page.getByRole('tab', { name: /Domingo/ }).click();
      await expect(page.getByRole('tab', { name: /Domingo/ })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await expect(
        page.getByRole('list', { name: 'Almuerzo del domingo, opción A' }),
      ).toContainText(RECIPE);
      // Una porción de la receta: 204 kcal cada día y de promedio.
      const week = page.getByRole('region', { name: 'Resumen de la semana' });
      await expect(week.getByRole('row', { name: /^Promedio/ })).toContainText('204 kcal');
      expect(await seriousViolations(page)).toEqual([]);

      await saveAndPublish(page);
      await expect(page.getByRole('heading', { name: 'Menú de la semana' })).toBeVisible();
      // En escritorio, la grilla de la semana; en el celular, la pestaña del lunes.
      await expect(
        page.getByText(`${RECIPE} · 1 porción`).filter({ visible: true }).first(),
      ).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);
    });

    await test.step('el historial: el menú vigente y la composición reemplazada (RN-E14)', async () => {
      await page.goto(`/panel/pacientes/${patientId}/dieta`);
      const rows = page.getByRole('row', { name: /Versión 1/ });
      await expect(rows.filter({ hasText: 'Menú semanal' })).toContainText('Vigente');
      await expect(rows.filter({ hasText: 'Composición' })).toContainText('Reemplazado');
    });
  });
});

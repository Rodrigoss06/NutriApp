import { expect, test, type Page } from '@playwright/test';
import { seriousViolations } from './support/axe';
import { createOrganization, loginInPage } from './support/stack';

/**
 * P10 · recetario de punta a punta (RF-21, RN-E12, RN-I03) en escritorio y en el celular (WebKit): una receta de arroz
 * cocido y pollo con los nutrientes por porción de la TPCA en vivo, «al menos» cuando a un ingrediente le falta el
 * dato (ADR-061), crear, editar las porciones, archivar y restaurar. axe en cada pantalla nueva. Los catálogos los
 * carga catalog:load antes de la E2E.
 */

async function addIngredient(page: Page, search: string, name: string, grams: string) {
  await page.getByRole('searchbox', { name: 'Buscar ingrediente' }).fill(search);
  await page.getByRole('button', { name: `Agregar ${name}` }).click();
  await page.getByLabel(`Gramos de ${name}`).fill(grams);
}

/** La fila de un nutriente en una tabla con ese título; Energía va primero en kcal. */
const nutrientRow = (page: Page, table: string, nutrient: string) =>
  page
    .getByRole('table', { name: table })
    .getByRole('row', { name: new RegExp(`^${nutrient}`) })
    .first();

test.describe('P10 · Recetario', () => {
  test('RF-21 · criterio 1: arroz cocido y pollo dan sus nutrientes por porción; se edita, se archiva y se restaura', async ({
    page,
  }) => {
    const organization = await createOrganization();
    await loginInPage(page, organization.ownerEmail);

    await page.goto('/panel/biblioteca/recetas');
    await expect(page.getByRole('link', { name: 'Recetas' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByText('Todavía no hay recetas')).toBeVisible();
    await page.getByRole('link', { name: 'Nueva receta' }).click();

    // Primero los ingredientes: la búsqueda solo responde con la página ya hidratada, y así lo que se escribe después
    // no se pierde.
    await addIngredient(page, 'arroz pilado cocido', 'Arroz pilado o pulido cocido', '200');
    await addIngredient(page, 'pollo carne pulpa', 'Pollo, carne pulpa', '150');
    await page.getByLabel('Nombre de la receta').fill('Arroz con pollo');
    await page.getByLabel('Porciones que rinde').fill('2');

    // (200 × 115 + 150 × 119) ÷ 100 ÷ 2 = 204.25 kcal; proteínas 18.45 g. La TPCA no trae el sodio del pollo.
    await expect(nutrientRow(page, 'Energía y macronutrientes', 'Energía')).toContainText(
      '204 kcal',
    );
    await expect(nutrientRow(page, 'Energía y macronutrientes', 'Proteínas')).toContainText('18 g');
    await expect(nutrientRow(page, 'Otros nutrientes', 'Sodio')).toContainText('al menos 18 mg');
    await expect(nutrientRow(page, 'Otros nutrientes', 'Sodio')).toContainText('falta en 1 de 2');
    await expect(page.getByText('Composición de receta')).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    await page.getByRole('button', { name: 'Crear receta' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Arroz con pollo' })).toBeVisible();
    await expect(page.getByText('Rinde 2 porciones')).toBeVisible();
    await expect(page.getByRole('row', { name: /Arroz pilado o pulido cocido/ })).toContainText(
      'Cocido',
    );
    await expect(nutrientRow(page, 'Energía y macronutrientes', 'Energía')).toContainText(
      '204 kcal',
    );
    expect(await seriousViolations(page)).toEqual([]);

    // Editar: con 4 porciones, la mitad por porción.
    await page.getByRole('link', { name: 'Editar' }).click();
    await page.getByLabel('Porciones que rinde').fill('4');
    await expect(nutrientRow(page, 'Energía y macronutrientes', 'Energía')).toContainText(
      '102 kcal',
    );
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText('Rinde 4 porciones')).toBeVisible();

    // Una receta no se borra: se archiva y sale de las activas; se restaura.
    await page.getByRole('button', { name: 'Archivar' }).click();
    await expect(page.getByText('Archivada')).toBeVisible();
    await page.getByRole('button', { name: 'Restaurar' }).click();
    await expect(page.getByText('Archivada')).toBeHidden();

    await page.getByRole('link', { name: 'Volver a recetas' }).click();
    await page.getByRole('searchbox', { name: 'Buscar receta' }).fill('ARROZ con pollo');
    await expect(page.getByRole('row', { name: /Arroz con pollo/ })).toContainText('102 kcal');
    expect(await seriousViolations(page)).toEqual([]);
  });
});

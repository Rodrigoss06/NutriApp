import { expect, test, type Page } from '@playwright/test';
import { seriousViolations } from './support/axe';
import { createOrganization, loginInPage } from './support/stack';

/**
 * P8 de punta a punta (RF-38, RN-I01 a RN-I03, RN-E11, RN-E12, RN-E16) en escritorio y en el celular (WebKit): los
 * criterios de la búsqueda y del «sin dato», el alimento propio con su error y su edición, un plato armado con una
 * medida casera, las actividades, la lista de intercambio provisional y la atribución de fuentes en «Acerca de»
 * (ADR-055). axe en cada pantalla nueva. Los catálogos los carga catalog:load antes de la E2E.
 */

async function choose(page: Page, label: string | RegExp, option: string | RegExp): Promise<void> {
  await page.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option }).first().click();
}

/** El menú del panel: en el celular está detrás del botón «Abrir menú». */
async function panelNavigation(page: Page) {
  const menu = page.getByRole('button', { name: 'Abrir menú' });
  if (await menu.isVisible()) await menu.click();
  return page.getByRole('navigation', { name: 'Secciones del panel' });
}

async function searchFood(page: Page, text: string): Promise<void> {
  await page.getByRole('searchbox', { name: 'Buscar alimento' }).fill(text);
}

test.describe('P8 · Biblioteca', () => {
  test('criterios: «platano» encuentra «Plátano» y la fibra sin dato se ve «sin dato», con su fuente y sin textos legales', async ({
    page,
  }) => {
    const organization = await createOrganization();
    await loginInPage(page, organization.ownerEmail);

    await (await panelNavigation(page)).getByRole('link', { name: 'Biblioteca' }).click();
    await page.waitForURL(/\/panel\/biblioteca\/alimentos$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Biblioteca' })).toBeVisible();
    await searchFood(page, 'platano');
    await expect(page.getByRole('link', { name: /^Plátano/ }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Plátano de isla' })).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    await searchFood(page, 'arroz pilado cocido');
    await page.getByRole('link', { name: 'Arroz pilado o pulido cocido' }).click();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Arroz pilado o pulido cocido' }),
    ).toBeVisible();
    await expect(page.getByRole('row', { name: /Fibra dietaria/ })).toContainText('sin dato');
    await expect(page.getByRole('row', { name: /^Energía 115 kcal/ })).toBeVisible();
    await expect(
      page.getByText(/Tablas peruanas de composición de alimentos, 10\.ª edición/),
    ).toBeVisible();
    // ADR-055: ni la licencia ni «oficial» viajan a la pantalla del alimento.
    await expect(page.getByText(/autorizaci[oó]n|prohibida|oficial/i)).toHaveCount(0);
    expect(await seriousViolations(page)).toEqual([]);

    // La búsqueda queda en la dirección: atrás vuelve a ella.
    await page.goBack();
    await expect(page).toHaveURL(/q=arroz/);
    await expect(page.getByRole('searchbox', { name: 'Buscar alimento' })).toHaveValue(
      'arroz pilado cocido',
    );
  });

  test('RN-I01 · RN-I03 · alimento propio: lo que no cabe en 100 g se rechaza; lo vacío queda «sin dato»; se edita', async ({
    page,
  }) => {
    const organization = await createOrganization();
    await loginInPage(page, organization.ownerEmail);

    await page.goto('/panel/biblioteca/alimentos');
    await page.getByRole('link', { name: 'Nuevo alimento propio' }).click();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Nuevo alimento propio' }),
    ).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    await page.getByLabel('Nombre', { exact: true }).fill('Pan de la casa');
    await choose(page, 'Estado', 'Listo para comer');
    await page.getByLabel('Energía (kcal)').fill('270');
    await page.getByLabel('Proteínas (g)').fill('40');
    await page.getByLabel('Grasa total (g)').fill('30');
    await page.getByLabel('Carbohidratos totales (g)').fill('35');
    await page.getByRole('button', { name: 'Agregar medida' }).click();
    await page.getByLabel('Medida 1', { exact: true }).fill('Unidad');
    await page.getByLabel('Gramos de la medida 1').fill('40');
    await page.getByRole('button', { name: 'Crear alimento' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'No se pudo crear el alimento' }),
    ).toContainText('Proteínas, grasa y carbohidratos suman 105 g en 100 g.');

    await page.getByLabel('Proteínas (g)').fill('8,5');
    await page.getByLabel('Grasa total (g)').fill('2');
    await page.getByLabel('Carbohidratos totales (g)').fill('55');
    await page.getByRole('button', { name: 'Crear alimento' }).click();
    await page.waitForURL(/\/panel\/biblioteca\/alimentos\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { level: 2, name: 'Pan de la casa' })).toBeVisible();
    await expect(page.getByText('Propio de tu organización')).toBeVisible();
    await expect(page.getByRole('row', { name: /Proteínas/ })).toContainText('8.5 g');
    await expect(page.getByRole('row', { name: /Fibra dietaria/ })).toContainText('sin dato');
    await expect(page.getByRole('row', { name: /Unidad/ })).toContainText('40.0 g');
    expect(await seriousViolations(page)).toEqual([]);

    await page.getByRole('link', { name: 'Editar' }).click();
    await expect(page.getByLabel('Proteínas (g)')).toHaveValue('8.5');
    await page.getByLabel('Nombre', { exact: true }).fill('Pan de la casa integral');
    await page.getByLabel('Fibra dietaria (g)').fill('6');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Pan de la casa integral' }),
    ).toBeVisible();
    await expect(page.getByRole('row', { name: /Fibra dietaria/ })).toContainText('6.0 g');

    // Solo lo ve su organización, y en la búsqueda aparece como propio.
    await page.goto('/panel/biblioteca/alimentos?q=pan%20de%20la%20casa');
    await expect(page.getByRole('row', { name: /Pan de la casa integral/ })).toContainText(
      'Propio',
    );
  });

  test('RN-E12 · RN-E16 · armar un plato con gramos y una medida casera: lo que aporta, con su método', async ({
    page,
  }) => {
    const organization = await createOrganization();
    await loginInPage(page, organization.ownerEmail);

    await page.goto('/panel/biblioteca/plato');
    await expect(page.getByText('El plato está vacío')).toBeVisible();
    const search = page.getByRole('searchbox', { name: 'Buscar alimento para el plato' });
    await search.fill('arroz pilado cocido');
    await page.getByRole('button', { name: 'Agregar Arroz pilado o pulido cocido' }).click();
    await page.getByLabel('Gramos de Arroz pilado o pulido cocido').fill('150');
    await search.fill('arroz blanco corriente');
    await page.getByRole('button', { name: 'Agregar Arroz blanco corriente' }).click();
    await choose(page, 'Medida de Arroz blanco corriente', /^Taza de acero al ras/);
    await page.getByLabel('Cantidad de Arroz blanco corriente').fill('0.5');

    // 150 g más media taza de 203.8 g (101.9 g): 251.9 g, con el método del motor y «sin dato» en la fibra.
    await expect(page.getByText('Peso del plato: 251.9 g')).toBeVisible();
    await expect(page.getByText('Equivale a 101.9 g')).toBeVisible();
    await expect(page.getByText('Composición de receta')).toBeVisible();
    await expect(page.getByRole('row', { name: /Fibra dietaria/ })).toContainText('sin dato');
    await expect(page.getByText(/factores de retención/)).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    await page.getByRole('button', { name: 'Quitar Arroz blanco corriente' }).click();
    await expect(page.getByText('Peso del plato: 150.0 g')).toBeVisible();
  });

  test('actividades, lista de intercambio provisional (R4) y la atribución de fuentes en «Acerca de» (ADR-055)', async ({
    page,
  }) => {
    const organization = await createOrganization();
    await loginInPage(page, organization.ownerEmail);

    await page.goto('/panel/biblioteca/actividades');
    await page.getByLabel('Buscar actividad').fill('correr a 6');
    const found = page.getByRole('list', { name: 'Actividades encontradas' });
    await expect(
      found.getByText('Correr a 6–6.3 mph (9.7–10.1 km/h), 10 min/milla (6.2 min/km)'),
    ).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    await page.goto('/panel/biblioteca/listas');
    await expect(
      page.getByRole('heading', { level: 2, name: 'Lista de demostración · versión 1.0.0' }),
    ).toBeVisible();
    await expect(page.getByText('Provisional', { exact: true })).toBeVisible();
    await expect(page.getByRole('row', { name: /Carnes magras/ })).toContainText('46 kcal');
    expect(await seriousViolations(page)).toEqual([]);

    await (await panelNavigation(page)).getByRole('link', { name: 'Acerca de' }).click();
    await page.waitForURL(/\/acerca$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Acerca de NutriCoach' }),
    ).toBeVisible();
    await expect(
      page.getByText(/Tablas peruanas de composición de alimentos \(2017\)/),
    ).toBeVisible();
    await expect(page.getByText(/TAFERA, 2016\) del Instituto Nacional de Salud/)).toBeVisible();
    await expect(page.getByText(/2024 Adult Compendium of Physical Activities/)).toBeVisible();
    await expect(page.getByText(/oficial/i)).toHaveCount(0);
    expect(await seriousViolations(page)).toEqual([]);
    await page.getByRole('button', { name: 'Volver' }).click();
    await page.waitForURL(/\/panel\/biblioteca\/listas$/);
  });
});

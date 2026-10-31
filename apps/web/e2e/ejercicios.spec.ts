import { expect, test, type Page } from '@playwright/test';
import { seriousViolations } from './support/axe';
import {
  acceptByApi,
  createOrganization,
  inviteByApi,
  loginInPage,
  uniqueEmail,
} from './support/stack';

/**
 * P12 (PR 2) de punta a punta (RF-25, RF-38, RN-I01, RN-F11, RN-F14) en escritorio y en el celular (WebKit): la biblioteca
 * con su búsqueda y sus filtros, la ficha con sus variantes, los ejercicios provisionales, un ejercicio propio con su
 * error y su edición, y la tabla patrón × nivel. axe en cada pantalla nueva. Los catálogos los carga catalog:load.
 */

async function choose(page: Page, label: string | RegExp, option: string | RegExp): Promise<void> {
  await page.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option }).first().click();
}

/** El menú del panel: en el celular está detrás del botón «Abrir menú». */
async function openExercises(page: Page): Promise<void> {
  const menu = page.getByRole('button', { name: 'Abrir menú' });
  if (await menu.isVisible()) await menu.click();
  await page
    .getByRole('navigation', { name: 'Secciones del panel' })
    .getByRole('link', { name: 'Biblioteca' })
    .click();
  await page.waitForURL(/\/panel\/biblioteca\/alimentos$/);
  await page
    .getByRole('navigation', { name: 'Secciones de la Biblioteca' })
    .getByRole('link', { name: 'Ejercicios' })
    .click();
  await page.waitForURL(/\/panel\/biblioteca\/ejercicios$/);
}

test.describe('P12 · Biblioteca de ejercicios', () => {
  test('la búsqueda sin tildes y por alias, los filtros, la ficha con sus variantes y lo provisional', async ({
    page,
  }) => {
    const organization = await createOrganization();
    await loginInPage(page, organization.ownerEmail);
    await openExercises(page);
    await expect(page.getByRole('link', { name: 'Sentadilla goblet' })).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    const search = page.getByRole('searchbox', { name: 'Buscar ejercicio' });
    await search.fill('jalon al pecho');
    await expect(page.getByRole('link', { name: 'Jalón al pecho' })).toBeVisible();
    // «RDL» es como la hoja de la V3 llama al peso muerto rumano (P-11).
    await search.fill('rdl con mancuernas');
    await expect(
      page.getByRole('link', { name: 'Peso muerto rumano con mancuernas' }),
    ).toBeVisible();

    await search.fill('');
    await choose(page, 'Patrón', 'Bisagra');
    await choose(page, 'Nivel', 'Avanzado');
    await expect(page.getByRole('link', { name: 'Peso muerto sumo' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sentadilla goblet' })).toHaveCount(0);
    await expect(page).toHaveURL(/pattern=HINGE/);

    // Un ejercicio de la V3 no lleva la marca; el que redactó el equipo, sí (ADR-071).
    await page.getByRole('link', { name: 'Peso muerto sumo' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Peso muerto sumo' })).toBeVisible();
    await expect(page.getByText('Ejercicio provisional')).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    await page.goBack();
    await page.goto('/panel/biblioteca/ejercicios?q=sentadilla%20goblet');
    await page.getByRole('link', { name: 'Sentadilla goblet' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Sentadilla goblet' })).toBeVisible();
    await expect(page.getByText('Ejercicio provisional')).toHaveCount(0);
    await expect(page.getByText('Dolor de rodilla o lumbar')).toBeVisible();
    await expect(page.getByText('3 × 10 repeticiones · 90 s de descanso')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Editar' })).toHaveCount(0);

    // RN-F11: la regresión y la progresión llevan a su ficha.
    await page.getByRole('link', { name: 'Sentadilla a caja' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Sentadilla a caja' })).toBeVisible();
  });

  test('RN-I01: un ejercicio propio se crea, se edita y se archiva', async ({ page }) => {
    const organization = await createOrganization();
    await loginInPage(page, organization.ownerEmail);
    await openExercises(page);
    await page.getByRole('link', { name: 'Nuevo ejercicio propio' }).click();
    await page.waitForURL(/\/ejercicios\/nuevo$/);

    await page.getByRole('button', { name: 'Crear ejercicio' }).click();
    await expect(page.getByText('Escribe el nombre: 2 letras o más.')).toBeVisible();
    await expect(page.getByText('Elige al menos un músculo principal.')).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Sentadilla en bosu');
    await page.getByRole('textbox', { name: 'Otros nombres' }).fill('Bosu squat');
    await choose(page, 'Patrón de movimiento', 'Sentadilla');
    await choose(page, /^Nivel/, 'Intermedio');
    await choose(page, /^Equipo/, 'Mancuernas');
    await page.getByRole('checkbox', { name: 'Cuádriceps', exact: true }).check();
    await page.getByRole('checkbox', { name: 'Glúteo (secundario)' }).check();
    await page.getByRole('textbox', { name: 'Series' }).fill('3');
    await page.getByRole('textbox', { name: 'Mínimo' }).fill('8');
    await page.getByRole('textbox', { name: 'Máximo' }).fill('12');
    await page.getByRole('textbox', { name: 'Descanso (s)' }).fill('90');
    await page.getByRole('searchbox', { name: 'Alternativa' }).fill('sentadilla goblet');
    await page.getByRole('button', { name: 'Elegir Sentadilla goblet' }).click();
    await page.getByRole('button', { name: 'Crear ejercicio' }).click();

    await expect(page.getByRole('heading', { level: 2, name: 'Sentadilla en bosu' })).toBeVisible();
    await expect(page.getByText('Propio de tu organización')).toBeVisible();
    await expect(page.getByText('3 × 8 a 12 repeticiones · 90 s de descanso')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sentadilla goblet' })).toBeVisible();

    await page.getByRole('link', { name: 'Editar' }).click();
    await page.waitForURL(/\/editar$/);
    await page.getByRole('textbox', { name: 'Precaución general' }).fill('Inestabilidad');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText('Inestabilidad', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Archivar' }).click();
    await expect(page.getByText('Archivado', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Restaurar' }).click();
    await expect(page.getByRole('button', { name: 'Archivar' })).toBeVisible();

    // Solo existe en su organización: la búsqueda lo encuentra por su otro nombre.
    await page.goto('/panel/biblioteca/ejercicios?q=bosu%20squat');
    await expect(page.getByRole('link', { name: 'Sentadilla en bosu' })).toBeVisible();
  });

  test('RN-F14: la tabla patrón × nivel de la V3, y una organización cambia una fila y vuelve a la original', async ({
    page,
  }) => {
    const organization = await createOrganization();
    await loginInPage(page, organization.ownerEmail);
    await openExercises(page);
    await page
      .getByRole('navigation', { name: 'Secciones de la Biblioteca' })
      .getByRole('link', { name: 'Patrón y nivel' })
      .click();
    await page.waitForURL(/\/patrones$/);

    const squat = page.getByRole('row', { name: /^Sentadilla / });
    await expect(squat).toContainText('Sentadilla goblet');
    await expect(squat).toContainText('Prensa de piernas');
    await expect(squat).toContainText('Sentadilla trasera');
    expect(await seriousViolations(page)).toEqual([]);

    await page.getByRole('button', { name: 'Cambiar Sentadilla, Principiante' }).click();
    await choose(page, 'Ejercicio para Sentadilla, Principiante', 'Sentadilla a caja');
    await expect(squat).toContainText('Sentadilla a caja');
    await expect(squat).toContainText('De tu organización');

    await page
      .getByRole('button', { name: 'Volver a la original en Sentadilla, Principiante' })
      .click();
    await expect(squat).toContainText('Sentadilla goblet');
    await expect(squat).not.toContainText('De tu organización');
  });

  test('RN-F14: un profesional lee la tabla patrón × nivel, pero no se le ofrece cambiarla', async ({
    page,
  }) => {
    const organization = await createOrganization();
    const email = uniqueEmail();
    await acceptByApi(await inviteByApi(organization.ownerEmail, email), 'Profesional E2E');
    await loginInPage(page, email);

    await page.goto('/panel/biblioteca/patrones');
    await expect(page.getByRole('row', { name: /^Sentadilla / })).toContainText(
      'Sentadilla goblet',
    );
    await expect(page.getByRole('button', { name: /^Cambiar / })).toHaveCount(0);
  });
});

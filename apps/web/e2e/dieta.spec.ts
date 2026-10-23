import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { seriousViolations } from './support/axe';
import { apiAs, createOrganization, grantInPersonByApi, loginInPage } from './support/stack';

/**
 * P9 de punta a punta (RF-18, RF-19, RF-23; RN-E08 a RN-E10, RN-E13 a RN-E15, RN-G05) en escritorio y en el celular: la
 * dieta por intercambios de Luis. Luis y su prescripción (G-17) se preparan por la API. El plan se arma en pantalla:
 * metas con la referencia de hidratación, 4 verduras, 3 frutas y 3 lácteos (G-18), el reparto de G-19 y un alimento
 * permitido con su porción sugerida (ADR-057). Los demás alimentos van por la API para poder publicar; después, la
 * versión nueva. axe en cada paso. Datos sintéticos de seeds/luis.
 */

interface LuisSeed {
  readonly evaluations: {
    current: { measurements: Readonly<Record<string, readonly number[]>> };
  };
  readonly energyPrescription: Readonly<Record<string, unknown>>;
}

const luis = JSON.parse(
  readFileSync(new URL('../../../seeds/luis/luis.json', import.meta.url), 'utf8'),
) as LuisSeed;

/** G-19: almidones y carnes de cada tiempo con los % por defecto. */
const G19 = { STA: [1, 1, 2, 1, 1], MEAT: [4, 2, 5, 2, 3] } as const;
const MEALS = ['Desayuno', 'Media mañana', 'Almuerzo', 'Media tarde', 'Cena'] as const;
const RICE = 'Arroz pilado o pulido cocido';

interface Versioned {
  readonly id: string;
  readonly version: number;
}

/** Luis con su consentimiento, su evaluación ISAK 2 cerrada y su prescripción energética (G-12 a G-17). */
async function luisWithPrescription(ownerEmail: string): Promise<string> {
  const api = await apiAs(ownerEmail);
  const created = await api.post('/api/v1/patients', {
    data: { firstName: 'Luis', lastName: 'Ejemplo Sintético', sex: 'M', birthDate: '1998-10-13' },
  });
  expect(created.status(), 'registrar a Luis').toBe(201);
  const { id } = (await created.json()) as { id: string };
  await grantInPersonByApi(ownerEmail, id, 'HEALTH_DATA');
  const evaluation = await api.post(`/api/v1/patients/${id}/evaluations`, {
    data: {
      level: 'ISAK2',
      measuredAt: '2026-10-13T13:30:00.000Z',
      conditions: { schemaVersion: 1, fasting: true, intenseActivityLast24h: false },
    },
  });
  expect(evaluation.status(), 'crear la evaluación').toBe(201);
  let current = (await evaluation.json()) as Versioned;
  for (const [siteCode, attempts] of Object.entries(luis.evaluations.current.measurements)) {
    const measured = await api.put(`/api/v1/evaluations/${current.id}/measurements/${siteCode}`, {
      data: { attempts },
      headers: { 'If-Match': String(current.version) },
    });
    expect(measured.ok(), `medir ${siteCode}`).toBe(true);
    current = (await measured.json()) as Versioned;
  }
  const closed = await api.post(`/api/v1/evaluations/${current.id}/close`, {
    headers: { 'If-Match': String(current.version) },
  });
  expect(closed.ok(), 'cerrar la evaluación').toBe(true);
  // El worker calcula los resultados al cerrar; la proyección del peso objetivo los usa.
  await expect(async () => {
    const prescribed = await api.post(`/api/v1/patients/${id}/energy-prescriptions`, {
      data: { ...luis.energyPrescription, evaluationId: current.id },
    });
    expect(prescribed.status(), 'prescribir').toBe(201);
  }).toPass({ timeout: 20_000 });
  await api.dispose();
  return id;
}

interface PlanRead extends Versioned {
  readonly meals: readonly {
    slotCode: string;
    name: string;
    timeOfDay: string | null;
    sharePct: number;
    servings: Readonly<Record<string, number>>;
    allowedFoods: readonly {
      groupCode: string;
      foodId: string;
      grams: number;
      householdText: string | null;
    }[];
  }[];
  readonly exchanges: readonly { groupCode: string; servings: number; manual: boolean }[];
  readonly hydrationTargetMl: number | null;
  readonly instructions: string | null;
}

/**
 * Completa por la API un alimento en cada grupo con intercambios de cada tiempo, con un alimento propio: lo que haría
 * la persona en pantalla treinta veces, para poder publicar (RN-G05).
 */
async function fillAllowedFoodsByApi(ownerEmail: string, planId: string): Promise<void> {
  const api = await apiAs(ownerEmail);
  const food = await api.post('/api/v1/foods', {
    data: {
      name: 'Comodín E2E',
      state: 'READY',
      nutrients: { ENERC_KCAL: 100, PROCNT: 10, FAT: 5, CHOCDF: 5 },
    },
  });
  expect(food.status(), 'crear el alimento propio').toBe(201);
  const { id: foodId } = (await food.json()) as { id: string };
  const plan = (await (await api.get(`/api/v1/nutrition-plans/${planId}`)).json()) as PlanRead;
  const fixed = (code: string) => plan.exchanges.find((e) => e.groupCode === code)?.servings ?? 0;
  const updated = await api.put(`/api/v1/nutrition-plans/${planId}`, {
    headers: { 'If-Match': `"${String(plan.version)}"` },
    data: {
      fixedServings: { VEG: fixed('VEG'), FRU: fixed('FRU'), MILK: fixed('MILK') },
      overrides: {},
      splitOverrides: {},
      hydrationTargetMl: plan.hydrationTargetMl,
      instructions: plan.instructions,
      meals: plan.meals.map((meal) => ({
        slotCode: meal.slotCode,
        name: meal.name,
        timeOfDay: meal.timeOfDay,
        sharePct: meal.sharePct,
        allowedFoods: [
          ...meal.allowedFoods.map(({ groupCode, foodId: id, grams, householdText }) => ({
            groupCode,
            foodId: id,
            grams,
            householdText,
          })),
          ...Object.entries(meal.servings)
            .filter(
              ([code, servings]) =>
                servings > 0 && !meal.allowedFoods.some((f) => f.groupCode === code),
            )
            .map(([groupCode]) => ({ groupCode, foodId, grams: 50, householdText: null })),
        ],
      })),
    },
  });
  expect(updated.status(), 'completar los alimentos permitidos').toBe(200);
  await api.dispose();
}

async function recordTab(page: Page, name: string): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Secciones del expediente' })
    .getByRole('link', { name, exact: true })
    .click();
}

const saved = async (page: Page) => {
  await page.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(page.getByText('Guardado', { exact: true })).toBeVisible();
};

test.describe('P9 · Dieta por intercambios', () => {
  test('Luis arma su plan en tres pasos con G-17 a G-19, lo publica y crea la versión 2', async ({
    page,
  }) => {
    test.setTimeout(3 * 60_000);
    const organization = await createOrganization();
    const luisId = await luisWithPrescription(organization.ownerEmail);
    await loginInPage(page, organization.ownerEmail);
    await page.goto(`/panel/pacientes/${luisId}`);

    await test.step('nuevo plan desde la prescripción y la lista DEMO (RF-18, RN-E11)', async () => {
      await recordTab(page, 'Dieta');
      await expect(page.getByText('Todavía no hay planes')).toBeVisible();
      await page.getByRole('link', { name: 'Nuevo plan' }).click();
      await expect(page.getByText('Lista provisional')).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);
      await page.getByRole('button', { name: 'Crear borrador' }).click();
      await page.waitForURL(/\/dieta\/[0-9a-f-]{36}$/);
    });

    await test.step('1 · metas exactas de G-17 y la referencia de hidratación (RN-E13)', async () => {
      const goals = page.getByRole('region', { name: 'Metas del día' });
      for (const value of ['1,835 kcal', '184 g', '160 g', '51 g']) {
        await expect(goals).toContainText(value);
      }
      await page.getByRole('button', { name: 'Usar 2,500 ml (EFSA 2010)' }).click();
      await expect(page.getByLabel('Meta de hidratación (ml por día)')).toHaveValue('2500');
      expect(await seriousViolations(page)).toEqual([]);
    });

    await test.step('2 · G-18: 4 verduras, 3 frutas y 3 lácteos dan 6, 16 y 3 (RN-E08, RN-E10)', async () => {
      await page.getByRole('button', { name: 'Siguiente: Intercambios' }).click();
      await page.getByLabel('Verduras: intercambios por día').fill('4');
      await page.getByLabel('Frutas: intercambios por día').fill('3');
      await page.getByLabel('Lácteos: intercambios por día').fill('3');
      await expect(page.getByTestId('plan-totals')).toContainText('1,889 kcal');
      for (const [group, servings] of [
        ['Almidones', '6'],
        ['Carnes magras', '16'],
        ['Grasas', '3'],
      ] as const) {
        await expect(
          page.getByRole('row', { name: new RegExp(`^${group}`) }).getByText(servings, {
            exact: true,
          }),
        ).toBeVisible();
      }
      for (const [nutrient, pct] of [
        ['kcal', '103.0 %'],
        ['cho', '103.8 %'],
        ['protein', '101.3 %'],
        ['fat', '104.0 %'],
      ] as const) {
        const row = page.locator(`[data-adequacy="${nutrient}"]`);
        await expect(row).toContainText(pct);
        await expect(row).toContainText('En rango');
      }
      expect(await seriousViolations(page)).toEqual([]);
      await saved(page);
    });

    await test.step('3 · G-19 por tiempos y un alimento con su porción sugerida (RN-E09, RN-G05)', async () => {
      await page.getByRole('button', { name: 'Siguiente: Reparto y alimentos' }).click();
      const split = page.getByRole('region', { name: 'Reparto por tiempos de comida' });
      for (const [index, meal] of MEALS.entries()) {
        const cells = split.getByRole('row', { name: new RegExp(`^${meal}`) }).getByRole('cell');
        await expect(cells.nth(3)).toHaveText(String(G19.STA[index]));
        await expect(cells.nth(4)).toHaveText(String(G19.MEAT[index]));
      }

      const lunch = page.getByRole('region', { name: 'Almuerzo', exact: true });
      await lunch.getByRole('button', { name: 'Agregar almidones' }).click();
      await page
        .getByRole('searchbox', { name: 'Buscar alimento de Almidones' })
        .fill('arroz pilado');
      await page.getByRole('button', { name: `Agregar ${RICE}` }).click();
      // 15 g de carbohidratos de un almidón ÷ 25.2 g por 100 g del arroz cocido × 100 ≈ 59.5 g (ADR-057).
      await expect(lunch.getByLabel(`Gramos de ${RICE}`)).toHaveValue('60');
      await expect(lunch).toContainText('Un intercambio son 60 g: aportan 15 g de carbohidratos.');
      await lunch.getByLabel(`Medida casera de ${RICE}`).fill('1 cucharón chino lleno');
      await page.getByRole('button', { name: 'Cerrar búsqueda' }).click();
      await expect(page.getByRole('list', { name: 'Lo que falta para publicar' })).toContainText(
        'Desayuno: falta al menos un alimento permitido de Verduras (RN-G05).',
      );
      expect(await seriousViolations(page)).toEqual([]);
      await saved(page);
    });

    await test.step('publicar: vigente desde hoy, inmutable y en la línea de tiempo (RN-E14, RN-E15)', async () => {
      const planId = page.url().split('/').at(-1) ?? '';
      await fillAllowedFoodsByApi(organization.ownerEmail, planId);
      await page.reload();
      await page.getByRole('button', { name: 'Siguiente: Intercambios' }).click();
      await page.getByRole('button', { name: 'Siguiente: Reparto y alimentos' }).click();
      await expect(page.getByRole('list', { name: 'Lo que falta para publicar' })).toHaveCount(0);
      await page.getByRole('button', { name: 'Publicar plan' }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Publicar' }).click();

      await expect(
        page.getByRole('heading', { level: 2, name: 'Plan nutricional · versión 1' }),
      ).toBeVisible();
      await expect(page.getByText('Vigente', { exact: true })).toBeVisible();
      await expect(page.getByText(/^Vale desde el /)).toBeVisible();
      await expect(page.getByRole('region', { name: 'Alimentos permitidos' })).toContainText(
        `${RICE} · 60 g · 1 cucharón chino lleno`,
      );
      await expect(page.getByRole('region', { name: 'Hidratación e indicaciones' })).toContainText(
        '2,500 ml',
      );
      expect(await seriousViolations(page)).toEqual([]);

      await recordTab(page, 'Línea de tiempo');
      await expect(page.getByRole('cell', { name: 'Plan nutricional publicado' })).toBeVisible();
      await expect(page.getByRole('cell', { name: 'Versión 1' })).toBeVisible();
    });

    await test.step('versión nueva: un borrador con lo mismo; pedirla otra vez abre el mismo (RN-E15)', async () => {
      await recordTab(page, 'Dieta');
      await expect(page.getByRole('row', { name: /Versión 1/ })).toContainText('Vigente');
      expect(await seriousViolations(page)).toEqual([]);
      await page.getByRole('link', { name: 'Versión 1' }).click();
      await page.waitForURL(/\/dieta\/[0-9a-f-]{36}$/);
      const published = page.url();
      await page.getByRole('button', { name: 'Crear versión nueva' }).click();
      await page.waitForURL(
        (url) => /\/dieta\/[0-9a-f-]{36}$/.test(url.pathname) && url.href !== published,
      );
      await expect(page.getByText('Borrador de la versión 2.')).toBeVisible();
      const draft = page.url();
      await expect(page.getByLabel('Meta de hidratación (ml por día)')).toHaveValue('2500');

      await page.goto(published);
      await page.getByRole('button', { name: 'Crear versión nueva' }).click();
      await page.waitForURL(draft);
      await expect(page.getByText('Borrador de la versión 2.')).toBeVisible();
    });
  });
});

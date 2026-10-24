import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiHarness, type StaffOrganization } from './support/api-harness.js';
import { pool } from './support/database.js';
import { luisWithPrescription } from './support/luis.js';

/**
 * P10 (PR 2) · dieta por composición y menú semanal por HTTP contra PostgreSQL como app_user (RF-20, RF-21, RN-E16):
 * totales con el motor y «al menos» cuando falta un dato (ADR-061, ADR-062), lo que falta para publicar (RN-E13,
 * RN-G05), el snapshot de cada modalidad (RN-E15) y el criterio 2 de P10: un menú semanal publicado aparece en la
 * vista del plan activo del paciente (tracking.active_plan_view).
 */

const harness = new ApiHarness();
let org: StaffOrganization;
let cookie: string;
let patientId: string;
let prescriptionId: string;
let rice: string;
let chicken: string;
let egg: string;
let stew: string;
/** El menú del criterio 2: lo usan también las pruebas de la base. */
let published: MenuPlan;

interface Totals {
  ingredientCount: number;
  nutrients: Record<string, { value: number | null; known: number; missing: number }>;
}
interface FoodAdequacy {
  pct: number;
  daysInRange: number;
  days: number;
  missing: number;
  of: number;
}
interface Plan {
  id: string;
  lineageId: string;
  versionNo: number;
  modality: string;
  status: string;
  version: number;
  validFrom: string | null;
  meals: { slotCode: string; name: string; timeOfDay: string | null; sharePct: number }[];
  hydrationTargetMl: number | null;
  publishProblems: string[];
  adequacy: Record<'kcal' | 'cho' | 'protein' | 'fat', FoodAdequacy>;
}
interface CompositionPlan extends Plan {
  meals: (Plan['meals'][number] & {
    id: string;
    items: {
      foodId: string;
      foodName: string;
      state: string;
      nutrientsPer100g: Record<string, number | null>;
    }[];
    totals: Totals;
  })[];
  totals: Totals;
}
interface MenuPlan extends Plan {
  days: {
    dayOfWeek: number;
    meals: {
      id: string;
      optionA: {
        itemType: string;
        recipeName?: string;
        nutrientsPerServing?: Record<string, number | null>;
      }[];
      optionB: unknown[];
      totalsA: Totals | null;
      totalsB: Totals | null;
    }[];
    totals: Totals;
  }[];
  weeklyAverage: Record<string, { value: number | null; known: number; missingDays: number }>;
}

const owner = async <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  (await pool('owner').query(sql, params)).rows as T[];

const today = (): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

const create = async <T extends Plan>(modality: 'COMPOSITION' | 'WEEKLY_MENU'): Promise<T> => {
  const created = await harness.post(
    `/patients/${patientId}/nutrition-plans`,
    { modality, energyPrescriptionId: prescriptionId },
    cookie,
  );
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  return created.body as T;
};
const put = (plan: Plan, body: object) =>
  harness.put(`/nutrition-plans/${plan.id}`, body, cookie).set('If-Match', String(plan.version));
const publish = (plan: Plan) =>
  harness
    .post(`/nutrition-plans/${plan.id}/publish`, undefined, cookie)
    .set('If-Match', String(plan.version));

const headers = (plan: Plan) =>
  plan.meals.map(({ slotCode, name, timeOfDay, sharePct }) => ({
    slotCode,
    name,
    timeOfDay,
    sharePct,
  }));
const food = (foodId: string, grams: number, householdText: string | null = null) => ({
  itemType: 'FOOD',
  foodId,
  grams,
  householdText,
});
const recipe = (recipeId: string, servings: number) => ({ itemType: 'RECIPE', recipeId, servings });

/** Composición: huevo en el desayuno, arroz y pollo en el almuerzo y pollo en los demás tiempos. */
const compositionBody = (plan: Plan, hydrationTargetMl: number | null = 2_000) => ({
  modality: 'COMPOSITION',
  meals: headers(plan).map((meal, m) => ({
    ...meal,
    items:
      m === 0
        ? [food(egg, 100, '2 unidades')]
        : m === 2
          ? [food(rice, 200, '1 taza'), food(chicken, 150)]
          : [food(chicken, 50)],
  })),
  hydrationTargetMl,
  instructions: null,
});

/**
 * Menú: de lunes a sábado, huevo en el desayuno; el domingo, arroz. En el almuerzo, dos porciones de arroz con pollo y
 * pollo solo como opción B; en los demás tiempos, pollo.
 */
const menuBody = (
  plan: Plan,
  change: (day: number, meal: number) => object | null = () => null,
) => ({
  modality: 'WEEKLY_MENU',
  meals: headers(plan),
  days: Array.from({ length: 7 }, (_, d) => ({
    meals: headers(plan).map(
      (_, m) =>
        change(d, m) ??
        (m === 0
          ? { optionA: [food(d === 6 ? rice : egg, 100)], optionB: [] }
          : m === 2
            ? { optionA: [recipe(stew, 2)], optionB: [food(chicken, 200)] }
            : { optionA: [food(chicken, 50)], optionB: [] }),
    ),
  })),
  hydrationTargetMl: 2_000,
  instructions: 'Variar las frutas.',
});

beforeAll(async () => {
  await harness.start();
  org = await harness.createStaffOrganization();
  cookie = org.staff.responsible.cookie;
  ({ patientId, prescriptionId } = await luisWithPrescription(harness, org));
  // Valores sintéticos por 100 g. Como en la TPCA, el arroz no trae fibra y el huevo, carbohidratos (RN-I03).
  const ownFood = async (name: string, state: string, nutrients: Record<string, number>) => {
    const created = await harness.post('/foods', { name, state, nutrients }, cookie);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    return (created.body as { id: string }).id;
  };
  rice = await ownFood('Arroz cocido (plan)', 'COOKED', {
    ENERC_KCAL: 120,
    PROCNT: 2,
    FAT: 0.5,
    CHOCDF: 25,
  });
  chicken = await ownFood('Pollo (plan)', 'RAW', {
    ENERC_KCAL: 110,
    PROCNT: 20,
    FAT: 3,
    CHOCDF: 0,
    FIBTG: 0,
  });
  egg = await ownFood('Huevo (plan)', 'RAW', { ENERC_KCAL: 140, PROCNT: 12, FAT: 10, FIBTG: 0 });
  const created = await harness.post(
    '/recipes',
    {
      name: 'Arroz con pollo (plan)',
      servings: 2,
      ingredients: [
        { foodId: rice, grams: 200 },
        { foodId: chicken, grams: 150 },
      ],
    },
    cookie,
  );
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  stew = (created.body as { id: string }).id;
});

afterAll(async () => {
  await harness.stop();
});

describe('RF-20 · RN-E16 · dieta por composición', () => {
  it('un plan nuevo empieza con los tiempos de G-19, sin lista ni alimentos', async () => {
    const plan = await create<CompositionPlan>('COMPOSITION');
    expect(plan).toMatchObject({ modality: 'COMPOSITION', status: 'DRAFT', versionNo: 1 });
    expect(plan.meals.map((m) => m.sharePct)).toEqual([25, 10, 35, 10, 20]);
    expect(plan.publishProblems).toEqual([
      'Falta la meta de hidratación (RN-E13).',
      'Desayuno: agrega al menos un alimento (RN-G05).',
      'Media mañana: agrega al menos un alimento (RN-G05).',
      'Almuerzo: agrega al menos un alimento (RN-G05).',
      'Media tarde: agrega al menos un alimento (RN-G05).',
      'Cena: agrega al menos un alimento (RN-G05).',
    ]);
    const [row] = await owner<{ list: string | null }>(
      'SELECT exchange_list_id AS list FROM nutrition.plan WHERE id = $1',
      [plan.id],
    );
    expect(row).toEqual({ list: null });
  });

  it('totales por tiempo y del día con el motor; si falta un dato, «sin dato» y lo conocido aparte (ADR-061)', async () => {
    const plan = await create<CompositionPlan>('COMPOSITION');
    const saved = await put(plan, compositionBody(plan));
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    const read = saved.body as CompositionPlan;

    expect(read.meals[0]?.items[0]).toMatchObject({
      foodName: 'Huevo (plan)',
      state: 'RAW',
      nutrientsPer100g: { ENERC_KCAL: 140, CHOCDF: null },
    });
    // 140 + 50 × 1.1 + (240 + 165) + 55 + 55 = 710 kcal.
    expect(read.totals.nutrients.ENERC_KCAL?.value).toBeCloseTo(710, 6);
    expect(read.meals[2]?.totals.nutrients.ENERC_KCAL?.value).toBeCloseTo(405, 6);
    expect(read.totals.nutrients.CHOCDF).toMatchObject({ value: null, missing: 1 });
    expect(read.totals.nutrients.CHOCDF?.known).toBeCloseTo(50, 6);
    expect(read.totals.ingredientCount).toBe(6);
    expect(read.publishProblems).toEqual([]);
  });

  it('RN-E10 · ADR-062 · la adecuación con lo conocido dice en cuántos alimentos falta', async () => {
    const plan = await create<CompositionPlan>('COMPOSITION');
    const read = (await put(plan, compositionBody(plan))).body as CompositionPlan;
    expect(read.adequacy.kcal).toMatchObject({ days: 1, missing: 0, of: 6 });
    expect(read.adequacy.cho).toMatchObject({ days: 1, missing: 1, of: 6 });
  });

  it('la modalidad no cambia; las recetas van en el menú y un alimento de otra organización no entra', async () => {
    const plan = await create<CompositionPlan>('COMPOSITION');
    const exchanges = await put(plan, {
      modality: 'EXCHANGES',
      fixedServings: { VEG: 0, FRU: 0, MILK: 0 },
      overrides: {},
      meals: headers(plan).map((meal) => ({ ...meal, allowedFoods: [] })),
      splitOverrides: {},
      hydrationTargetMl: null,
      instructions: null,
    });
    expect(exchanges.status).toBe(422);
    expect(exchanges.body).toMatchObject({ code: 'NC-NUT-014' });

    const withRecipe = compositionBody(plan);
    const body = {
      ...withRecipe,
      meals: withRecipe.meals.map((meal, m) =>
        m === 0 ? { ...meal, items: [recipe(stew, 1)] } : meal,
      ),
    };
    expect((await put(plan, body)).status).toBe(400);

    const other = await harness.createStaffOrganization();
    const foreign = await harness.post(
      '/foods',
      { name: 'Alimento ajeno', state: 'READY', nutrients: { ENERC_KCAL: 100 } },
      other.staff.responsible.cookie,
    );
    const foreignBody = compositionBody(plan);
    const response = await put(plan, {
      ...foreignBody,
      meals: foreignBody.meals.map((meal, m) =>
        m === 0 ? { ...meal, items: [food((foreign.body as { id: string }).id, 100)] } : meal,
      ),
    });
    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ code: 'NC-NUT-010' });
  });

  it('RN-E15 · publicar congela el snapshot de la composición con sus alimentos', async () => {
    const plan = await create<CompositionPlan>('COMPOSITION');
    const ready = (await put(plan, compositionBody(plan))).body as CompositionPlan;
    const published = await publish(ready);
    expect(published.status, JSON.stringify(published.body)).toBe(200);

    const [row] = await owner<{ modality: string; egg_kcal: number; meals: number }>(
      `SELECT snapshot->>'modality' AS modality,
              (snapshot->'foods'->$2->'nutrientsPer100g'->>'ENERC_KCAL')::float8 AS egg_kcal,
              jsonb_array_length(snapshot->'meals') AS meals
       FROM nutrition.plan WHERE id = $1`,
      [plan.id, egg],
    );
    expect(row).toEqual({ modality: 'COMPOSITION', egg_kcal: 140, meals: 5 });
    const edit = await put(published.body as Plan, compositionBody(plan));
    expect(edit.status).toBe(409);
  });
});

describe('RF-21 · RN-E16 · menú semanal', () => {
  it('un menú nuevo tiene 7 días vacíos con los tiempos de G-19', async () => {
    const plan = await create<MenuPlan>('WEEKLY_MENU');
    expect(plan.days.map((d) => d.dayOfWeek)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(plan.days[0]?.meals).toHaveLength(5);
    expect(plan.days[0]?.meals[0]?.totalsA).toBeNull();
    expect(plan.publishProblems).toContain('Desayuno: falta la opción A todos los días (RN-G05).');
    const [count] = await owner<{ meals: number }>(
      'SELECT count(*)::int AS meals FROM nutrition.plan_meal WHERE plan_id = $1',
      [plan.id],
    );
    expect(count).toEqual({ meals: 35 });
  });

  it('cada día con la opción A de cada tiempo, la receta por sus ingredientes y el promedio de la semana', async () => {
    const plan = await create<MenuPlan>('WEEKLY_MENU');
    const saved = await put(plan, menuBody(plan));
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    const read = saved.body as MenuPlan;

    const lunch = read.days[0]?.meals[2];
    expect(lunch?.optionA[0]).toMatchObject({
      itemType: 'RECIPE',
      recipeName: 'Arroz con pollo (plan)',
    });
    // Una porción: (240 + 165) ÷ 2 = 202.5 kcal.
    expect(lunch?.optionA[0]?.nutrientsPerServing?.ENERC_KCAL).toBeCloseTo(202.5, 6);
    expect(lunch?.totalsA?.nutrients.ENERC_KCAL?.value).toBeCloseTo(405, 6);
    expect(lunch?.totalsB?.nutrients.ENERC_KCAL?.value).toBeCloseTo(220, 6);
    // Lunes: 140 + 55 + 405 + 55 + 55 = 710 kcal; el domingo, arroz en vez de huevo: 690.
    expect(read.days[0]?.totals.nutrients.ENERC_KCAL?.value).toBeCloseTo(710, 6);
    expect(read.days[6]?.totals.nutrients.ENERC_KCAL?.value).toBeCloseTo(690, 6);
    expect(read.weeklyAverage.ENERC_KCAL?.value).toBeCloseTo((710 * 6 + 690) / 7, 6);
    expect(read.weeklyAverage.CHOCDF).toMatchObject({ value: null, missingDays: 6 });
    expect(read.adequacy.kcal).toMatchObject({ days: 7, missing: 0, of: 7 });
    expect(read.adequacy.cho).toMatchObject({ days: 7, missing: 6, of: 7 });
    expect(read.publishProblems).toEqual([]);
  });

  it('RN-G05 · sin la opción A algún día no se publica, con los días que faltan', async () => {
    const plan = await create<MenuPlan>('WEEKLY_MENU');
    const draft = (
      await put(
        plan,
        menuBody(plan, (d, m) =>
          m === 2 && (d === 1 || d === 3) ? { optionA: [], optionB: [] } : null,
        ),
      )
    ).body as MenuPlan;
    const response = await publish(draft);
    expect(response.status).toBe(422);
    expect((response.body as { details: { problems: string[] } }).details.problems).toEqual([
      'Almuerzo: falta la opción A el martes y el jueves (RN-G05).',
    ]);
  });

  it('criterio 2 · un menú semanal publicado aparece en la vista del plan activo del paciente', async () => {
    const plan = await create<MenuPlan>('WEEKLY_MENU');
    const ready = (await put(plan, menuBody(plan))).body as MenuPlan;
    const response = await publish(ready);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    published = response.body as MenuPlan;
    expect(published).toMatchObject({ status: 'PUBLISHED', validFrom: today() });

    await harness.deliver('tracking.plans');
    await harness.deliver('tracking.plans');
    const views = await owner<{ plan: string; modality: string; days: number; recipe: string }>(
      `SELECT nutrition_plan_id AS plan, nutrition_snapshot->>'modality' AS modality,
              jsonb_array_length(nutrition_snapshot->'days') AS days,
              nutrition_snapshot->'recipes'->$2->>'name' AS recipe
       FROM tracking.active_plan_view WHERE patient_id = $1`,
      [patientId, stew],
    );
    expect(views).toEqual([
      { plan: published.id, modality: 'WEEKLY_MENU', days: 7, recipe: 'Arroz con pollo (plan)' },
    ]);
    const targets = await owner<{ plan: string; water: number }>(
      `SELECT nutrition_plan_id AS plan, water_ml AS water
       FROM tracking.daily_target WHERE patient_id = $1 AND local_date = $2::date`,
      [patientId, today()],
    );
    expect(targets).toEqual([{ plan: published.id, water: 2_000 }]);
  });

  it('una versión nueva copia los siete días; la auditoría guarda qué cambió (RN-B03)', async () => {
    const revised = await harness.post(
      `/nutrition-plans/${published.id}/revisions`,
      undefined,
      cookie,
    );
    expect(revised.status, JSON.stringify(revised.body)).toBe(201);
    const draft = revised.body as MenuPlan;
    expect(draft).toMatchObject({ modality: 'WEEKLY_MENU', status: 'DRAFT', versionNo: 2 });
    expect(draft.days[6]?.totals.nutrients.ENERC_KCAL?.value).toBeCloseTo(690, 6);

    const edited = await put(
      draft,
      menuBody(draft, (d, m) =>
        d === 0 && m === 1 ? { optionA: [food(egg, 50)], optionB: [] } : null,
      ),
    );
    expect(edited.status).toBe(200);
    await harness.deliver('audit.events');
    const audit = await owner<{ action: string; fields: string[] | null }>(
      `SELECT action, changed_fields AS fields FROM audit.audit_log
       WHERE resource_type = 'nutrition.plan' AND resource_id = $1 AND action = 'UPDATE'`,
      [draft.id],
    );
    expect(audit).toEqual([{ action: 'UPDATE', fields: ['plan_item'] }]);

    const history = await harness.get(`/patients/${patientId}/nutrition-plans`, cookie);
    const plans = (
      history.body as { plans: { id: string; modality: string; exchangeListCode: string | null }[] }
    ).plans;
    expect(plans.find((p) => p.id === draft.id)).toMatchObject({
      modality: 'WEEKLY_MENU',
      exchangeListCode: null,
    });
  });
});

describe('RN-E15 · RN-E16 · la base lo rechaza aunque se salte la API', () => {
  it('solo los intercambios llevan lista; un alimento va en gramos, una receta en porciones y la opción es A o B', async () => {
    const plan = await create<CompositionPlan>('COMPOSITION');
    const meal = plan.meals[0]?.id;
    await expect(
      owner(
        `UPDATE nutrition.plan SET exchange_list_id = gen_random_uuid(), exchange_list_version = '1' WHERE id = $1`,
        [plan.id],
      ),
    ).rejects.toThrow(/plan_exchange_list_by_modality/);
    const insert = (
      type: string,
      grams: number | null,
      servings: number | null,
      option: string | null,
    ) =>
      owner(
        `INSERT INTO nutrition.plan_item (id, plan_meal_id, organization_id, item_type, item_id, grams, servings,
                                          option_label, position)
         VALUES (gen_random_uuid(), $1, $2, $3, gen_random_uuid(), $4, $5, $6, 1)`,
        [meal, org.organizationId, type, grams, servings, option],
      );
    await expect(insert('FOOD', null, 1, null)).rejects.toThrow(/plan_item_quantity/);
    await expect(insert('RECIPE', 100, null, null)).rejects.toThrow(/plan_item_quantity/);
    await expect(insert('FOOD', 100, null, 'C')).rejects.toThrow(/plan_item_option/);
  });

  it('los alimentos y recetas de un menú publicado no cambian (RN-E15)', async () => {
    const [item] = await owner<{ id: string }>(
      `SELECT i.id FROM nutrition.plan_item i JOIN nutrition.plan_meal m ON m.id = i.plan_meal_id
       WHERE m.plan_id = $1 LIMIT 1`,
      [published.id],
    );
    await expect(
      owner('UPDATE nutrition.plan_item SET grams = 1 WHERE id = $1', [item?.id]),
    ).rejects.toThrow(/RN-E15/);
  });
});

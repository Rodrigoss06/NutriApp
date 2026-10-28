/**
 * Semilla de la Demo 2 (P11, decisión 4 del plan): Luis con su prescripción energética (G-12 a G-17), la receta de
 * arroz con pollo (P10), su dieta por intercambios publicada (G-17 a G-19) y después su dieta por composición publicada,
 * que la reemplaza y queda vigente. El menú semanal se arma en vivo en la demo. Datos de seeds/luis/demo-2.json.
 *
 * Va por la API, con la API y el worker corriendo (pnpm dev), para que los snapshots, la adecuación y las fichas sean
 * los reales: nada se escribe a mano en la base. Entra como la dueña demo de la semilla (pnpm db:seed) y necesita los
 * catálogos (pnpm catalog:load). Se puede correr dos veces: lo que ya está no se vuelve a crear.
 *
 * Uso: pnpm demo:2
 */
import data from '../../../seeds/luis/demo-2.json' with { type: 'json' };
import luis from '../../../seeds/luis/luis.json' with { type: 'json' };

type Method = 'GET' | 'POST' | 'PUT';

export interface ApiResponse {
  readonly status: number;
  readonly body: unknown;
}

/** Una petición a /api/v1 con la sesión de quien siembra; ifMatch es la versión que se leyó (06 §5). */
export interface DemoApi {
  call(
    method: Method,
    path: string,
    options?: { readonly body?: unknown; readonly ifMatch?: number },
  ): Promise<ApiResponse>;
}

export type Outcome = 'CREATED' | 'EXISTING';

export interface Demo2Report {
  readonly prescription: Outcome;
  readonly recipe: Outcome;
  readonly exchanges: Outcome;
  readonly composition: Outcome;
}

type Group = 'VEG' | 'FRU' | 'MILK' | 'STA' | 'MEAT' | 'FAT';

interface Meal {
  readonly slotCode: string;
  readonly name: string;
  readonly timeOfDay: string | null;
  readonly sharePct: number;
  readonly servings?: Readonly<Partial<Record<Group, number>>>;
}
interface Plan {
  readonly id: string;
  readonly version: number;
  readonly meals: readonly Meal[];
}
interface PlanSummary {
  readonly id: string;
  readonly modality: 'EXCHANGES' | 'COMPOSITION' | 'WEEKLY_MENU';
  readonly status: 'DRAFT' | 'PUBLISHED' | 'SUPERSEDED' | 'ARCHIVED';
}
interface Food {
  readonly id: string;
  readonly name: string;
  readonly own: boolean;
  readonly nutrients: readonly { code: string; valuePer100g: number | null }[];
  readonly measures: readonly { name: string; grams: number }[];
}
type ItemData = { readonly food: string } & (
  { readonly grams: number } | { readonly measure: string; readonly amount: number }
);

/** El macronutriente que define a cada grupo, como la porción sugerida del editor (ADR-057, ADR-059). */
const DEFINING: Readonly<Record<Group, { macro: 'choG' | 'proteinG' | 'fatG'; nutrient: string }>> =
  {
    VEG: { macro: 'choG', nutrient: 'CHOCDF' },
    FRU: { macro: 'choG', nutrient: 'CHOCDF' },
    MILK: { macro: 'proteinG', nutrient: 'PROCNT' },
    STA: { macro: 'choG', nutrient: 'CHOCDF' },
    MEAT: { macro: 'proteinG', nutrient: 'PROCNT' },
    FAT: { macro: 'fatG', nutrient: 'FAT' },
  };

/** Esperas para el cálculo de los resultados: el worker los calcula al cerrar la evaluación. */
const RESULT_ATTEMPTS = 30;
const RESULT_WAIT_MS = 2_000;

function expectStatus(response: ApiResponse, expected: number, what: string): void {
  if (response.status !== expected) {
    throw new Error(
      `${what}: la API respondió ${String(response.status)} ${JSON.stringify(response.body)}`,
    );
  }
}

export async function seedDemo2(
  api: DemoApi,
  patientId: string,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<Demo2Report> {
  const foods = new Map<string, Food>();
  const food = async (name: string): Promise<Food> => {
    const cached = foods.get(name);
    if (cached) return cached;
    const found = await api.call('GET', `/foods?q=${encodeURIComponent(name)}&limit=20`);
    expectStatus(found, 200, `buscar «${name}»`);
    const summary = (
      found.body as { foods: { id: string; name: string; own: boolean }[] }
    ).foods.find((f) => f.name === name && !f.own);
    if (!summary) throw new Error(`El catálogo no trae «${name}»: corre pnpm catalog:load.`);
    const detail = await api.call('GET', `/foods/${summary.id}`);
    expectStatus(detail, 200, `leer «${name}»`);
    foods.set(name, detail.body as Food);
    return detail.body as Food;
  };

  // 1 · La prescripción de G-12 a G-17: la más reciente, o una nueva con la evaluación cerrada más reciente.
  const prescription = async (): Promise<{ id: string; outcome: Outcome }> => {
    const listed = await api.call('GET', `/patients/${patientId}/energy-prescriptions`);
    expectStatus(listed, 200, 'leer las prescripciones de Luis');
    const [latest] = [
      ...(listed.body as { prescriptions: { id: string; createdAt: string }[] }).prescriptions,
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (latest) return { id: latest.id, outcome: 'EXISTING' };
    const evaluations = await api.call('GET', `/patients/${patientId}/evaluations`);
    expectStatus(evaluations, 200, 'leer las evaluaciones de Luis');
    const [current] = (
      evaluations.body as { evaluations: { id: string; status: string; measuredAt: string }[] }
    ).evaluations
      .filter((e) => e.status === 'CLOSED')
      .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt));
    if (!current) throw new Error('Luis no tiene una evaluación cerrada: corre pnpm db:seed.');
    for (let attempt = 1; ; attempt += 1) {
      const created = await api.call('POST', `/patients/${patientId}/energy-prescriptions`, {
        body: { ...luis.energyPrescription, evaluationId: current.id },
      });
      if (created.status === 201)
        return { id: (created.body as { id: string }).id, outcome: 'CREATED' };
      if (attempt >= RESULT_ATTEMPTS) {
        expectStatus(created, 201, 'prescribir la energía de Luis (¿corre el worker?)');
      }
      await wait(RESULT_WAIT_MS);
    }
  };
  const { id: prescriptionId, outcome: prescriptionOutcome } = await prescription();

  // 2 · La receta de P10.
  let recipeOutcome: Outcome = 'EXISTING';
  const recipes = await api.call('GET', `/recipes?q=${encodeURIComponent(data.recipe.name)}`);
  expectStatus(recipes, 200, 'buscar la receta');
  if (
    !(recipes.body as { recipes: { name: string }[] }).recipes.some(
      (r) => r.name === data.recipe.name,
    )
  ) {
    const ingredients = [];
    for (const ingredient of data.recipe.ingredients) {
      ingredients.push({ foodId: (await food(ingredient.food)).id, grams: ingredient.grams });
    }
    const created = await api.call('POST', '/recipes', {
      body: { name: data.recipe.name, servings: data.recipe.servings, ingredients },
    });
    expectStatus(created, 201, 'crear la receta');
    recipeOutcome = 'CREATED';
  }

  // 3 · Los planes: el de intercambios primero y la composición después, que lo reemplaza y queda vigente.
  const plans = await api.call('GET', `/patients/${patientId}/nutrition-plans`);
  expectStatus(plans, 200, 'leer los planes de Luis');
  const summaries = (plans.body as { plans: PlanSummary[] }).plans;
  const done = (modality: PlanSummary['modality']) =>
    summaries.some(
      (p) => p.modality === modality && (p.status === 'PUBLISHED' || p.status === 'SUPERSEDED'),
    );
  /** El borrador que dejó una corrida cortada, o uno nuevo. */
  const draftOf = async (modality: 'EXCHANGES' | 'COMPOSITION', create: object): Promise<Plan> => {
    const pending = summaries.find((p) => p.modality === modality && p.status === 'DRAFT');
    const response = pending
      ? await api.call('GET', `/nutrition-plans/${pending.id}`)
      : await api.call('POST', `/patients/${patientId}/nutrition-plans`, {
          body: { modality, energyPrescriptionId: prescriptionId, ...create },
        });
    expectStatus(response, pending ? 200 : 201, `abrir el borrador de ${modality}`);
    return response.body as Plan;
  };
  const save = async (plan: Plan, body: object, what: string): Promise<Plan> => {
    const response = await api.call('PUT', `/nutrition-plans/${plan.id}`, {
      body,
      ifMatch: plan.version,
    });
    expectStatus(response, 200, what);
    return response.body as Plan;
  };
  const publish = async (plan: Plan, what: string): Promise<void> => {
    const response = await api.call('POST', `/nutrition-plans/${plan.id}/publish`, {
      ifMatch: plan.version,
    });
    expectStatus(response, 200, what);
  };
  const times: Readonly<Record<string, string | undefined>> = data.mealTimes;
  /** Cada tiempo con su hora del día (la del borrador si el JSON no la trae). */
  const header = ({ slotCode, name, timeOfDay, sharePct }: Meal) => ({
    slotCode,
    name,
    timeOfDay: times[slotCode] ?? timeOfDay,
    sharePct,
  });

  const compositionDone = done('COMPOSITION');
  let exchangesOutcome: Outcome = 'EXISTING';
  // Con la composición ya publicada, un plan de intercambios nuevo quedaría vigente: no se crea.
  if (!done('EXCHANGES') && !compositionDone) {
    const lists = await api.call('GET', '/exchange-lists');
    expectStatus(lists, 200, 'leer las listas de intercambio');
    const all = (
      lists.body as {
        lists: {
          id: string;
          code: string;
          groups: { code: string; choG: number; proteinG: number; fatG: number }[];
        }[];
      }
    ).lists;
    const list = all.find((l) => l.code === 'DEMO') ?? all[0];
    if (!list) throw new Error('No hay listas de intercambio publicadas.');
    const { fixedServings, hydrationTargetMl, instructions } = data.exchanges;
    const body = (plan: Plan, allowed: (meal: Meal) => object[]) => ({
      modality: 'EXCHANGES',
      fixedServings,
      overrides: {},
      splitOverrides: {},
      hydrationTargetMl,
      instructions,
      meals: plan.meals.map((meal) => ({ ...header(meal), allowedFoods: allowed(meal) })),
    });
    const draft = await draftOf('EXCHANGES', { exchangeListId: list.id });
    // Primero G-18 y el reparto de G-19; con eso se sabe qué grupos lleva cada tiempo (RN-G05).
    const split = await save(
      draft,
      body(draft, () => []),
      'repartir los intercambios',
    );
    const portions = new Map<string, { foodId: string; grams: number }>();
    for (const [group, names] of Object.entries(data.exchanges.allowedFoods) as [
      Group,
      string[],
    ][]) {
      const exchange = list.groups.find((g) => g.code === group);
      for (const name of names) {
        const detail = await food(name);
        const { macro, nutrient } = DEFINING[group];
        const per100g = detail.nutrients.find((n) => n.code === nutrient)?.valuePer100g ?? null;
        if (!exchange || per100g === null || per100g <= 0) {
          throw new Error(`«${name}» no aporta lo que define a su grupo ${group}.`);
        }
        portions.set(`${group}:${name}`, {
          foodId: detail.id,
          grams: Math.round((exchange[macro] / per100g) * 100),
        });
      }
    }
    const ready = await save(
      split,
      body(split, (meal) =>
        (Object.entries(data.exchanges.allowedFoods) as [Group, string[]][])
          .filter(([group]) => (meal.servings?.[group] ?? 0) > 0)
          .flatMap(([group, names]) =>
            names.map((name) => ({
              groupCode: group,
              ...portions.get(`${group}:${name}`),
              householdText: null,
            })),
          ),
      ),
      'poner los alimentos permitidos',
    );
    await publish(ready, 'publicar la dieta por intercambios');
    exchangesOutcome = 'CREATED';
  }

  let compositionOutcome: Outcome = 'EXISTING';
  if (!compositionDone) {
    const item = async (entry: ItemData) => {
      const detail = await food(entry.food);
      if ('grams' in entry) {
        return { itemType: 'FOOD', foodId: detail.id, grams: entry.grams, householdText: null };
      }
      const measure = detail.measures.find((m) => m.name === entry.measure);
      if (!measure) throw new Error(`«${entry.food}» no tiene la medida «${entry.measure}».`);
      // Como el editor: los gramos de la medida por la cantidad, y la medida como texto (RN-E12).
      return {
        itemType: 'FOOD',
        foodId: detail.id,
        grams: Math.round(measure.grams * entry.amount * 10) / 10,
        householdText: `${String(entry.amount)} × ${measure.name}`,
      };
    };
    // Un tiempo que el JSON no trae (uno propio) queda vacío.
    const byMeal: Readonly<Record<string, readonly ItemData[] | undefined>> =
      data.composition.meals;
    const draft = await draftOf('COMPOSITION', {});
    const meals = [];
    for (const meal of draft.meals) {
      const entries = byMeal[meal.slotCode] ?? [];
      const items = [];
      for (const entry of entries) items.push(await item(entry));
      meals.push({ ...header(meal), items });
    }
    const ready = await save(
      draft,
      {
        modality: 'COMPOSITION',
        meals,
        hydrationTargetMl: data.composition.hydrationTargetMl,
        instructions: data.composition.instructions,
      },
      'poner los alimentos de cada tiempo',
    );
    await publish(ready, 'publicar la dieta por composición');
    compositionOutcome = 'CREATED';
  }

  return {
    prescription: prescriptionOutcome,
    recipe: recipeOutcome,
    exchanges: exchangesOutcome,
    composition: compositionOutcome,
  };
}

/** Luis de la semilla (scripts/seed.ts), en el Consultorio Demo. */
const LUIS_ID = '01920000-0000-7000-8000-0000000000c1';
const OWNER_EMAIL = 'duena@demo.example.com';

/** La API local con la sesión de la dueña demo. */
async function ownerApi(): Promise<DemoApi> {
  try {
    process.loadEnvFile();
  } catch {
    // Sin .env: las variables ya están en el entorno.
  }
  const appEnv = process.env.APP_ENV ?? 'local';
  const password =
    process.env.SEED_DEMO_PASSWORD ?? (appEnv === 'local' ? 'Demostracion-Local-2026' : undefined);
  if (!password) throw new Error('Falta SEED_DEMO_PASSWORD.');
  const base = new URL(process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001').origin;
  const origin = new URL(process.env.APP_URL ?? 'http://localhost:3000').origin;
  const cookieName = process.env.SESSION_COOKIE_NAME ?? 'nc_session';
  let cookie = '';
  const call: DemoApi['call'] = async (method, path, options = {}) => {
    const response = await fetch(`${base}/api/v1${path}`, {
      method,
      headers: {
        Origin: origin,
        Accept: 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(options.ifMatch === undefined ? {} : { 'If-Match': `"${String(options.ifMatch)}"` }),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
    const text = await response.text();
    return { status: response.status, body: text ? (JSON.parse(text) as unknown) : null };
  };
  const login = await fetch(`${base}/api/v1/auth/login`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: OWNER_EMAIL, password }),
  });
  if (login.status !== 200) {
    throw new Error(
      `No se pudo entrar como ${OWNER_EMAIL} (${String(login.status)}): ¿corre la API?`,
    );
  }
  cookie =
    login.headers
      .getSetCookie()
      .find((c) => c.startsWith(`${cookieName}=`))
      ?.split(';')[0] ?? '';
  return { call };
}

const LABELS: Readonly<Record<keyof Demo2Report, string>> = {
  prescription: 'Prescripción energética de Luis',
  recipe: 'Receta «Arroz con pollo»',
  exchanges: 'Dieta por intercambios publicada',
  composition: 'Dieta por composición publicada (vigente)',
};

if (import.meta.main) {
  try {
    const report = await seedDemo2(await ownerApi(), LUIS_ID);
    for (const [key, outcome] of Object.entries(report) as [keyof Demo2Report, Outcome][]) {
      console.log(`${LABELS[key]}: ${outcome === 'CREATED' ? 'creada' : 'ya estaba'}`);
    }
    console.log('Listo: las fichas de los planes las genera el worker en unos segundos.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

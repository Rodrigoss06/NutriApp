import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiHarness, type StaffOrganization } from './support/api-harness.js';
import { errorCode, id as uuid, PG, pool, withContext } from './support/database.js';
import { luisWithPrescription, patientWithConsent } from './support/luis.js';

/**
 * RN-E17 · un plan no lleva un alimento enlazado a una alergia o intolerancia activa del paciente, tampoco dentro de una
 * receta, por HTTP contra PostgreSQL como app_user (07 §12, ADR-074). Lo publicado no cambia (RN-E15): se avisa y se corrige
 * con una versión nueva.
 */

const harness = new ApiHarness();
let org: StaffOrganization;
let cookie: string;
let patientId: string;
let prescriptionId: string;
let filler: string;

interface Plan {
  id: string;
  versionNo: number;
  status: string;
  version: number;
  meals: { slotCode: string; name: string; timeOfDay: string | null; sharePct: number }[];
  publishProblems: string[];
}
interface Problem {
  code: string;
  rule?: string;
  details?: { problems?: string[] };
}
interface Exclusions {
  conditions: {
    conditionId: string;
    kind: string;
    label: string;
    foods: { id: string; name: string }[];
  }[];
  publishedPlan: { id: string; versionNo: number; problems: string[] } | null;
}

const ownFood = async (name: string, as = cookie): Promise<string> => {
  const created = await harness.post(
    '/foods',
    { name, state: 'READY', nutrients: { ENERC_KCAL: 100, PROCNT: 10, FAT: 5, CHOCDF: 5 } },
    as,
  );
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  return (created.body as { id: string }).id;
};

const condition = async (label: string, kind = 'ALLERGY', patient = patientId): Promise<string> => {
  const created = await harness.post(`/patients/${patient}/conditions`, { kind, label }, cookie);
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  return (created.body as { id: string }).id;
};

const link = (conditionId: string, foodIds: readonly string[], as = cookie, patient = patientId) =>
  harness.put(`/patients/${patient}/food-exclusions/${conditionId}`, { foodIds }, as);

const setStatus = (conditionId: string, status: 'ACTIVE' | 'RESOLVED') =>
  harness.patch(`/patients/${patientId}/conditions/${conditionId}`, { status }, cookie);

const exclusions = async (as = cookie) =>
  (await harness.get(`/patients/${patientId}/food-exclusions`, as)).body as Exclusions;

const create = async (modality: 'COMPOSITION' | 'WEEKLY_MENU'): Promise<Plan> => {
  const created = await harness.post(
    `/patients/${patientId}/nutrition-plans`,
    { modality, energyPrescriptionId: prescriptionId },
    cookie,
  );
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  return created.body as Plan;
};
const read = async (plan: Plan): Promise<Plan> =>
  (await harness.get(`/nutrition-plans/${plan.id}`, cookie)).body as Plan;
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
const foodItem = (foodId: string) => ({
  itemType: 'FOOD',
  foodId,
  grams: 100,
  householdText: null,
});

/** Lista para publicar: `lunch` en el almuerzo y un alimento cualquiera en los demás tiempos. */
const compositionBody = (plan: Plan, lunch: readonly string[]) => ({
  modality: 'COMPOSITION',
  meals: headers(plan).map((meal) => ({
    ...meal,
    items: (meal.slotCode === 'LUNCH' ? lunch : [filler]).map(foodItem),
  })),
  hydrationTargetMl: 2_000,
  instructions: null,
});

const menuBody = (plan: Plan, lunchItem: object) => ({
  modality: 'WEEKLY_MENU',
  meals: headers(plan),
  days: Array.from({ length: 7 }, () => ({
    meals: headers(plan).map((meal) => ({
      optionA: [meal.slotCode === 'LUNCH' ? lunchItem : foodItem(filler)],
      optionB: [],
    })),
  })),
  hydrationTargetMl: 2_000,
  instructions: null,
});

beforeAll(async () => {
  await harness.start();
  org = await harness.createStaffOrganization();
  cookie = org.staff.responsible.cookie;
  ({ patientId, prescriptionId } = await luisWithPrescription(harness, org));
  filler = await ownFood('Alimento de relleno');
});

afterAll(async () => {
  await harness.stop();
});

describe('RN-E17 · el plan no lleva un alimento excluido', () => {
  it('una composición con el alimento no se guarda y dice cuál, dónde y por qué; sin él, sí', async () => {
    const peanut = await ownFood('Maní tostado (composición)');
    expect((await link(await condition('Maní'), [peanut])).status).toBe(204);
    const plan = await create('COMPOSITION');

    const refused = await put(plan, compositionBody(plan, [peanut]));

    expect(refused.status).toBe(422);
    expect(refused.body as Problem).toMatchObject({ code: 'NC-NUT-015', rule: 'RN-E17' });
    expect((refused.body as Problem).details?.problems).toEqual([
      'Maní tostado (composición) (Almuerzo): excluido por una alergia, «Maní» (RN-E17).',
    ]);
    expect((await put(plan, compositionBody(plan, [filler]))).status).toBe(200);
  });

  it('una receta con el alimento no entra al menú; el recetario no cambia, porque no tiene paciente', async () => {
    const walnut = await ownFood('Nuez (menú)');
    await link(await condition('Nuez', 'INTOLERANCE'), [walnut]);
    const created = await harness.post(
      '/recipes',
      { name: 'Ensalada con nuez', servings: 1, ingredients: [{ foodId: walnut, grams: 30 }] },
      cookie,
    );
    expect(created.status).toBe(201);
    const recipeId = (created.body as { id: string }).id;
    const plan = await create('WEEKLY_MENU');

    const refused = await put(plan, menuBody(plan, { itemType: 'RECIPE', recipeId, servings: 1 }));

    expect(refused.status).toBe(422);
    expect((refused.body as Problem).code).toBe('NC-NUT-015');
    expect((refused.body as Problem).details?.problems).toEqual([
      'Receta «Ensalada con nuez» (Lunes · Almuerzo, Martes · Almuerzo, Miércoles · Almuerzo y 4 más): lleva Nuez (menú), excluido por una intolerancia, «Nuez» (RN-E17).',
    ]);
  });

  it('enlazado después de guardar: el borrador y la vista previa lo avisan, y no se publica', async () => {
    const soy = await ownFood('Soya (después)');
    const plan = await create('COMPOSITION');
    const body = compositionBody(plan, [soy]);
    const saved = await put(plan, body);
    expect(saved.status).toBe(200);
    await link(await condition('Soya'), [soy]);
    const message = 'Soya (después) (Almuerzo): excluido por una alergia, «Soya» (RN-E17).';

    const draft = await read(plan);
    expect(draft.publishProblems).toEqual([message]);
    const preview = await harness.post(`/nutrition-plans/${plan.id}/preview`, body, cookie);
    expect(preview.status, JSON.stringify(preview.body)).toBe(200);
    expect((preview.body as Plan).publishProblems).toEqual([message]);
    const refused = await publish(draft);
    expect(refused.status).toBe(422);
    expect(refused.body as Problem).toMatchObject({ code: 'NC-NUT-015', rule: 'RN-E17' });
    expect((await read(plan)).status).toBe('DRAFT');
  });

  it('una condición resuelta deja de excluir; reactivada, vuelve a excluir sin enlazar de nuevo', async () => {
    const shrimp = await ownFood('Camarón (resuelta)');
    const conditionId = await condition('Camarón');
    await link(conditionId, [shrimp]);
    const plan = await create('COMPOSITION');
    expect((await put(plan, compositionBody(plan, [shrimp]))).status).toBe(422);

    expect((await setStatus(conditionId, 'RESOLVED')).status).toBe(204);
    expect((await put(plan, compositionBody(plan, [shrimp]))).status).toBe(200);

    expect((await setStatus(conditionId, 'ACTIVE')).status).toBe(204);
    const again = await read(plan);
    expect((await put(again, compositionBody(again, [shrimp]))).status).toBe(422);
  });

  it('RN-E15: lo publicado no cambia; se avisa, y se corrige con una versión nueva', async () => {
    const egg = await ownFood('Huevo (publicado)');
    const plan = await create('COMPOSITION');
    await put(plan, compositionBody(plan, [egg]));
    const published = await publish(await read(plan));
    expect(published.status, JSON.stringify(published.body)).toBe(200);
    expect((await exclusions()).publishedPlan).toBeNull();

    await link(await condition('Huevo'), [egg]);

    const reading = await read(plan);
    expect(reading).toMatchObject({ status: 'PUBLISHED', publishProblems: [] });
    expect((await exclusions()).publishedPlan).toEqual({
      id: plan.id,
      versionNo: plan.versionNo,
      problems: ['Huevo (publicado) (Almuerzo): excluido por una alergia, «Huevo» (RN-E17).'],
    });

    // La versión nueva se crea igual, porque es como se corrige, y no se publica hasta quitarlo.
    const revised = await harness.post(`/nutrition-plans/${plan.id}/revisions`, undefined, cookie);
    expect(revised.status, JSON.stringify(revised.body)).toBe(201);
    const draft = revised.body as Plan;
    expect(draft.publishProblems).toHaveLength(1);
    expect((await publish(draft)).status).toBe(422);
    expect((await put(draft, compositionBody(draft, [filler]))).status).toBe(200);
    expect((await publish(await read(draft))).status).toBe(200);
    expect((await exclusions()).publishedPlan).toBeNull();
  });
});

describe('RN-E17 · enlazar una alergia o intolerancia con sus alimentos', () => {
  it('lista solo las activas, con sus alimentos; enlazar reemplaza la lista y no repite', async () => {
    const [cashew, almond] = [await ownFood('Castaña'), await ownFood('Almendra')];
    const conditionId = await condition('Frutos secos');
    const pending = await condition('Polen');
    const disease = await condition('Hipotiroidismo', 'DISEASE');
    const resolved = await condition('Penicilina');
    await setStatus(resolved, 'RESOLVED');

    expect((await link(conditionId, [cashew, almond, cashew])).status).toBe(204);
    const { conditions } = await exclusions();
    expect(conditions.find((c) => c.conditionId === conditionId)).toEqual({
      conditionId,
      kind: 'ALLERGY',
      label: 'Frutos secos',
      foods: [
        { id: cashew, name: 'Castaña' },
        { id: almond, name: 'Almendra' },
      ],
    });
    expect(conditions.find((c) => c.conditionId === pending)?.foods).toEqual([]);
    const ids = conditions.map((c) => c.conditionId);
    expect(ids).not.toContain(disease);
    expect(ids).not.toContain(resolved);

    await link(conditionId, [almond]);
    const again = await exclusions();
    expect(again.conditions.find((c) => c.conditionId === conditionId)?.foods).toEqual([
      { id: almond, name: 'Almendra' },
    ]);
  });

  it('solo una alergia o intolerancia activa excluye: 422 con RN-E17', async () => {
    const food = await ownFood('Alimento para validar');
    const disease = await condition('Diabetes', 'DISEASE');
    const resolved = await condition('Kiwi');
    await setStatus(resolved, 'RESOLVED');

    for (const conditionId of [disease, resolved, uuid()]) {
      const response = await link(conditionId, [food]);
      expect(response.status).toBe(422);
      expect(response.body as Problem).toMatchObject({ code: 'NC-NUT-016', rule: 'RN-E17' });
    }
  });

  it('RN-I01: un alimento que no existe o es de otra organización no se enlaza', async () => {
    const other = await harness.createStaffOrganization();
    const theirs = await ownFood('Alimento de otra organización', other.staff.responsible.cookie);
    const conditionId = await condition('Otra');

    for (const foodId of [theirs, uuid()]) {
      const response = await link(conditionId, [foodId]);
      expect(response.status).toBe(422);
      expect(response.body as Problem).toMatchObject({ code: 'NC-NUT-017', rule: 'RN-I01' });
    }
    expect((await link(conditionId, ['no-es-un-id'])).status).toBe(400);
  });

  it('RN-A05: con READ, o siendo OWNER fuera del equipo, no se escribe; fuera del equipo no existe', async () => {
    const { team, outsider, owner } = org.staff;
    const food = await ownFood('Alimento para permisos');
    const conditionId = await condition('Permisos');
    const added = await harness.put(
      `/patients/${patientId}/care-team/${team.memberId}`,
      { role: 'COLLABORATOR', access: 'READ' },
      cookie,
    );
    expect(added.status).toBe(204);

    expect((await harness.get(`/patients/${patientId}/food-exclusions`, team.cookie)).status).toBe(
      200,
    );
    const byReader = await link(conditionId, [food], team.cookie);
    expect(byReader.status).toBe(403);
    expect((byReader.body as Problem).code).toBe('NC-CLI-013');
    expect((await link(conditionId, [food], owner.cookie)).status).toBe(403);
    expect(
      (await harness.get(`/patients/${patientId}/food-exclusions`, outsider.cookie)).status,
    ).toBe(404);
    expect((await link(conditionId, [food], outsider.cookie)).status).toBe(404);
  });

  it('un paciente archivado no recibe enlaces nuevos: 409', async () => {
    const archivedId = await patientWithConsent(harness, org, {
      firstName: 'Archivo',
      lastName: 'Sintético',
      sex: 'F',
      birthDate: '1990-01-01',
    });
    const conditionId = await condition('Archivo', 'ALLERGY', archivedId);
    await harness.post(`/patients/${archivedId}/archive`, undefined, cookie);

    const response = await link(conditionId, [filler], cookie, archivedId);

    expect(response.status).toBe(409);
    expect((response.body as Problem).code).toBe('NC-CLI-018');
  });

  it('RN-B03: enlazar queda auditado con el nombre del campo; leer deja su READ', async () => {
    const food = await ownFood('Alimento para auditar');
    const conditionId = await condition('Auditoría');
    await link(conditionId, [food]);
    await harness.deliver('audit.events');

    const { rows } = await pool('owner').query<{ action: string; fields: string[] }>(
      `SELECT action, changed_fields AS fields FROM audit.audit_log
       WHERE resource_type = 'nutrition.food_exclusion' AND resource_id = $1`,
      [conditionId],
    );
    expect(rows).toEqual([{ action: 'UPDATE', fields: ['food_id'] }]);

    await exclusions();
    const reads = await pool('owner').query(
      `SELECT 1 FROM audit.audit_log
       WHERE action = 'READ' AND resource_type = 'nutrition.food_exclusion' AND patient_id = $1`,
      [patientId],
    );
    expect(reads.rowCount).toBeGreaterThan(0);
  });

  it('RN-A01 · RN-A05: como app_user lo ve el equipo; ni el paciente ni otra organización, y no se actualiza', async () => {
    const { responsible, outsider } = org.staff;
    const food = await ownFood('Alimento para RLS');
    const conditionId = await condition('RLS');
    await link(conditionId, [food]);
    const count = 'SELECT 1 FROM nutrition.food_exclusion WHERE condition_id = $1';
    const staff = (member: typeof responsible) => ({
      orgId: org.organizationId,
      userId: member.userId,
      role: 'PROFESSIONAL' as const,
      memberId: member.memberId,
    });

    await withContext('user', staff(responsible), async (client) => {
      expect((await client.query(count, [conditionId])).rowCount).toBe(1);
      expect(
        await errorCode(client, `UPDATE nutrition.food_exclusion SET food_id = $1`, [uuid()]),
      ).toBe(PG.insufficientPrivilege);
    });
    await withContext('user', staff(outsider), async (client) => {
      expect((await client.query(count, [conditionId])).rowCount).toBe(0);
    });
    await withContext(
      'user',
      { orgId: org.organizationId, userId: uuid(), role: 'PATIENT', patientId },
      async (client) => {
        expect((await client.query(count, [conditionId])).rowCount).toBe(0);
        const deleted = await client.query('DELETE FROM nutrition.food_exclusion');
        expect(deleted.rowCount).toBe(0);
      },
    );
    await withContext('user', { orgId: uuid(), role: 'OWNER', userId: uuid() }, async (client) => {
      expect((await client.query(count, [conditionId])).rowCount).toBe(0);
    });
  });
});

import { expect } from '@playwright/test';
import {
  apiAs,
  apiContext,
  linkFromMail,
  mailCount,
  PASSWORD,
  tokenOf,
  uniqueEmail,
} from './stack';

/** La lista de intercambio de demostración (migración de P8). */
const DEMO_LIST = '01926200-0000-7000-8000-000000000001';
const GROUPS = ['VEG', 'FRU', 'MILK', 'STA', 'MEAT', 'FAT'] as const;

interface PlanRead {
  readonly id: string;
  readonly version: number;
  readonly meals: readonly {
    slotCode: string;
    name: string;
    timeOfDay: string | null;
    sharePct: number;
    servings: Readonly<Record<string, number>>;
  }[];
}

/**
 * Un plan por intercambios publicado por la API (G-18): un alimento propio por grupo, de 50 g por porción, en cada tiempo donde el
 * grupo tiene intercambios (RN-G05). Lo que haría el profesional en pantalla, para que la app tenga plan.
 */
export async function publishedExchangePlanByApi(
  ownerEmail: string,
  patientId: string,
): Promise<string> {
  const api = await apiAs(ownerEmail);
  const foods: Record<string, string> = {};
  for (const group of GROUPS) {
    const created = await api.post('/api/v1/foods', {
      data: {
        name: `Alimento ${group} de la app`,
        state: 'READY',
        nutrients: { ENERC_KCAL: 120, PROCNT: 6, FAT: 4, CHOCDF: 15 },
      },
    });
    expect(created.status(), `crear el alimento ${group}`).toBe(201);
    foods[group] = ((await created.json()) as { id: string }).id;
  }
  const prescriptions = await api.get(`/api/v1/patients/${patientId}/energy-prescriptions`);
  const { prescriptions: list } = (await prescriptions.json()) as {
    prescriptions: { id: string }[];
  };
  const created = await api.post(`/api/v1/patients/${patientId}/nutrition-plans`, {
    data: { modality: 'EXCHANGES', energyPrescriptionId: list[0]?.id, exchangeListId: DEMO_LIST },
  });
  expect(created.status(), 'crear el plan').toBe(201);
  let plan = (await created.json()) as PlanRead;
  for (const allowed of [false, true]) {
    const saved = await api.put(`/api/v1/nutrition-plans/${plan.id}`, {
      headers: { 'If-Match': String(plan.version) },
      data: {
        modality: 'EXCHANGES',
        fixedServings: { VEG: 4, FRU: 3, MILK: 3 },
        overrides: {},
        meals: plan.meals.map(({ slotCode, name, timeOfDay, sharePct, servings }) => ({
          slotCode,
          name,
          timeOfDay,
          sharePct,
          allowedFoods: allowed
            ? GROUPS.filter((group) => (servings[group] ?? 0) > 0).map((group) => ({
                groupCode: group,
                foodId: foods[group],
                grams: 50,
                householdText: null,
              }))
            : [],
        })),
        splitOverrides: {},
        hydrationTargetMl: 2_000,
        instructions: 'Toma agua entre comidas.',
      },
    });
    expect(saved.status(), 'guardar el plan').toBe(200);
    plan = (await saved.json()) as PlanRead;
  }
  const published = await api.post(`/api/v1/nutrition-plans/${plan.id}/publish`, {
    headers: { 'If-Match': String(plan.version) },
  });
  expect(published.status(), 'publicar el plan').toBe(200);
  await api.dispose();
  return plan.id;
}

/** El acceso a la app de un paciente ya registrado (RN-A06): invitación a un correo nuevo y aceptación por la API. */
export async function appAccessByApi(staffEmail: string, patientId: string): Promise<string> {
  const email = uniqueEmail();
  const seen = await mailCount(email, '/invitacion');
  const staff = await apiAs(staffEmail);
  const invited = await staff.post(`/api/v1/patients/${patientId}/invitation`, { data: { email } });
  expect(invited.status(), 'invitar al paciente').toBe(201);
  await staff.dispose();
  const token = tokenOf(await linkFromMail(email, '/invitacion', seen));
  const guest = await apiContext();
  const inspected = await guest.post('/api/v1/invitations/inspect', { data: { token } });
  const { consents } = (await inspected.json()) as { consents: { id: string }[] };
  const accepted = await guest.post('/api/v1/invitations/accept', {
    data: { token, password: PASSWORD, acceptedConsentDocumentIds: consents.map((c) => c.id) },
  });
  expect(accepted.status(), 'aceptar la invitación').toBe(200);
  await guest.dispose();
  return email;
}

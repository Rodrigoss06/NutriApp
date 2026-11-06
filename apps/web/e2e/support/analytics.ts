import { randomUUID } from 'node:crypto';
import { expect, type APIRequestContext } from '@playwright/test';
import { apiAs, apiContext, apiLogin, PASSWORD } from './stack';

/** La fecha de Lima de hace n días (RN-G04): Lima no cambia de hora. */
export const limaDate = (daysAgo = 0): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(
    new Date(Date.now() - daysAgo * 86_400_000),
  );

/** Hasta 7 días atrás (RN-G10): así la semana que cerró ayer se registra entera. */
export async function editWindowByApi(ownerEmail: string, days: number): Promise<void> {
  const owner = await apiAs(ownerEmail);
  const saved = await owner.put('/api/v1/organization/settings/tracking.edit_window_days', {
    data: { value: days },
  });
  expect(saved.status(), 'cambiar el plazo de los registros').toBe(200);
  await owner.dispose();
}

/** Un alimento propio de 100 kcal por 100 g: los gramos registrados son las kcal del día. */
export async function hundredKcalFoodByApi(ownerEmail: string): Promise<string> {
  const owner = await apiAs(ownerEmail);
  const created = await owner.post('/api/v1/foods', {
    data: {
      name: 'Guiso de prueba de la analítica',
      state: 'READY',
      nutrients: { ENERC_KCAL: 100, PROCNT: 5, FAT: 3, CHOCDF: 13 },
    },
  });
  expect(created.status(), 'crear el alimento').toBe(201);
  const { id } = (await created.json()) as { id: string };
  await owner.dispose();
  return id;
}

interface MeToday {
  readonly editWindowDays: number;
  readonly target: { readonly kcal: number } | null;
  readonly sessions: readonly unknown[] | null;
}

/** El paciente con su sesión de la app, por la API. */
export async function patientApi(email: string): Promise<APIRequestContext> {
  const api = await apiContext();
  await apiLogin(api, email, PASSWORD);
  return api;
}

/** Espera a que el worker deje lista la app: la meta de hoy del plan y el programa vigente (RN-G03). */
export async function appReady(email: string, ready: (today: MeToday) => boolean): Promise<void> {
  const api = await patientApi(email);
  await expect
    .poll(
      async () => {
        const response = await api.get('/api/v1/me/today');
        return response.ok() && ready((await response.json()) as MeToday);
      },
      { message: 'la app con su plan y su programa', timeout: 30_000, intervals: [500, 1_000] },
    )
    .toBe(true);
  await api.dispose();
}

/**
 * Lo que el paciente registra desde su app, por la API con su sesión, cada uno en su fecha local: con su clientId y su
 * Idempotency-Key (RN-G08, 06 §5).
 */
export async function patientPostsByApi(
  email: string,
  records: readonly {
    readonly path: string;
    readonly localDate: string;
    readonly body: Readonly<Record<string, unknown>>;
  }[],
): Promise<void> {
  const api = await patientApi(email);
  for (const { path, localDate, body } of records) {
    const clientId = randomUUID();
    const response = await api.post(`/api/v1${path}`, {
      headers: { 'Idempotency-Key': `rec:${clientId}` },
      data: { clientId, localDate, ...body },
    });
    expect(response.status(), `registrar ${path} del ${localDate}`).toBe(201);
  }
  await api.dispose();
}

interface ProgramRead {
  readonly id: string;
  readonly version: number;
  readonly document: {
    readonly mesocycles: readonly {
      readonly weeks: readonly {
        readonly id: string;
        readonly sessions: readonly { readonly id: string }[];
      }[];
    }[];
  };
}

export interface StartedProgram {
  readonly programId: string;
  readonly firstSessionId: string;
  readonly exerciseId: string;
}

/**
 * Un programa a mano publicado por la API que empezó hace `daysAgo` días (07 §8), así su semana 1 ya cerró: un mesociclo
 * de 2 semanas, la 1 con factor 1.05 y la 2 con 1.10, cada una con tres sesiones de sentadilla goblet, 3 × 8 con 60 kg.
 */
export async function startedProgramByApi(
  ownerEmail: string,
  patientId: string,
  daysAgo: number,
): Promise<StartedProgram> {
  const api = await apiAs(ownerEmail);
  const profile = await api.put(`/api/v1/patients/${patientId}/athlete-profile`, {
    data: {
      expectedRevision: 0,
      objective: 'HYPERTROPHY',
      level: 'BEGINNER',
      daysPerWeek: 3,
      equipmentCodes: ['FULL_GYM'],
      medicalClearance: 'CLEARED',
      baselineRestingHrBpm: 55,
      baselineHrvMs: 60,
      sleepTargetHours: 8,
    },
  });
  expect(profile.status(), 'guardar el perfil de entrenamiento').toBe(200);
  const search = await api.get('/api/v1/exercises?q=goblet');
  const { exercises } = (await search.json()) as { exercises: { id: string; name: string }[] };
  const squat = exercises.find((exercise) => exercise.name === 'Sentadilla goblet');
  expect(squat, 'la sentadilla goblet de la biblioteca').toBeDefined();
  const exerciseId = squat?.id ?? '';
  const created = await api.post(`/api/v1/patients/${patientId}/training-programs`, {
    data: { name: 'Hipertrofia base', startDate: limaDate(daysAgo) },
  });
  expect(created.status(), 'crear el programa').toBe(201);
  const { id } = (await created.json()) as { id: string };
  let program = (await (await api.get(`/api/v1/training-programs/${id}`)).json()) as ProgramRead;
  const added = await api.post(`/api/v1/training-programs/${id}/mesocycles`, {
    headers: { 'If-Match': String(program.version) },
    data: { name: 'Base', weeks: 2 },
  });
  expect(added.status(), 'agregar el mesociclo').toBe(201);
  program = (await added.json()) as ProgramRead;
  const set = { repsMin: 8, repsMax: 8, loadKind: 'KG', loadValue: 60, restSeconds: 90 };
  const sessions = ['Sesión 1', 'Sesión 2', 'Sesión 3'].map((name) => ({
    name,
    exercises: [{ exerciseId, sets: [set, set, set] }],
  }));
  const weeks = program.document.mesocycles[0]?.weeks ?? [];
  for (const [index, phase] of [
    { phaseEs: 'Acumulación', volumeFactor: 1.05 },
    { phaseEs: 'Hipertrofia', volumeFactor: 1.1 },
  ].entries()) {
    const saved = await api.put(`/api/v1/training-programs/${id}/weeks/${weeks[index]?.id ?? ''}`, {
      headers: { 'If-Match': String(program.version) },
      data: { ...phase, sessions },
    });
    expect(saved.status(), `guardar la semana ${String(index + 1)}`).toBe(200);
    program = (await saved.json()) as ProgramRead;
  }
  const published = await api.post(`/api/v1/training-programs/${id}/publish`, {
    headers: { 'If-Match': String(program.version) },
  });
  expect(published.status(), 'publicar el programa').toBe(200);
  const firstSessionId =
    program.document.mesocycles[0]?.weeks[0]?.sessions[0]?.id ?? '(sin sesión)';
  await api.dispose();
  return { programId: id, firstSessionId, exerciseId };
}

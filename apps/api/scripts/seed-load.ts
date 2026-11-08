/**
 * Generador de carga (P14, PR 7a; RNF-05, criterio 4 de P14; 01 §9; ADR-096): una organización de carga con 15 profesionales y N
 * pacientes con Y años de historia sintética, para medir la analítica con datos realistas. Solo en local y staging.
 *
 * 1. Por SQL, como app_owner: la organización, su suscripción con cupo para todos, la dueña y 15 profesionales con la contraseña demo.
 * 2. Por la API, como la dueña de carga: la plantilla, un paciente con la evaluación ISAK 2 de Luis, su prescripción, un plan por
 *    intercambios y un programa de 12 semanas publicados. Así los snapshots son los que produce la aplicación (RN-E15, RN-F12).
 * 3. Por SQL: los N pacientes con su responsable y HEALTH_DATA, una copia del plan y un programa por cada bloque de 12 semanas (solo
 *    la fila con su snapshot: la analítica y la app leen el snapshot), y cada día de su historia: la meta, las comidas, el agua, el
 *    peso de los lunes, el registro diario, los entrenos con sus series y alguna nota. Los registros van con source IMPORT, y las
 *    particiones se crean desde el mes más antiguo.
 * 4. analytics:rebuild --all calcula los read models desde esos registros, como en producción.
 *
 * Datos sintéticos: ningún nombre ni dato es de una persona real. Corre una vez por base: si la organización de carga ya existe, se
 * detiene sin tocar nada.
 *
 * Uso: pnpm seed:load [--patients 500] [--years 2]
 * Antes: pnpm db:seed, la API y el worker corriendo, y pnpm --filter api build (para la reconstrucción).
 */
import { execFileSync } from 'node:child_process';
import { hash } from '@node-rs/argon2';
import pg from 'pg';
import { v7 as uuidv7 } from 'uuid';
import luis from '../../../seeds/luis/luis.json' with { type: 'json' };

// ─── Constantes ─────────────────────────────────────────────────────────────────────────────────────────────

/** Ids fijos de la organización de carga: correr dos veces no duplica. */
export const LOAD_IDS = {
  organization: '019a3000-0000-7000-8000-0000000000d0',
  subscription: '019a3000-0000-7000-8000-0000000000d1',
  owner: '019a3000-0000-7000-8000-0000000000a1',
  ownerMember: '019a3000-0000-7000-8000-0000000000b1',
} as const;

export const LOAD_OWNER_EMAIL = 'duena@carga.example.com';
export const LOAD_PROFESSIONALS = 15;
export const professionalEmail = (n: number): string =>
  `profesional-${String(n).padStart(2, '0')}@carga.example.com`;
const professionalUserId = (n: number): string =>
  `019a3000-0000-7000-8000-0000000001${n.toString(16).padStart(2, '0')}`;
const professionalMemberId = (n: number): string =>
  `019a3000-0000-7000-8000-0000000002${n.toString(16).padStart(2, '0')}`;

/** Texto provisional de HEALTH_DATA de la migración de clinical (ADR-039). */
const HEALTH_DATA_DOCUMENT = '01926000-0000-7000-8000-000000000001';
/** La lista de intercambio de demostración de la migración de nutrition. */
const DEMO_EXCHANGE_LIST = '01926200-0000-7000-8000-000000000001';
/** Un programa dura 12 semanas (07 §7): la historia se parte en bloques de 84 días. */
export const BLOCK_DAYS = 84;
/** Las tablas particionadas que escribe el generador (PARTITIONED_TABLES de maintenance). */
const PARTITIONED = [
  'tracking.food_log',
  'tracking.hydration_log',
  'tracking.metric_log',
  'tracking.daily_checkin',
  'tracking.workout_log',
  'tracking.set_log',
  'tracking.note_log',
] as const;
const EXCHANGE_GROUPS = ['VEG', 'FRU', 'MILK', 'STA', 'MEAT', 'FAT'] as const;
/** Cinco ejercicios base de cuerpo completo (seeds/exercise/ejercicios-base.csv). */
const TEMPLATE_EXERCISES = [
  { name: 'Sentadilla goblet', loadKg: 16 },
  { name: 'Peso muerto rumano con mancuernas', loadKg: 20 },
  { name: 'Press en máquina', loadKg: 30 },
  { name: 'Remo sentado', loadKg: 30 },
  { name: 'Press de hombros en máquina', loadKg: 15 },
] as const;
const DAY_MS = 86_400_000;
/** Mismos parámetros que Argon2PasswordHasher y db:seed (RNF-13). 2 = Algorithm.Argon2id, un const enum. */
const ARGON2_OPTIONS = { algorithm: 2, memoryCost: 19_456, timeCost: 2, parallelism: 1 };
/** Lima no tiene horario de verano: UTC−5 todo el año. */
const LIMA_OFFSET_HOURS = 5;

// ─── Argumentos y utilidades puras ───────────────────────────────────────────────────────────────────────────

export interface LoadArgs {
  readonly patients: number;
  readonly years: number;
}

/** --patients N (1 a 5 000, por defecto 500) y --years Y (0.1 a 5, por defecto 2). */
export function parseLoadArgs(argv: readonly string[]): LoadArgs {
  const value = (flag: string): string | undefined => {
    const at = argv.indexOf(flag);
    return at === -1 ? undefined : argv[at + 1];
  };
  const patients = Number(value('--patients') ?? 500);
  const years = Number(value('--years') ?? 2);
  if (!Number.isInteger(patients) || patients < 1 || patients > 5_000) {
    throw new Error('--patients va de 1 a 5000.');
  }
  if (!Number.isFinite(years) || years < 0.1 || years > 5) {
    throw new Error('--years va de 0.1 a 5.');
  }
  return { patients, years };
}

export const addDays = (date: string, days: number): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
export const daysFrom = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
const isoWeekday = (date: string): number => new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
/** Una hora local de Lima de ese día, como instante UTC. */
const limaInstant = (date: string, hour: number, minute = 0): string =>
  new Date(
    Date.parse(`${date}T00:00:00Z`) + ((hour + LIMA_OFFSET_HOURS) * 60 + minute) * 60_000,
  ).toISOString();

/** Generador pseudoaleatorio con semilla (mulberry32): la misma semilla da la misma historia. */
export function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const between = (rand: () => number, min: number, max: number): number =>
  min + (max - min) * rand();
const intBetween = (rand: () => number, min: number, max: number): number =>
  Math.floor(between(rand, min, max + 1));
const round1 = (value: number): number => Math.round(value * 10) / 10;

/** Los bloques de 12 semanas de la historia: el último incluye hoy y es el vigente. */
export function programBlocks(
  start: string,
  today: string,
): { readonly startDate: string; readonly endDate: string; readonly current: boolean }[] {
  const count = Math.floor(daysFrom(start, today) / BLOCK_DAYS) + 1;
  return Array.from({ length: count }, (_, i) => {
    const startDate = addDays(start, i * BLOCK_DAYS);
    return { startDate, endDate: addDays(startDate, BLOCK_DAYS - 1), current: i === count - 1 };
  });
}

/**
 * El factor de energía del día frente a la meta: con probabilidad `adherence` cae dentro de ±8 % (en rango, RN-G09); si no, por
 * debajo o por encima.
 */
export function dayFactor(rand: () => number, adherence: number): number {
  if (rand() < adherence) return between(rand, 0.92, 1.08);
  return rand() < 0.65 ? between(rand, 0.6, 0.88) : between(rand, 1.12, 1.35);
}

// ─── Snapshots de la plantilla ───────────────────────────────────────────────────────────────────────────────

interface SnapshotSet {
  readonly setNo: number;
  readonly repsMin: number | null;
  readonly repsMax: number | null;
}
interface SnapshotExercise {
  readonly exerciseId: string;
  readonly name: string;
  readonly primaryMuscles: readonly { readonly code: string }[];
  readonly secondaryMuscles: readonly { readonly code: string }[];
  readonly sets: readonly SnapshotSet[];
}
interface SnapshotSession {
  readonly id: string;
  readonly position: number;
  readonly dayOfWeek: number | null;
  readonly setsByMuscle: Readonly<Record<string, number>>;
  readonly exercises: readonly SnapshotExercise[];
}
interface SnapshotWeek {
  readonly weekNo: number;
  readonly isDeload: boolean;
  readonly sessions: readonly SnapshotSession[];
}
interface ProgramSnapshotShape {
  readonly mesocycles: readonly { readonly id: string; readonly weeks: readonly SnapshotWeek[] }[];
}
interface PlanSnapshotShape {
  readonly meals: readonly {
    readonly slotCode: string;
    readonly sharePct: number | null;
    readonly timeOfDay: string | null;
  }[];
}

/** Las semanas del programa en orden, con su mesociclo. */
export function programWeeks(
  snapshot: ProgramSnapshotShape,
): (SnapshotWeek & { readonly mesocycleId: string })[] {
  return snapshot.mesocycles.flatMap((mesocycle) =>
    mesocycle.weeks.map((week) => ({ ...week, mesocycleId: mesocycle.id })),
  );
}

/**
 * Las sesiones de un día del bloque (07 §8, como tracking): los días 1 a N de cada semana son las sesiones 1 a N y los demás,
 * descanso; una sesión con su día de la semana va ese día. Fuera del programa, null.
 */
export function sessionsOnDay(
  weeks: readonly (SnapshotWeek & { readonly mesocycleId: string })[],
  blockStart: string,
  date: string,
): {
  readonly week: SnapshotWeek & { readonly mesocycleId: string };
  readonly sessions: readonly SnapshotSession[];
} | null {
  const days = daysFrom(blockStart, date);
  if (days < 0) return null;
  const week = weeks[Math.floor(days / 7)];
  if (!week) return null;
  const dayNumber = (days % 7) + 1;
  const weekday = isoWeekday(date);
  return {
    week,
    sessions: week.sessions.filter((session) =>
      session.dayOfWeek === null ? session.position === dayNumber : session.dayOfWeek === weekday,
    ),
  };
}

// ─── Acceso a la base y a la API ─────────────────────────────────────────────────────────────────────────────

/** Una conexión como app_owner, igual que las migraciones y db:seed. */
export interface LoadDb {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
}

/** La API con la sesión de la dueña de carga, como en demo:2. `settle` espera a que el worker procese lo pendiente. */
export interface LoadApi {
  call(
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    options?: { readonly body?: unknown; readonly ifMatch?: number },
  ): Promise<{ readonly status: number; readonly body: unknown }>;
  settle(): Promise<void>;
}

/** Una llamada que debe salir bien (2xx); si no, se detiene con lo que respondió la API. */
async function ok(
  api: LoadApi,
  label: string,
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  options?: { readonly body?: unknown; readonly ifMatch?: number },
): Promise<unknown> {
  const response = await api.call(method, path, options);
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`${label}: ${String(response.status)} ${JSON.stringify(response.body)}`);
  }
  return response.body;
}

/** Inserta filas por lotes con unnest: una ida y vuelta por cada `size` filas. */
class BatchWriter {
  readonly #rows: unknown[][] = [];
  readonly #db: LoadDb;
  readonly #table: string;
  readonly #columns: readonly (readonly [name: string, type: string])[];
  readonly #size: number;
  readonly #before: BatchWriter | null;
  written = 0;

  // Sin propiedades de parámetro: Node corre este script quitando los tipos y no las admite.
  constructor(
    db: LoadDb,
    table: string,
    columns: readonly (readonly [name: string, type: string])[],
    size = 4_000,
    before: BatchWriter | null = null,
  ) {
    this.#db = db;
    this.#table = table;
    this.#columns = columns;
    this.#size = size;
    this.#before = before;
  }

  async push(row: unknown[]): Promise<void> {
    this.#rows.push(row);
    if (this.#rows.length >= this.#size) await this.flush();
  }

  async flush(): Promise<void> {
    // Un set necesita su entreno ya guardado (disparador de restricción, ADR-024).
    if (this.#before) await this.#before.flush();
    if (this.#rows.length === 0) return;
    const names = this.#columns.map(([name]) => name).join(', ');
    const arrays = this.#columns.map(([, type], i) => `$${String(i + 1)}::${type}[]`).join(', ');
    const params = this.#columns.map((_, i) => this.#rows.map((row) => row[i]));
    await this.#db.query(
      `INSERT INTO ${this.#table} (${names}) SELECT * FROM unnest(${arrays})`,
      params,
    );
    this.written += this.#rows.length;
    this.#rows.length = 0;
  }
}

// ─── 1. Organización, dueña y profesionales ─────────────────────────────────────────────────────────────────

/** La organización de carga con su suscripción, la dueña y los profesionales. false si ya existía: no se toca. */
export async function createLoadOrganization(
  db: LoadDb,
  passwordHash: string,
  patients: number,
): Promise<boolean> {
  const exists = await db.query('SELECT 1 FROM tenancy.organization WHERE id = $1', [
    LOAD_IDS.organization,
  ]);
  if (exists.rows.length > 0) return false;
  // El plan de membresía de db:seed (provisional, N9), por si la base no tiene la semilla.
  await db.query(
    `INSERT INTO tenancy.subscription_plan
       (id, code, name, max_active_patients, max_professionals, duration_months, price_cents, currency)
     VALUES ('01920000-0000-7000-8000-000000000050', 'TRAMO_50', 'Tramo 50 (provisional)', 50, 10, 12, 0, 'PEN')
     ON CONFLICT (code) DO NOTHING`,
  );
  const users = [
    [LOAD_IDS.owner, LOAD_OWNER_EMAIL, 'Dueña Carga'],
    ...Array.from({ length: LOAD_PROFESSIONALS }, (_, i) => [
      professionalUserId(i + 1),
      professionalEmail(i + 1),
      `Profesional Carga ${String(i + 1).padStart(2, '0')}`,
    ]),
  ];
  for (const [id, email, displayName] of users) {
    await db.query(
      `INSERT INTO iam.user_account (id, email, email_verified_at, password_hash, display_name, status, is_platform_admin)
       VALUES ($1, $2, now(), $3, $4, 'ACTIVE', false)`,
      [id, email, passwordHash, displayName],
    );
  }
  await db.query(
    `INSERT INTO tenancy.organization (id, name, slug, timezone)
     VALUES ($1, 'Consultorio Carga', 'consultorio-carga', 'America/Lima')`,
    [LOAD_IDS.organization],
  );
  await db.query(
    `INSERT INTO tenancy.subscription
       (id, organization_id, plan_id, status, starts_on, ends_on, price_cents, currency,
        max_active_patients, max_professionals, changed_by, change_reason)
     SELECT $1, $2, p.id, 'ACTIVE', current_date - interval '6 years', current_date + interval '12 months',
            p.price_cents, p.currency, $3, $4, $5, 'Generador de carga'
     FROM tenancy.subscription_plan p WHERE p.code = 'TRAMO_50'`,
    [
      LOAD_IDS.subscription,
      LOAD_IDS.organization,
      patients + 10,
      LOAD_PROFESSIONALS + 5,
      LOAD_IDS.owner,
    ],
  );
  await db.query(
    `INSERT INTO tenancy.member (id, organization_id, user_id, role, status, profession)
     VALUES ($1, $2, $3, 'OWNER', 'ACTIVE', 'NUTRITIONIST')`,
    [LOAD_IDS.ownerMember, LOAD_IDS.organization, LOAD_IDS.owner],
  );
  for (let n = 1; n <= LOAD_PROFESSIONALS; n += 1) {
    await db.query(
      `INSERT INTO tenancy.member (id, organization_id, user_id, role, status, profession)
       VALUES ($1, $2, $3, 'PROFESSIONAL', 'ACTIVE', $4)`,
      [
        professionalMemberId(n),
        LOAD_IDS.organization,
        professionalUserId(n),
        n % 2 === 0 ? 'TRAINER' : 'NUTRITIONIST',
      ],
    );
  }
  return true;
}

// ─── 2. La plantilla por la API ─────────────────────────────────────────────────────────────────────────────

export interface LoadTemplate {
  readonly patientId: string;
  readonly planId: string;
  readonly programId: string;
}

interface Versioned {
  readonly id: string;
  readonly version: number;
}
interface PlanRead extends Versioned {
  readonly meals: readonly {
    readonly slotCode: string;
    readonly name: string;
    readonly timeOfDay: string | null;
    readonly sharePct: number;
    readonly servings: Readonly<Record<string, number>>;
  }[];
}
interface ProgramRead extends Versioned {
  readonly document: {
    readonly mesocycles: readonly { readonly weeks: readonly { readonly id: string }[] }[];
  };
}

/**
 * La plantilla, como la haría un profesional en pantalla: un paciente con HEALTH_DATA (por SQL, el resto por la API), la evaluación
 * ISAK 2 de Luis cerrada, su prescripción (G-12 a G-17), un plan por intercambios y un programa de 12 semanas publicados.
 */
export async function createTemplate(
  db: LoadDb,
  api: LoadApi,
  today: string,
): Promise<LoadTemplate> {
  await ok(
    api,
    'coeficiente de Lee',
    'PUT',
    '/organization/settings/assessment.lee_reference_group_coefficient',
    { body: { value: 0 } },
  );
  const patient = (await ok(api, 'registrar la plantilla', 'POST', '/patients', {
    body: { firstName: 'Plantilla', lastName: 'de Carga', sex: 'M', birthDate: '1998-10-13' },
  })) as { id: string };
  await db.query(
    `INSERT INTO clinical.consent (id, organization_id, patient_id, purpose, consent_document_id, granted_at, channel,
                                   granted_by_user_id)
     VALUES ($1, $2, $3, 'HEALTH_DATA', $4, now(), 'IN_PERSON_DIGITAL', $5)`,
    [uuidv7(), LOAD_IDS.organization, patient.id, HEALTH_DATA_DOCUMENT, LOAD_IDS.owner],
  );

  let evaluation = (await ok(
    api,
    'crear la evaluación',
    'POST',
    `/patients/${patient.id}/evaluations`,
    {
      body: {
        level: 'ISAK2',
        measuredAt: new Date(Date.now() - 3_600_000).toISOString(),
        conditions: { schemaVersion: 1, fasting: true, intenseActivityLast24h: false },
      },
    },
  )) as Versioned;
  for (const [siteCode, attempts] of Object.entries(luis.evaluations.current.measurements)) {
    evaluation = (await ok(
      api,
      `medir ${siteCode}`,
      'PUT',
      `/evaluations/${evaluation.id}/measurements/${siteCode}`,
      { body: { attempts }, ifMatch: evaluation.version },
    )) as Versioned;
  }
  await ok(api, 'cerrar la evaluación', 'POST', `/evaluations/${evaluation.id}/close`, {
    ifMatch: evaluation.version,
  });
  // El worker calcula los resultados al cerrar; la prescripción los necesita.
  let prescription: { id: string } | null = null;
  for (let attempt = 0; attempt < 60 && !prescription; attempt += 1) {
    await api.settle();
    const response = await api.call('POST', `/patients/${patient.id}/energy-prescriptions`, {
      body: { ...luis.energyPrescription, evaluationId: evaluation.id },
    });
    if (response.status === 201) prescription = response.body as { id: string };
  }
  if (!prescription)
    throw new Error('La prescripción de la plantilla no se pudo crear: ¿corre el worker?');

  const foods: Record<string, string> = {};
  for (const group of EXCHANGE_GROUPS) {
    const food = (await ok(api, `crear el alimento ${group}`, 'POST', '/foods', {
      body: {
        name: `Alimento ${group} (carga)`,
        state: 'READY',
        nutrients: { ENERC_KCAL: 120, PROCNT: 6, FAT: 4, CHOCDF: 15 },
      },
    })) as { id: string };
    foods[group] = food.id;
  }
  let plan = (await ok(api, 'crear el plan', 'POST', `/patients/${patient.id}/nutrition-plans`, {
    body: {
      modality: 'EXCHANGES',
      energyPrescriptionId: prescription.id,
      exchangeListId: DEMO_EXCHANGE_LIST,
    },
  })) as PlanRead;
  for (const allowed of [false, true]) {
    plan = (await ok(api, 'guardar el plan', 'PUT', `/nutrition-plans/${plan.id}`, {
      ifMatch: plan.version,
      body: {
        modality: 'EXCHANGES',
        fixedServings: { VEG: 4, FRU: 3, MILK: 3 },
        overrides: {},
        meals: plan.meals.map(({ slotCode, name, timeOfDay, sharePct, servings }) => ({
          slotCode,
          name,
          timeOfDay,
          sharePct,
          allowedFoods: allowed
            ? EXCHANGE_GROUPS.filter((group) => (servings[group] ?? 0) > 0).map((group) => ({
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
    })) as PlanRead;
  }
  await ok(api, 'publicar el plan', 'POST', `/nutrition-plans/${plan.id}/publish`, {
    ifMatch: plan.version,
  });

  await ok(
    api,
    'guardar el perfil de entrenamiento',
    'PUT',
    `/patients/${patient.id}/athlete-profile`,
    {
      body: {
        expectedRevision: 0,
        objective: 'HYPERTROPHY',
        level: 'BEGINNER',
        daysPerWeek: 3,
        equipmentCodes: ['FULL_GYM'],
        medicalClearance: 'CLEARED',
        baselineRestingHrBpm: 58,
        baselineHrvMs: 60,
        sleepTargetHours: 8,
      },
    },
  );
  const exercises: { id: string; loadKg: number }[] = [];
  for (const { name, loadKg } of TEMPLATE_EXERCISES) {
    const found = (await ok(
      api,
      `buscar ${name}`,
      'GET',
      `/exercises?q=${encodeURIComponent(name)}`,
    )) as { exercises: { id: string; name: string }[] };
    const exercise = found.exercises.find((item) => item.name === name);
    if (!exercise) throw new Error(`Falta «${name}» en la biblioteca: corre pnpm catalog:load.`);
    exercises.push({ id: exercise.id, loadKg });
  }
  const created = (await ok(
    api,
    'crear el programa',
    'POST',
    `/patients/${patient.id}/training-programs`,
    {
      body: { name: 'Fuerza general (carga)', startDate: today },
    },
  )) as { id: string };
  let program = (await ok(
    api,
    'leer el programa',
    'GET',
    `/training-programs/${created.id}`,
  )) as ProgramRead;
  for (const name of ['Base', 'Desarrollo', 'Consolidación']) {
    program = (await ok(
      api,
      `agregar el mesociclo ${name}`,
      'POST',
      `/training-programs/${program.id}/mesocycles`,
      { ifMatch: program.version, body: { name, weeks: 4 } },
    )) as ProgramRead;
  }
  const session = (name: string) => ({
    name,
    exercises: exercises.map(({ id, loadKg }) => {
      const set = { repsMin: 8, repsMax: 12, loadKind: 'KG', loadValue: loadKg, restSeconds: 90 };
      return { exerciseId: id, sets: [set, set, set] };
    }),
  });
  const weekIds = program.document.mesocycles.flatMap((mesocycle) =>
    mesocycle.weeks.map((week) => week.id),
  );
  for (const weekId of weekIds) {
    program = (await ok(
      api,
      'guardar la semana',
      'PUT',
      `/training-programs/${program.id}/weeks/${weekId}`,
      {
        ifMatch: program.version,
        body: {
          sessions: [
            session('Cuerpo completo A'),
            session('Cuerpo completo B'),
            session('Cuerpo completo C'),
          ],
        },
      },
    )) as ProgramRead;
  }
  await ok(api, 'publicar el programa', 'POST', `/training-programs/${program.id}/publish`, {
    ifMatch: program.version,
  });
  await api.settle();
  return { patientId: patient.id, planId: plan.id, programId: program.id };
}

// ─── 3. Pacientes, copias e historia por SQL ────────────────────────────────────────────────────────────────

interface PlanTemplateRow {
  readonly target_kcal: string;
  readonly target_cho_g: string;
  readonly target_protein_g: string;
  readonly target_fat_g: string;
  readonly hydration_target_ml: number | null;
  readonly snapshot: PlanSnapshotShape;
}

/** Las columnas de una tabla, para copiar una fila con algunos valores cambiados sin listarlas a mano. */
async function columnsOf(db: LoadDb, table: string): Promise<string[]> {
  const [schema, name] = table.split('.');
  const { rows } = (await db.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`,
    [schema, name],
  )) as { rows: { column_name: string }[] };
  return rows.map((row) => row.column_name);
}

/**
 * Copia la fila de la plantilla una vez por cada elemento de los arreglos: las columnas de `overrides` toman su expresión (con
 * `t` como la fila de la plantilla y `v` como la fila de valores); las demás, el valor de la plantilla.
 */
async function cloneRows(
  db: LoadDb,
  table: string,
  templateId: string,
  values: Readonly<Record<string, { readonly type: string; readonly items: readonly unknown[] }>>,
  overrides: Readonly<Record<string, string>>,
): Promise<void> {
  const columns = await columnsOf(db, table);
  const names = Object.keys(values);
  const unnest = names
    .map((name, i) => `$${String(i + 2)}::${values[name]?.type ?? 'text'}[]`)
    .join(', ');
  const select = columns.map((column) => overrides[column] ?? `t.${column}`).join(', ');
  await db.query(
    `INSERT INTO ${table} (${columns.join(', ')})
     SELECT ${select}
     FROM ${table} t, unnest(${unnest}) AS v(${names.join(', ')})
     WHERE t.id = $1`,
    [templateId, ...names.map((name) => values[name]?.items ?? [])],
  );
}

export interface LoadReport {
  readonly organizationCreated: boolean;
  readonly patients: number;
  readonly days: number;
  readonly rows: Readonly<Record<string, number>>;
}

/** La organización de carga, la plantilla y la historia de cada paciente. Si la organización ya existía, no hace nada. */
export async function seedLoad(
  db: LoadDb,
  apiFor: () => Promise<LoadApi>,
  options: LoadArgs & {
    readonly today: string;
    readonly passwordHash: string;
    readonly seed?: number;
  },
): Promise<LoadReport> {
  const created = await createLoadOrganization(db, options.passwordHash, options.patients);
  if (!created) return { organizationCreated: false, patients: 0, days: 0, rows: {} };
  const template = await createTemplate(db, await apiFor(), options.today);
  const start = addDays(options.today, -Math.round(options.years * 365));
  for (const table of PARTITIONED) {
    await db.query('SELECT app.ensure_monthly_partitions($1::regclass, 3, $2::date)', [
      table,
      start,
    ]);
  }
  const [plan] = (
    await db.query(
      `SELECT target_kcal, target_cho_g, target_protein_g, target_fat_g, hydration_target_ml, snapshot
       FROM nutrition.plan WHERE id = $1`,
      [template.planId],
    )
  ).rows as PlanTemplateRow[];
  const [program] = (
    await db.query('SELECT snapshot FROM training.program WHERE id = $1', [template.programId])
  ).rows as { snapshot: ProgramSnapshotShape }[];
  if (!plan || !program) throw new Error('Falta la plantilla publicada.');
  const weeks = programWeeks(program.snapshot);
  const blocks = programBlocks(start, options.today);
  const rand = random(options.seed ?? 20_261_107);

  // Pacientes, su responsable y HEALTH_DATA.
  const patients = Array.from({ length: options.patients }, (_, i) => ({
    id: uuidv7(),
    n: i + 1,
    member: professionalMemberId((i % LOAD_PROFESSIONALS) + 1),
    planId: uuidv7(),
    programs: blocks.map((block) => ({ ...block, id: uuidv7(), lineageId: uuidv7() })),
  }));
  await db.query(
    `INSERT INTO clinical.patient (id, organization_id, code, first_name, last_name, sex, birth_date, responsible_member_id,
                                   created_by, created_at)
     SELECT v.id, $1, 'P-' || lpad(v.n::text, 6, '0'), 'Paciente ' || lpad((v.n - 1)::text, 4, '0'), 'Carga Sintética',
            v.sex, v.birth_date, v.member, $2, $3::date
     FROM unnest($4::uuid[], $5::int[], $6::bpchar[], $7::date[], $8::uuid[]) AS v(id, n, sex, birth_date, member)`,
    [
      LOAD_IDS.organization,
      LOAD_IDS.owner,
      start,
      patients.map((p) => p.id),
      // El código 1 es de la plantilla, creada por la API.
      patients.map((p) => p.n + 1),
      patients.map((p) => (p.n % 2 === 0 ? 'F' : 'M')),
      patients.map(() => addDays('1965-01-01', intBetween(rand, 0, 365 * 38))),
      patients.map((p) => p.member),
    ],
  );
  await db.query(
    `INSERT INTO platform.counter (organization_id, name, next_value) VALUES ($1, 'patient', $2)
     ON CONFLICT (organization_id, name) DO UPDATE SET next_value = EXCLUDED.next_value`,
    [LOAD_IDS.organization, options.patients + 2],
  );
  await db.query(
    `INSERT INTO clinical.care_team_member (patient_id, member_id, organization_id, role, access, added_by, created_at)
     SELECT v.patient, v.member, $1, 'RESPONSIBLE', 'WRITE', $2, $3::date
     FROM unnest($4::uuid[], $5::uuid[]) AS v(patient, member)`,
    [
      LOAD_IDS.organization,
      LOAD_IDS.owner,
      start,
      patients.map((p) => p.id),
      patients.map((p) => p.member),
    ],
  );
  await db.query(
    `INSERT INTO clinical.consent (id, organization_id, patient_id, purpose, consent_document_id, granted_at, channel,
                                   granted_by_user_id)
     SELECT v.id, $1, v.patient, 'HEALTH_DATA', $2, $3::date, 'IN_PERSON_DIGITAL', $4
     FROM unnest($5::uuid[], $6::uuid[]) AS v(id, patient)`,
    [
      LOAD_IDS.organization,
      HEALTH_DATA_DOCUMENT,
      start,
      LOAD_IDS.owner,
      patients.map(() => uuidv7()),
      patients.map((p) => p.id),
    ],
  );

  // Un plan por paciente y un programa por bloque: solo la fila con su snapshot, copiado de la plantilla.
  const startInstant = limaInstant(start, 9);
  await cloneRows(
    db,
    'nutrition.plan',
    template.planId,
    {
      id: { type: 'uuid', items: patients.map((p) => p.planId) },
      patient: { type: 'uuid', items: patients.map((p) => p.id) },
    },
    {
      id: 'v.id',
      patient_id: 'v.patient',
      lineage_id: 'v.id',
      version_no: '1',
      energy_prescription_id: 'NULL',
      status: `'PUBLISHED'`,
      valid_from: `'${start}'::date`,
      published_at: `'${startInstant}'::timestamptz`,
      created_at: `'${startInstant}'::timestamptz`,
      updated_at: `'${startInstant}'::timestamptz`,
      snapshot: `t.snapshot || jsonb_build_object('planId', v.id, 'lineageId', v.id, 'versionNo', 1, 'patientId', v.patient,
                   'validFrom', '${start}', 'publishedAt', '${startInstant}')`,
      snapshot_hash: `sha256(convert_to((t.snapshot || jsonb_build_object('planId', v.id, 'patientId', v.patient))::text, 'UTF8'))`,
    },
  );
  const programRows = patients.flatMap((p) =>
    p.programs.map((block) => ({ patient: p.id, ...block })),
  );
  await cloneRows(
    db,
    'training.program',
    template.programId,
    {
      id: { type: 'uuid', items: programRows.map((r) => r.id) },
      lineage: { type: 'uuid', items: programRows.map((r) => r.lineageId) },
      patient: { type: 'uuid', items: programRows.map((r) => r.patient) },
      start_on: { type: 'date', items: programRows.map((r) => r.startDate) },
      end_on: { type: 'date', items: programRows.map((r) => r.endDate) },
      state: {
        type: 'text',
        items: programRows.map((r) => (r.current ? 'PUBLISHED' : 'SUPERSEDED')),
      },
      published: { type: 'text', items: programRows.map((r) => limaInstant(r.startDate, 8)) },
    },
    {
      id: 'v.id',
      patient_id: 'v.patient',
      lineage_id: 'v.lineage',
      version_no: '1',
      status: 'v.state',
      start_date: 'v.start_on',
      end_date: 'v.end_on',
      published_at: 'v.published::timestamptz',
      created_at: 'v.published::timestamptz',
      updated_at: 'v.published::timestamptz',
      athlete_profile_id: 'NULL',
      periodization_valid_from: 'NULL',
      snapshot: `t.snapshot || jsonb_build_object('programId', v.id, 'lineageId', v.lineage, 'versionNo', 1, 'patientId', v.patient,
                   'startDate', v.start_on, 'endDate', v.end_on, 'publishedAt', v.published)`,
      snapshot_hash: `sha256(convert_to((t.snapshot || jsonb_build_object('programId', v.id, 'patientId', v.patient))::text, 'UTF8'))`,
    },
  );
  await db.query(
    `INSERT INTO tracking.active_plan_view (patient_id, organization_id, nutrition_plan_id, nutrition_snapshot, training_program_id,
                                            training_snapshot, effective_from)
     SELECT v.patient, $1, v.plan, n.snapshot, v.program, p.snapshot, v.effective
     FROM unnest($2::uuid[], $3::uuid[], $4::uuid[], $5::date[]) AS v(patient, plan, program, effective)
     JOIN nutrition.plan n ON n.id = v.plan
     JOIN training.program p ON p.id = v.program`,
    [
      LOAD_IDS.organization,
      patients.map((p) => p.id),
      patients.map((p) => p.planId),
      patients.map((p) => p.programs.at(-1)?.id),
      patients.map((p) => p.programs.at(-1)?.startDate),
    ],
  );

  // La historia de cada día.
  const org = LOAD_IDS.organization;
  const actor = LOAD_IDS.owner;
  const targets = new BatchWriter(db, 'tracking.daily_target', [
    ['patient_id', 'uuid'],
    ['local_date', 'date'],
    ['organization_id', 'uuid'],
    ['nutrition_plan_id', 'uuid'],
    ['kcal', 'numeric'],
    ['cho_g', 'numeric'],
    ['protein_g', 'numeric'],
    ['fat_g', 'numeric'],
    ['water_ml', 'int'],
    ['planned_sessions', 'smallint'],
    ['planned_sets', 'jsonb'],
  ]);
  const foods = new BatchWriter(db, 'tracking.food_log', [
    ['id', 'uuid'],
    ['local_date', 'date'],
    ['organization_id', 'uuid'],
    ['patient_id', 'uuid'],
    ['logged_at', 'timestamptz'],
    ['meal_slot_code', 'text'],
    ['plan_id', 'uuid'],
    ['item_type', 'text'],
    ['item_name', 'text'],
    ['grams', 'numeric'],
    ['kcal', 'numeric'],
    ['cho_g', 'numeric'],
    ['protein_g', 'numeric'],
    ['fat_g', 'numeric'],
    ['in_plan', 'boolean'],
    ['source', 'text'],
    ['client_id', 'uuid'],
    ['created_by', 'uuid'],
    ['created_at', 'timestamptz'],
  ]);
  const water = new BatchWriter(db, 'tracking.hydration_log', [
    ['id', 'uuid'],
    ['local_date', 'date'],
    ['organization_id', 'uuid'],
    ['patient_id', 'uuid'],
    ['logged_at', 'timestamptz'],
    ['volume_ml', 'int'],
    ['source', 'text'],
    ['client_id', 'uuid'],
    ['created_at', 'timestamptz'],
  ]);
  const metrics = new BatchWriter(db, 'tracking.metric_log', [
    ['id', 'uuid'],
    ['local_date', 'date'],
    ['organization_id', 'uuid'],
    ['patient_id', 'uuid'],
    ['metric_code', 'text'],
    ['value', 'numeric'],
    ['measured_at', 'timestamptz'],
    ['source', 'text'],
    ['client_id', 'uuid'],
    ['created_at', 'timestamptz'],
  ]);
  const checkins = new BatchWriter(db, 'tracking.daily_checkin', [
    ['id', 'uuid'],
    ['local_date', 'date'],
    ['organization_id', 'uuid'],
    ['patient_id', 'uuid'],
    ['stress', 'smallint'],
    ['sleep_hours', 'numeric'],
    ['energy', 'smallint'],
    ['fatigue', 'smallint'],
    ['soreness', 'smallint'],
    ['motivation', 'smallint'],
    ['session_minutes', 'smallint'],
    ['session_rpe', 'numeric'],
    ['program_id', 'uuid'],
    ['week_no', 'smallint'],
    ['session_id', 'uuid'],
    ['nutrition_compliance_pct', 'smallint'],
    ['source', 'text'],
    ['client_id', 'uuid'],
    ['created_at', 'timestamptz'],
  ]);
  const workouts = new BatchWriter(db, 'tracking.workout_log', [
    ['id', 'uuid'],
    ['local_date', 'date'],
    ['organization_id', 'uuid'],
    ['patient_id', 'uuid'],
    ['program_id', 'uuid'],
    ['session_id', 'uuid'],
    ['mesocycle_id', 'uuid'],
    ['week_no', 'smallint'],
    ['is_deload', 'boolean'],
    ['started_at', 'timestamptz'],
    ['finished_at', 'timestamptz'],
    ['outcome', 'text'],
    ['session_rpe', 'numeric'],
    ['stimulus_rating', 'smallint'],
    ['fatigue_rating', 'smallint'],
    ['source', 'text'],
    ['client_id', 'uuid'],
    ['created_at', 'timestamptz'],
  ]);
  const sets = new BatchWriter(
    db,
    'tracking.set_log',
    [
      ['id', 'uuid'],
      ['local_date', 'date'],
      ['organization_id', 'uuid'],
      ['patient_id', 'uuid'],
      ['workout_log_id', 'uuid'],
      ['exercise_id', 'uuid'],
      ['exercise_name', 'text'],
      ['muscle_contributions', 'jsonb'],
      ['set_no', 'smallint'],
      ['reps', 'smallint'],
      ['load_kg', 'numeric'],
      ['rir', 'smallint'],
      ['client_id', 'uuid'],
      ['created_at', 'timestamptz'],
    ],
    4_000,
    workouts,
  );
  const notes = new BatchWriter(db, 'tracking.note_log', [
    ['id', 'uuid'],
    ['local_date', 'date'],
    ['organization_id', 'uuid'],
    ['patient_id', 'uuid'],
    ['body', 'text'],
    ['read_at', 'timestamptz'],
    ['read_by', 'uuid'],
    ['client_id', 'uuid'],
    ['created_at', 'timestamptz'],
  ]);

  const target = {
    kcal: Number(plan.target_kcal),
    cho: Number(plan.target_cho_g),
    protein: Number(plan.target_protein_g),
    fat: Number(plan.target_fat_g),
    water: plan.hydration_target_ml ?? 2_000,
  };
  const meals = plan.snapshot.meals;
  const lastDay = addDays(options.today, -1);
  const totalDays = daysFrom(start, lastDay) + 1;
  for (const patient of patients) {
    const profile = {
      logging: between(rand, 0.75, 0.98),
      adherence: between(rand, 0.45, 0.95),
      training: between(rand, 0.6, 0.95),
      checkin: between(rand, 0.4, 0.9),
      weightKg: between(rand, 55, 100),
      weeklyTrendKg: between(rand, -0.15, 0.05),
      loadFactor: between(rand, 0.7, 1.6),
    };
    for (let d = 0; d < totalDays; d += 1) {
      const date = addDays(start, d);
      const block = patient.programs[Math.floor(d / BLOCK_DAYS)];
      const day = block ? sessionsOnDay(weeks, block.startDate, date) : null;
      const plannedSets: Record<string, number> = {};
      for (const session of day?.sessions ?? []) {
        for (const [muscle, count] of Object.entries(session.setsByMuscle)) {
          plannedSets[muscle] = (plannedSets[muscle] ?? 0) + count;
        }
      }
      await targets.push([
        patient.id,
        date,
        org,
        patient.planId,
        target.kcal,
        target.cho,
        target.protein,
        target.fat,
        target.water,
        day ? day.sessions.length : null,
        day ? JSON.stringify(plannedSets) : null,
      ]);
      const logged = rand() < profile.logging;
      if (logged) {
        const factor = dayFactor(rand, profile.adherence);
        for (const meal of meals) {
          const share = ((meal.sharePct ?? 100 / meals.length) / 100) * factor;
          const hour = meal.timeOfDay ? Number(meal.timeOfDay.slice(0, 2)) : 13;
          const at = limaInstant(date, hour, intBetween(rand, 0, 40));
          await foods.push([
            uuidv7(),
            date,
            org,
            patient.id,
            at,
            meal.slotCode,
            patient.planId,
            'FOOD',
            'Comida del plan (carga)',
            round1(300 * share),
            round1(target.kcal * share),
            round1(target.cho * share),
            round1(target.protein * share),
            round1(target.fat * share),
            true,
            'IMPORT',
            uuidv7(),
            actor,
            at,
          ]);
        }
        const glasses = intBetween(rand, 3, 7);
        for (let g = 0; g < glasses; g += 1) {
          const at = limaInstant(date, 8 + g * 2, intBetween(rand, 0, 50));
          await water.push([
            uuidv7(),
            date,
            org,
            patient.id,
            at,
            intBetween(rand, 250, 500),
            'IMPORT',
            uuidv7(),
            at,
          ]);
        }
      }
      if (isoWeekday(date) === 1 && rand() < 0.8) {
        const at = limaInstant(date, 7, intBetween(rand, 0, 30));
        const weight =
          profile.weightKg + (profile.weeklyTrendKg * d) / 7 + between(rand, -0.6, 0.6);
        await metrics.push([
          uuidv7(),
          date,
          org,
          patient.id,
          'BODY_WEIGHT',
          round1(weight),
          at,
          'IMPORT',
          uuidv7(),
          at,
        ]);
      }
      const trained: { session: SnapshotSession; workoutId: string }[] = [];
      for (const session of day?.sessions ?? []) {
        if (!block || !day || rand() >= profile.training) continue;
        const workoutId = uuidv7();
        const started = limaInstant(date, 18, intBetween(rand, 0, 45));
        const finished = new Date(
          Date.parse(started) + intBetween(rand, 45, 75) * 60_000,
        ).toISOString();
        const partial = rand() < 0.1;
        await workouts.push([
          workoutId,
          date,
          org,
          patient.id,
          block.id,
          session.id,
          day.week.mesocycleId,
          day.week.weekNo,
          day.week.isDeload,
          started,
          finished,
          partial ? 'PARTIAL' : 'COMPLETED',
          round1(between(rand, 6, 8.5)),
          intBetween(rand, 3, 4),
          intBetween(rand, 2, 4),
          'IMPORT',
          uuidv7(),
          finished,
        ]);
        const progress = 1 + 0.004 * Math.floor(d / 7);
        const exercises = partial ? session.exercises.slice(0, -1) : session.exercises;
        for (const [index, exercise] of exercises.entries()) {
          const base = TEMPLATE_EXERCISES[index % TEMPLATE_EXERCISES.length]?.loadKg ?? 20;
          const load = Math.round(base * profile.loadFactor * progress * 2) / 2;
          const contributions = JSON.stringify([
            ...exercise.primaryMuscles.map(({ code }) => ({ muscle: code, weight: 1 })),
            ...exercise.secondaryMuscles.map(({ code }) => ({ muscle: code, weight: 0.5 })),
          ]);
          for (const set of exercise.sets) {
            const reps = intBetween(rand, set.repsMin ?? 8, set.repsMax ?? 12);
            await sets.push([
              uuidv7(),
              date,
              org,
              patient.id,
              workoutId,
              exercise.exerciseId,
              exercise.name,
              contributions,
              set.setNo,
              reps,
              load,
              intBetween(rand, 1, 3),
              uuidv7(),
              finished,
            ]);
          }
        }
        trained.push({ session, workoutId });
      }
      if (rand() < profile.checkin || trained.length > 0) {
        const first = trained[0];
        const at = limaInstant(date, 21, intBetween(rand, 0, 50));
        await checkins.push([
          uuidv7(),
          date,
          org,
          patient.id,
          intBetween(rand, 1, 4),
          round1(between(rand, 5.5, 8.5)),
          intBetween(rand, 2, 5),
          intBetween(rand, 1, 4),
          intBetween(rand, 1, 4),
          intBetween(rand, 2, 5),
          first ? intBetween(rand, 45, 75) : null,
          first ? round1(between(rand, 6, 8.5)) : null,
          first ? block?.id : null,
          first ? day?.week.weekNo : null,
          first ? first.session.id : null,
          intBetween(rand, 60, 100),
          'IMPORT',
          uuidv7(),
          at,
        ]);
      }
      if (rand() < 0.03) {
        const at = limaInstant(date, 20, intBetween(rand, 0, 50));
        // Las de los últimos 3 días siguen sin leer: el panel las muestra (RN-G13).
        const read = d < totalDays - 3;
        await notes.push([
          uuidv7(),
          date,
          org,
          patient.id,
          'Nota sintética de carga.',
          read ? addDays(date, 1) : null,
          read ? patient.member : null,
          uuidv7(),
          at,
        ]);
      }
    }
  }
  for (const writer of [targets, foods, water, metrics, checkins, sets, notes])
    await writer.flush();
  return {
    organizationCreated: true,
    patients: patients.length,
    days: totalDays,
    rows: {
      daily_target: targets.written,
      food_log: foods.written,
      hydration_log: water.written,
      metric_log: metrics.written,
      daily_checkin: checkins.written,
      workout_log: workouts.written,
      set_log: sets.written,
      note_log: notes.written,
      program: programRows.length,
    },
  };
}

// ─── Ejecución ──────────────────────────────────────────────────────────────────────────────────────────────

/** La API local con la sesión de la dueña de carga (como demo:2); el worker procesa aparte, así que `settle` espera un segundo. */
async function loadApi(password: string): Promise<LoadApi> {
  const base = new URL(process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001').origin;
  const origin = new URL(process.env.APP_URL ?? 'http://localhost:3000').origin;
  const cookieName = process.env.SESSION_COOKIE_NAME ?? 'nc_session';
  const login = await fetch(`${base}/api/v1/auth/login`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: LOAD_OWNER_EMAIL, password }),
  });
  if (login.status !== 200) {
    throw new Error(
      `No se pudo entrar como ${LOAD_OWNER_EMAIL} (${String(login.status)}): ¿corre la API?`,
    );
  }
  const cookie =
    login.headers
      .getSetCookie()
      .find((c) => c.startsWith(`${cookieName}=`))
      ?.split(';')[0] ?? '';
  return {
    call: async (method, path, options = {}) => {
      const response = await fetch(`${base}/api/v1${path}`, {
        method,
        headers: {
          Origin: origin,
          Accept: 'application/json',
          Cookie: cookie,
          ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(options.ifMatch === undefined ? {} : { 'If-Match': `"${String(options.ifMatch)}"` }),
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      });
      const text = await response.text();
      return { status: response.status, body: text ? (JSON.parse(text) as unknown) : null };
    },
    settle: () => new Promise((resolve) => setTimeout(resolve, 1_000)),
  };
}

if (import.meta.main) {
  try {
    process.loadEnvFile();
  } catch {
    // Sin .env: las variables ya están en el entorno.
  }
  const appEnv = process.env.APP_ENV ?? 'local';
  if (appEnv !== 'local' && appEnv !== 'staging') {
    console.error(`El generador de carga solo corre en local o staging (APP_ENV=${appEnv}).`);
    process.exit(1);
  }
  const password =
    process.env.SEED_DEMO_PASSWORD ?? (appEnv === 'local' ? 'Demostracion-Local-2026' : undefined);
  const ownerUrl = process.env.DATABASE_OWNER_URL;
  if (!password || !ownerUrl) {
    console.error('Faltan SEED_DEMO_PASSWORD o DATABASE_OWNER_URL.');
    process.exit(1);
  }
  const args = parseLoadArgs(process.argv.slice(2));
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
  const client = new pg.Client({ connectionString: ownerUrl });
  await client.connect();
  const started = Date.now();
  try {
    const passwordHash = await hash(password.normalize('NFKC'), ARGON2_OPTIONS);
    const report = await seedLoad(client, () => loadApi(password), {
      ...args,
      today,
      passwordHash,
    });
    if (!report.organizationCreated) {
      console.log(
        'La organización de carga ya existe: no se generó nada. Para regenerarla, empieza desde una base vacía.',
      );
    } else {
      console.log(
        `Historia lista en ${String(Math.round((Date.now() - started) / 1000))} s: ${String(report.patients)} pacientes, ` +
          `${String(report.days)} días, ${LOAD_OWNER_EMAIL} y ${String(LOAD_PROFESSIONALS)} profesionales.`,
      );
      console.table(report.rows);
      console.log('Reconstruyendo la analítica (analytics:rebuild --all --concurrency 4)…');
      execFileSync(
        process.execPath,
        ['dist/cli/analytics-rebuild.js', '--all', '--concurrency', '4'],
        { stdio: 'inherit' },
      );
      const size = await client.query<{ size: string }>(
        'SELECT pg_size_pretty(pg_database_size(current_database())) AS size',
      );
      console.log(
        `Listo en ${String(Math.round((Date.now() - started) / 1000))} s. Base: ${size.rows[0]?.size ?? '?'}.`,
      );
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

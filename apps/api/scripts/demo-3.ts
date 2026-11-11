/**
 * Semilla de la Demo 3 (P14, PR 7b; ADR-097), con datos sintéticos, sobre lo de demo:2. Dos casos:
 *
 * - Luis (seeds/luis/demo-3.json): la rutina «Fuerza base» y su semana G-20 registrada, para enseñar la analítica de dieta
 *   (1910 kcal de promedio, 104.1 % de adecuación y 4 de 7 días en rango) y de rutina, el control semanal y el panel con datos.
 * - Mateo Prueba (seeds/mateo/demo-3.json): el alumno ficticio de la hoja piloto de Jeremy y su mes de octubre, para comparar la
 *   app con la hoja. El control de sus cuatro semanas da lo que da la hoja: descarga, descarga, continuar y continuar (07 §10).
 *   Su plan tiene los perfiles de día de las respuestas de Jeremy a P-20 (P14.5, ADR-101): Entrenamiento es su prescripción,
 *   2,510 kcal, y Descanso, 2,230; cada día de octubre lleva la meta del perfil que pide su programa.
 *
 * Por la API, como la dueña demo (igual que demo:2): los perfiles de entrenamiento y los programas, publicados (RN-F12). Por SQL,
 * con source IMPORT, lo que la app ya no deja registrar, porque son días cerrados (RN-G10) o porque el profesional no registra por
 * el paciente (RN-G01): las metas de cada día, las comidas, los entrenos con sus series y los registros diarios, cada uno con su
 * recuperación calculada por READINESS_JV como al registrarlo (RN-G14, RN-D01). La ficha de Mateo, su consentimiento, su historia y
 * sus dos evaluaciones también van por SQL, como las de Luis en db:seed: son de octubre y la API las fecharía hoy (RN-B01). Al final
 * reconstruye la analítica de los dos y calcula sus controles semanales (RN-G16), que el coach decide en vivo (RN-F17).
 *
 * Corre con la API y el worker (pnpm dev), después de pnpm db:seed, pnpm catalog:load, pnpm demo:2 y pnpm build. Se puede correr
 * dos veces: lo que ya está no se toca.
 *
 * Uso: pnpm demo:3
 */
import { execFileSync } from 'node:child_process';
import { READINESS_JV, runMethod } from '@nutricoach/engine';
import pg from 'pg';
import { v7 as uuidv7 } from 'uuid';
import luis from '../../../seeds/luis/demo-3.json' with { type: 'json' };
import mateo from '../../../seeds/mateo/demo-3.json' with { type: 'json' };
import periodization from '../../../seeds/training/periodization-v3.json' with { type: 'json' };

/** Luis de la semilla (scripts/seed.ts) y Mateo, los dos en el Consultorio Demo. */
const LUIS_ID = '01920000-0000-7000-8000-0000000000c1';
const MATEO_ID = '01920000-0000-7000-8000-0000000000c7';
const OWNER_EMAIL = 'duena@demo.example.com';
/** El texto de HEALTH_DATA de la migración de clinical, el mismo de db:seed (ADR-039). */
const HEALTH_DATA_DOCUMENT = '01926000-0000-7000-8000-000000000001';
const DAY_MS = 86_400_000;
/** Lima no tiene horario de verano: UTC−5 todo el año. */
const LIMA_OFFSET_HOURS = 5;

export type Outcome = 'CREATED' | 'EXISTING';

/** La API con la sesión de la dueña demo, como en demo:2. */
export interface Demo3Api {
  call(
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    options?: { readonly body?: unknown; readonly ifMatch?: number },
  ): Promise<{ readonly status: number; readonly body: unknown }>;
}

/** Una conexión como app_owner, para lo que va por SQL. */
export interface Demo3Db {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
}

/** El control de una semana (07 §10) como lo devuelve la API. */
export interface WeekReview {
  readonly weekNo: number;
  readonly light: string;
  readonly reasons: readonly string[];
  readonly suggestedAction: string;
}

export interface Demo3Report {
  readonly luis: {
    readonly program: Outcome;
    /** La semana G-20: el lunes y el domingo. */
    readonly week: { readonly from: string; readonly to: string } | null;
    /** El semáforo del control de esa semana, o null si todavía no se calculó. */
    readonly light: string | null;
  };
  readonly mateo: {
    readonly patient: Outcome;
    /** Su plan con los perfiles de día (P14.5): Entrenamiento 2,510 kcal y Descanso 2,230. */
    readonly plan: Outcome;
    readonly program: Outcome;
    /** Los controles de sus semanas cerradas, en orden; vacío si el programa ya estaba. */
    readonly reviews: readonly WeekReview[];
  };
}

const addDays = (date: string, days: number): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
const isoWeekday = (date: string): number => new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
const limaInstant = (date: string, hour: number, minute = 0): string =>
  new Date(
    Date.parse(`${date}T00:00:00Z`) + ((hour + LIMA_OFFSET_HOURS) * 60 + minute) * 60_000,
  ).toISOString();
const limaDate = (instant: Date): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(instant);
const round1 = (value: number): number => Math.round(value * 10) / 10;
const numberOrNull = (value: string | number | null | undefined): number | null =>
  value === null || value === undefined ? null : Number(value);

/** La semana pasada, de lunes a domingo: la de G-20. Un lunes, la que terminó ayer. */
export function lastWeek(today: string): { readonly from: string; readonly to: string } {
  const monday = addDays(today, -(isoWeekday(today) - 1));
  return { from: addDays(monday, -7), to: addDays(monday, -1) };
}

/** Edad decimal como la del dominio (ADR-044), igual que en db:seed: años cumplidos y la fracción entre cumpleaños. */
function decimalAge(birthDate: string, onDate: string): number {
  const [by = 0, bm = 1, bd = 1] = birthDate.split('-').map(Number);
  const [y = 0, m = 1, d = 1] = onDate.split('-').map(Number);
  const day = (year: number, month: number, dayOfMonth: number) => {
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return Date.UTC(year, month - 1, Math.min(dayOfMonth, last)) / DAY_MS;
  };
  const today = day(y, m, d);
  let years = y - by;
  if (day(y, bm, bd) > today) years -= 1;
  const last = day(by + years, bm, bd);
  return years + (today - last) / (day(by + years + 1, bm, bd) - last);
}

async function ok(
  api: Demo3Api,
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

/** Inserta filas con unnest: una ida y vuelta por tabla. */
async function insertRows(
  db: Demo3Db,
  table: string,
  columns: readonly (readonly [name: string, type: string])[],
  rows: readonly unknown[][],
): Promise<void> {
  if (rows.length === 0) return;
  const names = columns.map(([name]) => name).join(', ');
  const arrays = columns.map(([, type], i) => `$${String(i + 1)}::${type}[]`).join(', ');
  await db.query(
    `INSERT INTO ${table} (${names}) SELECT * FROM unnest(${arrays})`,
    columns.map((_, i) => rows.map((row) => row[i])),
  );
}

// ─── API: perfiles y programas ───────────────────────────────────────────────────────────────────────────────

interface ProgramRead {
  readonly id: string;
  readonly version: number;
  readonly document: {
    readonly mesocycles: readonly {
      readonly weeks: readonly { readonly id: string; readonly weekNo: number }[];
    }[];
  };
}

async function programNames(api: Demo3Api, patientId: string): Promise<readonly string[]> {
  const found = (await ok(
    api,
    'leer los programas',
    'GET',
    `/patients/${patientId}/training-programs`,
  )) as { programs: { name: string }[] };
  return found.programs.map((program) => program.name);
}

async function saveAthleteProfile(
  api: Demo3Api,
  patientId: string,
  profile: object,
): Promise<void> {
  const current = (await ok(
    api,
    'leer el perfil de entrenamiento',
    'GET',
    `/patients/${patientId}/athlete-profile`,
  )) as { current: { revision: number } | null };
  await ok(
    api,
    'guardar el perfil de entrenamiento',
    'PUT',
    `/patients/${patientId}/athlete-profile`,
    { body: { expectedRevision: current.current?.revision ?? 0, ...profile } },
  );
}

/** Los ejercicios de la biblioteca por su nombre exacto. */
async function exerciseIds(
  api: Demo3Api,
  names: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  const ids = new Map<string, string>();
  for (const name of new Set(names)) {
    const found = (await ok(
      api,
      `buscar ${name}`,
      'GET',
      `/exercises?q=${encodeURIComponent(name)}`,
    )) as { exercises: { id: string; name: string }[] };
    const exercise = found.exercises.find((item) => item.name === name);
    if (!exercise) throw new Error(`Falta «${name}» en la biblioteca: corre pnpm catalog:load.`);
    ids.set(name, exercise.id);
  }
  return ids;
}

/** Un programa a mano por la API, como en el editor: lo crea, agrega sus mesociclos, guarda cada semana y lo publica (RN-F12). */
async function publishManualProgram(
  api: Demo3Api,
  patientId: string,
  header: { readonly name: string; readonly startDate: string },
  mesocycles: readonly { readonly name: string; readonly weeks: number }[],
  weekBody: (weekNo: number) => object,
): Promise<string> {
  const created = (await ok(
    api,
    'crear el programa',
    'POST',
    `/patients/${patientId}/training-programs`,
    { body: header },
  )) as { id: string };
  let program = (await ok(
    api,
    'leer el programa',
    'GET',
    `/training-programs/${created.id}`,
  )) as ProgramRead;
  for (const mesocycle of mesocycles) {
    program = (await ok(
      api,
      'agregar el mesociclo',
      'POST',
      `/training-programs/${program.id}/mesocycles`,
      { ifMatch: program.version, body: mesocycle },
    )) as ProgramRead;
  }
  for (const week of program.document.mesocycles.flatMap((mesocycle) => mesocycle.weeks)) {
    program = (await ok(
      api,
      'guardar la semana',
      'PUT',
      `/training-programs/${program.id}/weeks/${week.id}`,
      { ifMatch: program.version, body: weekBody(week.weekNo) },
    )) as ProgramRead;
  }
  await ok(api, 'publicar el programa', 'POST', `/training-programs/${program.id}/publish`, {
    ifMatch: program.version,
  });
  return program.id;
}

// ─── SQL: lo registrado ──────────────────────────────────────────────────────────────────────────────────────

interface SnapshotExercise {
  readonly exerciseId: string;
  readonly name: string;
  readonly primaryMuscles: readonly { readonly code: string }[];
  readonly secondaryMuscles: readonly { readonly code: string }[];
  readonly sets: readonly { readonly setNo: number }[];
}
interface SnapshotSession {
  readonly id: string;
  readonly dayOfWeek: number | null;
  readonly setsByMuscle: Readonly<Record<string, number>>;
  readonly exercises: readonly SnapshotExercise[];
}
interface SnapshotWeek {
  readonly weekNo: number;
  readonly isDeload: boolean;
  readonly sessions: readonly SnapshotSession[];
}
interface ProgramSnapshot {
  readonly mesocycles: readonly { readonly id: string; readonly weeks: readonly SnapshotWeek[] }[];
}

async function snapshotOf(db: Demo3Db, programId: string): Promise<ProgramSnapshot> {
  const [program] = (
    await db.query('SELECT snapshot FROM training.program WHERE id = $1', [programId])
  ).rows as { snapshot: ProgramSnapshot }[];
  if (!program) throw new Error('El programa publicado no se encontró.');
  return program.snapshot;
}

/** Las series planificadas por músculo de las sesiones de un día (05.2, planned_sets). */
function plannedSets(sessions: readonly SnapshotSession[]): Record<string, number> {
  const planned: Record<string, number> = {};
  for (const session of sessions) {
    for (const [muscle, n] of Object.entries(session.setsByMuscle)) {
      planned[muscle] = (planned[muscle] ?? 0) + n;
    }
  }
  return planned;
}

/** Los músculos congelados en cada serie, como al registrarla (RN-F06): 1 el principal y 0.5 el secundario. */
const contributions = (exercise: SnapshotExercise): string =>
  JSON.stringify([
    ...exercise.primaryMuscles.map(({ code }) => ({ muscle: code, weight: 1 })),
    ...exercise.secondaryMuscles.map(({ code }) => ({ muscle: code, weight: 0.5 })),
  ]);

const TARGET_COLUMNS = [
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
  ['day_kind', 'text'],
  ['day_profile_code', 'text'],
  ['day_profile_name', 'text'],
] as const;

/** Las metas de cada día (RN-G03): las que ya existían se completan con lo del programa. */
async function upsertTargets(db: Demo3Db, rows: readonly unknown[][]): Promise<void> {
  await db.query(
    `INSERT INTO tracking.daily_target (${TARGET_COLUMNS.map(([name]) => name).join(', ')})
     SELECT * FROM unnest(${TARGET_COLUMNS.map(([, type], i) => `$${String(i + 1)}::${type}[]`).join(', ')})
     ON CONFLICT (patient_id, local_date) DO UPDATE SET
       nutrition_plan_id = EXCLUDED.nutrition_plan_id, kcal = EXCLUDED.kcal, cho_g = EXCLUDED.cho_g,
       protein_g = EXCLUDED.protein_g, fat_g = EXCLUDED.fat_g, water_ml = EXCLUDED.water_ml,
       planned_sessions = EXCLUDED.planned_sessions, planned_sets = EXCLUDED.planned_sets,
       day_kind = EXCLUDED.day_kind, day_profile_code = EXCLUDED.day_profile_code,
       day_profile_name = EXCLUDED.day_profile_name`,
    TARGET_COLUMNS.map((_, i) => rows.map((row) => row[i])),
  );
}

const WORKOUT_COLUMNS = [
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
  ['notes', 'text'],
  ['source', 'text'],
  ['client_id', 'uuid'],
  ['created_at', 'timestamptz'],
] as const;

const SET_COLUMNS = [
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
] as const;

/** Un registro diario por guardar (RN-G11); null es «sin dato». */
interface CheckinDraft {
  readonly localDate: string;
  readonly at: string;
  readonly stress: number | null;
  readonly sleepHours: number | null;
  readonly energy: number | null;
  readonly fatigue: number | null;
  readonly soreness: number | null;
  readonly motivation: number | null;
  readonly sessionMinutes: number | null;
  readonly sessionRpe: number | null;
  readonly programId: string | null;
  readonly weekNo: number | null;
  readonly sessionId: string | null;
  readonly nutritionCompliancePct: number | null;
  readonly performancePlanned: number | null;
  readonly performanceActual: number | null;
}

/**
 * Los registros diarios con su recuperación, como los guarda el registro diario (RN-G14, RN-G15): READINESS_JV con la línea base del
 * perfil vigente y el umbral vigente ese día, con método, versión e insumos con su hash (RN-D01). Las dos rutinas de la demo
 * prescriben un rango de repeticiones y no un tonelaje fijo: el rendimiento es el que escribe el paciente (P-09, ADR-080).
 */
async function insertCheckins(
  db: Demo3Db,
  organizationId: string,
  patientId: string,
  drafts: readonly CheckinDraft[],
): Promise<void> {
  const [profile] = (
    await db.query(
      `SELECT sleep_target_hours, baseline_resting_hr_bpm, baseline_hrv_ms FROM training.athlete_profile
       WHERE patient_id = $1 ORDER BY revision DESC LIMIT 1`,
      [patientId],
    )
  ).rows as {
    sleep_target_hours: string | null;
    baseline_resting_hr_bpm: number | null;
    baseline_hrv_ms: string | null;
  }[];
  const baseline = {
    sleepTargetHours: numberOrNull(profile?.sleep_target_hours),
    restingHrBpm: profile?.baseline_resting_hr_bpm ?? null,
    hrvMs: numberOrNull(profile?.baseline_hrv_ms),
  };
  const checkins: unknown[][] = [];
  const readiness: unknown[][] = [];
  for (const draft of drafts) {
    // El mismo orden que app.readiness_basis: el de la organización antes que el global, y el más reciente.
    const [threshold] = (
      await db.query(
        `SELECT id, neutral_score, readiness_green_min, readiness_red_below, performance_min_pct
         FROM training.readiness_threshold
         WHERE (organization_id = $1 OR organization_id IS NULL) AND valid_from <= $2::date
         ORDER BY (organization_id IS NULL), valid_from DESC LIMIT 1`,
        [organizationId, draft.localDate],
      )
    ).rows as {
      id: string;
      neutral_score: string;
      readiness_green_min: string;
      readiness_red_below: string;
      performance_min_pct: string;
    }[];
    if (!threshold)
      throw new Error(`No hay un umbral de recuperación vigente el ${draft.localDate}.`);
    const run = runMethod(READINESS_JV, {
      day: {
        sessionMinutes: draft.sessionMinutes,
        sessionRpe: draft.sessionRpe,
        sleepHours: draft.sleepHours,
        fatigue: draft.fatigue,
        soreness: draft.soreness,
        stress: draft.stress,
        motivation: draft.motivation,
        menstrualSymptoms: null,
        performancePlanned: draft.performancePlanned,
        performanceActual: draft.performanceActual,
        restingHrBpm: null,
        hrvMs: null,
      },
      baseline,
      thresholds: {
        neutralScore: Number(threshold.neutral_score),
        readinessGreenMin: Number(threshold.readiness_green_min),
        readinessRedBelow: Number(threshold.readiness_red_below),
        performanceMinPct: Number(threshold.performance_min_pct),
      },
    });
    if (!run.ok) throw new Error(`El registro del ${draft.localDate} no pasa READINESS_JV.`);
    const checkinId = uuidv7();
    checkins.push([
      checkinId,
      draft.localDate,
      organizationId,
      patientId,
      draft.stress,
      draft.sleepHours,
      draft.energy,
      draft.fatigue,
      draft.soreness,
      draft.motivation,
      draft.sessionMinutes,
      draft.sessionRpe,
      draft.programId,
      draft.weekNo,
      draft.sessionId,
      draft.nutritionCompliancePct,
      draft.performancePlanned,
      draft.performanceActual,
      'IMPORT',
      uuidv7(),
      draft.at,
    ]);
    const { result } = run;
    readiness.push([
      uuidv7(),
      draft.localDate,
      organizationId,
      patientId,
      checkinId,
      result.methodCode,
      result.methodVersion,
      result.engineVersion,
      threshold.id,
      JSON.stringify(result.inputs),
      result.inputsHash,
      result.outputs.srpeLoad,
      result.outputs.performancePct,
      result.outputs.readinessScore,
      JSON.stringify({
        scores: result.outputs.components,
        neutral: result.outputs.neutralComponents,
      }),
      result.outputs.indication,
      draft.at,
    ]);
  }
  await insertRows(
    db,
    'tracking.daily_checkin',
    [
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
      ['performance_planned', 'numeric'],
      ['performance_actual', 'numeric'],
      ['source', 'text'],
      ['client_id', 'uuid'],
      ['created_at', 'timestamptz'],
    ],
    checkins,
  );
  const columns = [
    'uuid',
    'date',
    'uuid',
    'uuid',
    'uuid',
    'text',
    'text',
    'text',
    'uuid',
    'jsonb',
    'text',
    'numeric',
    'numeric',
    'numeric',
    'jsonb',
    'text',
    'timestamptz',
  ];
  await db.query(
    `INSERT INTO tracking.daily_readiness (id, local_date, organization_id, patient_id, checkin_id, method_code, method_version,
       engine_version, threshold_id, inputs, inputs_hash, srpe_load, performance_pct, readiness_score, components, indication,
       computed_at)
     SELECT r.id, r.local_date, r.organization_id, r.patient_id, r.checkin_id, r.method_code, r.method_version, r.engine_version,
            r.threshold_id, r.inputs, decode(r.inputs_hash, 'hex'), r.srpe_load, r.performance_pct, r.readiness_score,
            r.components, r.indication, r.computed_at
     FROM unnest(${columns.map((type, i) => `$${String(i + 1)}::${type}[]`).join(', ')})
       AS r(id, local_date, organization_id, patient_id, checkin_id, method_code, method_version, engine_version, threshold_id,
            inputs, inputs_hash, srpe_load, performance_pct, readiness_score, components, indication, computed_at)`,
    columns.map((_, i) => readiness.map((row) => row[i])),
  );
}

// ─── Luis ────────────────────────────────────────────────────────────────────────────────────────────────────

interface CurrentPlan {
  readonly id: string;
  readonly target_kcal: string;
  readonly target_cho_g: string;
  readonly target_protein_g: string;
  readonly target_fat_g: string;
  readonly hydration_target_ml: number | null;
  readonly snapshot: {
    readonly meals: readonly {
      readonly slotCode: string;
      readonly sharePct?: number | null;
      readonly timeOfDay?: string | null;
    }[];
  };
}

/** «Fuerza base» de Luis por la API, empezando el lunes de la semana G-20; devuelve su id. */
async function publishLuisProgram(
  api: Demo3Api,
  luisId: string,
  startDate: string,
): Promise<string> {
  await saveAthleteProfile(api, luisId, luis.athleteProfile);
  const ids = await exerciseIds(
    api,
    luis.program.sessions.flatMap((session) => session.exercises.map((exercise) => exercise.name)),
  );
  const { count, repsMin, repsMax, restSeconds } = luis.program.sets;
  const sessions = luis.program.sessions.map((session) => ({
    name: session.name,
    dayOfWeek: session.dayOfWeek,
    exercises: session.exercises.map((exercise) => ({
      exerciseId: ids.get(exercise.name),
      sets: Array.from({ length: count }, () => ({
        repsMin,
        repsMax,
        loadKind: 'KG',
        loadValue: exercise.loadKg,
        restSeconds,
      })),
    })),
  }));
  return publishManualProgram(
    api,
    luisId,
    { name: luis.program.name, startDate },
    [luis.program.mesocycle],
    () => ({ sessions }),
  );
}

/**
 * La semana G-20 de Luis con source IMPORT: metas (con lo programado para el entreno), comidas por tiempo, entrenos con sus series y
 * registros diarios con su recuperación.
 */
async function importLuisWeek(
  db: Demo3Db,
  organizationId: string,
  luisId: string,
  actorUserId: string,
  plan: CurrentPlan,
  programId: string,
  snapshot: ProgramSnapshot,
  week: { readonly from: string; readonly to: string },
): Promise<void> {
  const target = {
    kcal: Number(plan.target_kcal),
    cho: Number(plan.target_cho_g),
    protein: Number(plan.target_protein_g),
    fat: Number(plan.target_fat_g),
  };
  const meals = plan.snapshot.meals;
  const [mesocycle] = snapshot.mesocycles;
  const firstWeek = mesocycle?.weeks[0];
  if (!mesocycle || !firstWeek) throw new Error('El programa no tiene semanas.');
  const targets: unknown[][] = [];
  const foods: unknown[][] = [];
  const workouts: unknown[][] = [];
  const sets: unknown[][] = [];
  const checkins: CheckinDraft[] = [];
  const { workout } = luis.week;
  for (let d = 0; d < 7; d += 1) {
    const date = addDays(week.from, d);
    const sessions = firstWeek.sessions.filter((session) => session.dayOfWeek === isoWeekday(date));
    targets.push([
      luisId,
      date,
      organizationId,
      plan.id,
      target.kcal,
      target.cho,
      target.protein,
      target.fat,
      plan.hydration_target_ml ?? 2_000,
      sessions.length,
      JSON.stringify(plannedSets(sessions)),
      sessions.length > 0 ? 'TRAINING' : 'REST',
      null,
      null,
    ]);
    const kcal = luis.week.kcal[d] ?? target.kcal;
    const factor = kcal / target.kcal;
    for (const meal of meals) {
      const share = (meal.sharePct ?? 100 / meals.length) / 100;
      const at = limaInstant(date, meal.timeOfDay ? Number(meal.timeOfDay.slice(0, 2)) : 13, 10);
      foods.push([
        uuidv7(),
        date,
        organizationId,
        luisId,
        at,
        meal.slotCode,
        plan.id,
        'FOOD',
        'Comida de la semana demo',
        round1(300 * share * factor),
        round1(kcal * share),
        round1(target.cho * share * factor),
        round1(target.protein * share * factor),
        round1(target.fat * share * factor),
        true,
        'IMPORT',
        uuidv7(),
        actorUserId,
        at,
      ]);
    }
    const session = sessions[0];
    if (session) {
      const workoutId = uuidv7();
      const finished = limaInstant(date, 18, workout.minutes);
      workouts.push([
        workoutId,
        date,
        organizationId,
        luisId,
        programId,
        session.id,
        mesocycle.id,
        firstWeek.weekNo,
        firstWeek.isDeload,
        limaInstant(date, 18),
        finished,
        'COMPLETED',
        workout.sessionRpe,
        4,
        3,
        null,
        'IMPORT',
        uuidv7(),
        finished,
      ]);
      const loads =
        luis.program.sessions.find((item) => item.dayOfWeek === session.dayOfWeek)?.exercises ?? [];
      for (const [index, exercise] of session.exercises.entries()) {
        for (const set of exercise.sets) {
          sets.push([
            uuidv7(),
            date,
            organizationId,
            luisId,
            workoutId,
            exercise.exerciseId,
            exercise.name,
            contributions(exercise),
            set.setNo,
            workout.reps,
            loads[index]?.loadKg ?? 20,
            workout.rir,
            uuidv7(),
            finished,
          ]);
        }
      }
    }
    const checkin = luis.week.checkins[d];
    if (checkin) {
      checkins.push({
        localDate: date,
        at: limaInstant(date, 21, 30),
        stress: checkin.stress,
        sleepHours: checkin.sleepHours,
        energy: checkin.energy,
        fatigue: checkin.fatigue,
        soreness: checkin.soreness,
        motivation: checkin.motivation,
        sessionMinutes: session ? workout.minutes : null,
        sessionRpe: session ? workout.sessionRpe : null,
        programId: session ? programId : null,
        weekNo: session ? firstWeek.weekNo : null,
        sessionId: session ? session.id : null,
        nutritionCompliancePct: checkin.nutritionCompliancePct,
        performancePlanned: null,
        performanceActual: null,
      });
    }
  }
  await upsertTargets(db, targets);
  await insertRows(
    db,
    'tracking.food_log',
    [
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
    ],
    foods,
  );
  await insertRows(db, 'tracking.workout_log', WORKOUT_COLUMNS, workouts);
  await insertRows(db, 'tracking.set_log', SET_COLUMNS, sets);
  await insertCheckins(db, organizationId, luisId, checkins);
}

async function weeklyReviews(api: Demo3Api, patientId: string): Promise<readonly WeekReview[]> {
  await ok(
    api,
    'calcular los controles semanales',
    'POST',
    `/patients/${patientId}/weekly-reviews/compute`,
  );
  const found = (await ok(
    api,
    'leer los controles',
    'GET',
    `/patients/${patientId}/weekly-reviews`,
  )) as { reviews: WeekReview[] };
  return found.reviews
    .map(({ weekNo, light, reasons, suggestedAction }) => ({
      weekNo,
      light,
      reasons,
      suggestedAction,
    }))
    .sort((a, b) => a.weekNo - b.weekNo);
}

async function seedLuis(
  api: Demo3Api,
  db: Demo3Db,
  options: Demo3Options,
): Promise<Demo3Report['luis']> {
  const { luisId } = options;
  if ((await programNames(api, luisId)).includes(luis.program.name)) {
    return { program: 'EXISTING', week: null, light: null };
  }
  const [plan] = (
    await db.query(
      `SELECT id, target_kcal, target_cho_g, target_protein_g, target_fat_g, hydration_target_ml, snapshot
       FROM nutrition.plan WHERE patient_id = $1 AND status = 'PUBLISHED'`,
      [luisId],
    )
  ).rows as CurrentPlan[];
  if (!plan) throw new Error('Luis no tiene un plan publicado: corre pnpm demo:2.');
  const place = await placeOf(db, luisId);
  const week = lastWeek(options.today);
  const programId = await publishLuisProgram(api, luisId, week.from);
  await importLuisWeek(
    db,
    place.organizationId,
    luisId,
    place.ownerUserId,
    plan,
    programId,
    await snapshotOf(db, programId),
    week,
  );
  await options.rebuild(luisId);
  const reviews = await weeklyReviews(api, luisId);
  return {
    program: 'CREATED',
    week,
    light: reviews.find((review) => review.weekNo === 1)?.light ?? null,
  };
}

// ─── Mateo ───────────────────────────────────────────────────────────────────────────────────────────────────

/** Dónde vive Luis: su organización, quien lo dio de alta y su responsable, con su rol. Mateo va al mismo lugar. */
interface Place {
  readonly organizationId: string;
  readonly ownerUserId: string;
  readonly responsibleMemberId: string;
  readonly responsibleRole: string;
}

async function placeOf(db: Demo3Db, luisId: string): Promise<Place> {
  const [row] = (
    await db.query(
      `SELECT p.organization_id, p.created_by, p.responsible_member_id, m.role
       FROM clinical.patient p JOIN tenancy.member m ON m.id = p.responsible_member_id
       WHERE p.id = $1`,
      [luisId],
    )
  ).rows as {
    organization_id: string;
    created_by: string;
    responsible_member_id: string;
    role: string;
  }[];
  if (!row) throw new Error('Falta Luis: corre pnpm db:seed.');
  return {
    organizationId: row.organization_id,
    ownerUserId: row.created_by,
    responsibleMemberId: row.responsible_member_id,
    responsibleRole: row.role,
  };
}

/**
 * Mateo, como Luis en db:seed: ficha con correlativo y su responsable, HEALTH_DATA (RN-B01) e historia el día antes de su ciclo, y
 * sus dos evaluaciones básicas con la lectura de bioimpedancia (RN-C08), cerradas (RN-C07). El worker calcula sus resultados al leer
 * el evento de cierre.
 */
async function insertMateo(db: Demo3Db, place: Place, mateoId: string): Promise<void> {
  const registeredAt = new Date(mateo.registeredAt);
  const [counter] = (
    await db.query(
      `INSERT INTO platform.counter AS c (organization_id, name, next_value) VALUES ($1, 'patient', 2)
       ON CONFLICT (organization_id, name) DO UPDATE SET next_value = c.next_value + 1
       RETURNING c.next_value - 1 AS value`,
      [place.organizationId],
    )
  ).rows as { value: string }[];
  await db.query(
    `INSERT INTO clinical.patient (id, organization_id, code, first_name, last_name, sex, birth_date, population,
                                   responsible_member_id, created_by, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)`,
    [
      mateoId,
      place.organizationId,
      `P-${(counter?.value ?? '1').padStart(6, '0')}`,
      mateo.patient.firstName,
      mateo.patient.lastName,
      mateo.patient.sex,
      mateo.birthDate,
      mateo.patient.population,
      place.responsibleMemberId,
      place.ownerUserId,
      registeredAt,
    ],
  );
  await db.query(
    `INSERT INTO clinical.care_team_member (patient_id, member_id, organization_id, role, access, added_by, created_at)
     VALUES ($1, $2, $3, 'RESPONSIBLE', 'WRITE', $4, $5)`,
    [mateoId, place.responsibleMemberId, place.organizationId, place.ownerUserId, registeredAt],
  );
  await db.query(
    `INSERT INTO clinical.consent (id, organization_id, patient_id, purpose, consent_document_id, granted_at, channel,
                                   granted_by_user_id, created_at)
     VALUES ($1, $2, $3, 'HEALTH_DATA', $4, $6, 'IN_PERSON_DIGITAL', $5, $6)`,
    [
      uuidv7(),
      place.organizationId,
      mateoId,
      HEALTH_DATA_DOCUMENT,
      place.ownerUserId,
      new Date(registeredAt.getTime() + 5 * 60_000),
    ],
  );
  await db.query(
    `INSERT INTO clinical.clinical_history (id, organization_id, patient_id, revision, form_code, form_version, answers,
                                            recorded_by, recorded_at)
     VALUES ($1, $2, $3, 1, 'ANAMNESIS', '1', $4, $5, $6)`,
    [
      uuidv7(),
      place.organizationId,
      mateoId,
      JSON.stringify(mateo.clinicalHistory.answers),
      place.ownerUserId,
      new Date(registeredAt.getTime() + 20 * 60_000),
    ],
  );
  for (const evaluation of mateo.evaluations) {
    const id = uuidv7();
    const measuredAt = new Date(evaluation.measuredAt);
    const localDate = limaDate(measuredAt);
    const closedAt = new Date(measuredAt.getTime() + 30 * 60_000);
    await db.query(
      `INSERT INTO assessment.evaluation (id, organization_id, patient_id, evaluator_member_id, kind, level, measured_at,
                                          local_date, conditions, patient_snapshot, created_by)
       VALUES ($1, $2, $3, $4, 'MIXED', 'BASIC', $5, $6, $7, $8, $9)`,
      [
        id,
        place.organizationId,
        mateoId,
        place.responsibleMemberId,
        measuredAt,
        localDate,
        JSON.stringify({
          schemaVersion: 1,
          fasting: true,
          intenseActivityLast24h: false,
          hydration: null,
        }),
        JSON.stringify({
          sex: mateo.patient.sex,
          ageYears: decimalAge(mateo.birthDate, localDate),
          population: mateo.patient.population,
        }),
        place.ownerUserId,
      ],
    );
    // Dos tomas iguales por sitio: la media de 2, sin diferencia (RN-C02).
    for (const [siteCode, value] of [
      ['BASIC_WEIGHT', evaluation.weightKg],
      ['BASIC_HEIGHT', mateo.heightCm],
      ['GIRTH_WAIST', evaluation.waistCm],
      ['GIRTH_HIP', evaluation.hipCm],
    ] as const) {
      await db.query(
        `INSERT INTO assessment.measurement (evaluation_id, site_code, organization_id, attempt_1, attempt_2, attempt_3,
                                             consolidated_value, consolidation, diff_pct)
         VALUES ($1, $2, $3, $4, $4, NULL, $4, 'MEAN_2', 0)`,
        [id, siteCode, place.organizationId, value],
      );
    }
    await db.query(
      `INSERT INTO assessment.bia_reading (id, organization_id, evaluation_id, device_brand, device_model, readings,
                                           entered_by, created_at)
       VALUES ($1, $2, $3, 'Marca Demo', 'BIA-200', $4, $5, $6)`,
      [
        uuidv7(),
        place.organizationId,
        id,
        JSON.stringify([
          { metric: 'FAT_PCT', value: evaluation.fatPct, unit: '%', deviceLabel: 'Grasa corporal' },
        ]),
        place.ownerUserId,
        new Date(measuredAt.getTime() + 20 * 60_000),
      ],
    );
    await db.query(
      `UPDATE assessment.evaluation SET status = 'CLOSED', closed_at = $2, version = version + 1 WHERE id = $1`,
      [id, closedAt],
    );
    await db.query(
      `INSERT INTO platform.outbox_event (id, organization_id, aggregate_type, aggregate_id, event_type, payload,
                                          metadata, occurred_at)
       VALUES ($1, $2, 'assessment.evaluation', $3, 'assessment.evaluation.closed', $4, $5, $6)`,
      [
        uuidv7(),
        place.organizationId,
        id,
        JSON.stringify({
          patientId: mateoId,
          evaluationId: id,
          revision: 1,
          amendsEvaluationId: null,
        }),
        JSON.stringify({ actorUserId: place.ownerUserId, actorRole: place.responsibleRole }),
        closedAt,
      ],
    );
  }
}

/**
 * El umbral global de la V3 vale desde el 21/10/2026, cuando entró en la app, y el mes de Mateo empieza antes. Si ese día la
 * organización no tiene un umbral vigente, toma los mismos valores de la V3 desde esa fecha (07 §11: una fila propia, versionada).
 */
async function ensureThreshold(db: Demo3Db, organizationId: string, from: string): Promise<void> {
  await db.query(
    `INSERT INTO training.readiness_threshold (id, organization_id, valid_from)
     SELECT $1, $2, $3::date
     WHERE NOT EXISTS (SELECT 1 FROM training.readiness_threshold
                       WHERE (organization_id = $2 OR organization_id IS NULL) AND valid_from <= $3::date)`,
    [uuidv7(), organizationId, from],
  );
}

/** El programa «Full Body» de la hoja por la API: el perfil de Mateo y las semanas 1 a 8 con sus fases de la V3 (07 §7). */
async function publishMateoProgram(api: Demo3Api, mateoId: string): Promise<string> {
  await saveAthleteProfile(api, mateoId, mateo.athleteProfile);
  const ids = await exerciseIds(
    api,
    mateo.program.sessions.map((session) => session.exercise),
  );
  const phases = new Map(
    periodization.phases
      .filter((phase) => phase.objective === mateo.athleteProfile.objective)
      .map((phase) => [phase.weekNo, phase]),
  );
  const { count, repsMin, repsMax, restSeconds, tempo } = mateo.program.set;
  return publishManualProgram(
    api,
    mateoId,
    { name: mateo.program.name, startDate: mateo.program.startDate },
    mateo.program.mesocycles,
    (weekNo) => {
      const phase = phases.get(weekNo);
      if (!phase) throw new Error(`La V3 no tiene la semana ${String(weekNo)}.`);
      return {
        isDeload: phase.isDeload,
        phaseEs: phase.phaseEs,
        phaseGoalEs: phase.phaseGoalEs,
        volumeFactor: phase.volumeFactor,
        intensity: phase.intensity,
        targetRir: phase.targetRir,
        reviewKind: phase.reviewKind,
        sessions: mateo.program.sessions.map((session) => ({
          name: session.name,
          dayOfWeek: session.dayOfWeek,
          exercises: [
            {
              exerciseId: ids.get(session.exercise),
              sets: Array.from({ length: count }, () => ({
                repsMin,
                repsMax,
                loadKind: 'RIR',
                loadValue: phase.targetRir,
                restSeconds,
                tempo,
              })),
            },
          ],
        })),
      };
    },
  );
}

/** Una sesión de la hoja: lo que hizo en su ejercicio, o la ausencia con su motivo. */
interface LoggedSession {
  readonly date: string;
  readonly reps?: number;
  readonly loadKg?: number;
  readonly absence?: string;
}

/**
 * El mes de Mateo con source IMPORT: las metas de entrenamiento de cada día, los entrenos de la hoja con sus series (una ausencia
 * quedaría como sesión no hecha, con su motivo; el 22/10 asistió, P-33) y un registro diario por día con los valores de su semana.
 */
/**
 * La meta de un día de Mateo (RN-G03): la del perfil que pide su programa (07 §2, P-20.4). Un día con sesión es Entrenamiento,
 * su prescripción; uno sin sesión, Descanso. Una ausencia no la cambia: nadie reprogramó la sesión (P-20.3).
 */
function mateoTarget(
  organizationId: string,
  mateoId: string,
  date: string,
  planned: readonly SnapshotSession[],
  plan: MateoPlan,
): unknown[] {
  const rest = plan.dayProfiles.find((profile) => profile.code === 'REST');
  const profile =
    planned.length > 0 || !rest
      ? { code: 'TRAINING', name: 'Entrenamiento', ...plan.targets }
      : rest;
  return [
    mateoId,
    date,
    organizationId,
    plan.id,
    profile.kcal,
    profile.choG,
    profile.proteinG,
    profile.fatG,
    plan.hydrationTargetMl,
    planned.length,
    JSON.stringify(plannedSets(planned)),
    planned.length > 0 ? 'TRAINING' : 'REST',
    profile.code,
    profile.name,
  ];
}

/** Las sesiones del programa que caen en cada día del mes de Mateo, semana por semana. */
function mateoDays(
  snapshot: ProgramSnapshot,
): { readonly date: string; readonly planned: readonly SnapshotSession[] }[] {
  const weeks = snapshot.mesocycles.flatMap((mesocycle) => mesocycle.weeks);
  return mateo.weeks.flatMap((logged) => {
    const week = weeks.find((w) => w.weekNo === logged.weekNo);
    const weekStart = addDays(mateo.program.startDate, 7 * (logged.weekNo - 1));
    return Array.from({ length: 7 }, (_, d) => {
      const date = addDays(weekStart, d);
      return {
        date,
        planned: (week?.sessions ?? []).filter((s) => s.dayOfWeek === isoWeekday(date)),
      };
    });
  });
}

interface MateoPlan {
  readonly id: string;
  readonly targets: { kcal: number; choG: number; proteinG: number; fatG: number };
  readonly dayProfiles: readonly {
    code: string;
    name: string;
    kcal: number;
    choG: number;
    proteinG: number;
    fatG: number;
  }[];
  readonly hydrationTargetMl: number;
}

interface FoodHit {
  readonly id: string;
  readonly name: string;
  readonly own: boolean;
}

/**
 * El plan de Mateo por la API (P14.5, ADR-101 y ADR-103): su prescripción con la meta de Entrenamiento de la hoja, 160/310/70 g
 * (2,510 kcal), y la composición con el perfil Descanso, 160/240/70 g (2,230 kcal; mandan los gramos, P-20.2), con menos pan en
 * la media tarde y menos papa en la cena (P-20.5). La prescripción sale de su
 * evaluación del 05/10: la vista previa da su GET y el ajuste lo lleva a 2,510 kcal. Si ya tiene un plan publicado, no se toca.
 */
async function publishMateoPlan(
  api: Demo3Api,
  mateoId: string,
): Promise<{ readonly outcome: Outcome; readonly plan: MateoPlan }> {
  const { nutrition } = mateo;
  const listed = await ok(
    api,
    'leer los planes de Mateo',
    'GET',
    `/patients/${mateoId}/nutrition-plans`,
  );
  const published = (listed as { plans: { id: string; status: string }[] }).plans.find(
    (p) => p.status === 'PUBLISHED',
  );
  if (published) {
    const plan = await ok(api, 'leer el plan de Mateo', 'GET', `/nutrition-plans/${published.id}`);
    return { outcome: 'EXISTING', plan: plan as MateoPlan };
  }

  const evaluations = await ok(
    api,
    'leer las evaluaciones de Mateo',
    'GET',
    `/patients/${mateoId}/evaluations`,
  );
  const [first] = (
    evaluations as { evaluations: { id: string; status: string; measuredAt: string }[] }
  ).evaluations
    .filter((e) => e.status === 'CLOSED')
    .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
  if (!first) throw new Error('Mateo no tiene una evaluación cerrada.');
  const [weighed] = mateo.evaluations;
  if (!weighed) throw new Error('La semilla de Mateo no trae su primera evaluación.');
  const { training } = nutrition;
  const base = {
    ...nutrition.prescription,
    evaluationId: first.id,
    // La proteína y la grasa de la hoja: 160 g con 80 kg es 2 g/kg, y 70 g son el 25.1 % de 2,510 kcal (RN-E07).
    proteinGPerKg: training.proteinG / weighed.weightKg,
    fatPctKcal: ((training.fatG * 9) / training.kcal) * 100,
    targetFatPct: null,
  };
  const preview = (await ok(
    api,
    'calcular el gasto de Mateo',
    'POST',
    `/patients/${mateoId}/energy-prescriptions/preview`,
    {
      body: { ...base, adjustment: { kind: 'KCAL_PER_DAY', kcalPerDay: 0 } },
    },
  )) as { tee: { teeKcal: number } };
  const prescription = (await ok(
    api,
    'prescribir la energía de Mateo',
    'POST',
    `/patients/${mateoId}/energy-prescriptions`,
    {
      body: {
        ...base,
        adjustment: { kind: 'KCAL_PER_DAY', kcalPerDay: training.kcal - preview.tee.teeKcal },
      },
    },
  )) as { id: string };

  const items = [];
  for (const meal of nutrition.meals) {
    const foods = [];
    for (const item of meal.items) {
      const found = (await ok(
        api,
        `buscar «${item.food}»`,
        'GET',
        `/foods?q=${encodeURIComponent(item.food)}&limit=20`,
      )) as { foods: FoodHit[] };
      const food = found.foods.find((f) => f.name === item.food && !f.own);
      if (!food) throw new Error(`El catálogo no trae «${item.food}»: corre pnpm catalog:load.`);
      // Descanso: la cantidad de ese día (P-20.5), solo en los alimentos que la cambian.
      const restGrams = 'restGrams' in item ? item.restGrams : undefined;
      foods.push({
        itemType: 'FOOD',
        foodId: food.id,
        grams: item.grams,
        householdText: null,
        byProfile:
          restGrams === undefined ? {} : { REST: { grams: restGrams, householdText: null } },
      });
    }
    items.push({
      slotCode: meal.slotCode,
      name: meal.name,
      timeOfDay: meal.timeOfDay,
      sharePct: meal.sharePct,
      items: foods,
    });
  }
  const draft = (await ok(
    api,
    'crear el plan de Mateo',
    'POST',
    `/patients/${mateoId}/nutrition-plans`,
    {
      body: { modality: 'COMPOSITION', energyPrescriptionId: prescription.id },
    },
  )) as { id: string; version: number };
  const saved = (await ok(api, 'armar el plan de Mateo', 'PUT', `/nutrition-plans/${draft.id}`, {
    body: {
      modality: 'COMPOSITION',
      meals: items,
      hydrationTargetMl: nutrition.hydrationTargetMl,
      instructions: null,
      dayProfiles: [nutrition.restProfile],
    },
    ifMatch: draft.version,
  })) as { id: string; version: number };
  const plan = await ok(
    api,
    'publicar el plan de Mateo',
    'POST',
    `/nutrition-plans/${saved.id}/publish`,
    { ifMatch: saved.version },
  );
  return { outcome: 'CREATED', plan: plan as MateoPlan };
}

async function importMateoMonth(
  db: Demo3Db,
  organizationId: string,
  mateoId: string,
  programId: string,
  snapshot: ProgramSnapshot,
  plan: MateoPlan,
): Promise<void> {
  const weeks = snapshot.mesocycles.flatMap((mesocycle) =>
    mesocycle.weeks.map((week) => ({ mesocycleId: mesocycle.id, week })),
  );
  const targets: unknown[][] = [];
  const workouts: unknown[][] = [];
  const sets: unknown[][] = [];
  const checkins: CheckinDraft[] = [];
  const { startTime, minutes } = mateo.workout;
  const startHour = Number(startTime.slice(0, 2));
  const startMinute = Number(startTime.slice(3, 5));
  for (const logged of mateo.weeks) {
    const place = weeks.find(({ week }) => week.weekNo === logged.weekNo);
    if (!place) throw new Error(`El programa no tiene la semana ${String(logged.weekNo)}.`);
    const weekStart = addDays(mateo.program.startDate, 7 * (logged.weekNo - 1));
    for (let d = 0; d < 7; d += 1) {
      const date = addDays(weekStart, d);
      const planned = place.week.sessions.filter(
        (session) => session.dayOfWeek === isoWeekday(date),
      );
      targets.push(mateoTarget(organizationId, mateoId, date, planned, plan));
      const entry: LoggedSession | undefined = logged.sessions.find((item) => item.date === date);
      const session = planned[0];
      const trained = entry !== undefined && session !== undefined && entry.absence === undefined;
      if (entry && session) {
        const workoutId = uuidv7();
        const started = limaInstant(date, startHour, startMinute);
        const finished = limaInstant(date, startHour, startMinute + minutes);
        workouts.push([
          workoutId,
          date,
          organizationId,
          mateoId,
          programId,
          session.id,
          place.mesocycleId,
          logged.weekNo,
          place.week.isDeload,
          trained ? started : null,
          trained ? finished : null,
          trained ? 'COMPLETED' : 'SKIPPED',
          null,
          null,
          null,
          entry.absence ?? null,
          'IMPORT',
          uuidv7(),
          finished,
        ]);
        if (trained) {
          for (const exercise of session.exercises) {
            for (const set of exercise.sets) {
              sets.push([
                uuidv7(),
                date,
                organizationId,
                mateoId,
                workoutId,
                exercise.exerciseId,
                exercise.name,
                contributions(exercise),
                set.setNo,
                entry.reps,
                entry.loadKg,
                logged.rir,
                uuidv7(),
                finished,
              ]);
            }
          }
        }
      }
      checkins.push({
        localDate: date,
        at: limaInstant(date, 21, 30),
        stress: logged.stress,
        sleepHours: logged.sleepHours,
        energy: null,
        fatigue: logged.fatigue,
        soreness: null,
        motivation: null,
        sessionMinutes: trained ? minutes : 0,
        sessionRpe: null,
        programId: trained ? programId : null,
        weekNo: trained ? logged.weekNo : null,
        sessionId: trained ? session.id : null,
        // La alimentación va en el check-in del domingo (P-21, P-22; ADR-109), no en el registro de cada día.
        nutritionCompliancePct: null,
        performancePlanned: trained ? 100 : null,
        performanceActual: trained ? logged.performancePct : null,
      });
    }
  }
  await upsertTargets(db, targets);
  await insertRows(db, 'tracking.workout_log', WORKOUT_COLUMNS, workouts);
  await insertRows(db, 'tracking.set_log', SET_COLUMNS, sets);
  await insertCheckins(db, organizationId, mateoId, checkins);
  // El check-in de cada domingo con la alimentación de la hoja: 78, 82, 88 y 92 % (ADR-109). La semana de 7 días que empieza un
  // martes tiene su domingo en el sexto día.
  await insertRows(
    db,
    'tracking.weekly_checkin',
    WEEKLY_CHECKIN_COLUMNS,
    mateo.weeks.map((logged) => {
      const weekStart = addDays(mateo.program.startDate, 7 * (logged.weekNo - 1));
      const sunday = addDays(weekStart, (7 - isoWeekday(weekStart)) % 7);
      return [
        uuidv7(),
        organizationId,
        mateoId,
        sunday,
        uuidv7(),
        sunday,
        logged.nutritionCompliancePct,
        limaInstant(sunday, 21, 30),
      ];
    }),
  );
}

const WEEKLY_CHECKIN_COLUMNS = [
  ['id', 'uuid'],
  ['organization_id', 'uuid'],
  ['patient_id', 'uuid'],
  ['week_date', 'date'],
  ['client_id', 'uuid'],
  ['logged_on', 'date'],
  ['nutrition_compliance_pct', 'smallint'],
  ['created_at', 'timestamptz'],
] as const;

async function seedMateo(
  api: Demo3Api,
  db: Demo3Db,
  options: Demo3Options,
): Promise<Demo3Report['mateo']> {
  const { mateoId } = options;
  const place = await placeOf(db, options.luisId);
  const exists = (await db.query('SELECT 1 FROM clinical.patient WHERE id = $1', [mateoId])).rows
    .length;
  if (!exists) await insertMateo(db, place, mateoId);
  const patient: Outcome = exists ? 'EXISTING' : 'CREATED';
  const { outcome: planOutcome, plan } = await publishMateoPlan(api, mateoId);
  if ((await programNames(api, mateoId)).includes(mateo.program.name)) {
    if (planOutcome === 'CREATED') {
      // Un mes ya importado sin plan (una demo anterior a P14.5): sus metas toman ahora la del perfil de cada día.
      const [row] = (
        await db.query(
          `SELECT id FROM training.program WHERE patient_id = $1 AND name = $2 AND status = 'PUBLISHED'`,
          [mateoId, mateo.program.name],
        )
      ).rows as { id: string }[];
      if (row) {
        const snapshot = await snapshotOf(db, row.id);
        await upsertTargets(
          db,
          mateoDays(snapshot).map(({ date, planned }) =>
            mateoTarget(place.organizationId, mateoId, date, planned, plan),
          ),
        );
        await options.rebuild(mateoId);
      }
    }
    return { patient, plan: planOutcome, program: 'EXISTING', reviews: [] };
  }
  const programId = await publishMateoProgram(api, mateoId);
  await ensureThreshold(db, place.organizationId, mateo.registeredAt.slice(0, 10));
  await importMateoMonth(
    db,
    place.organizationId,
    mateoId,
    programId,
    await snapshotOf(db, programId),
    plan,
  );
  await options.rebuild(mateoId);
  return {
    patient,
    plan: planOutcome,
    program: 'CREATED',
    reviews: await weeklyReviews(api, mateoId),
  };
}

export interface Demo3Options {
  readonly luisId: string;
  readonly mateoId: string;
  /** Hoy en Lima: la semana G-20 de Luis es la anterior. */
  readonly today: string;
  /** Recalcula la analítica de un paciente desde sus registros (analytics:rebuild --patient). */
  readonly rebuild: (patientId: string) => Promise<void>;
}

/** Los dos casos de la Demo 3. Lo que ya está no se toca. */
export async function seedDemo3(
  api: Demo3Api,
  db: Demo3Db,
  options: Demo3Options,
): Promise<Demo3Report> {
  const luisReport = await seedLuis(api, db, options);
  const mateoReport = await seedMateo(api, db, options);
  return { luis: luisReport, mateo: mateoReport };
}

/** La API local con la sesión de la dueña demo (como demo:2). */
async function ownerApi(password: string): Promise<Demo3Api> {
  const base = new URL(process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001').origin;
  const origin = new URL(process.env.APP_URL ?? 'http://localhost:3000').origin;
  const cookieName = process.env.SESSION_COOKIE_NAME ?? 'nc_session';
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
  };
}

const lightLabel = (review: WeekReview): string =>
  `semana ${String(review.weekNo)}: ${review.light} (${review.suggestedAction})`;

if (import.meta.main) {
  try {
    process.loadEnvFile();
  } catch {
    // Sin .env: las variables ya están en el entorno.
  }
  const appEnv = process.env.APP_ENV ?? 'local';
  const password =
    process.env.SEED_DEMO_PASSWORD ?? (appEnv === 'local' ? 'Demostracion-Local-2026' : undefined);
  const ownerUrl = process.env.DATABASE_OWNER_URL;
  if (appEnv !== 'local' && appEnv !== 'staging') {
    console.error(`La semilla de la Demo 3 solo corre en local o staging (APP_ENV=${appEnv}).`);
    process.exit(1);
  }
  if (!password || !ownerUrl) {
    console.error('Faltan SEED_DEMO_PASSWORD o DATABASE_OWNER_URL.');
    process.exit(1);
  }
  const today = limaDate(new Date());
  const client = new pg.Client({ connectionString: ownerUrl });
  await client.connect();
  try {
    const report = await seedDemo3(await ownerApi(password), client, {
      luisId: LUIS_ID,
      mateoId: MATEO_ID,
      today,
      rebuild: (patientId) => {
        execFileSync(process.execPath, ['dist/cli/analytics-rebuild.js', '--patient', patientId], {
          stdio: 'inherit',
        });
        return Promise.resolve();
      },
    });
    console.log(
      report.luis.program === 'EXISTING'
        ? 'Luis ya tiene «Fuerza base»: no se cambió nada.'
        : `Luis: «Fuerza base» publicada y su semana G-20 (${report.luis.week?.from ?? ''} a ${report.luis.week?.to ?? ''}) ` +
            `registrada. Control de la semana 1: ${report.luis.light ?? 'sin calcular'}.`,
    );
    console.log(
      report.mateo.plan === 'EXISTING'
        ? 'Mateo ya tiene su plan publicado.'
        : 'Mateo: plan publicado con Entrenamiento (2,510 kcal) y Descanso (2,230 kcal).',
    );
    console.log(
      report.mateo.program === 'EXISTING'
        ? 'Mateo ya tiene «Full Body»: no se cambió su mes.'
        : `Mateo: ficha ${report.mateo.patient === 'CREATED' ? 'creada' : 'ya existía'}, «Full Body» publicada y su mes ` +
            `registrado. Controles: ${report.mateo.reviews.map(lightLabel).join('; ')}.`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

/**
 * Semilla de local y staging (P5): planes de membresía provisionales (N9), una organización demo con dueño y
 * profesional y un PLATFORM_ADMIN demo. Idempotente: ids fijos y ON CONFLICT DO NOTHING. Datos sintéticos.
 *
 * P7: el caso Luis de seeds/luis/luis.json para la Demo 1 (ADR-044): paciente con HEALTH_DATA e historia, el
 * coeficiente de Lee de la organización, el estudio de ETM de la dueña y dos evaluaciones ISAK 2 cerradas. Sus
 * resultados los calcula el worker al procesar los eventos de cierre, igual que en producción. Las fechas son
 * relativas a hoy en Lima: la evaluación actual es de hoy y Luis cumple 28 años hoy (G-13).
 *
 * Corre como app_owner (DATABASE_OWNER_URL), igual que las migraciones. Nunca en producción. En staging la
 * contraseña demo llega en SEED_DEMO_PASSWORD; en local tiene un valor fijo.
 *
 * Uso: pnpm db:seed
 */
import { hash } from '@node-rs/argon2';
import pg from 'pg';
import { v7 as uuidv7 } from 'uuid';
import luis from '../../../seeds/luis/luis.json' with { type: 'json' };

try {
  process.loadEnvFile();
} catch {
  // Sin .env: las variables ya están en el entorno.
}

const APP_ENV = process.env.APP_ENV ?? 'local';
if (APP_ENV !== 'local' && APP_ENV !== 'staging') {
  console.error(`La semilla solo corre en local o staging (APP_ENV=${APP_ENV}).`);
  process.exit(1);
}
const password =
  process.env.SEED_DEMO_PASSWORD ?? (APP_ENV === 'local' ? 'Demostracion-Local-2026' : undefined);
if (!password || Array.from(password.normalize('NFKC')).length < 10) {
  console.error('Falta SEED_DEMO_PASSWORD (10 caracteres o más) para la semilla de staging.');
  process.exit(1);
}
const ownerUrl = process.env.DATABASE_OWNER_URL;
if (!ownerUrl) {
  console.error('Falta DATABASE_OWNER_URL.');
  process.exit(1);
}

/** Mismos parámetros que Argon2PasswordHasher (RNF-13). 2 = Algorithm.Argon2id, un const enum. */
const ARGON2_OPTIONS = { algorithm: 2, memoryCost: 19_456, timeCost: 2, parallelism: 1 };
const passwordHash = await hash(password.normalize('NFKC'), ARGON2_OPTIONS);

const IDS = {
  planTramo5: '01920000-0000-7000-8000-000000000005',
  planTramo50: '01920000-0000-7000-8000-000000000050',
  organization: '01920000-0000-7000-8000-0000000000d0',
  subscription: '01920000-0000-7000-8000-0000000000d1',
  owner: '01920000-0000-7000-8000-0000000000a1',
  professional: '01920000-0000-7000-8000-0000000000a2',
  platformAdmin: '01920000-0000-7000-8000-0000000000a3',
  ownerMember: '01920000-0000-7000-8000-0000000000b1',
  professionalMember: '01920000-0000-7000-8000-0000000000b2',
  luis: '01920000-0000-7000-8000-0000000000c1',
  luisConsent: '01920000-0000-7000-8000-0000000000c2',
  luisHistory: '01920000-0000-7000-8000-0000000000c3',
  luisPrevious: '01920000-0000-7000-8000-0000000000e1',
  luisCurrent: '01920000-0000-7000-8000-0000000000e2',
} as const;

/** Texto provisional de HEALTH_DATA de la migración de clinical (ADR-039). */
const HEALTH_DATA_DOCUMENT = '01926000-0000-7000-8000-000000000001';

const client = new pg.Client({ connectionString: ownerUrl });
await client.connect();
try {
  await client.query('BEGIN');
  // Planes: límites y precios PROVISIONALES hasta que el cliente cierre N9.
  await client.query(
    `INSERT INTO tenancy.subscription_plan
       (id, code, name, max_active_patients, max_professionals, duration_months, price_cents, currency)
     VALUES ($1, 'TRAMO_5', 'Tramo 5 (provisional)', 5, 2, 12, 0, 'PEN'),
            ($2, 'TRAMO_50', 'Tramo 50 (provisional)', 50, 10, 12, 0, 'PEN')
     ON CONFLICT (code) DO NOTHING`,
    [IDS.planTramo5, IDS.planTramo50],
  );
  await client.query(
    `INSERT INTO iam.user_account
       (id, email, email_verified_at, password_hash, display_name, status, is_platform_admin)
     VALUES ($1, 'duena@demo.example.com', now(), $4, 'Dueña Demo', 'ACTIVE', false),
            ($2, 'profesional@demo.example.com', now(), $4, 'Profesional Demo', 'ACTIVE', false),
            ($3, 'plataforma@demo.example.com', now(), $4, 'Plataforma Demo', 'ACTIVE', true)
     ON CONFLICT (email) DO NOTHING`,
    [IDS.owner, IDS.professional, IDS.platformAdmin, passwordHash],
  );
  await client.query(
    `INSERT INTO tenancy.organization (id, name, slug, timezone)
     VALUES ($1, 'Consultorio Demo', 'consultorio-demo', 'America/Lima')
     ON CONFLICT DO NOTHING`,
    [IDS.organization],
  );
  await client.query(
    `INSERT INTO tenancy.subscription
       (id, organization_id, plan_id, status, starts_on, ends_on, price_cents, currency,
        max_active_patients, max_professionals, changed_by, change_reason)
     SELECT $1, $2, p.id, 'ACTIVE', current_date, current_date + interval '12 months' - interval '1 day',
            p.price_cents, p.currency, p.max_active_patients, p.max_professionals, $3, 'Semilla demo'
     FROM tenancy.subscription_plan p WHERE p.code = 'TRAMO_5'
     ON CONFLICT DO NOTHING`,
    [IDS.subscription, IDS.organization, IDS.platformAdmin],
  );
  await client.query(
    `INSERT INTO tenancy.member (id, organization_id, user_id, role, status, profession)
     VALUES ($1, $3, $4, 'OWNER', 'ACTIVE', 'NUTRITIONIST'),
            ($2, $3, $5, 'PROFESSIONAL', 'ACTIVE', 'TRAINER')
     ON CONFLICT DO NOTHING`,
    [IDS.ownerMember, IDS.professionalMember, IDS.organization, IDS.owner, IDS.professional],
  );
  await seedLuis(client);
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}

console.log(
  `Semilla lista (${APP_ENV}): duena@, profesional@ y plataforma@demo.example.com, y el caso Luis` +
    (APP_ENV === 'local'
      ? ' con la contraseña Demostracion-Local-2026.'
      : ' con SEED_DEMO_PASSWORD.'),
);

// ─── Caso Luis (P7) ──────────────────────────────────────────────────────────────────────────────────────────

/** Hoy en Lima, como YYYY-MM-DD. */
function todayInLima(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function addDays(date: string, days: number): string {
  const instant = new Date(`${date}T00:00:00Z`);
  instant.setUTCDate(instant.getUTCDate() + days);
  return instant.toISOString().slice(0, 10);
}

/** Edad decimal como la del dominio (ADR-044): años cumplidos y la fracción entre cumpleaños. */
function decimalAge(birthDate: string, onDate: string): number {
  const [by = 0, bm = 1, bd = 1] = birthDate.split('-').map(Number);
  const [y = 0, m = 1, d = 1] = onDate.split('-').map(Number);
  const day = (year: number, month: number, dayOfMonth: number) => {
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return Date.UTC(year, month - 1, Math.min(dayOfMonth, last)) / 86_400_000;
  };
  const today = day(y, m, d);
  let years = y - by;
  if (day(y, bm, bd) > today) years -= 1;
  const last = day(by + years, bm, bd);
  return years + (today - last) / (day(by + years + 1, bm, bd) - last);
}

/** Consolidado ISAK (RN-C03): media de dos tomas, mediana de tres; las del caso Luis no piden tercera. */
function consolidated(attempts: number[]): { value: number; method: string; diffPct: number } {
  const [first = 0, second = 0] = attempts;
  const sorted = [...attempts].sort((a, b) => a - b);
  return attempts.length === 3
    ? {
        value: sorted[1] ?? 0,
        method: 'MEDIAN_3',
        diffPct: (Math.abs(second - first) / first) * 100,
      }
    : {
        value: (first + second) / 2,
        method: 'MEAN_2',
        diffPct: (Math.abs(second - first) / first) * 100,
      };
}

/** ETM = √(Σd² / 2n) y %ETM = ETM / media × 100 (RN-C05); la API lo recalcula desde los pares. */
function technicalError(pairs: [number, number][]): { abs: number; relPct: number } {
  const n = pairs.length;
  const abs = Math.sqrt(pairs.reduce((total, [a, b]) => total + (a - b) ** 2, 0) / (2 * n));
  const mean = pairs.reduce((total, [a, b]) => total + a + b, 0) / (2 * n);
  return { abs, relPct: (abs / mean) * 100 };
}

async function seedLuis(db: pg.Client): Promise<void> {
  const exists = await db.query('SELECT 1 FROM clinical.patient WHERE id = $1', [IDS.luis]);
  if (exists.rowCount) return;
  const today = todayInLima();
  const birthDate = `${Number(today.slice(0, 4)) - luis.patient.ageYearsAtCurrentEvaluation}${today.slice(4)}`;
  const [{ value: number } = { value: '1' }] = (
    await db.query<{ value: string }>(
      `INSERT INTO platform.counter AS c (organization_id, name, next_value) VALUES ($1, 'patient', 2)
       ON CONFLICT (organization_id, name) DO UPDATE SET next_value = c.next_value + 1
       RETURNING c.next_value - 1 AS value`,
      [IDS.organization],
    )
  ).rows;
  await db.query(
    `INSERT INTO clinical.patient (id, organization_id, code, first_name, last_name, sex, birth_date, population,
                                   responsible_member_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      IDS.luis,
      IDS.organization,
      `P-${number.padStart(6, '0')}`,
      luis.patient.firstName,
      luis.patient.lastName,
      luis.patient.sex,
      birthDate,
      luis.patient.population,
      IDS.ownerMember,
      IDS.owner,
    ],
  );
  await db.query(
    `INSERT INTO clinical.care_team_member (patient_id, member_id, organization_id, role, access, added_by)
     VALUES ($1, $2, $3, 'RESPONSIBLE', 'WRITE', $4)`,
    [IDS.luis, IDS.ownerMember, IDS.organization, IDS.owner],
  );
  await db.query(
    `INSERT INTO clinical.consent (id, organization_id, patient_id, purpose, consent_document_id, granted_at, channel,
                                   granted_by_user_id)
     VALUES ($1, $2, $3, 'HEALTH_DATA', $4, now(), 'IN_PERSON_DIGITAL', $5)`,
    [IDS.luisConsent, IDS.organization, IDS.luis, HEALTH_DATA_DOCUMENT, IDS.owner],
  );
  await db.query(
    `INSERT INTO clinical.clinical_history (id, organization_id, patient_id, revision, form_code, form_version, answers,
                                            recorded_by)
     VALUES ($1, $2, $3, 1, 'ANAMNESIS', '1', $4, $5)`,
    [
      IDS.luisHistory,
      IDS.organization,
      IDS.luis,
      JSON.stringify(luis.clinicalHistory.answers),
      IDS.owner,
    ],
  );
  await db.query(
    `INSERT INTO tenancy.organization_setting (organization_id, key, value, updated_by)
     VALUES ($1, 'assessment.lee_reference_group_coefficient', to_jsonb($2::numeric), $3)
     ON CONFLICT DO NOTHING`,
    [
      IDS.organization,
      luis.organizationSettings['assessment.lee_reference_group_coefficient'],
      IDS.owner,
    ],
  );
  const study = luis.technicalErrorStudy;
  for (const site of study.sites) {
    const pairs = site.pairs as [number, number][];
    const tem = technicalError(pairs);
    await db.query(
      `INSERT INTO assessment.evaluator_error (id, organization_id, member_id, site_code, tem_abs, tem_rel_pct, source,
                                               sample_size, valid_from, pairs)
       VALUES ($1, $2, $3, $4, $5, $6, 'CALCULATED', $7, $8, $9)`,
      [
        uuidv7(),
        IDS.organization,
        IDS.ownerMember,
        site.siteCode,
        tem.abs,
        tem.relPct,
        pairs.length,
        addDays(today, -study.daysBeforeCurrentEvaluation),
        JSON.stringify(pairs),
      ],
    );
  }
  for (const [id, evaluation] of [
    [IDS.luisPrevious, luis.evaluations.previous],
    [IDS.luisCurrent, luis.evaluations.current],
  ] as const) {
    const localDate = addDays(today, -evaluation.daysBeforeCurrentEvaluation);
    // Lima no tiene horario de verano: UTC−5.
    const measuredAt = new Date(`${localDate}T${evaluation.localTime}:00-05:00`);
    const closedAt = new Date(measuredAt.getTime() + 45 * 60_000);
    await db.query(
      `INSERT INTO assessment.evaluation (id, organization_id, patient_id, evaluator_member_id, kind, level, measured_at,
                                          local_date, conditions, patient_snapshot, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        id,
        IDS.organization,
        IDS.luis,
        IDS.ownerMember,
        evaluation.kind,
        evaluation.level,
        measuredAt,
        localDate,
        JSON.stringify(evaluation.conditions),
        JSON.stringify({
          sex: luis.patient.sex,
          ageYears: decimalAge(birthDate, localDate),
          population: luis.patient.population,
        }),
        IDS.owner,
      ],
    );
    for (const [siteCode, attempts] of Object.entries(evaluation.measurements)) {
      const { value, method, diffPct } = consolidated(attempts);
      await db.query(
        `INSERT INTO assessment.measurement (evaluation_id, site_code, organization_id, attempt_1, attempt_2, attempt_3,
                                             consolidated_value, consolidation, diff_pct)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          id,
          siteCode,
          IDS.organization,
          attempts[0],
          attempts[1] ?? null,
          attempts[2] ?? null,
          value,
          method,
          diffPct,
        ],
      );
    }
    // Las tomas solo entran en borrador (RN-C07): se cierra al final, como en la consulta.
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
        IDS.organization,
        id,
        JSON.stringify({
          patientId: IDS.luis,
          evaluationId: id,
          revision: 1,
          amendsEvaluationId: null,
        }),
        JSON.stringify({ actorUserId: IDS.owner, actorRole: 'OWNER' }),
        closedAt,
      ],
    );
  }
}

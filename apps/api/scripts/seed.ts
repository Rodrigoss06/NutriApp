/**
 * Semilla de local y staging (P5): planes de membresía provisionales (N9), una organización demo con dueño y
 * profesional y un PLATFORM_ADMIN demo. Idempotente: ids fijos y ON CONFLICT DO NOTHING. Datos sintéticos.
 *
 * Corre como app_owner (DATABASE_OWNER_URL), igual que las migraciones. Nunca en producción. En staging la
 * contraseña demo llega en SEED_DEMO_PASSWORD; en local tiene un valor fijo.
 *
 * Uso: pnpm db:seed
 */
import { hash } from '@node-rs/argon2';
import pg from 'pg';

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
} as const;

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
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}

console.log(
  `Semilla lista (${APP_ENV}): duena@, profesional@ y plataforma@demo.example.com` +
    (APP_ENV === 'local'
      ? ' con la contraseña Demostracion-Local-2026.'
      : ' con SEED_DEMO_PASSWORD.'),
);

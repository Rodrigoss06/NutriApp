import { describe, expect, it } from 'vitest';
import { errorCode, PG, pool, withContext } from './support/database.js';

/** Esquemas de negocio (05 §2): los que lista schema.prisma. */
const BUSINESS_SCHEMAS = [
  'iam',
  'tenancy',
  'clinical',
  'assessment',
  'food',
  'nutrition',
  'exercise',
  'training',
  'tracking',
  'scheduling',
  'content',
  'documents',
  'platform',
  'audit',
  'analytics',
];

async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await pool('owner').query(sql, params)).rows as T[];
}

describe('RNF-12 · RN-A01 · el catálogo de PostgreSQL prueba el aislamiento', () => {
  it('toda tabla con organization_id tiene RLS activa y forzada, sin excepciones', async () => {
    const tables = await rows<{ name: string; enabled: boolean; forced: boolean }>(
      `SELECT format('%I.%I', n.nspname, c.relname) AS name,
              c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE c.relkind IN ('r', 'p') AND NOT c.relispartition
         AND n.nspname <> ALL (ARRAY['pg_catalog', 'information_schema', 'part'])
         AND EXISTS (SELECT 1 FROM pg_attribute a
                     WHERE a.attrelid = c.oid AND a.attname = 'organization_id' AND NOT a.attisdropped)
       ORDER BY 1`,
    );

    expect(tables.length).toBeGreaterThan(60);
    expect(tables.filter((t) => !t.enabled || !t.forced).map((t) => t.name)).toEqual([]);
  });

  it('toda tabla con RLS tiene al menos una política permisiva, salvo las que app_user no toca (ADR-030)', async () => {
    const withoutPolicy = await rows<{ name: string }>(
      `SELECT format('%I.%I', n.nspname, c.relname) AS name
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE c.relrowsecurity AND NOT c.relispartition
         AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND p.polpermissive)
         AND has_table_privilege('app_user', c.oid, 'SELECT, INSERT, UPDATE, DELETE')
       ORDER BY 1`,
    );

    expect(withoutPolicy).toEqual([]);
  });

  it('las tablas de negocio sin organization_id son solo las globales previstas en 05 §3', async () => {
    const global = await rows<{ name: string }>(
      `SELECT format('%I.%I', n.nspname, c.relname) AS name
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE c.relkind IN ('r', 'p') AND NOT c.relispartition AND n.nspname = ANY ($1)
         AND NOT EXISTS (SELECT 1 FROM pg_attribute a
                         WHERE a.attrelid = c.oid AND a.attname = 'organization_id' AND NOT a.attisdropped)
       ORDER BY 1`,
      [BUSINESS_SCHEMAS],
    );

    expect(global.map((t) => t.name)).toEqual([
      'analytics.projection_checkpoint',
      'assessment.measurement_site',
      'exercise.equipment',
      'exercise.muscle_group',
      'exercise.physical_activity',
      'food.food_group',
      'food.nutrient',
      'food.source',
      'iam.password_reset',
      'iam.session',
      'iam.user_account',
      'platform.idempotency_key',
      'platform.processed_event',
      'platform.rate_limit',
      'tenancy.organization',
      'tenancy.subscription_plan',
      'tracking.metric_definition',
    ]);
  });

  it('RN-A05 · toda tabla con patient_id tiene care_team_scope en SELECT, UPDATE y DELETE, salvo las excepciones', async () => {
    const missing = await rows<{ name: string }>(
      `SELECT format('%I.%I', c.table_schema, c.table_name) AS name
       FROM information_schema.columns c
       JOIN information_schema.tables t USING (table_schema, table_name)
       WHERE c.column_name = 'patient_id' AND t.table_type = 'BASE TABLE' AND c.table_schema <> 'part'
         AND format('%I.%I', c.table_schema, c.table_name) <> ALL (ARRAY['audit.audit_log', 'iam.invitation'])
         AND (SELECT count(*) FROM pg_policies p
              WHERE p.schemaname = c.table_schema AND p.tablename = c.table_name
                AND p.permissive = 'RESTRICTIVE'
                AND p.policyname IN ('care_team_scope_select', 'care_team_scope_update', 'care_team_scope_delete')) <> 3
       ORDER BY 1`,
    );
    const patient = await rows<{ policies: string }>(
      `SELECT string_agg(policyname, ',' ORDER BY policyname) AS policies FROM pg_policies
       WHERE schemaname = 'clinical' AND tablename = 'patient' AND policyname LIKE 'care_team_scope_%'`,
    );
    expect(missing).toEqual([]);
    expect(patient[0]?.policies).toBe(
      'care_team_scope_delete,care_team_scope_select,care_team_scope_update',
    );
  });

  it('ACCOUNT · toda tabla con care_team_scope tiene además account_scope', async () => {
    const missing = await rows<{ name: string }>(
      `SELECT DISTINCT format('%I.%I', schemaname, tablename) AS name FROM pg_policies c
       WHERE policyname = 'care_team_scope_select'
         AND NOT EXISTS (SELECT 1 FROM pg_policies a
                         WHERE a.schemaname = c.schemaname AND a.tablename = c.tablename
                           AND a.policyname = 'account_scope' AND a.permissive = 'RESTRICTIVE')
       ORDER BY 1`,
    );
    expect(missing).toEqual([]);
  });

  it('toda función SECURITY DEFINER fija su search_path', async () => {
    const unsafe = await rows<{ name: string }>(
      `SELECT p.oid::regprocedure::text AS name
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE p.prosecdef
         AND n.nspname <> ALL (ARRAY['pg_catalog', 'information_schema', 'pgboss'])
         AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%')`,
    );
    const definers = await rows<{ name: string; owner: string }>(
      `SELECT p.oid::regprocedure::text AS name, pg_get_userbyid(p.proowner) AS owner
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE p.prosecdef AND n.nspname = 'app' ORDER BY 1`,
    );

    expect(unsafe).toEqual([]);
    expect(definers).toEqual([
      { name: 'app.applied_migrations()', owner: 'app_owner' },
      { name: 'app.can_see_patient(uuid)', owner: 'app_owner' },
      { name: 'app.count_active_patients()', owner: 'app_owner' },
      { name: 'app.ensure_monthly_partitions(regclass,integer,date)', owner: 'app_owner' },
      { name: 'app.find_invitation(bytea)', owner: 'app_owner' },
      { name: 'app.has_clinical_support_grant()', owner: 'app_owner' },
      { name: 'app.hit_rate_limit(bytea,integer,integer)', owner: 'app_owner' },
      { name: 'app.missing_next_month_partitions()', owner: 'app_owner' },
      { name: 'app.patient_document_taken(bytea,uuid)', owner: 'app_owner' },
      { name: 'app.purge_rate_limits()', owner: 'app_owner' },
    ]);
  });

  it('app_user solo ejecuta las funciones app.* que necesita; nunca los auxiliares de migración', async () => {
    const executable = await rows<{ name: string }>(
      `SELECT p.proname AS name
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'app' AND has_function_privilege('app_user', p.oid, 'EXECUTE')
       ORDER BY 1`,
    );

    expect(executable.map((f) => f.name)).toEqual([
      'applied_migrations',
      'can_see_patient',
      'count_active_patients',
      'ensure_monthly_partitions',
      'find_invitation',
      'has_clinical_support_grant',
      'hit_rate_limit',
      'member_id',
      'missing_next_month_partitions',
      'org_id',
      'patient_document_taken',
      'patient_id',
      'purge_rate_limits',
      'role',
      'unaccent_immutable',
      'user_id',
    ]);
  });

  it('app_user no puede leer part.*: una partición consultada directo saltaría la RLS del padre', async () => {
    const [{ name: partition } = { name: '' }] = await rows<{ name: string }>(
      `SELECT format('%I.%I', n.nspname, c.relname) AS name
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'part' AND c.relname LIKE 'tracking_food_log_%' LIMIT 1`,
    );
    expect(partition).not.toBe('');

    await withContext('user', {}, async (client) => {
      expect(await errorCode(client, `SELECT * FROM ${partition}`)).toBe(PG.insufficientPrivilege);
    });
    await withContext('readonly', {}, async (client) => {
      expect(await errorCode(client, `SELECT * FROM ${partition}`)).toBe(PG.insufficientPrivilege);
    });
  });

  it('app_owner es el dueño de todo: ninguna tabla de negocio queda del superusuario', async () => {
    const foreign = await rows<{ name: string; owner: string }>(
      `SELECT format('%I.%I', n.nspname, c.relname) AS name, pg_get_userbyid(c.relowner) AS owner
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE c.relkind IN ('r', 'p') AND n.nspname = ANY ($1 || ARRAY['app', 'part'])
         AND pg_get_userbyid(c.relowner) <> 'app_owner'`,
      [BUSINESS_SCHEMAS],
    );

    expect(foreign).toEqual([]);
  });

  it('existe la partición del mes siguiente en las nueve tablas particionadas (05 §5)', async () => {
    const missing = await withContext('user', {}, async (client) => {
      const result = await client.query<{ parent: string }>(
        'SELECT * FROM app.missing_next_month_partitions() AS parent',
      );
      return result.rows.map((r) => r.parent);
    });
    const parents = await rows<{ name: string }>(
      `SELECT format('%I.%I', n.nspname, c.relname) AS name
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE c.relkind = 'p' AND n.nspname = ANY ($1) ORDER BY 1`,
      [BUSINESS_SCHEMAS],
    );

    expect(missing).toEqual([]);
    expect(parents).toHaveLength(9);
  });
});

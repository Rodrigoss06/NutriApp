-- 0000 · Base (Notion 05 §2, §3 y §5). La corre app_owner con `pnpm db:migrate`, también en producción:
-- así los esquemas y las funciones app.* son de app_owner, nunca del superusuario. Lo que exige
-- superusuario (roles, base, extensiones y zona horaria) está en infra/db/init.

-- Esquemas -----------------------------------------------------------------------------------------
-- app: funciones de contexto y mantenimiento. part: particiones hijas, fuera de la vista de Prisma y de
-- app_user (consultar una partición directamente saltaría la RLS del padre).
CREATE SCHEMA app;
CREATE SCHEMA part;
REVOKE ALL ON SCHEMA part FROM PUBLIC;

-- Uno por contexto (05 §2). Cada migración siguiente crea las tablas de su esquema.
CREATE SCHEMA iam;
CREATE SCHEMA tenancy;
CREATE SCHEMA clinical;
CREATE SCHEMA assessment;
CREATE SCHEMA food;
CREATE SCHEMA nutrition;
CREATE SCHEMA exercise;
CREATE SCHEMA training;
CREATE SCHEMA tracking;
CREATE SCHEMA scheduling;
CREATE SCHEMA content;
CREATE SCHEMA documents;
CREATE SCHEMA platform;
CREATE SCHEMA audit;
CREATE SCHEMA analytics;

-- pg-boss crea tablas al crear colas y se migra solo (ADR-024): su esquema es de app_user. Solo guarda
-- identificadores, nunca datos personales.
CREATE SCHEMA pgboss AUTHORIZATION app_user;

-- Permisos por defecto -----------------------------------------------------------------------------
-- Cada tabla nace con permisos; cada migración hace después sus REVOKE y GRANT puntuales.
-- app_user: SELECT, INSERT y UPDATE (05 §2: ningún DELETE salvo donde una migración lo conceda).
-- audit: solo se agrega (RN-B03). app_readonly: solo SELECT, sujeto a RLS.
GRANT USAGE ON SCHEMA app, iam, tenancy, clinical, assessment, food, nutrition, exercise, training,
  tracking, scheduling, content, documents, platform, audit, analytics TO app_user, app_readonly;

ALTER DEFAULT PRIVILEGES FOR ROLE app_owner
  IN SCHEMA iam, tenancy, clinical, assessment, food, nutrition, exercise, training, tracking,
    scheduling, content, documents, platform, analytics
  GRANT SELECT, INSERT, UPDATE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES FOR ROLE app_owner IN SCHEMA audit
  GRANT SELECT, INSERT ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES FOR ROLE app_owner
  IN SCHEMA iam, tenancy, clinical, assessment, food, nutrition, exercise, training, tracking,
    scheduling, content, documents, platform, audit, analytics
  GRANT SELECT ON TABLES TO app_readonly;

-- Ninguna función nueva es ejecutable por PUBLIC: cada una concede EXECUTE a quien la necesita.
ALTER DEFAULT PRIVILEGES FOR ROLE app_owner REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Contexto de seguridad (05 §3) --------------------------------------------------------------------
-- La UnitOfWork lo fija en cada transacción con set_config(nombre, valor, true). Las políticas los leen
-- con los permisos de quien consulta, por eso app_user y app_readonly pueden ejecutarlas.
CREATE FUNCTION app.org_id() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT NULLIF(current_setting('app.org_id', true), '')::uuid $$;
CREATE FUNCTION app.user_id() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;
CREATE FUNCTION app.role() RETURNS text LANGUAGE sql STABLE AS
  $$ SELECT NULLIF(current_setting('app.role', true), '') $$;
CREATE FUNCTION app.patient_id() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT NULLIF(current_setting('app.patient_id', true), '')::uuid $$;

-- unaccent no es IMMUTABLE: envoltura para índices y columnas generadas.
CREATE FUNCTION app.unaccent_immutable(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS
  $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

GRANT EXECUTE ON FUNCTION app.org_id(), app.user_id(), app.role(), app.patient_id(),
  app.unaccent_immutable(text) TO app_user, app_readonly;

-- Particiones mensuales (05 §5) --------------------------------------------------------------------
-- SECURITY DEFINER porque crear una partición exige ser dueño de la tabla padre, y app_user (el worker)
-- no lo es. search_path fijo, zona horaria UTC (las fronteras de audit_log y device_reading son
-- timestamptz) y lista cerrada de las nueve tablas particionadas.
CREATE FUNCTION app.ensure_monthly_partitions(
  p_parent regclass, p_months_ahead int DEFAULT 3, p_from date DEFAULT NULL
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET TimeZone = 'UTC'
AS $$
DECLARE
  v_month   date := date_trunc('month', coalesce(p_from, current_date))::date;
  v_end     date := (date_trunc('month', current_date) + make_interval(months => p_months_ahead + 1))::date;
  v_name    text;
  v_created int := 0;
BEGIN
  IF p_parent::text NOT IN (
    'tracking.food_log', 'tracking.hydration_log', 'tracking.workout_log', 'tracking.set_log',
    'tracking.daily_checkin', 'tracking.metric_log', 'tracking.note_log', 'tracking.device_reading',
    'audit.audit_log'
  ) THEN
    RAISE EXCEPTION 'La tabla % no es una tabla particionada por mes', p_parent
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_months_ahead NOT BETWEEN 0 AND 24 THEN
    RAISE EXCEPTION 'Meses por adelantado fuera de rango: %', p_months_ahead
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  WHILE v_month < v_end LOOP
    v_name := format('%s_%s', replace(p_parent::text, '.', '_'), to_char(v_month, 'YYYY_MM'));
    IF to_regclass(format('part.%I', v_name)) IS NULL THEN
      EXECUTE format('CREATE TABLE part.%I PARTITION OF %s FOR VALUES FROM (%L) TO (%L)',
                     v_name, p_parent, v_month, (v_month + interval '1 month')::date);
      v_created := v_created + 1;
    END IF;
    v_month := (v_month + interval '1 month')::date;
  END LOOP;
  RETURN v_created;
END $$;

GRANT EXECUTE ON FUNCTION app.ensure_monthly_partitions(regclass, int, date) TO app_user;

-- Verificación de salud: ¿existe la partición del mes siguiente en cada tabla? Lee el catálogo de `part`,
-- al que app_user no tiene acceso.
CREATE FUNCTION app.missing_next_month_partitions() RETURNS SETOF text
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET TimeZone = 'UTC'
AS $$
  SELECT parent
  FROM unnest(ARRAY[
    'tracking.food_log', 'tracking.hydration_log', 'tracking.workout_log', 'tracking.set_log',
    'tracking.daily_checkin', 'tracking.metric_log', 'tracking.note_log', 'tracking.device_reading',
    'audit.audit_log'
  ]) AS parent
  WHERE to_regclass(format('part.%I', replace(parent, '.', '_') || '_' ||
          to_char(date_trunc('month', current_date) + interval '1 month', 'YYYY_MM'))) IS NULL
$$;

GRANT EXECUTE ON FUNCTION app.missing_next_month_partitions() TO app_user;

-- Auxiliares de migración -------------------------------------------------------------------------
-- Aplican las plantillas de 05 §3 tabla por tabla, iguales en todos los esquemas. Las corre app_owner
-- dentro de las migraciones; nadie más puede ejecutarlas.

-- Plantilla de toda tabla con organization_id: RLS activa y forzada, solo la organización del contexto.
CREATE FUNCTION app.enable_tenant_rls(p_table regclass) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', p_table);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', p_table);
  EXECUTE format('CREATE POLICY tenant_isolation ON %s
                    USING (organization_id = app.org_id())
                    WITH CHECK (organization_id = app.org_id())', p_table);
END $$;

-- Catálogos donde organization_id NULL es global: se lee lo global y lo propio; se escribe lo propio, y lo
-- global solo con app.role = SYSTEM (cargas e importaciones).
CREATE FUNCTION app.enable_catalog_rls(p_table regclass) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_write text := '(organization_id = app.org_id() OR (organization_id IS NULL AND app.role() = ''SYSTEM''))';
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', p_table);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', p_table);
  EXECUTE format('CREATE POLICY catalog_read ON %s FOR SELECT
                    USING (organization_id IS NULL OR organization_id = app.org_id())', p_table);
  EXECUTE format('CREATE POLICY catalog_insert ON %s FOR INSERT WITH CHECK %s', p_table, v_write);
  EXECUTE format('CREATE POLICY catalog_update ON %s FOR UPDATE USING %s WITH CHECK %s',
                 p_table, v_write, v_write);
END $$;

-- Segunda capa del paciente, como lista de lo permitido: con app.role = PATIENT solo ve las filas que
-- cumplen p_read y solo escribe las que cumplen p_write. Sin argumentos, no ve ni escribe nada.
CREATE FUNCTION app.restrict_patient(p_table regclass, p_read text DEFAULT 'false', p_write text DEFAULT 'false')
RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  EXECUTE format('CREATE POLICY patient_scope ON %s AS RESTRICTIVE
                    USING (app.role() IS DISTINCT FROM ''PATIENT'' OR (%s))
                    WITH CHECK (app.role() IS DISTINCT FROM ''PATIENT'' OR (%s))',
                 p_table, p_read, p_write);
END $$;

-- Esquemas clínicos (RN-A09): PLATFORM_ADMIN solo lee, y solo con un permiso CLINICAL_READ vigente para su
-- usuario y la organización del contexto. Nunca inserta ni actualiza.
CREATE FUNCTION app.restrict_platform_admin(p_table regclass) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  EXECUTE format('CREATE POLICY support_read_only ON %s AS RESTRICTIVE
                    USING (app.role() IS DISTINCT FROM ''PLATFORM_ADMIN''
                           OR (SELECT app.has_clinical_support_grant()))
                    WITH CHECK (app.role() IS DISTINCT FROM ''PLATFORM_ADMIN'')', p_table);
END $$;

-- Verificación de salud: migraciones aplicadas. Prisma crea public._prisma_migrations antes de esta migración;
-- app_user no la lee directamente.
CREATE FUNCTION app.applied_migrations() RETURNS SETOF text
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT migration_name FROM public._prisma_migrations
  WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
  ORDER BY migration_name
$$;

GRANT EXECUTE ON FUNCTION app.applied_migrations() TO app_user;

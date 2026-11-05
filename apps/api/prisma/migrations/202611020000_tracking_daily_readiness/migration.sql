-- P13 (PR 4) · Registro diario, recuperación e indicación del día (RN-G11, RN-G14, RN-G15, RN-G17; 07 §9 y §11; 05.2,
-- «Entrenamiento según la plantilla V3»; ADR-080).

-- MENSTRUAL_TRACKING (RN-G17): finalidad opcional. Su texto es provisional, como los demás (RN-B01): lo revisa el abogado.
ALTER TABLE clinical.consent
  DROP CONSTRAINT consent_purpose_check,
  ADD CONSTRAINT consent_purpose_check
    CHECK (purpose IN ('HEALTH_DATA','APP_ACCESS','IMAGES','ANONYMIZED_RESEARCH','MARKETING','MENSTRUAL_TRACKING'));

INSERT INTO clinical.consent_document (id, organization_id, purpose, version, body_markdown, sha256, published_at)
SELECT d.id, NULL, d.purpose, '0.1-provisional', d.body, sha256(convert_to(d.body, 'UTF8')), now()
FROM (VALUES
  ('01926000-0000-7000-8000-000000000004'::uuid, 'MENSTRUAL_TRACKING',
   E'**Texto provisional, pendiente de revisión legal.**\n\n'
   'Autorizo a la organización que me atiende a registrar los síntomas de mi ciclo menstrual que yo anote en la app '
   '(de 0 a 3) y, si lo indico, el uso de anticoncepción hormonal, con la finalidad de que mi coach tenga ese contexto al '
   'revisar mi recuperación y mi entrenamiento. Lo ve solo mi equipo de atención y no cambia mi plan sin que el coach lo '
   'decida. Puedo retirar esta autorización cuando quiera desde la app; lo ya registrado se conserva hasta que pida su '
   'supresión.')
) AS d(id, purpose, body);

-- La anticoncepción hormonal del perfil llega con MENSTRUAL_TRACKING (ADR-075): sí o no, opcional, la registra el coach y
-- solo con el consentimiento vigente (ADR-080).
ALTER TABLE training.athlete_profile ADD COLUMN hormonal_contraception boolean;

-- Umbrales de 07 §11, versionados (RN-G15): una fila global con los valores base de la V3 y, si la organización los cambia,
-- las suyas. Las constantes de las fórmulas son del método (READINESS_JV), no de esta tabla.
CREATE TABLE training.readiness_threshold (
  id                           uuid PRIMARY KEY,
  organization_id              uuid,
  valid_from                   date NOT NULL,
  neutral_score                numeric(5,2) NOT NULL DEFAULT 75,
  readiness_green_min          numeric(5,2) NOT NULL DEFAULT 75,
  readiness_red_below          numeric(5,2) NOT NULL DEFAULT 60,
  performance_min_pct          numeric(5,2) NOT NULL DEFAULT 90,
  weekly_sleep_min_hours       numeric(3,1) NOT NULL DEFAULT 6.5,
  fatigue_soreness_amber_above numeric(3,1) NOT NULL DEFAULT 4,
  nutrition_min_pct            numeric(5,2) NOT NULL DEFAULT 80,
  CHECK (readiness_red_below <= readiness_green_min),
  UNIQUE NULLS NOT DISTINCT (organization_id, valid_from)
);
SELECT app.enable_catalog_rls('training.readiness_threshold');
SELECT app.restrict_patient('training.readiness_threshold');
INSERT INTO training.readiness_threshold (id, organization_id, valid_from)
VALUES ('019a2000-0000-7000-8000-000000000001', NULL, '2026-10-21');

-- Registro diario (RN-G11, 07 §9): stress, sleep_hours y energy siguen.
ALTER TABLE tracking.daily_checkin
  ADD COLUMN program_id               uuid,
  ADD COLUMN week_no                  smallint,
  ADD COLUMN session_id               uuid,
  ADD COLUMN session_minutes          smallint CHECK (session_minutes BETWEEN 0 AND 600),
  ADD COLUMN session_rpe              numeric(3,1) CHECK (session_rpe BETWEEN 0 AND 10),
  ADD COLUMN fatigue                  smallint CHECK (fatigue BETWEEN 1 AND 5),
  ADD COLUMN soreness                 smallint CHECK (soreness BETWEEN 1 AND 5),
  ADD COLUMN motivation               smallint CHECK (motivation BETWEEN 1 AND 5),
  ADD COLUMN menstrual_symptoms       smallint CHECK (menstrual_symptoms BETWEEN 0 AND 3),
  ADD COLUMN nutrition_compliance_pct smallint CHECK (nutrition_compliance_pct BETWEEN 0 AND 100),
  ADD COLUMN carbs_around_training_g  numeric(5,1) CHECK (carbs_around_training_g >= 0),
  ADD COLUMN performance_planned      numeric(10,2) CHECK (performance_planned >= 0),
  ADD COLUMN performance_actual       numeric(10,2) CHECK (performance_actual >= 0),
  ADD COLUMN resting_hr_bpm           smallint CHECK (resting_hr_bpm BETWEEN 25 AND 220),
  ADD COLUMN hrv_ms                   numeric(5,1) CHECK (hrv_ms > 0),
  ADD COLUMN steps                    int CHECK (steps BETWEEN 0 AND 200000),
  ADD COLUMN active_kcal              numeric(6,1) CHECK (active_kcal >= 0);

-- Recuperación e indicación del día (RN-G14, RN-G15): un resultado del motor por registro diario, con método, versión,
-- umbral e insumos con su hash (RN-D01). La escribe el caso de uso del registro diario en la misma transacción; anular el
-- registro la deja SUPERSEDED.
CREATE TABLE tracking.daily_readiness (
  id              uuid NOT NULL,
  local_date      date NOT NULL,
  organization_id uuid NOT NULL,
  patient_id      uuid NOT NULL,
  checkin_id      uuid NOT NULL,
  method_code     text NOT NULL,
  method_version  text NOT NULL,
  engine_version  text NOT NULL,
  threshold_id    uuid NOT NULL,
  inputs          jsonb NOT NULL,
  inputs_hash     bytea NOT NULL,
  srpe_load       numeric(7,1),
  performance_pct numeric(5,1),
  readiness_score numeric(5,2),
  components      jsonb NOT NULL,
  indication      text NOT NULL CHECK (indication IN ('GREEN','YELLOW','RED','NO_DATA')),
  status          text NOT NULL DEFAULT 'CURRENT' CHECK (status IN ('CURRENT','SUPERSEDED')),
  computed_at     timestamptz NOT NULL,
  PRIMARY KEY (id, local_date)
) PARTITION BY RANGE (local_date);
CREATE UNIQUE INDEX readiness_one_per_day ON tracking.daily_readiness (patient_id, local_date) WHERE status = 'CURRENT';
CREATE INDEX readiness_by_checkin ON tracking.daily_readiness (checkin_id, local_date);

-- checkin_id → daily_checkin (ADR-024): un disparador de restricción en vez de FK, como set_log.
CREATE FUNCTION tracking.readiness_requires_checkin() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tracking.daily_checkin c
                 WHERE c.id = NEW.checkin_id AND c.local_date = NEW.local_date) THEN
    RAISE EXCEPTION 'La recuperación % apunta a un registro diario que no existe (%, %)',
      NEW.id, NEW.checkin_id, NEW.local_date
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER readiness_checkin_fk
  AFTER INSERT OR UPDATE OF checkin_id, local_date ON tracking.daily_readiness
  DEFERRABLE INITIALLY IMMEDIATE
  FOR EACH ROW EXECUTE FUNCTION tracking.readiness_requires_checkin();

SELECT app.enable_tenant_rls('tracking.daily_readiness');
SELECT app.restrict_platform_admin('tracking.daily_readiness');
SELECT app.enable_care_team_scope('tracking.daily_readiness');
SELECT app.restrict_patient('tracking.daily_readiness', 'patient_id = app.patient_id()', 'patient_id = app.patient_id()');
REVOKE UPDATE ON tracking.daily_readiness FROM app_user;
GRANT UPDATE (status) ON tracking.daily_readiness TO app_user;

-- La nueva tabla particionada entra en la lista cerrada (05 §5, ADR-024) y en PARTITIONED_TABLES.
CREATE OR REPLACE FUNCTION app.ensure_monthly_partitions(
  p_parent regclass,
  p_months_ahead int DEFAULT 3,
  p_from date DEFAULT NULL
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
    'tracking.daily_readiness', 'audit.audit_log'
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

CREATE OR REPLACE FUNCTION app.missing_next_month_partitions() RETURNS SETOF text
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET TimeZone = 'UTC'
AS $$
  SELECT parent
  FROM unnest(ARRAY[
    'tracking.food_log', 'tracking.hydration_log', 'tracking.workout_log', 'tracking.set_log',
    'tracking.daily_checkin', 'tracking.metric_log', 'tracking.note_log', 'tracking.device_reading',
    'tracking.daily_readiness', 'audit.audit_log'
  ]) AS parent
  WHERE to_regclass(format('part.%I', replace(parent, '.', '_') || '_' ||
          to_char(date_trunc('month', current_date) + interval '1 month', 'YYYY_MM'))) IS NULL
$$;

SELECT app.ensure_monthly_partitions('tracking.daily_readiness', 3, '2026-10-01');

-- Lo que la recuperación del paciente necesita y su RLS no le deja leer (05.2: athlete_profile y readiness_threshold
-- restringidos): la línea base de su perfil vigente y el umbral vigente ese día, de su organización o el global. Solo para la
-- sesión PATIENT y solo lo suyo; nada más del perfil sale de aquí.
CREATE FUNCTION app.readiness_basis(p_local_date date)
RETURNS TABLE (
  sleep_target_hours      numeric,
  baseline_resting_hr_bpm smallint,
  baseline_hrv_ms         numeric,
  threshold_id            uuid,
  neutral_score           numeric,
  readiness_green_min     numeric,
  readiness_red_below     numeric,
  performance_min_pct     numeric
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT p.sleep_target_hours, p.baseline_resting_hr_bpm, p.baseline_hrv_ms,
         t.id, t.neutral_score, t.readiness_green_min, t.readiness_red_below, t.performance_min_pct
  FROM (SELECT r.* FROM training.readiness_threshold r
        WHERE (r.organization_id = app.org_id() OR r.organization_id IS NULL) AND r.valid_from <= p_local_date
        ORDER BY (r.organization_id IS NULL), r.valid_from DESC
        LIMIT 1) t
  LEFT JOIN LATERAL (SELECT a.sleep_target_hours, a.baseline_resting_hr_bpm, a.baseline_hrv_ms
                     FROM training.athlete_profile a
                     WHERE a.patient_id = app.patient_id() AND a.organization_id = app.org_id()
                     ORDER BY a.revision DESC
                     LIMIT 1) p ON true
  WHERE app.role() = 'PATIENT' AND app.patient_id() IS NOT NULL AND app.org_id() IS NOT NULL
$$;
REVOKE ALL ON FUNCTION app.readiness_basis(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.readiness_basis(date) TO app_user;

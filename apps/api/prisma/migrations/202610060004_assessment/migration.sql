-- 0004 · assessment (Notion 05.1).

CREATE TABLE assessment.measurement_site (           -- catálogo global: los sitios son datos, no código
  code          text PRIMARY KEY,                    -- 'SKF_TRICEPS', 'GIRTH_WAIST', 'BREADTH_HUMERUS', 'BASIC_WEIGHT'
  family        text NOT NULL CHECK (family IN ('BASIC','SKINFOLD','GIRTH','BREADTH','LENGTH')),
  name_es       text NOT NULL,
  unit          text NOT NULL CHECK (unit IN ('kg','cm','mm')),
  min_value     numeric(7,2) NOT NULL,
  max_value     numeric(7,2) NOT NULL,
  tolerance_pct numeric(4,2) NOT NULL,               -- 5 en pliegues, 1 en el resto
  min_attempts  smallint NOT NULL DEFAULT 2,
  in_basic      boolean NOT NULL,
  in_isak1      boolean NOT NULL,                    -- perfil restringido, 21 medidas
  in_isak2      boolean NOT NULL,                    -- perfil completo, 43 medidas
  display_order smallint NOT NULL
);

CREATE TABLE assessment.evaluation (
  id                   uuid PRIMARY KEY,
  organization_id      uuid NOT NULL,
  patient_id           uuid NOT NULL,
  evaluator_member_id  uuid NOT NULL,
  kind                 text NOT NULL DEFAULT 'ANTHROPOMETRY' CHECK (kind IN ('ANTHROPOMETRY','BIA','MIXED')),
  level                text CHECK (level IN ('BASIC','ISAK1','ISAK2')),
  measured_at          timestamptz NOT NULL,
  local_date           date NOT NULL,
  conditions           jsonb NOT NULL DEFAULT '{}',  -- hora, ayuno, actividad previa, hidratación
  patient_snapshot     jsonb NOT NULL,               -- sexo, edad decimal y población al medir
  status               text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','CLOSED','AMENDED')),
  revision             smallint NOT NULL DEFAULT 1,
  amends_evaluation_id uuid REFERENCES assessment.evaluation(id),
  amend_reason         text,
  closed_at            timestamptz,
  notes                text,
  created_by           uuid NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  version              int NOT NULL DEFAULT 0
);
CREATE INDEX evaluation_by_patient ON assessment.evaluation (organization_id, patient_id, measured_at DESC);

CREATE TABLE assessment.measurement (                -- un sitio dentro de una evaluación, con sus tomas
  evaluation_id      uuid NOT NULL REFERENCES assessment.evaluation(id) ON DELETE CASCADE,
  site_code          text NOT NULL REFERENCES assessment.measurement_site(code),
  organization_id    uuid NOT NULL,
  attempt_1          numeric(7,2) NOT NULL,
  attempt_2          numeric(7,2),
  attempt_3          numeric(7,2),
  consolidated_value numeric(7,2),                   -- derivado por el dominio (RN-C03)
  consolidation      text CHECK (consolidation IN ('SINGLE','MEAN_2','MEDIAN_3')),
  diff_pct           numeric(6,3),
  needs_third        boolean NOT NULL DEFAULT false,
  side               text NOT NULL DEFAULT 'RIGHT' CHECK (side IN ('RIGHT','LEFT')),
  PRIMARY KEY (evaluation_id, site_code)
);

CREATE TABLE assessment.bia_reading (                -- N19: lo que marca el equipo, cargado a mano
  id              uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  evaluation_id   uuid NOT NULL REFERENCES assessment.evaluation(id),
  device_brand    text NOT NULL,
  device_model    text NOT NULL,
  readings        jsonb NOT NULL,                    -- [{metric, value, unit}]
  entered_by      uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE assessment.evaluator_error (            -- ETM por evaluador y sitio (RN-C05)
  id              uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  member_id       uuid NOT NULL,
  site_code       text NOT NULL REFERENCES assessment.measurement_site(code),
  tem_abs         numeric(7,3) NOT NULL,
  tem_rel_pct     numeric(6,3) NOT NULL,
  source          text NOT NULL CHECK (source IN ('CALCULATED','DECLARED')),
  sample_size     int,
  valid_from      date NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE assessment.calculation_result (         -- inmutable (RN-D01, RN-D08)
  id              uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  patient_id      uuid NOT NULL,
  evaluation_id   uuid NOT NULL REFERENCES assessment.evaluation(id),
  method_code     text NOT NULL,
  method_version  text NOT NULL,
  engine_version  text NOT NULL,
  inputs          jsonb NOT NULL,
  inputs_hash     bytea NOT NULL,                    -- SHA-256 del JSON canónico
  outputs         jsonb NOT NULL,
  warnings        jsonb NOT NULL DEFAULT '[]',
  status          text NOT NULL DEFAULT 'CURRENT' CHECK (status IN ('CURRENT','SUPERSEDED')),
  superseded_by   uuid REFERENCES assessment.calculation_result(id),
  measured_at     timestamptz NOT NULL,              -- copia para las series de evolución
  computed_at     timestamptz NOT NULL,
  UNIQUE (evaluation_id, method_code, method_version, inputs_hash)
);

CREATE TABLE assessment.result_metric (              -- formato largo: un indicador por fila
  result_id       uuid NOT NULL REFERENCES assessment.calculation_result(id),
  metric_code     text NOT NULL,                     -- 'FAT_PCT', 'FAT_MASS_KG', 'MUSCLE_MASS_KG', 'BMI', 'CORMIC_INDEX'
  organization_id uuid NOT NULL,
  patient_id      uuid NOT NULL,
  method_code     text NOT NULL,
  measured_at     timestamptz NOT NULL,
  value           numeric(12,4) NOT NULL,
  unit            text NOT NULL,
  z_score         numeric(8,4),
  PRIMARY KEY (result_id, metric_code)
);
CREATE INDEX result_metric_series ON assessment.result_metric
  (organization_id, patient_id, metric_code, method_code, measured_at);

CREATE TABLE assessment.reference_range (            -- puntos de corte como datos (RN-D10)
  id              uuid PRIMARY KEY,
  organization_id uuid,                              -- NULL = global
  metric_code     text NOT NULL,
  sex             char(1),
  min_age         numeric(5,2),
  max_age         numeric(5,2),
  population      text,
  min_value       numeric(12,4),
  max_value       numeric(12,4),
  label           text NOT NULL,
  severity        text,
  source          text NOT NULL,                     -- 'OMS 2008', 'ACE'
  valid_from      date NOT NULL DEFAULT current_date
);

CREATE TABLE assessment.method_preference (          -- selección por población (RN-D05)
  id              uuid PRIMARY KEY,
  organization_id uuid,                              -- NULL = valor de la plataforma
  patient_id      uuid,                              -- no NULL = elección para un paciente
  population      text,
  purpose         text NOT NULL CHECK (purpose IN ('FAT_PCT','MUSCLE','BONE','RMR','ONE_RM')),
  method_code     text NOT NULL,
  UNIQUE NULLS NOT DISTINCT (organization_id, patient_id, population, purpose)
);

-- Inmutabilidad (RN-C07) ---------------------------------------------------------------------------
-- Una evaluación cerrada no se edita: solo pasa de CLOSED a AMENDED cuando una revisión la enmienda.
CREATE FUNCTION assessment.guard_closed_evaluation() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF OLD.status = 'DRAFT' THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'CLOSED' AND NEW.status = 'AMENDED'
     AND (to_jsonb(NEW) - ARRAY['status', 'updated_at', 'version'])
       = (to_jsonb(OLD) - ARRAY['status', 'updated_at', 'version']) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'La evaluación % está %: no se edita, se enmienda con una revisión (RN-C07)', OLD.id, OLD.status
    USING ERRCODE = 'integrity_constraint_violation';
END $$;

CREATE TRIGGER evaluation_immutable_when_closed
  BEFORE UPDATE ON assessment.evaluation
  FOR EACH ROW EXECUTE FUNCTION assessment.guard_closed_evaluation();

-- Las tomas solo cambian mientras la evaluación está en borrador.
CREATE FUNCTION assessment.guard_measurement_of_closed_evaluation() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_evaluation_id uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.evaluation_id ELSE NEW.evaluation_id END;
  v_status        text;
BEGIN
  SELECT e.status INTO v_status FROM assessment.evaluation e WHERE e.id = v_evaluation_id;
  IF v_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'La evaluación % no está en borrador: sus tomas no cambian (RN-C07)', v_evaluation_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.evaluation_id <> NEW.evaluation_id THEN
    RAISE EXCEPTION 'Una toma no cambia de evaluación' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

CREATE TRIGGER measurement_only_in_draft
  BEFORE INSERT OR UPDATE OR DELETE ON assessment.measurement
  FOR EACH ROW EXECUTE FUNCTION assessment.guard_measurement_of_closed_evaluation();

-- RLS ----------------------------------------------------------------------------------------------
SELECT app.enable_tenant_rls('assessment.evaluation');
SELECT app.enable_tenant_rls('assessment.measurement');
SELECT app.enable_tenant_rls('assessment.bia_reading');
SELECT app.enable_tenant_rls('assessment.evaluator_error');
SELECT app.enable_tenant_rls('assessment.calculation_result');
SELECT app.enable_tenant_rls('assessment.result_metric');
SELECT app.enable_catalog_rls('assessment.reference_range');
SELECT app.enable_catalog_rls('assessment.method_preference');

-- El paciente ve sus evaluaciones cerradas o enmendadas, sus resultados vigentes y sus indicadores.
SELECT app.restrict_patient('assessment.evaluation',
  'patient_id = app.patient_id() AND status IN (''CLOSED'', ''AMENDED'')');
SELECT app.restrict_patient('assessment.calculation_result',
  'patient_id = app.patient_id() AND status = ''CURRENT''');
SELECT app.restrict_patient('assessment.result_metric', 'patient_id = app.patient_id()');
SELECT app.restrict_patient('assessment.measurement');
SELECT app.restrict_patient('assessment.bia_reading');
SELECT app.restrict_patient('assessment.evaluator_error');
SELECT app.restrict_patient('assessment.reference_range');
SELECT app.restrict_patient('assessment.method_preference');

SELECT app.restrict_platform_admin('assessment.evaluation');
SELECT app.restrict_platform_admin('assessment.measurement');
SELECT app.restrict_platform_admin('assessment.bia_reading');
SELECT app.restrict_platform_admin('assessment.evaluator_error');
SELECT app.restrict_platform_admin('assessment.calculation_result');
SELECT app.restrict_platform_admin('assessment.result_metric');

-- Permisos -----------------------------------------------------------------------------------------
-- Un resultado es inmutable: recalcular crea otro y marca este como reemplazado (RN-D08).
REVOKE UPDATE ON assessment.calculation_result FROM app_user;
GRANT UPDATE (status, superseded_by) ON assessment.calculation_result TO app_user;
-- Tomas de una evaluación en borrador.
GRANT DELETE ON assessment.measurement TO app_user;

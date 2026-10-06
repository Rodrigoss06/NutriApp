-- 0009 · tracking (Notion 05.2 y 05 §5). Alto volumen, particionado por mes; las hijas viven en `part`.
-- Sin FK sobre tablas particionadas (ADR-024): set_log → workout_log es un disparador de restricción.

CREATE TABLE tracking.food_log (
  id                  uuid NOT NULL,
  local_date          date NOT NULL,
  organization_id     uuid NOT NULL,
  patient_id          uuid NOT NULL,
  logged_at           timestamptz NOT NULL,
  meal_slot_code      text NOT NULL,
  plan_id             uuid,                           -- versión del plan vigente
  plan_meal_id        uuid,
  item_type           text NOT NULL CHECK (item_type IN ('FOOD','RECIPE','EXCHANGE')),
  item_id             uuid,
  item_name           text NOT NULL,                  -- congelado al registrar
  exchange_group_code text,
  servings            numeric(5,2),
  grams               numeric(8,2),
  household_text      text,
  kcal                numeric(8,1) NOT NULL,          -- congelados: si el catálogo cambia, el día no cambia
  cho_g               numeric(7,2) NOT NULL,
  protein_g           numeric(7,2) NOT NULL,
  fat_g               numeric(7,2) NOT NULL,
  nutrients           jsonb NOT NULL DEFAULT '{}',    -- micronutrientes disponibles
  in_plan             boolean NOT NULL,
  source              text NOT NULL DEFAULT 'APP' CHECK (source IN ('APP','IMPORT','VOICE','DEVICE','PHOTO')),
  status              text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','VOIDED')),
  replaced_by_id      uuid,
  client_id           uuid NOT NULL,                  -- idempotencia desde el celular (RN-G08)
  created_by          uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, local_date)
) PARTITION BY RANGE (local_date);
CREATE UNIQUE INDEX food_log_idem ON tracking.food_log (patient_id, client_id, local_date);
CREATE INDEX food_log_day ON tracking.food_log (organization_id, patient_id, local_date);
CREATE INDEX food_log_time ON tracking.food_log USING brin (logged_at);

CREATE TABLE tracking.hydration_log (
  id uuid NOT NULL, local_date date NOT NULL, organization_id uuid NOT NULL, patient_id uuid NOT NULL,
  logged_at timestamptz NOT NULL, volume_ml int NOT NULL CHECK (volume_ml BETWEEN 1 AND 5000),
  beverage text NOT NULL DEFAULT 'WATER', source text NOT NULL DEFAULT 'APP',
  status text NOT NULL DEFAULT 'ACTIVE', client_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, local_date)
) PARTITION BY RANGE (local_date);

CREATE TABLE tracking.workout_log (
  id              uuid NOT NULL,
  local_date      date NOT NULL,
  organization_id uuid NOT NULL,
  patient_id      uuid NOT NULL,
  program_id      uuid,
  session_id      uuid,
  mesocycle_id    uuid,
  week_no         smallint,
  is_deload       boolean NOT NULL DEFAULT false,
  started_at      timestamptz,
  finished_at     timestamptz,
  outcome         text NOT NULL CHECK (outcome IN ('COMPLETED','PARTIAL','SKIPPED')),
  session_rpe     numeric(3,1),
  stimulus_rating smallint CHECK (stimulus_rating BETWEEN 1 AND 5),
  fatigue_rating  smallint CHECK (fatigue_rating BETWEEN 1 AND 5),
  notes           text,
  source          text NOT NULL DEFAULT 'APP',
  status          text NOT NULL DEFAULT 'ACTIVE',
  client_id       uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, local_date)
) PARTITION BY RANGE (local_date);

CREATE TABLE tracking.set_log (
  id                   uuid NOT NULL,
  local_date           date NOT NULL,
  organization_id      uuid NOT NULL,
  patient_id           uuid NOT NULL,
  workout_log_id       uuid NOT NULL,                -- tracking.workout_log, con el disparador de abajo
  prescribed_set_id    uuid,
  exercise_id          uuid NOT NULL,
  exercise_name        text NOT NULL,
  muscle_contributions jsonb NOT NULL,               -- congeladas: [{muscle, weight 1 o 0.5}]
  set_no               smallint NOT NULL,
  is_warmup            boolean NOT NULL DEFAULT false,
  reps                 smallint,
  load_kg              numeric(6,2),
  rir                  smallint,
  rpe                  numeric(3,1),
  duration_seconds     int,
  distance_m           numeric(8,1),
  met                  numeric(4,1),
  stimulus_rating      smallint CHECK (stimulus_rating BETWEEN 1 AND 5),
  fatigue_rating       smallint CHECK (fatigue_rating BETWEEN 1 AND 5),
  tonnage_kg           numeric(9,2) GENERATED ALWAYS AS
                         (CASE WHEN is_warmup THEN 0 ELSE coalesce(reps, 0) * coalesce(load_kg, 0) END) STORED,
  status               text NOT NULL DEFAULT 'ACTIVE',
  client_id            uuid NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, local_date)
) PARTITION BY RANGE (local_date);
CREATE INDEX set_log_exercise ON tracking.set_log (organization_id, patient_id, exercise_id, local_date);

CREATE TABLE tracking.daily_checkin (                 -- N7: estado diario
  id uuid NOT NULL, local_date date NOT NULL, organization_id uuid NOT NULL, patient_id uuid NOT NULL,
  stress smallint CHECK (stress BETWEEN 1 AND 5),
  sleep_hours numeric(3,1) CHECK (sleep_hours BETWEEN 0 AND 24),
  energy smallint CHECK (energy BETWEEN 1 AND 5),
  source text NOT NULL DEFAULT 'APP', status text NOT NULL DEFAULT 'ACTIVE',
  client_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, local_date)
) PARTITION BY RANGE (local_date);
CREATE UNIQUE INDEX checkin_one_per_day ON tracking.daily_checkin (patient_id, local_date) WHERE status = 'ACTIVE';

CREATE TABLE tracking.metric_definition (              -- métricas nuevas sin migración
  code text PRIMARY KEY, name_es text NOT NULL, unit text NOT NULL,
  min_value numeric, max_value numeric,
  aggregation text NOT NULL CHECK (aggregation IN ('SUM','AVG','LAST','MAX')),
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE tracking.metric_log (                     -- peso en casa, pasos, cintura, frecuencia cardíaca...
  id uuid NOT NULL, local_date date NOT NULL, organization_id uuid NOT NULL, patient_id uuid NOT NULL,
  metric_code text NOT NULL REFERENCES tracking.metric_definition(code),
  value numeric(12,4) NOT NULL, measured_at timestamptz NOT NULL,
  source text NOT NULL DEFAULT 'APP', device_reading_id uuid,
  status text NOT NULL DEFAULT 'ACTIVE', client_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, local_date)
) PARTITION BY RANGE (local_date);

CREATE TABLE tracking.note_log (
  id uuid NOT NULL, local_date date NOT NULL, organization_id uuid NOT NULL, patient_id uuid NOT NULL,
  body text NOT NULL CHECK (length(body) <= 2000),
  read_at timestamptz, read_by uuid,
  client_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, local_date)
) PARTITION BY RANGE (local_date);

CREATE TABLE tracking.log_adjustment (                 -- RN-G02: el profesional nunca sobrescribe
  id                uuid PRIMARY KEY,
  organization_id   uuid NOT NULL,
  patient_id        uuid NOT NULL,
  target_type       text NOT NULL CHECK (target_type IN ('FOOD','HYDRATION','WORKOUT','SET','CHECKIN','METRIC')),
  target_id         uuid NOT NULL,
  target_local_date date NOT NULL,
  action            text NOT NULL CHECK (action IN ('EXCLUDE','CORRECT')),
  corrected_values  jsonb,
  reason            text NOT NULL CHECK (length(reason) >= 10),
  author_member_id  uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX adjustment_by_day ON tracking.log_adjustment (organization_id, patient_id, target_local_date);

CREATE TABLE tracking.active_plan_view (              -- copia del plan y la rutina vigentes, alimentada por eventos
  patient_id          uuid PRIMARY KEY,
  organization_id     uuid NOT NULL,
  nutrition_plan_id   uuid,
  nutrition_snapshot  jsonb,
  training_program_id uuid,
  training_snapshot   jsonb,
  effective_from      date NOT NULL,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tracking.daily_target (                  -- RN-G03: la meta del día se guarda con el día
  patient_id        uuid NOT NULL,
  local_date        date NOT NULL,
  organization_id   uuid NOT NULL,
  nutrition_plan_id uuid,
  kcal              numeric(7,1),
  cho_g             numeric(6,1),
  protein_g         numeric(6,1),
  fat_g             numeric(6,1),
  water_ml          int,
  planned_sessions  smallint,
  planned_sets      jsonb,                             -- series planificadas por grupo muscular
  PRIMARY KEY (patient_id, local_date)
);

CREATE TABLE tracking.device_reading (                 -- fase Dispositivos: lista, sin uso en la 1.0
  id uuid NOT NULL, start_at timestamptz NOT NULL, organization_id uuid NOT NULL, patient_id uuid NOT NULL,
  provider text NOT NULL, external_id text NOT NULL, metric_code text NOT NULL,
  end_at timestamptz, value numeric(14,4), unit text, raw jsonb,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, start_at),
  UNIQUE (provider, external_id, start_at)
) PARTITION BY RANGE (start_at);

-- set_log → workout_log (ADR-024) ------------------------------------------------------------------
-- Reemplaza la FOREIGN KEY (workout_log_id, local_date) de 05.2, que Prisma no puede introspectar sobre
-- tablas particionadas. Como app_user no borra en tracking, basta con revisar al insertar o cambiar la
-- referencia. Corre con los permisos y la RLS de quien escribe: una serie solo apunta a un entrenamiento
-- que su autor puede ver.
CREATE FUNCTION tracking.set_log_requires_workout() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tracking.workout_log w
                 WHERE w.id = NEW.workout_log_id AND w.local_date = NEW.local_date) THEN
    RAISE EXCEPTION 'La serie % apunta a un entrenamiento que no existe (%, %)',
      NEW.id, NEW.workout_log_id, NEW.local_date
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER set_log_workout_fk
  AFTER INSERT OR UPDATE OF workout_log_id, local_date ON tracking.set_log
  DEFERRABLE INITIALLY IMMEDIATE
  FOR EACH ROW EXECUTE FUNCTION tracking.set_log_requires_workout();

-- RLS ----------------------------------------------------------------------------------------------
-- metric_definition no tiene organization_id: es global.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tracking.food_log', 'tracking.hydration_log', 'tracking.workout_log',
                           'tracking.set_log', 'tracking.daily_checkin', 'tracking.metric_log',
                           'tracking.note_log', 'tracking.log_adjustment', 'tracking.active_plan_view',
                           'tracking.daily_target', 'tracking.device_reading'] LOOP
    PERFORM app.enable_tenant_rls(t::regclass);
    PERFORM app.restrict_platform_admin(t::regclass);
  END LOOP;
END $$;

-- El paciente ve y escribe solo sus registros (RN-G01). Lee su meta diaria y su plan vigente. No ve los
-- ajustes del profesional ni las lecturas de dispositivos.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tracking.food_log', 'tracking.hydration_log', 'tracking.workout_log',
                           'tracking.set_log', 'tracking.daily_checkin', 'tracking.metric_log',
                           'tracking.note_log'] LOOP
    PERFORM app.restrict_patient(t::regclass, 'patient_id = app.patient_id()', 'patient_id = app.patient_id()');
  END LOOP;
END $$;
SELECT app.restrict_patient('tracking.daily_target', 'patient_id = app.patient_id()');
SELECT app.restrict_patient('tracking.active_plan_view', 'patient_id = app.patient_id()');
SELECT app.restrict_patient('tracking.log_adjustment');
SELECT app.restrict_patient('tracking.device_reading');

-- Permisos -----------------------------------------------------------------------------------------
-- Corregir o anular no borra ni sobrescribe (RN-G12): solo cambia el estado y el reemplazo. En las notas,
-- el equipo marca la lectura (RN-G13).
REVOKE UPDATE ON tracking.food_log, tracking.hydration_log, tracking.workout_log, tracking.set_log,
  tracking.daily_checkin, tracking.metric_log, tracking.note_log FROM app_user;
GRANT UPDATE (status, replaced_by_id) ON tracking.food_log TO app_user;
GRANT UPDATE (status) ON tracking.hydration_log, tracking.workout_log, tracking.set_log,
  tracking.daily_checkin, tracking.metric_log TO app_user;
GRANT UPDATE (read_at, read_by) ON tracking.note_log TO app_user;

-- Particiones: desde octubre de 2026 hasta tres meses después del actual (05 §5). La migración de cuentas
-- (RF-40) llama antes con p_from igual a la fecha más antigua que importa.
SELECT app.ensure_monthly_partitions('tracking.food_log', 3, '2026-10-01');
SELECT app.ensure_monthly_partitions('tracking.hydration_log', 3, '2026-10-01');
SELECT app.ensure_monthly_partitions('tracking.workout_log', 3, '2026-10-01');
SELECT app.ensure_monthly_partitions('tracking.set_log', 3, '2026-10-01');
SELECT app.ensure_monthly_partitions('tracking.daily_checkin', 3, '2026-10-01');
SELECT app.ensure_monthly_partitions('tracking.metric_log', 3, '2026-10-01');
SELECT app.ensure_monthly_partitions('tracking.note_log', 3, '2026-10-01');
SELECT app.ensure_monthly_partitions('tracking.device_reading', 3, '2026-10-01');

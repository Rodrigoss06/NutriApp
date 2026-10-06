-- 0015 · analytics (Notion 05.3). Read models: se reconstruyen desde las tablas de origen; nunca son la
-- fuente de verdad. Los escriben los consumidores del worker como SYSTEM.

CREATE TABLE analytics.patient_daily_summary (
  patient_id uuid NOT NULL, local_date date NOT NULL, organization_id uuid NOT NULL,
  kcal numeric(8,1), cho_g numeric(7,1), protein_g numeric(7,1), fat_g numeric(7,1), fiber_g numeric(6,1),
  target_kcal numeric(7,1), target_cho_g numeric(6,1), target_protein_g numeric(6,1), target_fat_g numeric(6,1),
  adequacy_kcal_pct numeric(6,1), adequacy_cho_pct numeric(6,1), adequacy_protein_pct numeric(6,1), adequacy_fat_pct numeric(6,1),
  kcal_in_range boolean, meals_logged smallint, meals_planned smallint, off_plan_items smallint,
  water_ml int, water_target_ml int,
  workouts_done smallint, workouts_planned smallint, tonnage_kg numeric(10,1), effective_sets numeric(6,1),
  stress smallint, sleep_hours numeric(3,1), energy smallint, body_weight_kg numeric(6,2),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (patient_id, local_date)
);
CREATE INDEX daily_summary_org ON analytics.patient_daily_summary (organization_id, local_date);

CREATE TABLE analytics.patient_weekly_muscle_volume (
  patient_id uuid NOT NULL, week_start date NOT NULL, muscle_code text NOT NULL, organization_id uuid NOT NULL,
  program_id uuid, mesocycle_id uuid, week_no smallint, is_deload boolean,
  fractional_sets_done numeric(6,1) NOT NULL, fractional_sets_planned numeric(6,1),
  tonnage_kg numeric(10,1), avg_rpe numeric(3,1), avg_stimulus numeric(3,1), avg_fatigue numeric(3,1),
  PRIMARY KEY (patient_id, week_start, muscle_code)
);

CREATE TABLE analytics.exercise_one_rm_series (
  patient_id uuid NOT NULL, exercise_id uuid NOT NULL, local_date date NOT NULL, formula text NOT NULL,
  organization_id uuid NOT NULL, best_estimated_1rm_kg numeric(6,1) NOT NULL, source_set_id uuid NOT NULL,
  PRIMARY KEY (patient_id, exercise_id, local_date, formula)
);

CREATE TABLE analytics.patient_overview (                -- una fila por paciente para el panel
  patient_id uuid PRIMARY KEY, organization_id uuid NOT NULL,
  last_log_date date, last_evaluation_at timestamptz, last_weight_kg numeric(6,2),
  adherence_7d_pct numeric(5,1), adherence_30d_pct numeric(5,1), unread_notes smallint NOT NULL DEFAULT 0,
  next_appointment_at timestamptz, alerts text[] NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE analytics.projection_checkpoint (projection text PRIMARY KEY, last_event_id uuid, rebuilt_at timestamptz);

-- RLS ----------------------------------------------------------------------------------------------
-- projection_checkpoint no tiene organization_id: es del worker.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['analytics.patient_daily_summary', 'analytics.patient_weekly_muscle_volume',
                           'analytics.exercise_one_rm_series', 'analytics.patient_overview'] LOOP
    PERFORM app.enable_tenant_rls(t::regclass);
    PERFORM app.restrict_platform_admin(t::regclass);
  END LOOP;
END $$;

-- El paciente ve sus resúmenes y series; no el panel del profesional.
SELECT app.restrict_patient('analytics.patient_daily_summary', 'patient_id = app.patient_id()');
SELECT app.restrict_patient('analytics.patient_weekly_muscle_volume', 'patient_id = app.patient_id()');
SELECT app.restrict_patient('analytics.exercise_one_rm_series', 'patient_id = app.patient_id()');
SELECT app.restrict_patient('analytics.patient_overview');

-- Permisos -----------------------------------------------------------------------------------------
-- Reconstruir un read model borra y vuelve a escribir.
GRANT DELETE ON analytics.patient_daily_summary, analytics.patient_weekly_muscle_volume,
  analytics.exercise_one_rm_series, analytics.patient_overview TO app_user;

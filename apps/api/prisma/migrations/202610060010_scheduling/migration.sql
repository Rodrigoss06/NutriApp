-- 0010 · scheduling (Notion 05.3).

CREATE TABLE scheduling.availability (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL, member_id uuid NOT NULL,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  start_time time NOT NULL, end_time time NOT NULL, valid_from date NOT NULL, valid_to date,
  CHECK (start_time < end_time)
);

CREATE TABLE scheduling.appointment (
  id               uuid PRIMARY KEY,
  organization_id  uuid NOT NULL,
  member_id        uuid NOT NULL,
  patient_id       uuid,
  kind             text NOT NULL CHECK (kind IN ('CONSULTATION','FOLLOW_UP','EVALUATION','TRAINING','OTHER')),
  mode             text NOT NULL CHECK (mode IN ('IN_PERSON','VIRTUAL')),
  location         text,
  meeting_url      text,
  starts_at        timestamptz NOT NULL,
  ends_at          timestamptz NOT NULL,
  status           text NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED','CONFIRMED','COMPLETED','CANCELLED','NO_SHOW')),
  notes            text,
  reminder_sent_at timestamptz,
  created_by       uuid NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  version          int NOT NULL DEFAULT 0,
  CHECK (starts_at < ends_at),
  EXCLUDE USING gist (member_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
    WHERE (status NOT IN ('CANCELLED','NO_SHOW'))   -- RN-J01
);
CREATE INDEX appointment_agenda ON scheduling.appointment (organization_id, member_id, starts_at);

-- RLS ----------------------------------------------------------------------------------------------
SELECT app.enable_tenant_rls('scheduling.availability');
SELECT app.enable_tenant_rls('scheduling.appointment');

-- El paciente ve sus citas; no la disponibilidad de los profesionales.
SELECT app.restrict_patient('scheduling.appointment', 'patient_id = app.patient_id()');
SELECT app.restrict_patient('scheduling.availability');

-- Permisos -----------------------------------------------------------------------------------------
GRANT DELETE ON scheduling.availability TO app_user;

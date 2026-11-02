-- P13 (PR 2) · Lo que el paciente registra por /me: comida, agua, notas y peso (RN-G01 a RN-G12, ADR-080, ADR-081).

-- Un alimento sin un nutriente se registra igual: el total del día muestra «al menos» (RN-I03). En 05.2 eran NOT NULL.
ALTER TABLE tracking.food_log
  ALTER COLUMN kcal DROP NOT NULL,
  ALTER COLUMN cho_g DROP NOT NULL,
  ALTER COLUMN protein_g DROP NOT NULL,
  ALTER COLUMN fat_g DROP NOT NULL;

-- Un reintento con el mismo clientId no duplica (RN-G08). 05.2 lo tenía solo en food_log (food_log_idem).
CREATE UNIQUE INDEX hydration_log_idem ON tracking.hydration_log (patient_id, client_id, local_date);
CREATE UNIQUE INDEX workout_log_idem ON tracking.workout_log (patient_id, client_id, local_date);
CREATE UNIQUE INDEX set_log_idem ON tracking.set_log (patient_id, client_id, local_date);
CREATE UNIQUE INDEX checkin_idem ON tracking.daily_checkin (patient_id, client_id, local_date);
CREATE UNIQUE INDEX metric_log_idem ON tracking.metric_log (patient_id, client_id, local_date);
CREATE UNIQUE INDEX note_log_idem ON tracking.note_log (patient_id, client_id, local_date);

-- El día en la app (05 §7): los registros del paciente en una fecha, con poda de particiones, como food_log_day.
CREATE INDEX hydration_log_day ON tracking.hydration_log (organization_id, patient_id, local_date);
CREATE INDEX workout_log_day ON tracking.workout_log (organization_id, patient_id, local_date);
CREATE INDEX metric_log_day ON tracking.metric_log (organization_id, patient_id, local_date);
CREATE INDEX note_log_day ON tracking.note_log (organization_id, patient_id, local_date);

-- Peso en casa, si la app lo permite (content.patient_app_setting.allow_weight_log), con el rango de RN-C04.
INSERT INTO tracking.metric_definition (code, name_es, unit, min_value, max_value, aggregation)
VALUES ('BODY_WEIGHT', 'Peso corporal', 'kg', 20, 300, 'LAST');

-- P13 (PR 4) · Las series de cada entreno (RF-29, ADR-083): su tonelaje y anularlas filtran por workout_log_id, que no tenía índice.
-- Se crea en la tabla padre y Postgres lo crea en cada partición (05 §5).
CREATE INDEX set_log_by_workout ON tracking.set_log (workout_log_id, local_date);

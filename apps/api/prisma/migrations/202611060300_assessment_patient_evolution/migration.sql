-- P14 · La evolución del paciente en su app (RF-30, ADR-091) necesita lo que su RLS no le deja leer (05.1: measurement,
-- evaluator_error y method_preference restringidos): de sus evaluaciones cerradas, las tomas del peso, la cintura y los 6
-- pliegues con el ETM vigente de su evaluador en la fecha de cada una (el CMD95 de RN-C06), y las preferencias de método
-- que valen para él (el método principal, RN-D05). Solo para la sesión PATIENT y solo lo suyo; nada más sale de aquí.
CREATE FUNCTION app.patient_evolution_sites()
RETURNS TABLE (
  evaluation_id uuid,
  site_code     text,
  attempt_1     numeric,
  attempt_2     numeric,
  attempt_3     numeric,
  tem_abs       numeric,
  tem_rel_pct   numeric,
  tem_pairs     jsonb
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT m.evaluation_id, m.site_code, m.attempt_1, m.attempt_2, m.attempt_3, err.tem_abs, err.tem_rel_pct, err.pairs
  FROM assessment.evaluation e
  JOIN assessment.measurement m ON m.evaluation_id = e.id
  LEFT JOIN LATERAL (SELECT x.tem_abs, x.tem_rel_pct, x.pairs
                     FROM assessment.evaluator_error x
                     WHERE x.organization_id = e.organization_id AND x.member_id = e.evaluator_member_id
                       AND x.site_code = m.site_code AND x.valid_from <= e.local_date
                     ORDER BY x.valid_from DESC, x.created_at DESC
                     LIMIT 1) err ON true
  WHERE app.role() = 'PATIENT' AND app.patient_id() IS NOT NULL AND app.org_id() IS NOT NULL
    AND e.patient_id = app.patient_id() AND e.organization_id = app.org_id() AND e.status = 'CLOSED'
    AND m.site_code IN ('BASIC_WEIGHT', 'GIRTH_WAIST', 'SKF_TRICEPS', 'SKF_SUBSCAPULAR', 'SKF_SUPRASPINALE',
                        'SKF_ABDOMINAL', 'SKF_FRONT_THIGH', 'SKF_MEDIAL_CALF')
$$;
REVOKE ALL ON FUNCTION app.patient_evolution_sites() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.patient_evolution_sites() TO app_user;

CREATE FUNCTION app.patient_method_preferences()
RETURNS TABLE (
  organization_level boolean,
  population         text,
  purpose            text,
  method_code        text
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT p.patient_id IS NULL, p.population, p.purpose, p.method_code
  FROM assessment.method_preference p
  WHERE app.role() = 'PATIENT' AND app.patient_id() IS NOT NULL AND app.org_id() IS NOT NULL
    AND p.organization_id = app.org_id() AND (p.patient_id IS NULL OR p.patient_id = app.patient_id())
$$;
REVOKE ALL ON FUNCTION app.patient_method_preferences() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.patient_method_preferences() TO app_user;

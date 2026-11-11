-- P14.5 (PR 6a) · La cadera en Progreso de la app, como en la «Comparativa física» de la hoja de Jeremy (RF-30; ADR-107). La
-- función de 202611060300_assessment_patient_evolution suma GIRTH_HIP; lo demás no cambia: solo la sesión PATIENT y solo lo suyo.
CREATE OR REPLACE FUNCTION app.patient_evolution_sites()
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
    AND m.site_code IN ('BASIC_WEIGHT', 'GIRTH_WAIST', 'GIRTH_HIP', 'SKF_TRICEPS', 'SKF_SUBSCAPULAR', 'SKF_SUPRASPINALE',
                        'SKF_ABDOMINAL', 'SKF_FRONT_THIGH', 'SKF_MEDIAL_CALF')
$$;
REVOKE ALL ON FUNCTION app.patient_evolution_sites() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.patient_evolution_sites() TO app_user;

-- P7 · Catálogo de sitios de medición, ETM con pares y equipo de atención de tomas y bioimpedancia (ADR-044).

-- Catálogo (RN-C01, RN-C04) -----------------------------------------------------------------------------------------
-- Generado una sola vez desde seeds/assessment/measurement-sites.json (2026-10-13) y fijo desde entonces: todo cambio
-- posterior del catálogo va en una migración nueva que también actualiza el JSON. Una prueba de integración compara
-- esta tabla con el JSON. ⚠️ 42 sitios de ISAK 2: el noveno diámetro espera la guía de acreditación ISAK (2023).
-- ⚠️ Rangos de rechazo de perímetros, diámetros y longitudes provisionales.
INSERT INTO assessment.measurement_site
  (code, family, name_es, unit, min_value, max_value, tolerance_pct, min_attempts, in_basic, in_isak1, in_isak2,
   display_order)
VALUES
  ('BASIC_WEIGHT', 'BASIC', 'Peso', 'kg', 20, 300, 1, 2, true, true, true, 10),
  ('BASIC_HEIGHT', 'BASIC', 'Talla', 'cm', 100, 230, 1, 2, true, true, true, 20),
  ('BASIC_SITTING_HEIGHT', 'BASIC', 'Talla sentado', 'cm', 45, 130, 1, 2, false, true, true, 30),
  ('BASIC_ARM_SPAN', 'BASIC', 'Envergadura', 'cm', 90, 250, 1, 2, false, true, true, 40),
  ('SKF_TRICEPS', 'SKINFOLD', 'Pliegue del tríceps', 'mm', 0, 80, 5, 2, false, true, true, 50),
  ('SKF_SUBSCAPULAR', 'SKINFOLD', 'Pliegue subescapular', 'mm', 0, 80, 5, 2, false, true, true, 60),
  ('SKF_BICEPS', 'SKINFOLD', 'Pliegue del bíceps', 'mm', 0, 80, 5, 2, false, true, true, 70),
  ('SKF_ILIAC_CREST', 'SKINFOLD', 'Pliegue de la cresta ilíaca', 'mm', 0, 80, 5, 2, false, true, true, 80),
  ('SKF_SUPRASPINALE', 'SKINFOLD', 'Pliegue supraespinal', 'mm', 0, 80, 5, 2, false, true, true, 90),
  ('SKF_ABDOMINAL', 'SKINFOLD', 'Pliegue abdominal', 'mm', 0, 80, 5, 2, false, true, true, 100),
  ('SKF_FRONT_THIGH', 'SKINFOLD', 'Pliegue del muslo anterior', 'mm', 0, 80, 5, 2, false, true, true, 110),
  ('SKF_MEDIAL_CALF', 'SKINFOLD', 'Pliegue de la pantorrilla medial', 'mm', 0, 80, 5, 2, false, true, true, 120),
  ('GIRTH_HEAD', 'GIRTH', 'Perímetro de la cabeza', 'cm', 40, 70, 1, 2, false, false, true, 130),
  ('GIRTH_NECK', 'GIRTH', 'Perímetro del cuello', 'cm', 20, 60, 1, 2, false, false, true, 140),
  ('GIRTH_ARM_RELAXED', 'GIRTH', 'Perímetro del brazo relajado', 'cm', 12, 70, 1, 2, false, true, true, 150),
  ('GIRTH_ARM_FLEXED', 'GIRTH', 'Perímetro del brazo flexionado y en tensión', 'cm', 12, 75, 1, 2, false, true, true, 160),
  ('GIRTH_FOREARM', 'GIRTH', 'Perímetro del antebrazo', 'cm', 12, 50, 1, 2, false, false, true, 170),
  ('GIRTH_WRIST', 'GIRTH', 'Perímetro de la muñeca', 'cm', 8, 25, 1, 2, false, false, true, 180),
  ('GIRTH_CHEST', 'GIRTH', 'Perímetro del tórax', 'cm', 40, 170, 1, 2, false, false, true, 190),
  ('GIRTH_WAIST', 'GIRTH', 'Perímetro de la cintura', 'cm', 40, 200, 1, 2, true, true, true, 200),
  ('GIRTH_HIP', 'GIRTH', 'Perímetro de la cadera', 'cm', 45, 200, 1, 2, true, true, true, 210),
  ('GIRTH_THIGH_GLUTEAL', 'GIRTH', 'Perímetro del muslo a 1 cm del pliegue glúteo', 'cm', 25, 110, 1, 2, false, false, true, 220),
  ('GIRTH_THIGH', 'GIRTH', 'Perímetro del muslo medio', 'cm', 20, 100, 1, 2, false, true, true, 230),
  ('GIRTH_CALF', 'GIRTH', 'Perímetro de la pantorrilla', 'cm', 15, 70, 1, 2, false, true, true, 240),
  ('GIRTH_ANKLE', 'GIRTH', 'Perímetro del tobillo', 'cm', 10, 40, 1, 2, false, false, true, 250),
  ('LENGTH_ACROMIALE_RADIALE', 'LENGTH', 'Longitud acromial-radial', 'cm', 14, 45, 1, 2, false, false, true, 260),
  ('LENGTH_RADIALE_STYLION', 'LENGTH', 'Longitud radial-estilión', 'cm', 10, 35, 1, 2, false, false, true, 270),
  ('LENGTH_MIDSTYLION_DACTYLION', 'LENGTH', 'Longitud mediestilión-dactilión', 'cm', 8, 25, 1, 2, false, false, true, 280),
  ('LENGTH_ILIOSPINALE_HEIGHT', 'LENGTH', 'Altura ilioespinal', 'cm', 40, 130, 1, 2, false, false, true, 290),
  ('LENGTH_TROCHANTERION_HEIGHT', 'LENGTH', 'Altura trocantérea', 'cm', 40, 125, 1, 2, false, false, true, 300),
  ('LENGTH_TROCHANTERION_TIBIALE_LATERALE', 'LENGTH', 'Longitud trocantéreo-tibial lateral', 'cm', 18, 60, 1, 2, false, false, true, 310),
  ('LENGTH_TIBIALE_LATERALE_HEIGHT', 'LENGTH', 'Altura tibial lateral', 'cm', 20, 65, 1, 2, false, false, true, 320),
  ('LENGTH_TIBIALE_MEDIALE_SPHYRION_TIBIALE', 'LENGTH', 'Longitud tibial medial-maleolar', 'cm', 16, 55, 1, 2, false, false, true, 330),
  ('LENGTH_FOOT', 'LENGTH', 'Longitud del pie', 'cm', 12, 35, 1, 2, false, false, true, 340),
  ('BREADTH_BIACROMIAL', 'BREADTH', 'Diámetro biacromial', 'cm', 18, 55, 1, 2, false, false, true, 350),
  ('BREADTH_BIILIOCRISTAL', 'BREADTH', 'Diámetro biiliocrestal', 'cm', 14, 45, 1, 2, false, false, true, 360),
  ('BREADTH_TRANSVERSE_CHEST', 'BREADTH', 'Diámetro transverso del tórax', 'cm', 14, 45, 1, 2, false, false, true, 370),
  ('BREADTH_AP_CHEST', 'BREADTH', 'Diámetro anteroposterior del tórax', 'cm', 9, 35, 1, 2, false, false, true, 380),
  ('BREADTH_HUMERUS', 'BREADTH', 'Diámetro biepicondíleo del húmero', 'cm', 3, 10, 1, 2, false, true, true, 390),
  ('BREADTH_WRIST', 'BREADTH', 'Diámetro biestiloideo de la muñeca', 'cm', 2.5, 8, 1, 2, false, true, true, 400),
  ('BREADTH_FEMUR', 'BREADTH', 'Diámetro bicondíleo del fémur', 'cm', 5, 14, 1, 2, false, true, true, 410),
  ('BREADTH_ANKLE', 'BREADTH', 'Diámetro bimaleolar del tobillo', 'cm', 4, 10, 1, 2, false, false, true, 420),
  ('SKF_CHEST', 'SKINFOLD', 'Pliegue pectoral (Jackson y Pollock)', 'mm', 0, 80, 5, 2, false, false, false, 430),
  ('SKF_MIDAXILLARY', 'SKINFOLD', 'Pliegue axilar medio (Jackson y Pollock)', 'mm', 0, 80, 5, 2, false, false, false, 440),
  ('SKF_SUPRAILIAC', 'SKINFOLD', 'Pliegue suprailíaco (Jackson y Pollock)', 'mm', 0, 80, 5, 2, false, false, false, 450);

-- El catálogo global es de solo lectura para la aplicación (RN-I01).
REVOKE INSERT, UPDATE ON assessment.measurement_site FROM app_user;

-- ETM (RN-C05) ------------------------------------------------------------------------------------------------------
-- El ETM calculado guarda los pares del estudio para recalcular el %ETM agrupado de una suma de pliegues; el declarado
-- no tiene pares. Una fila no se edita: un estudio nuevo agrega filas con su vigencia.
ALTER TABLE assessment.evaluator_error ADD COLUMN pairs jsonb;
ALTER TABLE assessment.evaluator_error
  ADD CONSTRAINT evaluator_error_pairs CHECK ((source = 'CALCULATED') = (pairs IS NOT NULL));
CREATE INDEX evaluator_error_current
  ON assessment.evaluator_error (organization_id, member_id, site_code, valid_from DESC, created_at DESC);
REVOKE UPDATE ON assessment.evaluator_error FROM app_user;

-- Enmienda (RN-C07) -------------------------------------------------------------------------------------------------
-- Una evaluación se enmienda una sola vez: la revisión siguiente se enmienda a su vez.
CREATE UNIQUE INDEX evaluation_amended_once
  ON assessment.evaluation (amends_evaluation_id) WHERE amends_evaluation_id IS NOT NULL;

-- Bioimpedancia (RN-C08) --------------------------------------------------------------------------------------------
-- Como las tomas: solo cambia mientras la evaluación está en borrador.
CREATE FUNCTION assessment.guard_bia_reading_of_closed_evaluation() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_evaluation_id uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.evaluation_id ELSE NEW.evaluation_id END;
  v_status        text;
BEGIN
  SELECT e.status INTO v_status FROM assessment.evaluation e WHERE e.id = v_evaluation_id;
  IF v_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'La evaluación % no está en borrador: su bioimpedancia no cambia (RN-C07)', v_evaluation_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.evaluation_id <> NEW.evaluation_id THEN
    RAISE EXCEPTION 'Una lectura no cambia de evaluación' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

CREATE TRIGGER bia_reading_only_in_draft
  BEFORE INSERT OR UPDATE OR DELETE ON assessment.bia_reading
  FOR EACH ROW EXECUTE FUNCTION assessment.guard_bia_reading_of_closed_evaluation();
GRANT DELETE ON assessment.bia_reading TO app_user;

-- Equipo de atención (RN-A05, ADR-037) ------------------------------------------------------------------------------
-- Las tomas y la bioimpedancia no tienen patient_id: se ven y se escriben solo si se ve su evaluación, que sí tiene
-- care_team_scope. La subconsulta corre con la RLS de quien consulta.
CREATE POLICY care_team_by_evaluation ON assessment.measurement AS RESTRICTIVE
  USING (EXISTS (SELECT 1 FROM assessment.evaluation e WHERE e.id = evaluation_id))
  WITH CHECK (EXISTS (SELECT 1 FROM assessment.evaluation e WHERE e.id = evaluation_id));
CREATE POLICY care_team_by_evaluation ON assessment.bia_reading AS RESTRICTIVE
  USING (EXISTS (SELECT 1 FROM assessment.evaluation e WHERE e.id = evaluation_id))
  WITH CHECK (EXISTS (SELECT 1 FROM assessment.evaluation e WHERE e.id = evaluation_id));

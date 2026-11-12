-- P14.5 (PR 6b-1) · El alumno ve y sube sus fotos de progreso, pero no las borra (05 §3; RN-G20; ADR-119): las borra el sistema al
-- archivarlo o cuando revoca su consentimiento. DELETE no pasa por el WITH CHECK de patient_scope, así que va su propia política.
CREATE POLICY patient_no_delete ON training.progress_photo AS RESTRICTIVE FOR DELETE
  USING (app.role() IS DISTINCT FROM 'PATIENT');

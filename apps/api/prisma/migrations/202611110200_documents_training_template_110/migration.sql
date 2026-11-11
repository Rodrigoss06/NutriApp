-- P14.5 (PR 9c) · La ficha de rutina 1.1.0 (RN-H01, RN-H02; P-34; ADR-114): las series se escriben con lo que el snapshot sabe
-- del ejercicio, «/lado» en un unilateral, los segundos de una isometría y «esfuerzo suave (RPE 5–6)» en la movilidad y el cardio
-- con RIR 4 o más. Las secciones no cambian. La 1.0.0 queda retirada: el código la sigue dibujando para volver a generar lo que ya
-- se generó con ella. Una sola activa por tipo (template_one_active).
UPDATE documents.template SET status = 'RETIRED'
WHERE organization_id IS NULL AND kind = 'TRAINING' AND version = '1.0.0';

INSERT INTO documents.template (id, organization_id, kind, version, layout)
SELECT '019a1c00-0000-7000-8000-00000000000b', NULL, 'TRAINING', '1.1.0', layout
FROM documents.template
WHERE organization_id IS NULL AND kind = 'TRAINING' AND version = '1.0.0';

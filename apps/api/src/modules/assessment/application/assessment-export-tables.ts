import type { PatientExportTable } from '../../clinical/index.js';

const OF_EVALUATIONS =
  'evaluation_id IN (SELECT id FROM assessment.evaluation WHERE patient_id = $1)';

/**
 * Lo de assessment en la exportación del paciente (RN-B04, ADR-131): sus evaluaciones con sus tomas y su bioimpedancia, los resultados
 * con sus indicadores, el método preferido por indicador y las pruebas posturales, de movimiento y físicas con su evidencia (ADR-075).
 */
export const ASSESSMENT_EXPORT_TABLES: readonly PatientExportTable[] = [
  { table: 'assessment.evaluation' },
  { table: 'assessment.measurement', where: OF_EVALUATIONS, orderBy: 'evaluation_id, site_code' },
  { table: 'assessment.bia_reading', where: OF_EVALUATIONS },
  { table: 'assessment.calculation_result' },
  { table: 'assessment.result_metric', orderBy: 'result_id, metric_code' },
  { table: 'assessment.method_preference' },
  { table: 'assessment.movement_screen', orderBy: 'evaluation_id, test_code' },
  { table: 'assessment.physical_test_result', orderBy: 'evaluation_id, test_code' },
];

import type { PatientExportTable } from '../../clinical/index.js';

const OF_PROGRAMS = 'program_id IN (SELECT id FROM training.program WHERE patient_id = $1)';
const OF_MESOCYCLES =
  'mesocycle_id IN (SELECT ms.id FROM training.mesocycle ms JOIN training.program p ON p.id = ms.program_id WHERE p.patient_id = $1)';
const OF_WEEKS = `week_id IN (SELECT w.id FROM training.program_week w WHERE w.${OF_MESOCYCLES})`;
const OF_SESSIONS = `session_id IN (SELECT s.id FROM training.session s WHERE s.${OF_WEEKS})`;
const OF_EXERCISES = `prescribed_exercise_id IN (SELECT e.id FROM training.prescribed_exercise e WHERE e.${OF_SESSIONS})`;

/**
 * Lo de training en la exportación del paciente (RN-B04, ADR-131): su perfil de entrenamiento, sus programas con su snapshot y todas
 * sus partes (ADR-077), los controles semanales con la decisión del coach, los informes del mesociclo con su comentario y sus fotos de
 * progreso; los archivos de las fotos van en su carpeta (RN-G19, RN-G20).
 */
export const TRAINING_EXPORT_TABLES: readonly PatientExportTable[] = [
  { table: 'training.athlete_profile' },
  { table: 'training.program' },
  { table: 'training.mesocycle', where: OF_PROGRAMS },
  { table: 'training.program_week', where: OF_MESOCYCLES },
  { table: 'training.session', where: OF_WEEKS },
  { table: 'training.prescribed_exercise', where: OF_SESSIONS },
  { table: 'training.prescribed_set', where: OF_EXERCISES },
  { table: 'training.weekly_review' },
  { table: 'training.mesocycle_report' },
  { table: 'training.progress_photo' },
];

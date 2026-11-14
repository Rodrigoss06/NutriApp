import type { PatientExportTable } from '../../clinical/index.js';

/**
 * Lo de tracking en la exportación del paciente (RN-B04, ADR-131): todos sus registros (comida, agua, entrenamientos con sus series,
 * registro diario y recuperación, métricas, notas, lecturas de dispositivos), los check-in del domingo, los cambios del día, los
 * ajustes del profesional, su meta de cada día y el plan activo que ve en la app.
 */
export const TRACKING_EXPORT_TABLES: readonly PatientExportTable[] = [
  { table: 'tracking.active_plan_view', orderBy: 'patient_id' },
  { table: 'tracking.daily_target', orderBy: 'local_date' },
  { table: 'tracking.day_change' },
  { table: 'tracking.food_log' },
  { table: 'tracking.hydration_log' },
  { table: 'tracking.workout_log' },
  { table: 'tracking.set_log' },
  { table: 'tracking.daily_checkin' },
  { table: 'tracking.daily_readiness' },
  { table: 'tracking.metric_log' },
  { table: 'tracking.note_log' },
  { table: 'tracking.device_reading' },
  { table: 'tracking.weekly_checkin' },
  { table: 'tracking.log_adjustment' },
];

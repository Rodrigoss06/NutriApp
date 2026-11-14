// API pública de clinical (02 §2). Otros contextos solo importan esto.
export {
  ClinicalApi,
  type DietaryCondition,
  type LatestScreening,
  type PatientCard,
  type PatientRef,
} from './application/clinical-api.js';
export {
  HEALTH_DATA_REQUIRED,
  MENSTRUAL_TRACKING_REQUIRED,
  PROGRESS_PHOTOS_REQUIRED,
  PATIENT_ARCHIVED,
  PATIENT_NOT_FOUND,
  WRITE_ACCESS_REQUIRED,
} from './domain/clinical-rules.js';
export type { TimelineRecord as TimelineEntry } from './application/ports/clinical.ports.js';
export type { TimelineCursor, TimelineSource } from './application/timeline-sources.js';
export {
  NOT_EXPORTED,
  PatientExportSources,
  type PatientExportSource,
  type PatientExportTable,
} from './application/patient-export-sources.js';
/** Para el trabajo de cada hora en las pruebas, como RemindersHandler de scheduling. */
export { PatientExportCommands } from './application/commands/patient-export.commands.js';
/** La migración de cuentas (RF-40, ADR-135): el paciente con su consentimiento migrado, en su transacción. */
export {
  PatientImportCommands,
  type PatientImportInput,
  type PatientImportOutcome,
} from './application/commands/patient-import.commands.js';
export type { MigratedConsent } from './domain/patient-import.js';
export { ClinicalModule } from './clinical.module.js';

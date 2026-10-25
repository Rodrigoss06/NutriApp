// API pública de clinical (02 §2). Otros contextos solo importan esto.
export { ClinicalApi, type PatientCard, type PatientRef } from './application/clinical-api.js';
export {
  HEALTH_DATA_REQUIRED,
  PATIENT_ARCHIVED,
  PATIENT_NOT_FOUND,
  WRITE_ACCESS_REQUIRED,
} from './domain/clinical-rules.js';
export type { TimelineRecord as TimelineEntry } from './application/ports/clinical.ports.js';
export type { TimelineCursor, TimelineSource } from './application/timeline-sources.js';
export { ClinicalModule } from './clinical.module.js';

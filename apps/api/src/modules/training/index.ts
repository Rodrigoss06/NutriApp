// API pública de training (02 §2). Otros contextos solo importan esto.
export { TrainingApi, type ReviewOverview } from './application/training-api.js';
export type { VolumeFactorsRow } from './application/ports/weekly-review.ports.js';
export type { ProgramSnapshot } from './application/program-document.js';
export { TrainingModule } from './training.module.js';
export {
  WeekCheckinSources,
  type WeekCheckin,
  type WeekCheckinSource,
} from './application/week-checkins.js';

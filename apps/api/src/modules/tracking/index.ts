// API pública de tracking (02 §2). Otros contextos solo importan esto.
export { TrackingApi } from './application/tracking-api.js';
export type { DayCheckin, DayFacts, DayFood, DaySet, DayWorkout } from './domain/day-facts.js';
export { TrackingModule } from './tracking.module.js';

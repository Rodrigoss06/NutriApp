// API pública de exercise (02 §2). Otros contextos solo importan esto.
export { ExerciseApi, type PhysicalActivityRecord } from './application/exercise-api.js';
export type {
  ExerciseCatalog,
  ExerciseRecord,
  MuscleRef,
  PatternChoiceRecord,
} from './application/ports/exercise.port.js';
export { ExerciseModule } from './exercise.module.js';

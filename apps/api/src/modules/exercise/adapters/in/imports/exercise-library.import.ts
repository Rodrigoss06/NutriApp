import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ImportRegistry } from '../../../../../platform/index.js';
import {
  SaveLibraryHandler,
  SavePatternChoicesHandler,
} from '../../../application/commands/save-library.handlers.js';
import {
  LIBRARY_COLUMNS,
  parseLibraryRow,
  parsePatternChoiceRow,
  PATTERN_CHOICE_COLUMNS,
  type LibraryExercise,
  type PatternChoiceRow,
} from '../../../domain/exercise-library.js';

/**
 * EXERCISE_LIBRARY: seeds/exercise/ejercicios-base.csv, y EXERCISE_PATTERN_CHOICES: seeds/exercise/pattern-choice-v3.csv,
 * que apunta a los ejercicios del primero (RF-38, RN-F14, ADR-071).
 */
@Injectable()
export class ExerciseLibraryImport implements OnModuleInit {
  constructor(
    private readonly registry: ImportRegistry,
    private readonly saveLibrary: SaveLibraryHandler,
    private readonly saveChoices: SavePatternChoicesHandler,
  ) {}

  onModuleInit(): void {
    this.registry.register<LibraryExercise>({
      kind: 'EXERCISE_LIBRARY',
      columns: LIBRARY_COLUMNS,
      parse: parseLibraryRow,
      key: (exercise) => exercise.code,
      save: (exercises) => this.saveLibrary.execute(exercises),
    });
    this.registry.register<PatternChoiceRow>({
      kind: 'EXERCISE_PATTERN_CHOICES',
      columns: PATTERN_CHOICE_COLUMNS,
      parse: parsePatternChoiceRow,
      key: (choice) => `${choice.pattern}|${choice.level}`,
      save: (choices) => this.saveChoices.execute(choices),
    });
  }
}

import { Inject, Injectable } from '@nestjs/common';
import {
  err,
  ok,
  UNIT_OF_WORK,
  type DomainError,
  type Result,
  type SecurityContext,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import { EXERCISE_NOT_FOUND } from '../../domain/exercise-errors.js';
import { ExerciseApi } from '../exercise-api.js';
import type {
  ExerciseCatalog,
  ExerciseRecord,
  ExerciseSearch,
  ExerciseSummaryRecord,
  PatternChoiceRecord,
} from '../ports/exercise.port.js';

/** La biblioteca de ejercicios para las pantallas, en transacciones de solo lectura (RN-I01). */
@Injectable()
export class ExerciseQueries {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(ExerciseApi) private readonly exercises: ExerciseApi,
  ) {}

  catalog(context: SecurityContext): Promise<ExerciseCatalog> {
    return this.uow.query(context, () => this.exercises.catalog());
  }

  search(
    context: SecurityContext,
    search: ExerciseSearch,
  ): Promise<readonly ExerciseSummaryRecord[]> {
    return this.uow.query(context, () => this.exercises.searchExercises(search));
  }

  detail(context: SecurityContext, id: string): Promise<Result<ExerciseRecord, DomainError>> {
    return this.uow.query(context, async () => {
      const [exercise] = await this.exercises.exercisesById([id]);
      return exercise ? ok(exercise) : err(EXERCISE_NOT_FOUND);
    });
  }

  patternChoices(context: SecurityContext): Promise<readonly PatternChoiceRecord[]> {
    return this.uow.query(context, () => this.exercises.patternChoices());
  }
}

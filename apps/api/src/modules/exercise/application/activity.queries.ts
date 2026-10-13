import { Inject, Injectable } from '@nestjs/common';
import { UNIT_OF_WORK, type SecurityContext, type UnitOfWork } from '@nutricoach/shared-kernel';
import { ExerciseApi, type PhysicalActivityRecord } from './exercise-api.js';

/** Búsqueda de actividades para las pantallas, en una transacción de solo lectura. */
@Injectable()
export class ActivityQueries {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(ExerciseApi) private readonly exercise: ExerciseApi,
  ) {}

  search(
    context: SecurityContext,
    text: string | null,
  ): Promise<readonly PhysicalActivityRecord[]> {
    return this.uow.query(context, () => this.exercise.searchActivities(text));
  }
}

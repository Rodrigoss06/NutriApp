import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  err,
  ID_GENERATOR,
  ok,
  OUTBOX,
  UNIT_OF_WORK,
  type Clock,
  type DomainError,
  type IdGenerator,
  type Outbox,
  type Result,
  type SecurityContext,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import { atomically } from '../../../../platform/index.js';
import { ClinicalApi } from '../../../clinical/index.js';
import { FoodApi } from '../../../food/index.js';
import { CONDITION_NOT_DIETARY, EXCLUDED_FOOD_NOT_FOUND } from '../../domain/food-exclusion.js';
import { nutritionEvent } from '../nutrition-events.js';
import { FOOD_EXCLUSION_STORE, type FoodExclusionStore } from '../ports/nutrition.ports.js';

/**
 * Enlaza una alergia o intolerancia activa con los alimentos que excluye de la dieta (RN-E17). Es escribir datos de salud:
 * exige ver al paciente, acceso de escritura en su equipo y HEALTH_DATA vigente (RN-A05, RN-B01), y queda auditado.
 */
@Injectable()
export class FoodExclusionCommands {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(OUTBOX) private readonly outbox: Outbox,
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
    @Inject(FoodApi) private readonly foods: FoodApi,
    @Inject(FOOD_EXCLUSION_STORE) private readonly store: FoodExclusionStore,
  ) {}

  set(
    context: SecurityContext,
    patientId: string,
    conditionId: string,
    foodIds: readonly string[],
  ): Promise<Result<void, DomainError>> {
    return atomically(this.uow, context, async () => {
      const patient = await this.clinical.ensureRecordWritable(context, patientId);
      if (!patient.ok) return patient;
      const conditions = await this.clinical.dietaryConditions(patientId);
      if (!conditions.some((condition) => condition.id === conditionId)) {
        return err(CONDITION_NOT_DIETARY);
      }
      const unique = [...new Set(foodIds)];
      const found = await this.foods.foodsById(unique);
      if (found.length < unique.length) return err(EXCLUDED_FOOD_NOT_FOUND);
      const { organizationId, userId } = context;
      if (!organizationId || !userId) throw new Error('Enlazar alimentos necesita quién lo hace.');
      await this.store.replace({
        organizationId,
        patientId,
        conditionId,
        foodIds: unique,
        createdBy: userId,
        now: this.clock.now(),
      });
      await this.outbox.append(
        [
          nutritionEvent(
            'nutrition.exclusion.changed',
            organizationId,
            conditionId,
            { patientId },
            { clock: this.clock, ids: this.ids },
          ),
        ],
        { actorUserId: userId, actorRole: context.role },
      );
      return ok(undefined);
    });
  }
}

import { Inject, Injectable } from '@nestjs/common';
import {
  AUDIT_PORT,
  UNIT_OF_WORK,
  type AuditPort,
  type Id,
  type PatientId,
  type SecurityContext,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import { ClinicalApi } from '../../../clinical/index.js';
import { FoodApi } from '../../../food/index.js';
import type { FoodExclusion } from '../../domain/food-exclusion.js';
import { FoodExclusions } from '../food-exclusions.js';
import { NUTRITION_PLAN_STORE, type NutritionPlanStore } from '../ports/nutrition.ports.js';

export interface FoodExclusionView {
  readonly conditions: readonly (Omit<FoodExclusion, 'foodIds'> & {
    readonly foods: readonly { readonly id: string; readonly name: string }[];
  })[];
  /** El plan vigente, solo si lleva un alimento excluido: lo publicado no cambia (RN-E15). */
  readonly publishedPlan: {
    readonly id: string;
    readonly versionNo: number;
    readonly problems: readonly string[];
  } | null;
}

/** Lo que una alergia o intolerancia excluye de la dieta (RN-E17). Lee datos de salud: deja un READ (RN-B03). */
@Injectable()
export class FoodExclusionQueries {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
    @Inject(FoodApi) private readonly foods: FoodApi,
    @Inject(FoodExclusions) private readonly exclusions: FoodExclusions,
    @Inject(NUTRITION_PLAN_STORE) private readonly plans: NutritionPlanStore,
  ) {}

  /** null si no se ve al paciente (RN-A05). */
  async list(context: SecurityContext, patientId: string): Promise<FoodExclusionView | null> {
    const view = await this.uow.query(context, async () => {
      if (!(await this.clinical.patientRef(patientId))) return null;
      const exclusions = await this.exclusions.ofPatient(patientId);
      const found = await this.foods.foodsById(exclusions.flatMap((e) => e.foodIds));
      const names = new Map(found.map((food) => [food.id, food.name]));
      const published = (await this.plans.listByPatient(patientId)).find(
        (plan) => plan.status === 'PUBLISHED',
      );
      const record = published ? await this.plans.find(published.id) : null;
      const problems = record ? await this.exclusions.problems(patientId, record.draft) : [];
      return {
        conditions: exclusions.map(({ foodIds, ...condition }) => ({
          ...condition,
          foods: foodIds.flatMap((id) => {
            const name = names.get(id);
            return name === undefined ? [] : [{ id, name }];
          }),
        })),
        publishedPlan:
          record && problems.length > 0
            ? { id: record.id, versionNo: record.versionNo, problems }
            : null,
      };
    });
    if (!view) return null;
    await this.audit.record(context, {
      action: 'READ',
      resourceType: 'nutrition.food_exclusion',
      resourceId: patientId as Id<string>,
      patientId: patientId as PatientId,
    });
    return view;
  }
}

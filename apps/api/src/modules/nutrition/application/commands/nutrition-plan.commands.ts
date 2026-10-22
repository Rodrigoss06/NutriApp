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
  type OrganizationId,
  type Outbox,
  type Result,
  type SecurityContext,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import { atomically } from '../../../../platform/index.js';
import { ClinicalApi } from '../../../clinical/index.js';
import { PRESCRIPTION_NOT_FOUND } from '../../domain/energy-rules.js';
import {
  DEFAULT_MEALS,
  PLAN_NOT_DRAFT,
  PLAN_NOT_FOUND,
  PLAN_VERSION_CONFLICT,
  type PlanDraftInput,
} from '../../domain/nutrition-plan.js';
import { nutritionEvent, type NutritionEventType } from '../nutrition-events.js';
import { PlanCalculator } from '../plan-calculator.js';
import {
  ENERGY_PRESCRIPTION_STORE,
  NUTRITION_PLAN_STORE,
  type EnergyPrescriptionStore,
  type NutritionPlanStore,
} from '../ports/nutrition.ports.js';

/** Un borrador nuevo empieza sin grupos fijos, con los tiempos de G-19 y sin alimentos ni hidratación. */
const NEW_DRAFT: PlanDraftInput = {
  fixedServings: { VEG: 0, FRU: 0, MILK: 0 },
  overrides: {},
  meals: DEFAULT_MEALS,
  splitOverrides: {},
  hydrationTargetMl: null,
  instructions: null,
};

/** Las partes del borrador que cambiaron, para la auditoría: nombres, nunca valores (RN-B03). */
function changedFields(before: PlanDraftInput, after: PlanDraftInput): readonly string[] {
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const meals = (draft: PlanDraftInput) =>
    draft.meals.map(({ slotCode, name, timeOfDay, sharePct }) => [
      slotCode,
      name,
      timeOfDay,
      sharePct,
    ]);
  const foods = (draft: PlanDraftInput) => draft.meals.map((m) => m.allowedFoods);
  return [
    ...(same([before.fixedServings, before.overrides], [after.fixedServings, after.overrides])
      ? []
      : ['plan_exchange']),
    ...(same(meals(before), meals(after)) ? [] : ['plan_meal']),
    ...(same(before.splitOverrides, after.splitOverrides) ? [] : ['plan_meal_exchange']),
    ...(same(foods(before), foods(after)) ? [] : ['plan_meal_allowed_food']),
    ...(before.hydrationTargetMl === after.hydrationTargetMl ? [] : ['hydration_target_ml']),
    ...(before.instructions === after.instructions ? [] : ['instructions']),
  ];
}

/**
 * Plan nutricional por intercambios (RF-19, 02 §7): un borrador que parte de una prescripción energética con sus metas
 * (RF-18) y que se edita entero con If-Match. Publicado es inmutable (RN-E15). Exige escribir datos de salud del
 * paciente (RN-A05, RN-B01) y cada escritura deja su evento para la auditoría (RN-B03).
 */
@Injectable()
export class NutritionPlanCommands {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(OUTBOX) private readonly outbox: Outbox,
    @Inject(NUTRITION_PLAN_STORE) private readonly plans: NutritionPlanStore,
    @Inject(ENERGY_PRESCRIPTION_STORE) private readonly prescriptions: EnergyPrescriptionStore,
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
    @Inject(PlanCalculator) private readonly calculator: PlanCalculator,
  ) {}

  create(
    context: SecurityContext,
    patientId: string,
    input: { readonly energyPrescriptionId: string; readonly exchangeListId: string },
  ): Promise<Result<{ id: string }, DomainError>> {
    return atomically(this.uow, context, async () => {
      const patient = await this.clinical.ensureRecordWritable(context, patientId);
      if (!patient.ok) return patient;
      const prescription = await this.prescriptions.find(input.energyPrescriptionId);
      if (prescription?.patientId !== patientId) return err(PRESCRIPTION_NOT_FOUND);
      const organizationId = this.#organization(context);
      const userId = context.userId;
      if (!userId) throw new Error('Un plan necesita quién lo crea.');
      const calculated = await this.calculator.calculate(
        organizationId,
        prescription,
        input.exchangeListId,
        NEW_DRAFT,
      );
      if (!calculated.ok) return calculated;
      const id = this.ids.newId<'NutritionPlanId'>();
      const lineageId = this.ids.newId<'PlanLineageId'>();
      await this.plans.insert(
        {
          id,
          organizationId,
          patientId,
          lineageId,
          versionNo: 1,
          energyPrescriptionId: prescription.id,
          exchangeListId: calculated.value.list.id,
          exchangeListVersion: calculated.value.list.version,
          targets: calculated.value.targets,
          createdBy: userId,
          now: this.clock.now(),
        },
        calculated.value.calculation.plan,
      );
      await this.#event(context, 'nutrition.plan.created', id, {
        patientId,
        lineageId,
        versionNo: 1,
      });
      return ok({ id });
    });
  }

  update(
    context: SecurityContext,
    planId: string,
    version: number,
    input: PlanDraftInput,
  ): Promise<Result<{ id: string; version: number }, DomainError>> {
    return atomically(this.uow, context, async () => {
      const existing = await this.plans.find(planId);
      if (!existing) return err(PLAN_NOT_FOUND);
      const patient = await this.clinical.ensureRecordWritable(context, existing.patientId);
      if (!patient.ok) return patient;
      if (existing.status !== 'DRAFT') return err(PLAN_NOT_DRAFT);
      const prescription = await this.prescriptions.find(existing.energyPrescriptionId);
      if (!prescription) return err(PRESCRIPTION_NOT_FOUND);
      const calculated = await this.calculator.calculate(
        this.#organization(context),
        prescription,
        existing.exchangeListId,
        input,
      );
      if (!calculated.ok) return calculated;
      const saved = await this.plans.replaceDraft(
        planId,
        version,
        calculated.value.calculation.plan,
        this.clock.now(),
      );
      if (!saved) return err(PLAN_VERSION_CONFLICT);
      await this.#event(context, 'nutrition.plan.updated', planId, {
        patientId: existing.patientId,
        fields: changedFields(existing.draft, input),
      });
      return ok({ id: planId, version: version + 1 });
    });
  }

  #organization(context: SecurityContext): OrganizationId {
    if (!context.organizationId) throw new Error('Un plan necesita la organización activa.');
    return context.organizationId;
  }

  async #event(
    context: SecurityContext,
    type: NutritionEventType,
    planId: string,
    payload: { readonly patientId: string } & Record<string, unknown>,
  ): Promise<void> {
    await this.outbox.append(
      [
        nutritionEvent(type, this.#organization(context), planId, payload, {
          clock: this.clock,
          ids: this.ids,
        }),
      ],
      { actorUserId: context.userId, actorRole: context.role },
    );
  }
}

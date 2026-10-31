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
import { planHasExcludedFoods } from '../../domain/food-exclusion.js';
import type { PlanDraft } from '../../domain/food-plan.js';
import {
  draftExists,
  PLAN_MODALITY_MISMATCH,
  PLAN_NOT_DRAFT,
  PLAN_NOT_FOUND,
  PLAN_VERSION_CONFLICT,
  planNotReady,
} from '../../domain/nutrition-plan.js';
import { localDateOf } from '../energy-basis.js';
import { FoodExclusions } from '../food-exclusions.js';
import { nutritionEvent, type NutritionEventType } from '../nutrition-events.js';
import { PlanCalculator } from '../plan-calculator.js';
import { planSnapshot } from '../plan-document.js';
import {
  calculateDraft,
  changedFields,
  contentOf,
  documentOf,
  newDraft,
  problemsOf,
  type CalculatedDraft,
} from '../plan-drafts.js';
import {
  ENERGY_PRESCRIPTION_STORE,
  NUTRITION_PLAN_STORE,
  type EnergyPrescriptionRecord,
  type EnergyPrescriptionStore,
  type NutritionPlanStore,
} from '../ports/nutrition.ports.js';

/** Un plan nuevo: su modalidad y la prescripción de la que salen sus metas; por intercambios, también su lista. */
export type CreatePlanInput =
  | {
      readonly modality: 'EXCHANGES';
      readonly energyPrescriptionId: string;
      readonly exchangeListId: string;
    }
  | { readonly modality: 'COMPOSITION' | 'WEEKLY_MENU'; readonly energyPrescriptionId: string };

/** La lista que usa un plan por intercambios y su versión (RN-E11); las otras modalidades no tienen. */
function listOf(calculated: CalculatedDraft): { id: string | null; version: string | null } {
  return calculated.modality === 'EXCHANGES'
    ? { id: calculated.value.list.id, version: calculated.value.list.version }
    : { id: null, version: null };
}

/**
 * Plan nutricional (02 §7) por intercambios (RF-19), por composición (RF-20) o menú semanal (RF-21): un borrador que
 * parte de una prescripción energética con sus metas (RF-18) y que se edita entero con If-Match. La modalidad se elige
 * al crearlo y no cambia. Publicado es inmutable (RN-E15). Exige escribir datos de salud del paciente (RN-A05, RN-B01)
 * y cada escritura deja su evento para la auditoría (RN-B03).
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
    @Inject(FoodExclusions) private readonly exclusions: FoodExclusions,
  ) {}

  create(
    context: SecurityContext,
    patientId: string,
    input: CreatePlanInput,
  ): Promise<Result<{ id: string }, DomainError>> {
    return atomically(this.uow, context, async () => {
      const patient = await this.clinical.ensureRecordWritable(context, patientId);
      if (!patient.ok) return patient;
      const prescription = await this.prescriptions.find(input.energyPrescriptionId);
      if (prescription?.patientId !== patientId) return err(PRESCRIPTION_NOT_FOUND);
      const organizationId = this.#organization(context);
      const userId = context.userId;
      if (!userId) throw new Error('Un plan necesita quién lo crea.');
      const calculated = await this.#calculate(
        organizationId,
        prescription,
        input.modality === 'EXCHANGES' ? input.exchangeListId : null,
        newDraft(input.modality),
      );
      if (!calculated.ok) return calculated;
      const id = this.ids.newId<'NutritionPlanId'>();
      const lineageId = this.ids.newId<'PlanLineageId'>();
      const list = listOf(calculated.value);
      await this.plans.insert(
        {
          id,
          organizationId,
          patientId,
          lineageId,
          versionNo: 1,
          energyPrescriptionId: prescription.id,
          exchangeListId: list.id,
          exchangeListVersion: list.version,
          targets: calculated.value.value.targets,
          createdBy: userId,
          now: this.clock.now(),
        },
        contentOf(calculated.value),
      );
      await this.#event(context, 'nutrition.plan.created', id, {
        patientId,
        lineageId,
        versionNo: 1,
        modality: input.modality,
      });
      return ok({ id });
    });
  }

  update(
    context: SecurityContext,
    planId: string,
    version: number,
    input: PlanDraft,
  ): Promise<Result<{ id: string; version: number }, DomainError>> {
    return atomically(this.uow, context, async () => {
      const existing = await this.plans.find(planId);
      if (!existing) return err(PLAN_NOT_FOUND);
      const patient = await this.clinical.ensureRecordWritable(context, existing.patientId);
      if (!patient.ok) return patient;
      if (existing.status !== 'DRAFT') return err(PLAN_NOT_DRAFT);
      if (input.modality !== existing.modality) return err(PLAN_MODALITY_MISMATCH);
      const prescription = await this.prescriptions.find(existing.energyPrescriptionId);
      if (!prescription) return err(PRESCRIPTION_NOT_FOUND);
      const calculated = await this.#calculate(
        this.#organization(context),
        prescription,
        existing.exchangeListId,
        input,
      );
      if (!calculated.ok) return calculated;
      const excluded = await this.exclusions.problems(existing.patientId, input);
      if (excluded.length > 0) return err(planHasExcludedFoods(excluded));
      const saved = await this.plans.replaceDraft(
        planId,
        version,
        contentOf(calculated.value),
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

  /**
   * Publica el borrador (RF-23, RN-E14, RN-E15): congela su snapshot con su hash, vale desde hoy en la fecha local del
   * paciente y el plan que estaba publicado pasa a SUPERSEDED. Sin hidratación no se publica (RN-E13); tampoco con un
   * tiempo del que el paciente no pueda registrar: en intercambios, sin un alimento permitido por grupo con
   * intercambios; en composición, sin alimentos; en el menú, sin la opción A algún día (RN-G05). Ni con un alimento
   * excluido por una alergia o intolerancia, que puede haberse enlazado después de guardar (RN-E17).
   */
  publish(
    context: SecurityContext,
    planId: string,
    version: number,
  ): Promise<Result<{ id: string }, DomainError>> {
    return atomically(this.uow, context, async () => {
      const existing = await this.plans.find(planId);
      if (!existing) return err(PLAN_NOT_FOUND);
      const patient = await this.clinical.ensureRecordWritable(context, existing.patientId);
      if (!patient.ok) return patient;
      if (existing.status !== 'DRAFT') return err(PLAN_NOT_DRAFT);
      if (existing.version !== version) return err(PLAN_VERSION_CONFLICT);
      const userId = context.userId;
      if (!userId) throw new Error('Un plan necesita quién lo publica.');
      const prescription = await this.prescriptions.find(existing.energyPrescriptionId);
      if (!prescription) return err(PRESCRIPTION_NOT_FOUND);
      const calculated = await this.#calculate(
        this.#organization(context),
        prescription,
        existing.exchangeListId,
        existing.draft,
      );
      if (!calculated.ok) return calculated;
      const excluded = await this.exclusions.problems(existing.patientId, existing.draft);
      if (excluded.length > 0) return err(planHasExcludedFoods(excluded));
      const problems = problemsOf(calculated.value);
      if (problems.length > 0) return err(planNotReady(problems));

      const now = this.clock.now();
      const validFrom = localDateOf(now, patient.value.timezone);
      const superseded = await this.plans.supersedePublished(existing.patientId, now);
      const { snapshot, hash } = planSnapshot(documentOf(calculated.value, existing.mealIds), {
        planId,
        lineageId: existing.lineageId,
        versionNo: existing.versionNo,
        patientId: existing.patientId,
        energyPrescriptionId: existing.energyPrescriptionId,
        validFrom,
        publishedAt: now.toISOString(),
        publishedBy: userId,
      });
      const published = await this.plans.publish(planId, version, {
        snapshot,
        hash,
        publishedAt: now,
        publishedBy: userId,
        validFrom,
      });
      if (!published) return err(PLAN_VERSION_CONFLICT);
      if (superseded) {
        await this.#event(context, 'nutrition.plan.superseded', superseded, {
          patientId: existing.patientId,
          supersededBy: planId,
        });
      }
      await this.#event(context, 'nutrition.plan.published', planId, {
        patientId: existing.patientId,
        lineageId: existing.lineageId,
        versionNo: existing.versionNo,
        validFrom,
        supersededPlanId: superseded,
      });
      return ok({ id: planId });
    });
  }

  /**
   * Versión nueva de un plan publicado o reemplazado (02 §7): un borrador con lo mismo, que se edita y se publica. Un
   * plan tiene a lo más un borrador a la vez. Se crea aunque lleve un alimento excluido: es como se corrige (RN-E17).
   */
  revise(context: SecurityContext, planId: string): Promise<Result<{ id: string }, DomainError>> {
    return atomically(this.uow, context, async () => {
      const source = await this.plans.find(planId);
      if (!source) return err(PLAN_NOT_FOUND);
      const patient = await this.clinical.ensureRecordWritable(context, source.patientId);
      if (!patient.ok) return patient;
      if (source.status === 'DRAFT') return err(draftExists(source.id));
      const lineage = await this.plans.lineage(source.lineageId);
      if (lineage.draftId) return err(draftExists(lineage.draftId));
      const userId = context.userId;
      if (!userId) throw new Error('Un plan necesita quién lo crea.');
      const prescription = await this.prescriptions.find(source.energyPrescriptionId);
      if (!prescription) return err(PRESCRIPTION_NOT_FOUND);
      const organizationId = this.#organization(context);
      const calculated = await this.#calculate(
        organizationId,
        prescription,
        source.exchangeListId,
        source.draft,
      );
      if (!calculated.ok) return calculated;
      const id = this.ids.newId<'NutritionPlanId'>();
      const versionNo = lineage.lastVersionNo + 1;
      await this.plans.insert(
        {
          id,
          organizationId,
          patientId: source.patientId,
          lineageId: source.lineageId,
          versionNo,
          energyPrescriptionId: source.energyPrescriptionId,
          exchangeListId: source.exchangeListId,
          exchangeListVersion: source.exchangeListVersion,
          targets: calculated.value.value.targets,
          createdBy: userId,
          now: this.clock.now(),
        },
        contentOf(calculated.value),
      );
      await this.#event(context, 'nutrition.plan.created', id, {
        patientId: source.patientId,
        lineageId: source.lineageId,
        versionNo,
        revisionOf: source.id,
      });
      return ok({ id });
    });
  }

  #calculate(
    organizationId: OrganizationId,
    prescription: EnergyPrescriptionRecord,
    exchangeListId: string | null,
    draft: PlanDraft,
  ): Promise<Result<CalculatedDraft, DomainError>> {
    return calculateDraft(this.calculator, organizationId, prescription, exchangeListId, draft);
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

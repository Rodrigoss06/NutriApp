import { Inject, Injectable } from '@nestjs/common';
import {
  AUDIT_PORT,
  err,
  ok,
  UNIT_OF_WORK,
  type AuditPort,
  type DomainError,
  type Id,
  type PatientId,
  type Result,
  type SecurityContext,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import { ClinicalApi } from '../../../clinical/index.js';
import { FoodApi } from '../../../food/index.js';
import type { PlanDraft } from '../../domain/food-plan.js';
import { PLAN_MODALITY_MISMATCH, PLAN_NOT_DRAFT } from '../../domain/nutrition-plan.js';
import { FoodExclusions } from '../food-exclusions.js';
import { PlanCalculator } from '../plan-calculator.js';
import type { PlanDocument, PlanSnapshot } from '../plan-document.js';
import { calculateDraft, documentOf, problemsOf } from '../plan-drafts.js';
import {
  ENERGY_PRESCRIPTION_STORE,
  NUTRITION_PLAN_STORE,
  type EnergyPrescriptionStore,
  type NutritionPlanRecord,
  type NutritionPlanStore,
  type NutritionPlanSummary,
} from '../ports/nutrition.ports.js';

/**
 * Un plan para leer: el borrador se calcula al leerlo; lo publicado se lee de su snapshot y nunca se recalcula
 * (RN-D08, RN-E15).
 */
export interface NutritionPlanView {
  readonly record: NutritionPlanRecord;
  readonly document: PlanDocument;
  readonly publishProblems: readonly string[];
  readonly snapshot: PlanSnapshot | null;
}

/** Un borrador calculado sin guardarlo: lo que el editor muestra mientras se escribe (RN-E10). */
export interface NutritionPlanPreviewView {
  readonly document: PlanDocument;
  readonly publishProblems: readonly string[];
}

export interface NutritionPlanListItem extends NutritionPlanSummary {
  /** Solo en intercambios (RN-E11). */
  readonly exchangeListCode: string | null;
}

/**
 * Lecturas de planes de cualquier modalidad (RF-19 a RF-21, RF-23): el historial del paciente y un plan con lo que
 * calcula el motor y lo que falta para publicarlo. Leen datos de salud: cada lectura deja un READ (RN-B03).
 */
@Injectable()
export class NutritionPlanQueries {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(NUTRITION_PLAN_STORE) private readonly plans: NutritionPlanStore,
    @Inject(ENERGY_PRESCRIPTION_STORE) private readonly prescriptions: EnergyPrescriptionStore,
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
    @Inject(FoodApi) private readonly foods: FoodApi,
    @Inject(PlanCalculator) private readonly calculator: PlanCalculator,
    @Inject(FoodExclusions) private readonly exclusions: FoodExclusions,
  ) {}

  /** null si no se ve al paciente. */
  async list(
    context: SecurityContext,
    patientId: string,
  ): Promise<readonly NutritionPlanListItem[] | null> {
    const plans = await this.uow.query(context, async () => {
      if (!(await this.clinical.patientRef(patientId))) return null;
      const summaries = await this.plans.listByPatient(patientId);
      const codes = new Map<string, string>();
      for (const id of new Set(summaries.flatMap((s) => s.exchangeListId ?? []))) {
        codes.set(id, (await this.foods.exchangeList(id))?.code ?? '');
      }
      return summaries.map((s) => ({
        ...s,
        exchangeListCode: s.exchangeListId === null ? null : (codes.get(s.exchangeListId) ?? ''),
      }));
    });
    if (!plans) return null;
    await this.#audited(context, patientId, patientId);
    return plans;
  }

  /** null si el plan no existe o no se ve a su paciente (RN-A05). */
  async detail(context: SecurityContext, planId: string): Promise<NutritionPlanView | null> {
    const view = await this.uow.query(context, async () => {
      const record = await this.plans.find(planId);
      if (!record) return null;
      if (record.status !== 'DRAFT') {
        const snapshot = await this.plans.snapshot(planId);
        if (!snapshot) throw new Error(`Plan ${planId} publicado sin snapshot.`);
        return { record, document: snapshot, publishProblems: [], snapshot };
      }
      const prescription = await this.prescriptions.find(record.energyPrescriptionId);
      if (!prescription || !context.organizationId) return null;
      const calculated = await calculateDraft(
        this.calculator,
        context.organizationId,
        prescription,
        record.exchangeListId,
        record.draft,
      );
      // Lo guardado ya pasó estas reglas: si no cuadra ahora, es una falla técnica.
      if (!calculated.ok) throw new Error(`Plan ${planId} sin calcular: ${calculated.error.code}`);
      return {
        record,
        document: documentOf(calculated.value, record.mealIds),
        publishProblems: [
          ...(await this.exclusions.problems(record.patientId, record.draft)),
          ...problemsOf(calculated.value),
        ],
        snapshot: null,
      };
    });
    if (!view) return null;
    await this.#audited(context, planId, view.record.patientId);
    return view;
  }

  /**
   * Un borrador calculado con lo que se está escribiendo, sin guardarlo: la adecuación en vivo del editor (RN-E10). Lo
   * publicado no se calcula de nuevo (RN-E15). Lee la prescripción del paciente: deja un READ (RN-B03). null si el plan
   * no existe o no se ve a su paciente.
   */
  async preview(
    context: SecurityContext,
    planId: string,
    input: PlanDraft,
  ): Promise<Result<NutritionPlanPreviewView, DomainError> | null> {
    const found = await this.uow.query(context, async () => {
      const record = await this.plans.find(planId);
      if (!record) return null;
      if (record.status !== 'DRAFT') return { record, result: err(PLAN_NOT_DRAFT) };
      if (input.modality !== record.modality) {
        return { record, result: err(PLAN_MODALITY_MISMATCH) };
      }
      const prescription = await this.prescriptions.find(record.energyPrescriptionId);
      if (!prescription || !context.organizationId) return null;
      const calculated = await calculateDraft(
        this.calculator,
        context.organizationId,
        prescription,
        record.exchangeListId,
        input,
      );
      if (!calculated.ok) return { record, result: calculated };
      return {
        record,
        result: ok({
          document: documentOf(calculated.value, []),
          publishProblems: [
            ...(await this.exclusions.problems(record.patientId, input)),
            ...problemsOf(calculated.value),
          ],
        }),
      };
    });
    if (!found) return null;
    await this.#audited(context, planId, found.record.patientId);
    return found.result;
  }

  async #audited(context: SecurityContext, resourceId: string, patientId: string): Promise<void> {
    await this.audit.record(context, {
      action: 'READ',
      resourceType: 'nutrition.plan',
      resourceId: resourceId as Id<string>,
      patientId: patientId as PatientId,
    });
  }
}

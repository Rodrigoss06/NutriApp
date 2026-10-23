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
import { publishProblems, type ExchangeGroupCode } from '../../domain/nutrition-plan.js';
import { planDocument, type PlanDocument, type PlanSnapshot } from '../plan-document.js';
import { PlanCalculator } from '../plan-calculator.js';
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

export interface NutritionPlanListItem extends NutritionPlanSummary {
  readonly exchangeListCode: string;
}

/**
 * Lecturas de planes (RF-19, RF-23): el historial del paciente y un plan con lo que calcula el motor y lo que falta para
 * publicarlo. Leen datos de salud: cada lectura deja un READ (RN-B03).
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
      for (const id of new Set(summaries.map((s) => s.exchangeListId))) {
        codes.set(id, (await this.foods.exchangeList(id))?.code ?? '');
      }
      return summaries.map((s) => ({ ...s, exchangeListCode: codes.get(s.exchangeListId) ?? '' }));
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
      const calculated = await this.calculator.calculate(
        context.organizationId,
        prescription,
        record.exchangeListId,
        record.draft,
      );
      // Lo guardado ya pasó estas reglas: si no cuadra ahora, es una falla técnica.
      if (!calculated.ok) throw new Error(`Plan ${planId} sin calcular: ${calculated.error.code}`);
      const names = Object.fromEntries(
        calculated.value.list.groups.map((g) => [g.code, g.name]),
      ) as Record<ExchangeGroupCode, string>;
      return {
        record,
        document: planDocument(calculated.value, record.mealIds),
        publishProblems: publishProblems(calculated.value.calculation.plan, names),
        snapshot: null,
      };
    });
    if (!view) return null;
    await this.#audited(context, planId, view.record.patientId);
    return view;
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

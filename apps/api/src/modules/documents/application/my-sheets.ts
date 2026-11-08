import { Inject, Injectable } from '@nestjs/common';
import {
  systemContext,
  UNIT_OF_WORK,
  type SecurityContext,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import { AssessmentApi } from '../../assessment/index.js';
import { TrackingApi } from '../../tracking/index.js';
import type { SheetSource } from './sheet-sources.js';

/** En el orden de la app. El contrato repite la lista. */
export const MY_SHEET_ORDER = ['PLAN', 'PROGRAM', 'RESULTS', 'EVOLUTION'] as const;
export type MySheetItem = (typeof MY_SHEET_ORDER)[number];

/**
 * Las fichas vigentes del paciente (ADR-080, ADR-095): el plan y la rutina que ve en su app, y su última evaluación cerrada, con sus
 * resultados y, si tiene dos o más, su evolución hasta ella. Puro.
 */
export function mySheetSources(facts: {
  readonly plans: {
    readonly nutritionPlanId: string | null;
    readonly trainingProgramId: string | null;
  };
  readonly closedEvaluationIds: readonly string[];
}): Partial<Record<MySheetItem, SheetSource>> {
  const sources: Partial<Record<MySheetItem, SheetSource>> = {};
  if (facts.plans.nutritionPlanId) {
    sources.PLAN = { type: 'NUTRITION_PLAN', id: facts.plans.nutritionPlanId };
  }
  if (facts.plans.trainingProgramId) {
    sources.PROGRAM = { type: 'TRAINING_PROGRAM', id: facts.plans.trainingProgramId };
  }
  const [last] = facts.closedEvaluationIds;
  if (last) {
    sources.RESULTS = { type: 'EVALUATION', id: last };
    if (facts.closedEvaluationIds.length > 1) {
      sources.EVOLUTION = { type: 'EVALUATION', id: last, kind: 'EVOLUTION' };
    }
  }
  return sources;
}

/**
 * Elige el origen de cada ficha de la app con el id del paciente de la sesión: el paciente nunca envía un origen. Se lee como SYSTEM
 * de su organización, porque su RLS no ve todo lo que hace falta para elegirlo.
 */
@Injectable()
export class MySheets {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(TrackingApi) private readonly tracking: TrackingApi,
    @Inject(AssessmentApi) private readonly assessment: AssessmentApi,
  ) {}

  async sources(context: SecurityContext): Promise<Partial<Record<MySheetItem, SheetSource>>> {
    const { organizationId, patientId } = context;
    if (context.role !== 'PATIENT' || !organizationId || !patientId) {
      throw new Error('Las fichas de la app necesitan la sesión del paciente.');
    }
    return this.uow.query(systemContext(organizationId), async () =>
      mySheetSources({
        plans: await this.tracking.activePlans(patientId),
        closedEvaluationIds: await this.assessment.closedEvaluationIds(patientId),
      }),
    );
  }
}

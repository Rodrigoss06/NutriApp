import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
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
import { atomically, ImportRecordStore, type ImportOrigin } from '../../../../platform/index.js';
import { ClinicalApi } from '../../../clinical/index.js';
import { nutritionEvent } from '../nutrition-events.js';
import {
  IMPORTED_PLAN_STORE,
  type ImportedPlanRecord,
  type ImportedPlanStore,
} from '../ports/nutrition.ports.js';

export type ImportedPlanInput = Pick<
  ImportedPlanRecord,
  | 'patientId'
  | 'validFrom'
  | 'validTo'
  | 'targetKcal'
  | 'targetProteinG'
  | 'targetFatG'
  | 'targetChoG'
  | 'hydrationTargetMl'
  | 'instructions'
> & { readonly origin: ImportOrigin };

/**
 * La importación de un plan del sistema anterior (RF-40, RN-I05; ADR-135), en una transacción: entra al historial del paciente, de
 * solo lectura, con sus metas y sus indicaciones tal como venían. No es un plan de NutriCoach: un plan nace de una prescripción del
 * motor (RF-18, RN-D01). Los datos del plan son de salud (RN-B01). Si la fila ya entró, devuelve el mismo plan sin tocar nada.
 */
@Injectable()
export class ImportedPlanCommands {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(OUTBOX) private readonly outbox: Outbox,
    @Inject(IMPORTED_PLAN_STORE) private readonly plans: ImportedPlanStore,
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
    private readonly records: ImportRecordStore,
  ) {}

  importPlan(
    context: SecurityContext,
    input: ImportedPlanInput,
  ): Promise<Result<{ id: string; created: boolean }, DomainError>> {
    const organizationId = context.organizationId;
    const userId = context.userId;
    if (!organizationId || !userId) throw new Error('Importación sin organización activa.');
    return atomically<{ id: string; created: boolean }>(this.uow, context, async () => {
      const existing = await this.records.find(organizationId, 'PLAN', input.origin);
      if (existing) return ok({ id: existing, created: false });
      const patient = await this.clinical.ensureImportWritable(context, input.patientId);
      if (!patient.ok) return patient;
      const id = this.ids.newId<'ImportedPlanId'>();
      const { origin, ...plan } = input;
      await this.plans.insert({
        ...plan,
        id,
        organizationId,
        createdBy: userId,
        createdAt: this.clock.now(),
      });
      await this.outbox.append(
        [
          nutritionEvent(
            'nutrition.plan.imported',
            organizationId,
            id,
            { patientId: input.patientId },
            { clock: this.clock, ids: this.ids },
          ),
        ],
        { actorUserId: userId, actorRole: context.role },
      );
      await this.records.insert(organizationId, 'PLAN', origin, id);
      return ok({ id, created: true });
    });
  }

  /**
   * El muestreo del informe (RN-I05): vuelve a leer el plan importado y devuelve los campos que no coinciden con su fila de origen,
   * sin sus valores. Es parte de la importación: no la hace una persona y no se audita como lectura.
   */
  verify(
    context: SecurityContext,
    planId: string,
    input: Omit<ImportedPlanInput, 'origin'>,
  ): Promise<readonly string[]> {
    return this.uow.query(context, async () => {
      const plan = await this.plans.find(planId);
      if (!plan) return ['plan'];
      const checks: readonly [string, boolean][] = [
        ['id_paciente', plan.patientId === input.patientId],
        ['desde', plan.validFrom === input.validFrom],
        ['hasta', plan.validTo === input.validTo],
        ['kcal', plan.targetKcal === input.targetKcal],
        ['proteina_g', plan.targetProteinG === input.targetProteinG],
        ['grasa_g', plan.targetFatG === input.targetFatG],
        ['carbohidratos_g', plan.targetChoG === input.targetChoG],
        ['agua_ml', plan.hydrationTargetMl === input.hydrationTargetMl],
        ['indicaciones', plan.instructions === input.instructions],
      ];
      return checks.filter(([, same]) => !same).map(([field]) => field);
    });
  }
}

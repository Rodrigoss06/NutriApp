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
import { AssessmentApi } from '../../../assessment/index.js';
import { ClinicalApi, type PatientRef } from '../../../clinical/index.js';
import { ExerciseApi } from '../../../exercise/index.js';
import {
  ACTIVITY_NOT_FOUND,
  ENERGY_RULE,
  NO_CLOSED_EVALUATION,
  TARGET_NEEDS_FAT_FREE_MASS,
} from '../../domain/energy-rules.js';
import { bodyCompositionOf, localDateOf } from '../energy-basis.js';
import {
  calculatePrescription,
  type CatalogActivity,
  type PrescriptionCalculation,
  type PrescriptionRequest,
} from '../energy-calculation.js';
import { nutritionEvent } from '../nutrition-events.js';
import {
  ENERGY_PRESCRIPTION_STORE,
  type EnergyPrescriptionRecord,
  type EnergyPrescriptionStore,
} from '../ports/nutrition.ports.js';

export interface PrescriptionInput extends PrescriptionRequest {
  readonly evaluationId: string;
}

export interface CalculatedPrescription {
  readonly record: EnergyPrescriptionRecord;
  readonly calculation: PrescriptionCalculation;
}

/**
 * Prescripción energética (RF-17, RN-E01 a RN-E07): se calcula con la composición de una evaluación cerrada y se
 * guarda como EnergyPrescription con cada componente y su método (02 §7). No se edita: se crea otra (RN-D08). Exige
 * escribir datos de salud del paciente (RN-A05, RN-B01).
 */
@Injectable()
export class EnergyPrescriptionCommands {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(OUTBOX) private readonly outbox: Outbox,
    @Inject(ENERGY_PRESCRIPTION_STORE) private readonly prescriptions: EnergyPrescriptionStore,
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
    @Inject(AssessmentApi) private readonly assessment: AssessmentApi,
    @Inject(ExerciseApi) private readonly exercise: ExerciseApi,
  ) {}

  create(
    context: SecurityContext,
    patientId: string,
    input: PrescriptionInput,
  ): Promise<Result<{ id: string }, DomainError>> {
    return atomically(this.uow, context, async () => {
      const patient = await this.clinical.ensureRecordWritable(context, patientId);
      if (!patient.ok) return patient;
      const calculated = await this.calculate(context, patient.value, input);
      if (!calculated.ok) return calculated;
      const { record } = calculated.value;
      await this.prescriptions.insert(record);
      await this.outbox.append(
        [
          nutritionEvent(
            'nutrition.prescription.created',
            record.organizationId,
            record.id,
            { patientId, evaluationId: record.evaluationId },
            { clock: this.clock, ids: this.ids },
          ),
        ],
        { actorUserId: record.createdBy, actorRole: context.role },
      );
      return ok({ id: record.id });
    });
  }

  /**
   * El cálculo de una prescripción, sin guardarlo: lo usan crear y la vista previa. Corre en la transacción de quien
   * llama.
   */
  async calculate(
    context: SecurityContext,
    patient: PatientRef,
    input: PrescriptionInput,
  ): Promise<Result<CalculatedPrescription, DomainError>> {
    const organizationId = context.organizationId;
    const userId = context.userId;
    if (!organizationId || !userId) throw new Error('Prescripción sin organización activa.');
    const basis = await this.assessment.compositionBasis(patient.id, input.evaluationId);
    if (!basis) return err(NO_CLOSED_EVALUATION);
    const activities = input.strategy === 'ADDITIVE' ? input.activities : [];
    const found = await this.exercise.activitiesByCode(activities.map((a) => a.activityCode));
    const catalog = new Map<string, CatalogActivity>(found.map((a) => [a.code, a]));
    const missing = activities.find((a) => !catalog.has(a.activityCode));
    if (missing) return err(ACTIVITY_NOT_FOUND(missing.activityCode));
    const composition = bodyCompositionOf(basis);
    const today = localDateOf(this.clock.now(), patient.timezone);
    const result = calculatePrescription(composition, input, catalog, today);
    if (!result.ok) {
      return err(
        result.failure.kind === 'NO_FAT_FREE_MASS'
          ? TARGET_NEEDS_FAT_FREE_MASS
          : ENERGY_RULE({ ...result.failure.issue, methodCode: result.failure.methodCode }),
      );
    }
    const record: EnergyPrescriptionRecord = {
      id: this.ids.newId<'EnergyPrescriptionId'>(),
      organizationId,
      patientId: patient.id,
      evaluationId: basis.evaluationId,
      calculationResultId: basis.fatFreeMass?.calculationResultId ?? null,
      sex: basis.sex,
      ageYears: basis.ageYears,
      weightKg: basis.weightKg,
      heightCm: basis.heightCm,
      fatFreeMassKg: basis.fatFreeMass?.kg ?? null,
      ffmMethodCode: basis.fatFreeMass?.methodCode ?? null,
      strategy: input.strategy,
      pal: input.pal,
      activities: activities.map((a) => ({
        activityCode: a.activityCode,
        descriptionEs: catalog.get(a.activityCode)?.descriptionEs ?? a.activityCode,
        met: catalog.get(a.activityCode)?.met ?? 0,
        minutes: a.minutesPerSession,
        sessionsPerWeek: a.sessionsPerWeek,
      })),
      goal: input.goal,
      adjustmentKind: input.adjustment.kind,
      fatKgPerMonth: result.value.fatKgPerMonth,
      targetFatPct: input.targetFatPct,
      proteinGPerKg: input.proteinGPerKg,
      fatPctKcal: input.fatPctKcal,
      components: result.value.components,
      engineVersion: result.value.engineVersion,
      inputsHash: result.value.inputsHash,
      createdBy: userId,
      createdAt: this.clock.now(),
    };
    return ok({ record, calculation: result.value });
  }
}

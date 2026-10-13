import { Inject, Injectable } from '@nestjs/common';
import {
  err,
  ID_GENERATOR,
  CLOCK,
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
import {
  EVALUATION_NOT_FOUND,
  INVALID_PREFERENCE,
  RECALCULATE_ONLY_CLOSED,
} from '../../domain/assessment-rules.js';
import { isMethodFor, type MethodPurpose } from '../../domain/calculation-plan.js';
import { assessmentEvent } from '../assessment-events.js';
import {
  CalculationService,
  type CalculationOptions,
  type ComputationSummary,
} from '../calculation.service.js';
import {
  CALCULATION_STORE,
  EVALUATION_STORE,
  type CalculationStore,
  type EvaluationStore,
} from '../ports/assessment.ports.js';

const POPULATIONS = ['ADULT', 'ATHLETE', 'CHILD', 'ADOLESCENT', 'OBESITY', 'OLDER_ADULT'];

/**
 * Recálculo explícito (RN-D08) y preferencias de métodos (RN-D05, RF-16). Cambiar una preferencia no recalcula nada:
 * recalcular es una acción aparte que crea resultados nuevos y deja los anteriores como SUPERSEDED.
 */
@Injectable()
export class CalculationCommands {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(OUTBOX) private readonly outbox: Outbox,
    @Inject(EVALUATION_STORE) private readonly evaluations: EvaluationStore,
    @Inject(CALCULATION_STORE) private readonly calculations: CalculationStore,
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
    @Inject(CalculationService) private readonly calculation: CalculationService,
  ) {}

  recalculate(
    context: SecurityContext,
    evaluationId: string,
    options: CalculationOptions,
  ): Promise<Result<ComputationSummary, DomainError>> {
    return atomically(this.uow, context, async () => {
      const evaluation = await this.evaluations.find(evaluationId);
      if (!evaluation) return err(EVALUATION_NOT_FOUND);
      const patient = await this.clinical.ensureRecordWritable(context, evaluation.patientId);
      if (!patient.ok) return patient;
      if (evaluation.status !== 'CLOSED') return err(RECALCULATE_ONLY_CLOSED);
      return ok(await this.calculation.compute(context, evaluation, options));
    });
  }

  /** Método por defecto de la organización para una población (OWNER y ADMIN por su ruta). */
  setOrganizationPreference(
    context: SecurityContext,
    population: string,
    purpose: string,
    methodCode: string | null,
  ): Promise<Result<void, DomainError>> {
    const organizationId = context.organizationId;
    if (!organizationId) throw new Error('Preferencia sin organización activa.');
    if (!POPULATIONS.includes(population) || !isPurpose(purpose)) {
      return Promise.resolve(err(INVALID_PREFERENCE));
    }
    if (methodCode !== null && !isMethodFor(purpose, methodCode)) {
      return Promise.resolve(err(INVALID_PREFERENCE));
    }
    return atomically(this.uow, context, async () => {
      if (methodCode === null) {
        await this.calculations.deletePreference({ population }, purpose);
      } else {
        await this.calculations.savePreference(
          organizationId,
          this.ids.newId<'MethodPreferenceId'>(),
          { population },
          purpose,
          methodCode,
        );
      }
      await this.#emit(context, organizationId, { population, purpose, methodCode });
      return ok(undefined);
    });
  }

  /** La elección de un paciente; la escribe su equipo con acceso de escritura (RN-A05). */
  setPatientPreference(
    context: SecurityContext,
    patientId: string,
    purpose: string,
    methodCode: string | null,
  ): Promise<Result<void, DomainError>> {
    const organizationId = context.organizationId;
    if (!organizationId) throw new Error('Preferencia sin organización activa.');
    if (!isPurpose(purpose) || (methodCode !== null && !isMethodFor(purpose, methodCode))) {
      return Promise.resolve(err(INVALID_PREFERENCE));
    }
    return atomically(this.uow, context, async () => {
      const patient = await this.clinical.ensureRecordWritable(context, patientId);
      if (!patient.ok) return patient;
      if (methodCode === null) {
        await this.calculations.deletePreference({ patientId }, purpose);
      } else {
        await this.calculations.savePreference(
          organizationId,
          this.ids.newId<'MethodPreferenceId'>(),
          { patientId },
          purpose,
          methodCode,
        );
      }
      await this.#emit(context, patientId, { patientId, purpose, methodCode });
      return ok(undefined);
    });
  }

  async #emit(context: SecurityContext, aggregateId: string, payload: object): Promise<void> {
    if (!context.organizationId) return;
    await this.outbox.append(
      [
        assessmentEvent(
          'assessment.preference.changed',
          context.organizationId,
          aggregateId,
          payload,
          {
            clock: this.clock,
            ids: this.ids,
          },
        ),
      ],
      { actorUserId: context.userId, actorRole: context.role },
    );
  }
}

const PURPOSES: readonly string[] = ['FAT_PCT', 'MUSCLE', 'BONE', 'RMR', 'ONE_RM'];
const isPurpose = (purpose: string): purpose is MethodPurpose => PURPOSES.includes(purpose);

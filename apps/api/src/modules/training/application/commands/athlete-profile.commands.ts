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
import { ClinicalApi } from '../../../clinical/index.js';
import { ExerciseApi } from '../../../exercise/index.js';
import {
  checkAthleteProfile,
  PROFILE_REVISION_CONFLICT,
  type AthleteProfileInput,
} from '../../domain/athlete-profile.js';
import { ATHLETE_PROFILE_STORE, type AthleteProfileStore } from '../ports/training.ports.js';
import { trainingEvent } from '../training-events.js';

/**
 * El perfil de entrenamiento (07 §2): cada cambio es una revisión nueva sobre la que se editó. Es escribir datos de salud:
 * exige ver al paciente, acceso de escritura y HEALTH_DATA (RN-A05, RN-B01), y queda auditado (RN-B03).
 */
@Injectable()
export class AthleteProfileCommands {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(OUTBOX) private readonly outbox: Outbox,
    @Inject(ATHLETE_PROFILE_STORE) private readonly profiles: AthleteProfileStore,
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
    @Inject(AssessmentApi) private readonly assessment: AssessmentApi,
    @Inject(ExerciseApi) private readonly exercises: ExerciseApi,
  ) {}

  save(
    context: SecurityContext,
    patientId: string,
    expectedRevision: number,
    input: AthleteProfileInput,
  ): Promise<Result<{ revision: number }, DomainError>> {
    return atomically(this.uow, context, async () => {
      const patient = await this.clinical.ensureRecordWritable(context, patientId);
      if (!patient.ok) return patient;
      const { organizationId, userId } = context;
      if (!organizationId || !userId) throw new Error('Un perfil necesita quién lo guarda.');
      const catalog = await this.exercises.catalog();
      const checked = checkAthleteProfile(input, {
        equipmentCodes: new Set(catalog.equipment.map((e) => e.code)),
        physicalTestCodes: new Set(await this.assessment.physicalTestCodes()),
      });
      if (!checked.ok) return checked;
      await this.clinical.lockPatient(patientId);
      const current = (await this.profiles.latest(patientId))?.revision ?? 0;
      if (current !== expectedRevision) return err(PROFILE_REVISION_CONFLICT);
      const revision = current + 1;
      const id = this.ids.newId<'AthleteProfileId'>();
      await this.profiles.insert({
        ...checked.value,
        id,
        organizationId,
        patientId,
        revision,
        recordedBy: userId,
        recordedAt: this.clock.now(),
      });
      await this.outbox.append(
        [
          trainingEvent(
            'training.profile.revised',
            organizationId,
            id,
            { patientId, revision },
            { clock: this.clock, ids: this.ids },
          ),
        ],
        { actorUserId: userId, actorRole: context.role },
      );
      return ok({ revision });
    });
  }
}

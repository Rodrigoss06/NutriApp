import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  err,
  UNIT_OF_WORK,
  type Clock,
  type DomainError,
  type Result,
  type SecurityContext,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import { atomically } from '../../../../platform/index.js';
import { IamApi } from '../../../iam/index.js';
import {
  canWriteClinical,
  GUARDIAN_CONSENT_REQUIRED,
  needsGuardian,
  PATIENT_ALREADY_LINKED,
  PATIENT_ARCHIVED,
  PATIENT_EMAIL_REQUIRED,
  PATIENT_NOT_FOUND,
  pendingAppPurposes,
  WRITE_ACCESS_REQUIRED,
} from '../../domain/clinical-rules.js';
import { localToday } from '../local-today.js';
import {
  CONSENT_STORE,
  PATIENT_STORE,
  type ConsentStore,
  type PatientStore,
} from '../ports/clinical.ports.js';
import { actorOf } from './patient.commands.js';

/**
 * Invitar al paciente a la app (RN-A06): el equipo con WRITE, a un paciente activo y sin cuenta. Por defecto al correo
 * de su ficha. Un menor de 14 solo se invita si APP_ACCESS y HEALTH_DATA ya se registraron en consulta, en papel
 * firmado por su padre, madre o tutor (⚠️). La invitación la crea iam dentro de esta misma transacción; reenviar
 * revoca la anterior.
 */
@Injectable()
export class PatientInvitationCommands {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(PATIENT_STORE) private readonly patients: PatientStore,
    @Inject(CONSENT_STORE) private readonly consents: ConsentStore,
    private readonly iam: IamApi,
  ) {}

  invite(
    context: SecurityContext,
    patientId: string,
    input: { email?: string | undefined },
  ): Promise<Result<{ id: string }, DomainError>> {
    const actor = actorOf(context);
    return atomically(this.uow, context, async () => {
      const patient = await this.patients.find(patientId);
      if (!patient) return err(PATIENT_NOT_FOUND);
      if (patient.status === 'ARCHIVED') return err(PATIENT_ARCHIVED);
      if (patient.userId) return err(PATIENT_ALREADY_LINKED);
      if (!canWriteClinical(actor, await this.patients.careTeam(patientId)))
        return err(WRITE_ACCESS_REQUIRED);
      const email = input.email ?? patient.email;
      if (!email) return err(PATIENT_EMAIL_REQUIRED);
      const active = (await this.consents.list(patientId))
        .filter((c) => c.revokedAt === null)
        .map((c) => c.purpose);
      const guardian = needsGuardian(
        patient.birthDate,
        localToday(this.clock.now(), patient.timezone),
      );
      if (guardian && pendingAppPurposes(active).length > 0) return err(GUARDIAN_CONSENT_REQUIRED);
      return this.iam.invitePatientWithin(context, actor.organizationId, patientId, email);
    });
  }
}

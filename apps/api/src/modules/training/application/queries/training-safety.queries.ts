import { Inject, Injectable } from '@nestjs/common';
import {
  AUDIT_PORT,
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
import {
  ATHLETE_PROFILE_STORE,
  type AthleteProfileRecord,
  type AthleteProfileStore,
} from '../ports/training.ports.js';
import { whatsappLink } from '../../domain/whatsapp.js';
import { TrainingSafety, type TrainingSafetyView } from '../training-safety.js';

/** El perfil de entrenamiento y las tres llaves. Leen datos de salud: cada lectura deja un READ (RN-B03). */
@Injectable()
export class TrainingSafetyQueries {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(ATHLETE_PROFILE_STORE) private readonly profiles: AthleteProfileStore,
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
    @Inject(TrainingSafety) private readonly safety: TrainingSafety,
  ) {}

  /** undefined si no se ve al paciente; null si todavía no tiene perfil. */
  async profile(
    context: SecurityContext,
    patientId: string,
  ): Promise<AthleteProfileRecord | null | undefined> {
    return this.#read(context, patientId, 'training.athlete_profile', () =>
      this.profiles.latest(patientId),
    );
  }

  /** undefined si no se ve al paciente. */
  async safetyOf(
    context: SecurityContext,
    patientId: string,
  ): Promise<TrainingSafetyView | undefined> {
    return this.#read(context, patientId, 'training.athlete_profile', () =>
      this.safety.of(patientId),
    );
  }

  /**
   * El enlace wa.me del alumno (P-35), solo con el seguimiento por WhatsApp activado en su perfil vigente: sin él, el teléfono ni
   * se descifra. Cada pedido queda en la auditoría, también si falta el código de país. undefined si no se ve al paciente.
   */
  async whatsappLink(
    context: SecurityContext,
    patientId: string,
  ): Promise<Result<string, DomainError> | undefined> {
    return this.#read(context, patientId, 'clinical.patient.phone', async () => {
      const enabled = (await this.profiles.latest(patientId))?.whatsappFollowUp ?? false;
      return whatsappLink(
        enabled ? ((await this.clinical.patientPhone(patientId)) ?? null) : null,
        enabled,
      );
    });
  }

  async #read<T>(
    context: SecurityContext,
    patientId: string,
    resourceType: string,
    work: () => Promise<T>,
  ): Promise<T | undefined> {
    const found = await this.uow.query(context, async () =>
      (await this.clinical.patientRef(patientId)) ? { value: await work() } : null,
    );
    if (!found) return undefined;
    await this.audit.record(context, {
      action: 'READ',
      resourceType,
      resourceId: patientId as Id<string>,
      patientId: patientId as PatientId,
    });
    return found.value;
  }
}

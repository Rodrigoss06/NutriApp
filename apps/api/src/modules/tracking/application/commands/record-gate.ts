import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  err,
  ID_GENERATOR,
  ok,
  OUTBOX,
  type Clock,
  type DomainError,
  type IdGenerator,
  type OrganizationId,
  type Outbox,
  type Result,
  type SecurityContext,
  type UserId,
} from '@nutricoach/shared-kernel';
import { ClinicalApi, PATIENT_NOT_FOUND } from '../../../clinical/index.js';
import { TenancyApi } from '../../../tenancy/index.js';
import { localDate as localDateOf } from '../../domain/active-plan.js';
import { recordWindow } from '../../domain/records.js';
import { FUTURE_DATE, WINDOW_CLOSED } from '../../domain/tracking-errors.js';
import {
  trackingEvent,
  type TrackingEventPayload,
  type TrackingEventType,
} from '../tracking-events.js';

/** Lo registrado y si ya estaba: un reintento con el mismo clientId devuelve lo de la primera vez (RN-G08). */
export interface Logged<T> {
  readonly value: T;
  readonly replayed: boolean;
}

export interface PatientContext {
  readonly organizationId: OrganizationId;
  readonly patientId: string;
  readonly userId: UserId;
}

export function patientOf(context: SecurityContext): PatientContext {
  if (!context.organizationId || !context.patientId || !context.userId) {
    throw new Error('Un registro necesita la sesión del paciente.');
  }
  return {
    organizationId: context.organizationId,
    patientId: context.patientId,
    userId: context.userId,
  };
}

/**
 * Lo que todo registro del paciente comprueba y deja (02 §7): HEALTH_DATA vigente (RN-B01), un día ni futuro ni cerrado en su fecha
 * local (RN-G04, RN-G10) y su evento para la analítica (02 §8). Se llama dentro de la transacción del caso de uso.
 */
@Injectable()
export class RecordGate {
  constructor(
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(OUTBOX) private readonly outbox: Outbox,
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
    @Inject(TenancyApi) private readonly tenancy: TenancyApi,
  ) {}

  async ensureOpen(patient: PatientContext, localDate: string): Promise<Result<void, DomainError>> {
    const consent = await this.clinical.ensureHealthDataConsent(patient.patientId);
    if (!consent.ok) return consent;
    const ref = await this.clinical.patientRef(patient.patientId);
    if (!ref) return err(PATIENT_NOT_FOUND);
    const today = localDateOf(this.clock.now(), ref.timezone);
    const windowDays = await this.tenancy.trackingEditWindowDays(patient.organizationId);
    const verdict = recordWindow(localDate, today, windowDays);
    if (verdict === 'FUTURE') return err(FUTURE_DATE);
    if (verdict === 'CLOSED') return err(WINDOW_CLOSED);
    return ok(undefined);
  }

  /** Hoy en la fecha local del paciente (RN-G04). */
  async today(patient: PatientContext): Promise<Result<string, DomainError>> {
    const ref = await this.clinical.patientRef(patient.patientId);
    if (!ref) return err(PATIENT_NOT_FOUND);
    return ok(localDateOf(this.clock.now(), ref.timezone));
  }

  async emit(
    context: Pick<SecurityContext, 'organizationId' | 'userId' | 'role'>,
    type: TrackingEventType,
    aggregateId: string,
    payload: TrackingEventPayload,
  ): Promise<void> {
    if (!context.organizationId) throw new Error('Un evento de tracking necesita la organización.');
    await this.outbox.append(
      [
        trackingEvent(type, context.organizationId, aggregateId, payload, {
          clock: this.clock,
          ids: this.ids,
        }),
      ],
      { actorUserId: context.userId, actorRole: context.role },
    );
  }
}

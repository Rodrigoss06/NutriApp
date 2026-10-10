import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type DomainError, type Result } from '@nutricoach/shared-kernel';
import {
  HEALTH_DATA_REQUIRED,
  PATIENT_ARCHIVED,
  PATIENT_NOT_FOUND,
} from '../domain/clinical-rules.js';
import {
  CONSENT_STORE,
  PATIENT_STORE,
  type ConsentStore,
  type PatientStore,
} from './ports/clinical.ports.js';

/**
 * API pública de clinical para otros contextos (02 §3). Se llama DENTRO de la transacción del caso de uso que la
 * usa, con su contexto: la RLS aplica RN-A01 y RN-A05.
 */
@Injectable()
export class ClinicalApi {
  constructor(
    @Inject(PATIENT_STORE) private readonly patients: PatientStore,
    @Inject(CONSENT_STORE) private readonly consents: ConsentStore,
  ) {}

  /**
   * ConsentPolicy (RN-B01): sin consentimiento HEALTH_DATA vigente ningún contexto guarda datos de salud. Un
   * paciente archivado tampoco recibe registros nuevos.
   */
  async ensureHealthDataConsent(patientId: string): Promise<Result<void, DomainError>> {
    const patient = await this.patients.find(patientId);
    if (!patient) return err(PATIENT_NOT_FOUND);
    if (patient.status === 'ARCHIVED') return err(PATIENT_ARCHIVED);
    return (await this.consents.active(patientId, 'HEALTH_DATA'))
      ? ok(undefined)
      : err(HEALTH_DATA_REQUIRED);
  }

  /** Activos de la organización del contexto (RN-A03), para el uso del cupo en tenancy. */
  countActivePatients(): Promise<number> {
    return this.patients.countActivePatients();
  }
}

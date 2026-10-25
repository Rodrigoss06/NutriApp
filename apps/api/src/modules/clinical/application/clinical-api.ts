import { Inject, Injectable } from '@nestjs/common';
import {
  err,
  ok,
  type DomainError,
  type Result,
  type SecurityContext,
} from '@nutricoach/shared-kernel';
import {
  canWriteRecord,
  HEALTH_DATA_REQUIRED,
  PATIENT_ARCHIVED,
  PATIENT_NOT_FOUND,
  WRITE_ACCESS_REQUIRED,
  type PatientStatus,
  type Population,
  type Sex,
} from '../domain/clinical-rules.js';
import {
  CONSENT_STORE,
  PATIENT_STORE,
  type ConsentStore,
  type PatientRecord,
  type PatientStore,
} from './ports/clinical.ports.js';
import { TimelineSources, type TimelineSource } from './timeline-sources.js';

/**
 * Lo único del paciente que cruza a assessment, nutrition, training y tracking (02 §3, ClinicalQueryPort): sin
 * nombres, documentos ni contacto.
 */
export interface PatientRef {
  readonly id: string;
  readonly sex: Sex;
  readonly birthDate: string;
  readonly population: Population;
  readonly timezone: string;
  readonly status: PatientStatus;
}

/**
 * Lo que una ficha PDF dice del paciente (RN-H01): su nombre y su código, además de PatientRef. Solo lo pide documents
 * (ADR-064); ningún otro contexto lee nombres.
 */
export interface PatientCard extends PatientRef {
  readonly code: string;
  readonly fullName: string;
}

const refOf = (patient: PatientRecord): PatientRef => ({
  id: patient.id,
  sex: patient.sex,
  birthDate: patient.birthDate,
  population: patient.population,
  timezone: patient.timezone,
  status: patient.status,
});

/**
 * API pública de clinical para otros contextos (02 §3). Se llama DENTRO de la transacción del caso de uso que la
 * usa, con su contexto: la RLS aplica RN-A01 y RN-A05.
 */
@Injectable()
export class ClinicalApi {
  constructor(
    @Inject(PATIENT_STORE) private readonly patients: PatientStore,
    @Inject(CONSENT_STORE) private readonly consents: ConsentStore,
    @Inject(TimelineSources) private readonly timeline: TimelineSources,
  ) {}

  /** ClinicalQueryPort.getPatientRef (02 §3); null si el contexto no ve al paciente (RN-A05). */
  async patientRef(patientId: string): Promise<PatientRef | null> {
    const patient = await this.patients.find(patientId);
    return patient ? refOf(patient) : null;
  }

  /** El paciente como lo muestra su ficha PDF; null si el contexto no lo ve (RN-A05). Solo para documents. */
  async patientCard(patientId: string): Promise<PatientCard | null> {
    const patient = await this.patients.find(patientId);
    return patient
      ? {
          ...refOf(patient),
          code: patient.code,
          fullName: `${patient.firstName} ${patient.lastName}`,
        }
      : null;
  }

  /**
   * Lo que exige guardar datos de salud de un paciente desde otro contexto: verlo (RN-A05), que esté activo, acceso
   * de escritura en su equipo de atención, también frente al dueño, y HEALTH_DATA vigente (RN-B01).
   */
  async ensureRecordWritable(
    context: SecurityContext,
    patientId: string,
  ): Promise<Result<PatientRef, DomainError>> {
    const patient = await this.patients.find(patientId);
    if (!patient) return err(PATIENT_NOT_FOUND);
    if (patient.status === 'ARCHIVED') return err(PATIENT_ARCHIVED);
    const actor = { memberId: context.memberId ?? null };
    if (!canWriteRecord(actor, await this.patients.careTeam(patientId))) {
      return err(WRITE_ACCESS_REQUIRED);
    }
    if (!(await this.consents.active(patientId, 'HEALTH_DATA'))) return err(HEALTH_DATA_REQUIRED);
    return ok(refOf(patient));
  }

  /** Un contexto suma sus hechos a la línea de tiempo del expediente (RF-10). */
  registerTimelineSource(source: TimelineSource): void {
    this.timeline.register(source);
  }

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

  /** Códigos legibles (P-000123) de los pacientes que el contexto ve: la auditoría los muestra (RF-06). */
  async patientCodes(patientIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
    return new Map((await this.patients.labels(patientIds)).map((p) => [p.id, p.code]));
  }

  /** Activos de la organización del contexto (RN-A03), para el uso del cupo en tenancy. */
  countActivePatients(): Promise<number> {
    return this.patients.countActivePatients();
  }
}

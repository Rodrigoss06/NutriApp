import { Inject, Injectable } from '@nestjs/common';
import {
  isPrescriptionBlocked,
  prescriptionStatus,
  type MedicalClearance,
  type PrescriptionStatus,
} from '@nutricoach/engine';
import { AssessmentApi } from '../../assessment/index.js';
import { ClinicalApi, type LatestScreening } from '../../clinical/index.js';
import { ATHLETE_PROFILE_STORE, type AthleteProfileStore } from './ports/training.ports.js';

/** Las tres llaves de un paciente y lo que el coach necesita ver de cada una (RN-F15). */
export interface TrainingSafetyView {
  readonly status: PrescriptionStatus;
  readonly blocked: boolean;
  /** null sin perfil: cuenta como pendiente. */
  readonly medicalClearance: MedicalClearance | null;
  readonly alarmSymptoms: boolean;
  readonly movement: { readonly evaluated: boolean; readonly painTests: number };
  readonly screening: LatestScreening | null;
}

/**
 * Seguridad antes de prescribir (RF-41, RN-F15): junta el perfil, la evaluación postural y el cribado, y el motor decide.
 * Sin perfil, el alta cuenta como pendiente. Sin evaluación postural no se bloquea, como la V3; la pantalla avisa (ADR-070).
 * Corre en la transacción de quien llama, para que la propuesta decida con lo mismo que muestra la pantalla.
 */
@Injectable()
export class TrainingSafety {
  constructor(
    @Inject(ATHLETE_PROFILE_STORE) private readonly profiles: AthleteProfileStore,
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
    @Inject(AssessmentApi) private readonly assessment: AssessmentApi,
  ) {}

  async of(patientId: string): Promise<TrainingSafetyView> {
    const profile = await this.profiles.latest(patientId);
    const movement = await this.assessment.movementKeys(patientId);
    const screening = await this.clinical.latestScreening(patientId);
    const status = prescriptionStatus({
      medicalClearance: profile?.medicalClearance ?? 'PENDING',
      alarmSymptoms: profile?.alarmSymptoms ?? false,
      movementStatuses: movement.statuses,
      screening,
    });
    return {
      status,
      blocked: isPrescriptionBlocked(status),
      medicalClearance: profile?.medicalClearance ?? null,
      alarmSymptoms: profile?.alarmSymptoms ?? false,
      movement: {
        evaluated: movement.evaluated,
        painTests: movement.statuses.filter((s) => s === 'REFER').length,
      },
      screening,
    };
  }
}

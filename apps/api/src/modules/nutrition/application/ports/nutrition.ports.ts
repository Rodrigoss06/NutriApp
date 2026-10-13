import type { OrganizationId, UserId } from '@nutricoach/shared-kernel';
import type { TimelineCursor, TimelineEntry } from '../../../clinical/index.js';
import type { EnergyGoal, EnergyStrategy } from '../../domain/energy-rules.js';
import type { PrescriptionComponents } from '../energy-calculation.js';

/** Actividad elegida, congelada con su descripción y su MET (05.2: activityCode, met, minutes, sessionsPerWeek). */
export interface PrescribedActivity {
  readonly activityCode: string;
  readonly descriptionEs: string;
  readonly met: number;
  readonly minutes: number;
  readonly sessionsPerWeek: number;
}

/** nutrition.energy_prescription: no se edita; los componentes guardan cada sobre del motor (RN-D01). */
export interface EnergyPrescriptionRecord {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly patientId: string;
  readonly evaluationId: string;
  readonly calculationResultId: string | null;
  readonly sex: 'M' | 'F';
  readonly ageYears: number;
  readonly weightKg: number;
  readonly heightCm: number;
  readonly fatFreeMassKg: number | null;
  readonly ffmMethodCode: string | null;
  readonly strategy: EnergyStrategy;
  readonly pal: number;
  readonly activities: readonly PrescribedActivity[];
  readonly goal: EnergyGoal;
  readonly adjustmentKind: 'KCAL_PER_DAY' | 'FAT_KG_PER_MONTH';
  readonly fatKgPerMonth: number;
  readonly targetFatPct: number | null;
  readonly proteinGPerKg: number;
  readonly fatPctKcal: number;
  readonly components: PrescriptionComponents;
  readonly engineVersion: string;
  readonly inputsHash: string;
  readonly createdBy: UserId;
  readonly createdAt: Date;
}

export interface EnergyPrescriptionStore {
  insert(record: EnergyPrescriptionRecord): Promise<void>;
  find(id: string): Promise<EnergyPrescriptionRecord | null>;
  /** De la más reciente a la más antigua. */
  listByPatient(patientId: string): Promise<readonly EnergyPrescriptionRecord[]>;
  /** Para la línea de tiempo del expediente (RF-10), por createdAt e id descendentes. */
  timeline(
    patientId: string,
    before: TimelineCursor | null,
    limit: number,
  ): Promise<readonly TimelineEntry[]>;
}

export const ENERGY_PRESCRIPTION_STORE = Symbol.for('nutricoach.nutrition.EnergyPrescriptionStore');

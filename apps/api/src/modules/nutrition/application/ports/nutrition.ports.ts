import type { OrganizationId, UserId } from '@nutricoach/shared-kernel';
import type { TimelineCursor, TimelineEntry } from '../../../clinical/index.js';
import type { EnergyGoal, EnergyStrategy } from '../../domain/energy-rules.js';
import type { CompositionDraft, PlanDraft, WeeklyMenuDraft } from '../../domain/food-plan.js';
import type { ExchangePlan, PlanModality, PlanStatus } from '../../domain/nutrition-plan.js';
import type { PlanSnapshot } from '../plan-document.js';
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

/**
 * nutrition.plan con sus hijos, de cualquier modalidad. Las metas de las columnas van redondeadas a 1 decimal, para
 * listar; el cálculo usa las exactas de la prescripción (RN-D09).
 */
export interface NutritionPlanSummary {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly patientId: string;
  readonly lineageId: string;
  readonly versionNo: number;
  readonly modality: PlanModality;
  readonly status: PlanStatus;
  readonly energyPrescriptionId: string;
  /** Solo en intercambios (RN-E11). */
  readonly exchangeListId: string | null;
  readonly exchangeListVersion: string | null;
  readonly targetKcal: number;
  readonly createdAt: Date;
  readonly publishedAt: Date | null;
  /** YYYY-MM-DD; null mientras es borrador. */
  readonly validFrom: string | null;
}

export interface NutritionPlanRecord extends NutritionPlanSummary {
  /** El borrador tal como lo escribió el profesional, rearmado desde sus filas. */
  readonly draft: PlanDraft;
  /** Los id de los tiempos de comida, en su orden; en el menú, los de cada celda, día por día de lunes a domingo. */
  readonly mealIds: readonly string[];
  readonly createdBy: UserId;
  readonly updatedAt: Date;
  readonly version: number;
}

export interface NewNutritionPlan {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly patientId: string;
  readonly lineageId: string;
  readonly versionNo: number;
  readonly energyPrescriptionId: string;
  readonly exchangeListId: string | null;
  readonly exchangeListVersion: string | null;
  readonly targets: {
    readonly kcal: number;
    readonly choG: number;
    readonly proteinG: number;
    readonly fatG: number;
  };
  readonly createdBy: UserId;
  readonly now: Date;
}

/** Lo que se guarda de un borrador ya validado, según su modalidad. */
export type PlanContent =
  | { readonly modality: 'EXCHANGES'; readonly plan: ExchangePlan }
  | { readonly modality: 'COMPOSITION'; readonly plan: CompositionDraft }
  | { readonly modality: 'WEEKLY_MENU'; readonly plan: WeeklyMenuDraft };

export interface NutritionPlanStore {
  insert(plan: NewNutritionPlan, content: PlanContent): Promise<void>;
  find(id: string): Promise<NutritionPlanRecord | null>;
  /** Reemplaza el contenido del borrador si la versión coincide; si no, false. La modalidad no cambia. */
  replaceDraft(id: string, version: number, content: PlanContent, now: Date): Promise<boolean>;
  /** El historial del paciente, de lo más reciente a lo más antiguo (RF-23). */
  listByPatient(patientId: string): Promise<readonly NutritionPlanSummary[]>;
  /** Publica el borrador con su snapshot si la versión coincide; si no, false (RN-E15). */
  publish(
    id: string,
    version: number,
    publication: {
      readonly snapshot: PlanSnapshot;
      readonly hash: string;
      readonly publishedAt: Date;
      readonly publishedBy: UserId;
      readonly validFrom: string;
    },
  ): Promise<boolean>;
  /** El plan publicado del paciente pasa a SUPERSEDED (RN-E14); devuelve su id, o null si no había. */
  supersedePublished(patientId: string, now: Date): Promise<string | null>;
  /** El snapshot de un plan que ya no es borrador. */
  snapshot(id: string): Promise<PlanSnapshot | null>;
  /** La última versión de un plan y su borrador, si tiene uno. */
  lineage(
    lineageId: string,
  ): Promise<{ readonly lastVersionNo: number; readonly draftId: string | null }>;
  /** Los planes publicados en la línea de tiempo del expediente (RF-10), por published_at e id descendentes. */
  timeline(
    patientId: string,
    before: TimelineCursor | null,
    limit: number,
  ): Promise<readonly TimelineEntry[]>;
}

export const NUTRITION_PLAN_STORE = Symbol.for('nutricoach.nutrition.NutritionPlanStore');

/** nutrition.food_exclusion, con la transacción de quien llama: la RLS aplica RN-A01 y RN-A05. */
export interface FoodExclusionStore {
  forPatient(
    patientId: string,
  ): Promise<readonly { readonly conditionId: string; readonly foodId: string }[]>;
  /** Reemplaza los alimentos de la condición. */
  replace(row: {
    readonly organizationId: OrganizationId;
    readonly patientId: string;
    readonly conditionId: string;
    readonly foodIds: readonly string[];
    readonly createdBy: UserId;
    readonly now: Date;
  }): Promise<void>;
}

export const FOOD_EXCLUSION_STORE = Symbol.for('nutricoach.nutrition.FoodExclusionStore');

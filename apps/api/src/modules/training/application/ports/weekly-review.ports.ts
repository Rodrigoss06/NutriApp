import type { CoachDecision, WeeklyReviewRecord } from '../../domain/weekly-review.js';

/** Los umbrales de 07 §11, versionados por organización (RN-G15): los valores de una fila de training.readiness_threshold. */
export interface ThresholdValues {
  readonly neutralScore: number;
  readonly readinessGreenMin: number;
  readonly readinessRedBelow: number;
  readonly performanceMinPct: number;
  readonly weeklySleepMinHours: number;
  readonly fatigueSorenessAmberAbove: number;
  readonly nutritionMinPct: number;
}

export interface ThresholdRow extends ThresholdValues {
  readonly id: string;
  /** null: los valores base de la V3. */
  readonly organizationId: string | null;
  readonly validFrom: string;
}

export interface PublishedProgramRef {
  readonly programId: string;
  readonly patientId: string;
  readonly lineageId: string;
}

export interface ReviewDecision {
  readonly coachDecision: CoachDecision;
  readonly decidedVolumeFactor: number | null;
  readonly decisionNote: string;
  readonly decidedBy: string;
  readonly decidedAt: Date;
  readonly resultingProgramId: string | null;
}

/** Una versión de las tablas de factores del volumen ajustado (P-26, ADR-106): `from` es el RIR o los segundos de descanso. */
export interface VolumeFactorsRow {
  readonly id: string;
  /** null: la global, con los valores de Jeremy. */
  readonly organizationId: string | null;
  readonly validFrom: string;
  readonly rir: readonly {
    readonly from: number;
    readonly factor: number;
    readonly orMore: boolean;
  }[];
  readonly rest: readonly {
    readonly from: number;
    readonly factor: number;
    readonly orMore: boolean;
  }[];
}

/**
 * Una versión de los umbrales del panel de fatiga y recuperación (P-23, ADR-108): recuperación por estrés y sueño, fatiga percibida y
 * carga sobre el promedio de las 3 semanas previas.
 */
export interface FatiguePanelThresholdRow {
  readonly id: string;
  /** null: la global, con los valores de Jeremy. */
  readonly organizationId: string | null;
  readonly validFrom: string;
  readonly recoveryRedStressMin: number;
  readonly recoveryRedSleepBelowHours: number;
  readonly recoveryAmberStressMin: number;
  readonly recoveryAmberSleepBelowHours: number;
  readonly fatigueRedMin: number;
  readonly fatigueAmberMin: number;
  readonly loadAmberAbovePct: number;
  readonly loadRedAbovePct: number;
}

/**
 * training.weekly_review, training.readiness_threshold, training.volume_factor_table y training.fatigue_panel_threshold, en la
 * transacción de quien llama y con su RLS.
 */
export interface WeeklyReviewStore {
  /** Los programas publicados de la organización del contexto. */
  publishedPrograms(): Promise<readonly PublishedProgramRef[]>;
  /** El programa publicado del paciente; null si no tiene. */
  publishedProgramOf(patientId: string): Promise<PublishedProgramRef | null>;
  /** El control vigente de esa semana en cualquier versión de la línea. */
  currentOf(lineageId: string, weekNo: number): Promise<WeeklyReviewRecord | null>;
  insert(review: WeeklyReviewRecord): Promise<void>;
  supersede(id: string): Promise<void>;
  find(id: string): Promise<WeeklyReviewRecord | null>;
  /** Todos los controles de la línea, vigentes y reemplazados, por semana y de lo más nuevo a lo más viejo. */
  listOfLineage(lineageId: string): Promise<readonly WeeklyReviewRecord[]>;
  /** false si otro decidió antes. */
  decide(id: string, decision: ReviewDecision): Promise<boolean>;
  /** Los umbrales vigentes ese día: los de la organización o, si no tiene, los de la V3. */
  thresholdFor(organizationId: string, onDate: string): Promise<ThresholdRow | null>;
  /** Los valores base de la V3 vigentes ese día. */
  baseThreshold(onDate: string): Promise<ThresholdRow | null>;
  /** La versión de la organización que empieza ese día, si la hay. */
  ownThresholdOn(organizationId: string, validFrom: string): Promise<ThresholdRow | null>;
  insertThreshold(row: ThresholdRow): Promise<void>;
  updateThreshold(id: string, values: ThresholdValues): Promise<void>;
  /** Todas las versiones de los factores que ve la organización: las suyas y las globales (P-26). */
  volumeFactorVersions(organizationId: string): Promise<readonly VolumeFactorsRow[]>;
  /** Todas las versiones de los umbrales del panel que ve la organización: las suyas y las globales (P-23). */
  fatiguePanelThresholdVersions(
    organizationId: string,
  ): Promise<readonly FatiguePanelThresholdRow[]>;
}

export const WEEKLY_REVIEW_STORE = Symbol('WEEKLY_REVIEW_STORE');

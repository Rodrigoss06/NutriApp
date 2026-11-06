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

/** training.weekly_review y training.readiness_threshold, en la transacción de quien llama y con su RLS. */
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
}

export const WEEKLY_REVIEW_STORE = Symbol('WEEKLY_REVIEW_STORE');

import type { MovementTestStatus } from '@nutricoach/engine';
import type { OrganizationId, UserId } from '@nutricoach/shared-kernel';
import type { TimelineCursor, TimelineEntry } from '../../../clinical/index.js';
import type {
  ConsolidationMethod,
  EvaluationConditions,
  EvaluationKind,
  EvaluationLevel,
  EvaluationStatus,
  MeasurementSide,
  SiteDefinition,
} from '../../domain/assessment-rules.js';
import type { MethodPurpose, PreferenceRow } from '../../domain/calculation-plan.js';
import type {
  ClosedPhysicalEvaluation,
  EvaluationModality,
  FunctionalKind,
  PhysicalMoment,
} from '../../domain/functional-evaluation.js';
import type { ReferenceRange } from '../../domain/interpretation.js';

/** Sexo, edad decimal y población al medir (patient_snapshot). */
export interface PatientSnapshot {
  readonly sex: 'M' | 'F';
  readonly ageYears: number;
  readonly population: string;
}

export interface EvaluationRecord {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly patientId: string;
  readonly evaluatorMemberId: string;
  readonly kind: EvaluationKind;
  readonly level: EvaluationLevel | null;
  readonly measuredAt: Date;
  readonly localDate: string;
  readonly conditions: EvaluationConditions;
  readonly patientSnapshot: PatientSnapshot;
  readonly status: EvaluationStatus;
  readonly revision: number;
  readonly amendsEvaluationId: string | null;
  readonly amendReason: string | null;
  readonly closedAt: Date | null;
  readonly notes: string | null;
  readonly createdBy: UserId;
  readonly createdAt: Date;
  readonly version: number;
}

/** Tomas de un sitio; los derivados se guardan para consultas y la API los recalcula con el motor al leer. */
export interface MeasurementRecord {
  readonly siteCode: string;
  readonly attempts: readonly number[];
  readonly side: MeasurementSide;
}

export interface MeasurementRow extends MeasurementRecord {
  readonly consolidatedValue: number | null;
  readonly consolidation: ConsolidationMethod | null;
  readonly diffPct: number | null;
  readonly needsThird: boolean;
}

export interface BiaValueRecord {
  readonly metric: string;
  readonly value: number;
  readonly unit: string;
  readonly deviceLabel: string;
}

export interface BiaReadingRecord {
  readonly id: string;
  readonly evaluationId: string;
  readonly deviceBrand: string;
  readonly deviceModel: string;
  readonly readings: readonly BiaValueRecord[];
  readonly enteredBy: UserId;
  readonly createdAt: Date;
}

export type EvaluationChanges = Partial<
  Pick<
    EvaluationRecord,
    | 'level'
    | 'measuredAt'
    | 'localDate'
    | 'conditions'
    | 'patientSnapshot'
    | 'evaluatorMemberId'
    | 'notes'
  >
>;

/** Evaluaciones, tomas y bioimpedancia, con la transacción de la UnitOfWork y su RLS (RN-A01, RN-A05). */
export interface EvaluationStore {
  insert(evaluation: EvaluationRecord): Promise<void>;
  /** Solo antropometría y bioimpedancia: la postura y las pruebas físicas van por FunctionalEvaluationStore. */
  find(id: string): Promise<EvaluationRecord | null>;
  /** De la más reciente a la más antigua por measuredAt; solo antropometría y bioimpedancia. */
  listByPatient(patientId: string): Promise<readonly EvaluationRecord[]>;
  /** La revisión que enmendó a cada una de estas evaluaciones, si la hay. */
  amendedBy(ids: readonly string[]): Promise<ReadonlyMap<string, string>>;
  /**
   * Cambia la evaluación en borrador con bloqueo optimista: suma 1 a version solo si coincide. false si no coincidió
   * o ya no está en borrador.
   */
  updateDraft(id: string, expectedVersion: number, changes: EvaluationChanges): Promise<boolean>;
  /** Suma 1 a version sin comparar: las lecturas de bioimpedancia también mueven la evaluación. */
  touch(id: string): Promise<void>;
  close(id: string, expectedVersion: number, closedAt: Date): Promise<boolean>;
  /** CLOSED → AMENDED, cuando cierra su revisión (RN-C07). */
  markAmended(id: string): Promise<boolean>;
  measurements(evaluationId: string): Promise<readonly MeasurementRecord[]>;
  saveMeasurement(
    evaluationId: string,
    organizationId: OrganizationId,
    row: MeasurementRow,
  ): Promise<void>;
  deleteMeasurement(evaluationId: string, siteCode: string): Promise<boolean>;
  biaReadings(evaluationId: string): Promise<readonly BiaReadingRecord[]>;
  insertBiaReading(organizationId: OrganizationId, reading: BiaReadingRecord): Promise<void>;
  deleteBiaReading(evaluationId: string, readingId: string): Promise<boolean>;
  /** Cerradas o enmendadas, por closedAt y id descendentes (línea de tiempo, RF-10). */
  closedTimeline(
    patientId: string,
    before: TimelineCursor | null,
    limit: number,
  ): Promise<readonly TimelineEntry[]>;
}

/** El catálogo global de sitios (05.1); cambia solo por migración. */
export interface SiteCatalog {
  all(): Promise<readonly SiteDefinition[]>;
}

export type TechnicalErrorSource = 'CALCULATED' | 'DECLARED';

export interface TechnicalErrorRecord {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly memberId: string;
  readonly siteCode: string;
  readonly source: TechnicalErrorSource;
  readonly temAbs: number;
  readonly temRelPct: number;
  readonly sampleSize: number | null;
  readonly pairs: readonly (readonly [number, number])[] | null;
  readonly validFrom: string;
  readonly createdAt: Date;
}

/** ETM por evaluador y sitio (RN-C05): solo se agregan filas. */
export interface TechnicalErrorStore {
  insert(rows: readonly TechnicalErrorRecord[]): Promise<void>;
  /** El vigente de cada sitio en una fecha: el de validFrom más reciente que no la pasa, y el último creado. */
  current(memberId: string, onDate: string): Promise<readonly TechnicalErrorRecord[]>;
}

/** Una evaluación de postura o de pruebas físicas (RF-41): comparte tabla, cierre y enmienda con las demás. */
export interface FunctionalEvaluationRecord {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly patientId: string;
  readonly evaluatorMemberId: string;
  readonly kind: FunctionalKind;
  readonly moment: PhysicalMoment | null;
  readonly measuredAt: Date;
  readonly localDate: string;
  readonly patientSnapshot: PatientSnapshot;
  readonly status: EvaluationStatus;
  readonly revision: number;
  readonly amendsEvaluationId: string | null;
  readonly amendReason: string | null;
  readonly closedAt: Date | null;
  readonly notes: string | null;
  readonly createdBy: UserId;
  readonly createdAt: Date;
  readonly version: number;
}

interface FunctionalEvidence {
  readonly modality: EvaluationModality;
  readonly evidenceFileId: string | null;
  readonly evidenceUrl: string | null;
}

export interface MovementTestRow extends FunctionalEvidence {
  readonly testCode: string;
  readonly rightScore: number | null;
  readonly leftScore: number | null;
  readonly pain: boolean;
  readonly asymmetry: boolean;
  readonly status: MovementTestStatus;
  readonly ruleVersion: string;
  readonly observation: string | null;
  readonly actionNote: string | null;
  readonly reliabilityNote: string | null;
}

export interface PhysicalResultRow extends FunctionalEvidence {
  readonly testCode: string;
  readonly value: number;
  readonly unit: string;
  readonly notes: string | null;
}

export interface FunctionalCatalog {
  readonly movementTests: readonly {
    readonly code: string;
    readonly name: string;
    readonly kind: 'STATIC' | 'DYNAMIC';
    readonly region: string;
  }[];
  readonly physicalTests: readonly {
    readonly code: string;
    readonly domain: string;
    readonly name: string;
    readonly protocol: string;
    readonly unit: string;
  }[];
}

/** Postura y pruebas físicas, con la transacción de quien llama: la RLS aplica RN-A01 y RN-A05. */
export interface FunctionalEvaluationStore {
  catalog(): Promise<FunctionalCatalog>;
  insert(evaluation: FunctionalEvaluationRecord): Promise<void>;
  find(id: string): Promise<FunctionalEvaluationRecord | null>;
  /** De la más reciente a la más antigua. */
  listByPatient(
    patientId: string,
    kind: FunctionalKind,
  ): Promise<readonly FunctionalEvaluationRecord[]>;
  movementTests(evaluationId: string): Promise<readonly MovementTestRow[]>;
  physicalResults(evaluationId: string): Promise<readonly PhysicalResultRow[]>;
  /** Reemplaza la fila de esa prueba: en borrador se borra y se inserta, nunca se actualiza. */
  replaceMovementTest(evaluation: FunctionalEvaluationRecord, row: MovementTestRow): Promise<void>;
  replacePhysicalResult(
    evaluation: FunctionalEvaluationRecord,
    row: PhysicalResultRow,
  ): Promise<void>;
  removeMovementTest(evaluationId: string, testCode: string): Promise<boolean>;
  removePhysicalResult(evaluationId: string, testCode: string): Promise<boolean>;
  /** Hay una evaluación postural cerrada, y los estados de la vigente y de los borradores: el dolor no espera al cierre. */
  movementKeys(patientId: string): Promise<{
    readonly evaluated: boolean;
    readonly statuses: readonly MovementTestStatus[];
  }>;
  closedPhysical(patientId: string): Promise<readonly ClosedPhysicalEvaluation[]>;
}

export const FUNCTIONAL_EVALUATION_STORE = Symbol.for(
  'nutricoach.assessment.FunctionalEvaluationStore',
);

export const EVALUATION_STORE = Symbol.for('nutricoach.assessment.EvaluationStore');
export const SITE_CATALOG = Symbol.for('nutricoach.assessment.SiteCatalog');
export const TECHNICAL_ERROR_STORE = Symbol.for('nutricoach.assessment.TechnicalErrorStore');

/** Un resultado guardado (assessment.calculation_result): inmutable salvo su estado (RN-D01, RN-D08). */
export interface StoredResult {
  readonly id: string;
  readonly evaluationId: string;
  readonly patientId: string;
  readonly methodCode: string;
  readonly methodVersion: string;
  readonly engineVersion: string;
  readonly inputs: Readonly<Record<string, unknown>>;
  /** SHA-256 del JSON canónico, en hexadecimal. */
  readonly inputsHash: string;
  readonly outputs: Readonly<Record<string, unknown>>;
  readonly warnings: readonly {
    readonly rule: string;
    readonly severity: 'ERROR' | 'WARNING' | 'INFO';
    readonly code: string;
    readonly message: string;
  }[];
  readonly status: 'CURRENT' | 'SUPERSEDED';
  readonly supersededBy: string | null;
  readonly measuredAt: Date;
  readonly computedAt: Date;
}

/** Un indicador de un resultado (formato largo, 05 §1). */
export interface MetricRow {
  readonly metricCode: string;
  readonly value: number;
  readonly unit: string;
  readonly methodCode: string;
  readonly zScore: number | null;
}

/** Resultados, preferencias de métodos y rangos de referencia, con la RLS del contexto. */
export interface CalculationStore {
  /** Todos los resultados de esas evaluaciones, vigentes y reemplazados. */
  results(evaluationIds: readonly string[]): Promise<readonly StoredResult[]>;
  insertResult(
    organizationId: OrganizationId,
    result: StoredResult,
    metrics: readonly MetricRow[],
  ): Promise<void>;
  /** Lo único que cambia de un resultado: su estado y quién lo reemplazó. */
  setStatus(id: string, status: StoredResult['status'], supersededBy: string | null): Promise<void>;
  /** Las preferencias de la organización (por población) y las del paciente. */
  preferenceRows(patientId: string | null): Promise<readonly PreferenceRow[]>;
  savePreference(
    organizationId: OrganizationId,
    id: string,
    target: { readonly patientId: string } | { readonly population: string },
    purpose: MethodPurpose,
    methodCode: string,
  ): Promise<void>;
  deletePreference(
    target: { readonly patientId: string } | { readonly population: string },
    purpose: MethodPurpose,
  ): Promise<boolean>;
  /** Globales y de la organización del contexto. */
  referenceRanges(): Promise<readonly ReferenceRange[]>;
}

export const CALCULATION_STORE = Symbol.for('nutricoach.assessment.CalculationStore');

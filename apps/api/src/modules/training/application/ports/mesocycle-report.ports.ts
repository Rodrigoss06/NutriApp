import type {
  MesocycleReportRecord,
  MesocycleReportTexts,
  ReportWorkout,
} from '../../domain/mesocycle-report.js';

/** Lo que congela enviar el informe (RN-G19, RN-D08). */
export interface ReportSending {
  readonly snapshot: unknown;
  readonly snapshotSchemaVersion: number;
  /** SHA-256 en hexadecimal del JSON canónico del snapshot (RN-H02). */
  readonly snapshotHash: string;
  readonly sentAt: Date;
  /** El miembro del equipo que lo envía. */
  readonly sentBy: string;
}

/** training.mesocycle_report, en la transacción de quien llama y con su RLS (el alumno solo ve los enviados). */
export interface MesocycleReportStore {
  insert(report: MesocycleReportRecord): Promise<void>;
  find(id: string): Promise<MesocycleReportRecord | null>;
  byPosition(lineageId: string, position: number): Promise<MesocycleReportRecord | null>;
  ofLineage(lineageId: string): Promise<readonly MesocycleReportRecord[]>;
  /** Los textos del borrador con la versión leída (If-Match); false si cambió o ya se envió. */
  saveTexts(
    id: string,
    expectedVersion: number,
    texts: MesocycleReportTexts,
    at: Date,
  ): Promise<boolean>;
  /** Lo envía con la versión leída; false si cambió o ya se envió. */
  send(
    id: string,
    expectedVersion: number,
    texts: MesocycleReportTexts,
    sending: ReportSending,
  ): Promise<boolean>;
  /** El comentario del alumno en un informe enviado; false si no lo ve. */
  saveComment(id: string, comment: string | null, at: Date): Promise<boolean>;
  /** Los informes enviados del paciente, del más reciente al más antiguo. */
  sentOfPatient(patientId: string): Promise<readonly MesocycleReportRecord[]>;
}

export const MESOCYCLE_REPORT_STORE = Symbol('MESOCYCLE_REPORT_STORE');

/** El mejor 1RM estimado de un día y un ejercicio, con la fórmula del programa del entreno (RN-F04). */
export interface ReportOneRmPoint {
  readonly localDate: string;
  readonly exerciseId: string;
  readonly formula: string;
  readonly estimated1rmKg: number;
}

/**
 * Lo que el informe lee de los registros del alumno. Lo da analytics, que ya importa training (02 §4, sin ciclos entre módulos):
 * los entrenos con sus series, con los ajustes del profesional aplicados (RN-G02), y los 1RM de su read model.
 */
export interface MesocycleReportSource {
  workouts(patientId: string, from: string, to: string): Promise<readonly ReportWorkout[]>;
  /** Del rango, por ejercicio y en orden de fecha. */
  oneRm(patientId: string, from: string, to: string): Promise<readonly ReportOneRmPoint[]>;
}

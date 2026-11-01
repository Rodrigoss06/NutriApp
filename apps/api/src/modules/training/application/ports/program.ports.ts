import type { OrganizationId, UserId } from '@nutricoach/shared-kernel';
import type { PeriodizationPhase } from '@nutricoach/engine';
import type { TimelineCursor, TimelineEntry } from '../../../clinical/index.js';
import type {
  Mesocycle,
  OneRmFormula,
  ProgramOrigin,
  ProgramPrescription,
  ProgramSession,
  ProgramStatus,
  ProgramWeekPhase,
} from '../../domain/program.js';
import type { ProgramSnapshot } from '../program-document.js';

export interface ProgramSummaryRecord extends ProgramPrescription {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly patientId: string;
  readonly lineageId: string;
  readonly versionNo: number;
  readonly name: string;
  readonly goal: string | null;
  readonly status: ProgramStatus;
  readonly origin: ProgramOrigin;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly oneRmFormula: OneRmFormula;
  readonly publishedAt: Date | null;
  readonly createdBy: UserId;
  readonly createdAt: Date;
  readonly version: number;
}

export interface ProgramRecord extends ProgramSummaryRecord {
  readonly mesocycles: readonly Mesocycle[];
}

export interface ProgramHeaderChanges {
  readonly name?: string;
  readonly goal?: string | null;
  readonly startDate?: string | null;
  readonly oneRmFormula?: OneRmFormula;
}

/** Una fila de la tabla de fases, con la versión a la que pertenece (RN-F13). */
export interface StoredPhase extends PeriodizationPhase {
  readonly validFrom: string;
  /** De la organización; las demás son las de la V3. */
  readonly own: boolean;
}

export interface BlockApproval {
  readonly exerciseId: string | null;
  readonly note: string | null;
  readonly approvedBy: string;
  readonly approvedAt: Date;
}

export interface ProgramPublication {
  readonly snapshot: ProgramSnapshot;
  readonly hash: string;
  readonly publishedAt: Date;
  readonly publishedBy: UserId;
  readonly startDate: string;
  readonly endDate: string;
}

/**
 * training.program y su estructura, con la transacción de la UnitOfWork. Un programa publicado es inmutable, también en sus
 * hijos (disparadores); la RLS aplica el equipo de atención sobre el programa (RN-A05).
 */
export interface ProgramStore {
  insert(program: ProgramRecord): Promise<void>;
  /** Con toda su estructura; null si no existe o no se ve. */
  find(id: string): Promise<ProgramRecord | null>;
  /** Del más reciente al más antiguo. */
  listByPatient(patientId: string): Promise<readonly ProgramSummaryRecord[]>;
  lineage(lineageId: string): Promise<{ lastVersionNo: number; draftId: string | null }>;
  /** La fórmula de 1RM de los demás programas del paciente; null si no tiene otros (RN-F04). */
  formulaOf(patientId: string, exceptProgramId: string | null): Promise<OneRmFormula | null>;
  /** Sube la versión si sigue en borrador y es la leída; si no, false. */
  touch(id: string, version: number, now: Date, changes?: ProgramHeaderChanges): Promise<boolean>;
  /** Reemplaza las sesiones de una semana y cambia lo que llegue de su fase. */
  saveWeek(
    organizationId: string,
    weekId: string,
    phase: Partial<ProgramWeekPhase>,
    sessions: readonly ProgramSession[],
  ): Promise<void>;
  addMesocycle(organizationId: string, programId: string, mesocycle: Mesocycle): Promise<void>;
  removeMesocycle(mesocycleId: string): Promise<void>;
  /** Deja contiguos los mesociclos que quedan (02 §7). */
  renumber(mesocycles: readonly Mesocycle[]): Promise<void>;
  /** Aprueba el bloque (día y orden) en todas las semanas; devuelve cuántas filas tocó. */
  approveBlock(
    programId: string,
    day: number,
    order: number,
    approval: BlockApproval,
  ): Promise<number>;
  publish(id: string, version: number, publication: ProgramPublication): Promise<boolean>;
  /** Pasa a SUPERSEDED el publicado del paciente y devuelve su id; null si no hay. */
  supersedePublished(patientId: string, now: Date): Promise<string | null>;
  /** Lo que se congeló al publicar; null si es un borrador o no se ve. */
  snapshot(id: string): Promise<ProgramSnapshot | null>;
  /** null si no existe o no se ve. */
  status(id: string): Promise<ProgramStatus | null>;
  timeline(
    patientId: string,
    before: TimelineCursor | null,
    limit: number,
  ): Promise<readonly TimelineEntry[]>;
  /** Las filas de la tabla de fases de un objetivo, vigentes en esa fecha: de la organización y de la V3. */
  phases(
    objective: PeriodizationPhase['objective'],
    onDate: string,
  ): Promise<readonly StoredPhase[]>;
}

export const PROGRAM_STORE = Symbol.for('nutricoach.training.ProgramStore');

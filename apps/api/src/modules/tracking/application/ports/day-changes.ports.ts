import type { DayChange, DayChangeKind } from '../../domain/day-changes.js';

/**
 * tracking.day_change (ADR-104), con la transacción de quien llama: la del paciente o del coach con su RLS, o la del consumidor y la
 * del trabajo de cada hora con el contexto SYSTEM de la organización. Solo los vigentes: deshacer los anula.
 */
export interface DayChangeStore {
  /** Los cambios vigentes del paciente entre dos días, incluidos, en el orden en que se hicieron. */
  active(patientId: string, from: string, to: string): Promise<readonly DayChange[]>;
  /** Los cambios vigentes de la organización del contexto desde un día, por paciente. */
  activeSince(from: string): Promise<ReadonlyMap<string, readonly DayChange[]>>;
  insert(row: {
    readonly id: string;
    readonly organizationId: string;
    readonly patientId: string;
    readonly localDate: string;
    readonly kind: DayChangeKind;
    readonly dayProfileCode: string | null;
    readonly createdBy: string;
    readonly createdByRole: string;
    readonly createdAt: Date;
  }): Promise<void>;
  /** Anula un cambio vigente: deshacer nunca borra (ADR-104). */
  void(id: string, voidedBy: string, voidedAt: Date): Promise<void>;
}

export const DAY_CHANGE_STORE = Symbol.for('nutricoach.tracking.DayChangeStore');

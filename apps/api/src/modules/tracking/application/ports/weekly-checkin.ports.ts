/** Un check-in de la semana guardado (ADR-109). */
export interface StoredWeeklyCheckin {
  readonly id: string;
  readonly patientId: string;
  /** El domingo de la semana. */
  readonly weekDate: string;
  readonly clientId: string;
  /** El día en que lo envió, en su fecha local: el del peso y la nota. */
  readonly loggedOn: string;
  readonly nutritionCompliancePct: number;
  readonly metricLogId: string | null;
  readonly noteId: string | null;
  readonly status: 'ACTIVE' | 'VOIDED';
  readonly createdAt: Date;
}

/**
 * tracking.weekly_checkin (ADR-109), con la transacción de quien llama: la del paciente, la del equipo con su RLS o la del control
 * semanal con el contexto SYSTEM de la organización.
 */
export interface WeeklyCheckinStore {
  byClientId(
    patientId: string,
    weekDate: string,
    clientId: string,
  ): Promise<StoredWeeklyCheckin | null>;
  /** El vigente de ese domingo. */
  active(patientId: string, weekDate: string): Promise<StoredWeeklyCheckin | null>;
  /** Los vigentes del paciente con su domingo entre dos días, incluidos, del más antiguo al más reciente. */
  activeBetween(
    patientId: string,
    from: string,
    to: string,
  ): Promise<readonly StoredWeeklyCheckin[]>;
  insert(
    row: Omit<StoredWeeklyCheckin, 'status'> & { readonly organizationId: string },
  ): Promise<void>;
  /** Lo anula al corregirlo: nunca se borra (RN-G12). */
  void(id: string, voidedAt: Date): Promise<void>;
}

export const WEEKLY_CHECKIN_STORE = Symbol.for('nutricoach.tracking.WeeklyCheckinStore');

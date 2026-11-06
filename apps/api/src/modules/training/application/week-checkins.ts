import { Injectable } from '@nestjs/common';

/** Un registro diario de la semana como lo usa el control semanal (RN-G11, 07 §10), con lo que calculó su recuperación. */
export interface WeekCheckin {
  readonly localDate: string;
  readonly sessionMinutes: number | null;
  readonly sessionRpe: number | null;
  readonly sleepHours: number | null;
  readonly restingHrBpm: number | null;
  readonly hrvMs: number | null;
  readonly fatigue: number | null;
  readonly soreness: number | null;
  /** El rendimiento del día que guardó READINESS_JV. */
  readonly performancePct: number | null;
  readonly nutritionCompliancePct: number | null;
  readonly menstrualSymptoms: number | null;
}

/** Los registros diarios vigentes de un rango, con los ajustes del profesional aplicados (RN-G02). Los da tracking. */
export interface WeekCheckinSource {
  checkins(patientId: string, from: string, to: string): Promise<readonly WeekCheckin[]>;
}

/**
 * Dónde training encuentra los registros diarios sin importar tracking, que ya importa training: tracking registra su fuente al
 * iniciar (02 §4, sin ciclos entre módulos; como las fuentes de la línea de tiempo de clinical).
 */
@Injectable()
export class WeekCheckinSources {
  #source: WeekCheckinSource | null = null;

  register(source: WeekCheckinSource): void {
    this.#source = source;
  }

  get(): WeekCheckinSource {
    if (!this.#source) {
      throw new Error('Falta la fuente de los registros diarios: tracking la registra al iniciar.');
    }
    return this.#source;
  }
}

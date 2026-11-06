import { Inject, Injectable } from '@nestjs/common';
import type { WeekCheckin, WeekCheckinSource } from '../../training/index.js';
import { TrackingApi } from './tracking-api.js';

/**
 * Lo que tracking da al control semanal de training (RN-G16, 07 §10): los registros diarios vigentes del rango, con los ajustes del
 * profesional aplicados (un registro diario excluido no cuenta, RN-G02) y el rendimiento que calculó cada recuperación.
 */
@Injectable()
export class TrackingWeekCheckins implements WeekCheckinSource {
  constructor(@Inject(TrackingApi) private readonly tracking: TrackingApi) {}

  async checkins(patientId: string, from: string, to: string): Promise<readonly WeekCheckin[]> {
    const days = await this.tracking.dailyFacts(patientId, from, to);
    return days.flatMap(({ localDate, checkin }) =>
      checkin
        ? [
            {
              localDate,
              sessionMinutes: checkin.sessionMinutes,
              sessionRpe: checkin.sessionRpe,
              sleepHours: checkin.sleepHours,
              restingHrBpm: checkin.restingHrBpm,
              hrvMs: checkin.hrvMs,
              fatigue: checkin.fatigue,
              soreness: checkin.soreness,
              performancePct: checkin.performancePct,
              nutritionCompliancePct: checkin.nutritionCompliancePct,
              menstrualSymptoms: checkin.menstrualSymptoms,
            },
          ]
        : [],
    );
  }
}

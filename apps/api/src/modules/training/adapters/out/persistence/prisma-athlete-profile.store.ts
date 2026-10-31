import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { OrganizationId, UserId } from '@nutricoach/shared-kernel';
import type { Db } from '../../../../../platform/index.js';
import type {
  AthleteProfileRecord,
  AthleteProfileStore,
} from '../../../application/ports/training.ports.js';
import type {
  MedicalClearance,
  TrainingLevel,
  TrainingObjective,
} from '../../../domain/athlete-profile.js';

const isoDate = (value: Date | null): string | null =>
  value ? value.toISOString().slice(0, 10) : null;
const asDate = (value: string | null): Date | null =>
  value ? new Date(`${value}T00:00:00Z`) : null;
const num = (value: { toString(): string } | null): number | null =>
  value === null ? null : Number(value);

/** training.athlete_profile con la transacción de la UnitOfWork; no tiene UPDATE. */
@Injectable()
export class PrismaAthleteProfileStore implements AthleteProfileStore {
  constructor(@Inject(TransactionHost) private readonly db: Db) {}

  async latest(patientId: string): Promise<AthleteProfileRecord | null> {
    const row = await this.db.tx.athleteProfile.findFirst({
      where: { patientId },
      orderBy: { revision: 'desc' },
    });
    if (!row) return null;
    return {
      id: row.id,
      patientId: row.patientId,
      revision: row.revision,
      objective: row.objective as TrainingObjective,
      level: row.level as TrainingLevel,
      daysPerWeek: row.daysPerWeek,
      minutesPerSession: row.minutesPerSession,
      equipmentCodes: row.equipmentCodes,
      startDate: isoDate(row.startDate),
      macrocycleWeeks: row.macrocycleWeeks,
      medicalClearance: row.medicalClearance as MedicalClearance,
      alarmSymptoms: row.alarmSymptoms,
      injuriesNote: row.injuriesNote,
      restrictionsNote: row.restrictionsNote,
      baselineWeightKg: num(row.baselineWeightKg),
      baselineRestingHrBpm: row.baselineRestingHrBpm,
      baselineHrvMs: num(row.baselineHrvMs),
      sleepTargetHours: Number(row.sleepTargetHours),
      testTargets: row.testTargets as Readonly<Record<string, number>>,
      notes: row.notes,
      recordedBy: row.recordedBy as UserId,
      recordedAt: row.recordedAt,
    };
  }

  async insert(profile: AthleteProfileRecord & { organizationId: OrganizationId }): Promise<void> {
    const { equipmentCodes, startDate, testTargets, ...rest } = profile;
    await this.db.tx.athleteProfile.createMany({
      data: [
        {
          ...rest,
          equipmentCodes: [...equipmentCodes],
          startDate: asDate(startDate),
          testTargets: { ...testTargets },
        },
      ],
    });
  }
}

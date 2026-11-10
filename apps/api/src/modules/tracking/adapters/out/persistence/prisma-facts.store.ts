import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { Db } from '../../../../../platform/index.js';
import type {
  ActivePlans,
  FactsStore,
  OverviewFacts,
} from '../../../application/ports/facts.ports.js';
import type { FactWorkout, RawFacts } from '../../../domain/day-facts.js';

const isoDate = (value: Date): string => value.toISOString().slice(0, 10);
const asDate = (value: string): Date => new Date(`${value}T00:00:00Z`);
const num = (value: { toString(): string } | null): number | null =>
  value === null ? null : Number(value);

const FIBER = 'FIBTG';
const WORKOUT_OUTCOMES = new Set<FactWorkout['outcome']>(['COMPLETED', 'PARTIAL', 'SKIPPED']);

const numberAt = (json: unknown, key: string): number | null => {
  if (json === null || typeof json !== 'object') return null;
  const value = (json as Record<string, unknown>)[key];
  return typeof value === 'number' ? value : null;
};

const numberRecord = (json: unknown): Record<string, number> => {
  if (json === null || typeof json !== 'object') return {};
  return Object.fromEntries(
    Object.entries(json as Record<string, unknown>).filter(
      (entry): entry is [string, number] => typeof entry[1] === 'number',
    ),
  );
};

const contributions = (json: unknown): { muscle: string; weight: number }[] =>
  Array.isArray(json)
    ? json.flatMap((item: unknown) => {
        if (item === null || typeof item !== 'object') return [];
        const { muscle, weight } = item as Record<string, unknown>;
        return typeof muscle === 'string' && typeof weight === 'number' ? [{ muscle, weight }] : [];
      })
    : [];

const minutesBetween = (start: Date | null, end: Date | null): number | null =>
  start === null || end === null ? null : Math.round((end.getTime() - start.getTime()) / 60_000);

/**
 * Las lecturas de rango que pide la analítica (P14): una consulta por tabla con poda de particiones por local_date, en la
 * transacción del contexto (SYSTEM de la organización en el worker y en la CLI). En secuencia: deuda de pg@9 (ADR-083).
 */
@Injectable()
export class PrismaFactsStore implements FactsStore {
  constructor(@Inject(TransactionHost) private readonly db: Db) {}

  async between(patientId: string, from: string, to: string): Promise<RawFacts> {
    const range = { gte: asDate(from), lte: asDate(to) };
    const tx = this.db.tx;
    const targets = await tx.dailyTarget.findMany({
      where: { patientId, localDate: range },
      orderBy: { localDate: 'asc' },
    });
    const foods = await tx.foodLog.findMany({
      where: { patientId, localDate: range, status: 'ACTIVE' },
      select: {
        id: true,
        localDate: true,
        mealSlotCode: true,
        inPlan: true,
        servings: true,
        grams: true,
        kcal: true,
        choG: true,
        proteinG: true,
        fatG: true,
        nutrients: true,
      },
      orderBy: [{ localDate: 'asc' }, { loggedAt: 'asc' }, { id: 'asc' }],
    });
    const hydration = await tx.hydrationLog.findMany({
      where: { patientId, localDate: range, status: 'ACTIVE' },
      select: { id: true, localDate: true, volumeMl: true },
      orderBy: [{ localDate: 'asc' }, { id: 'asc' }],
    });
    const metrics = await tx.metricLog.findMany({
      where: { patientId, localDate: range, status: 'ACTIVE' },
      select: { id: true, localDate: true, metricCode: true, value: true, measuredAt: true },
      orderBy: [{ localDate: 'asc' }, { measuredAt: 'asc' }, { id: 'asc' }],
    });
    const checkins = await tx.dailyCheckin.findMany({
      where: { patientId, localDate: range, status: 'ACTIVE' },
      orderBy: { localDate: 'asc' },
    });
    const readiness = await tx.dailyReadiness.findMany({
      where: { patientId, localDate: range, status: 'CURRENT' },
      select: { checkinId: true, performancePct: true, srpeLoad: true },
    });
    const workouts = await tx.workoutLog.findMany({
      where: { patientId, localDate: range, status: 'ACTIVE' },
      orderBy: [{ localDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    const sets = await tx.setLog.findMany({
      where: { patientId, localDate: range, status: 'ACTIVE' },
      orderBy: [{ localDate: 'asc' }, { createdAt: 'asc' }, { setNo: 'asc' }, { id: 'asc' }],
    });
    const adjustments = await tx.logAdjustment.findMany({
      where: { patientId, targetLocalDate: range },
      select: {
        targetId: true,
        targetLocalDate: true,
        action: true,
        correctedValues: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const readinessOf = new Map(readiness.map((r) => [r.checkinId, r]));
    return {
      targets: targets.map((t) => ({
        localDate: isoDate(t.localDate),
        nutritionPlanId: t.nutritionPlanId,
        kcal: num(t.kcal),
        choG: num(t.choG),
        proteinG: num(t.proteinG),
        fatG: num(t.fatG),
        waterMl: t.waterMl,
        plannedSessions: t.plannedSessions,
        dayKind: t.dayKind === 'TRAINING' || t.dayKind === 'REST' ? t.dayKind : null,
        dayProfileCode: t.dayProfileCode,
        dayProfileName: t.dayProfileName,
        plannedSets: numberRecord(t.plannedSets),
      })),
      foods: foods.map((f) => ({
        id: f.id,
        localDate: isoDate(f.localDate),
        mealSlotCode: f.mealSlotCode,
        inPlan: f.inPlan,
        servings: num(f.servings),
        grams: num(f.grams),
        kcal: num(f.kcal),
        choG: num(f.choG),
        proteinG: num(f.proteinG),
        fatG: num(f.fatG),
        fiberG: numberAt(f.nutrients, FIBER),
      })),
      hydration: hydration.map((h) => ({
        id: h.id,
        localDate: isoDate(h.localDate),
        volumeMl: h.volumeMl,
      })),
      metrics: metrics.map((m) => ({
        id: m.id,
        localDate: isoDate(m.localDate),
        metricCode: m.metricCode,
        value: Number(m.value),
        measuredAt: m.measuredAt,
      })),
      checkins: checkins.map((c) => ({
        id: c.id,
        localDate: isoDate(c.localDate),
        sessionMinutes: c.sessionMinutes,
        sessionRpe: num(c.sessionRpe),
        sleepHours: num(c.sleepHours),
        fatigue: c.fatigue,
        soreness: c.soreness,
        stress: c.stress,
        motivation: c.motivation,
        energy: c.energy,
        menstrualSymptoms: c.menstrualSymptoms,
        nutritionCompliancePct: c.nutritionCompliancePct,
        restingHrBpm: c.restingHrBpm,
        hrvMs: num(c.hrvMs),
        performancePct: num(readinessOf.get(c.id)?.performancePct ?? null),
        srpeLoad: num(readinessOf.get(c.id)?.srpeLoad ?? null),
      })),
      workouts: workouts.flatMap((w) =>
        WORKOUT_OUTCOMES.has(w.outcome as FactWorkout['outcome'])
          ? [
              {
                id: w.id,
                localDate: isoDate(w.localDate),
                outcome: w.outcome as FactWorkout['outcome'],
                programId: w.programId,
                sessionId: w.sessionId,
                mesocycleId: w.mesocycleId,
                weekNo: w.weekNo,
                isDeload: w.isDeload,
                durationMinutes: minutesBetween(w.startedAt, w.finishedAt),
                sessionRpe: num(w.sessionRpe),
              },
            ]
          : [],
      ),
      sets: sets.map((s) => ({
        id: s.id,
        localDate: isoDate(s.localDate),
        workoutLogId: s.workoutLogId,
        exerciseId: s.exerciseId,
        setNo: s.setNo,
        muscleContributions: contributions(s.muscleContributions),
        isWarmup: s.isWarmup,
        reps: s.reps,
        loadKg: num(s.loadKg),
        rir: s.rir,
        rpe: num(s.rpe),
        stimulusRating: s.stimulusRating,
        fatigueRating: s.fatigueRating,
        durationSeconds: s.durationSeconds,
        tonnageKg: num(s.tonnageKg) ?? 0,
      })),
      adjustments: adjustments.map((a) => ({
        targetId: a.targetId,
        targetLocalDate: isoDate(a.targetLocalDate),
        action: a.action === 'CORRECT' ? 'CORRECT' : 'EXCLUDE',
        correctedValues: a.correctedValues === null ? null : numberRecord(a.correctedValues),
        createdAt: a.createdAt,
      })),
    };
  }

  async span(patientId: string): Promise<{ from: string; to: string } | null> {
    const [row] = await this.db.tx.$queryRaw<{ first: Date | null; last: Date | null }[]>`
      SELECT min(d) AS first, max(d) AS last FROM (
        SELECT local_date AS d FROM tracking.daily_target WHERE patient_id = ${patientId}::uuid
        UNION ALL SELECT local_date FROM tracking.food_log WHERE patient_id = ${patientId}::uuid
        UNION ALL SELECT local_date FROM tracking.hydration_log WHERE patient_id = ${patientId}::uuid
        UNION ALL SELECT local_date FROM tracking.metric_log WHERE patient_id = ${patientId}::uuid
        UNION ALL SELECT local_date FROM tracking.daily_checkin WHERE patient_id = ${patientId}::uuid
        UNION ALL SELECT local_date FROM tracking.workout_log WHERE patient_id = ${patientId}::uuid
      ) AS days`;
    if (!row?.first || !row.last) return null;
    return { from: isoDate(row.first), to: isoDate(row.last) };
  }

  async programIds(patientId: string, from: string, to: string): Promise<readonly string[]> {
    const rows = await this.db.tx.workoutLog.findMany({
      where: {
        patientId,
        localDate: { gte: asDate(from), lte: asDate(to) },
        programId: { not: null },
      },
      select: { programId: true },
      distinct: ['programId'],
    });
    return rows.flatMap((row) => (row.programId === null ? [] : [row.programId]));
  }

  async activeProgramId(patientId: string): Promise<string | null> {
    const row = await this.db.tx.activePlanView.findUnique({
      where: { patientId },
      select: { trainingProgramId: true },
    });
    return row?.trainingProgramId ?? null;
  }

  async activePlans(patientId: string): Promise<ActivePlans> {
    const row = await this.db.tx.activePlanView.findUnique({
      where: { patientId },
      select: { nutritionPlanId: true, trainingProgramId: true },
    });
    return {
      nutritionPlanId: row?.nutritionPlanId ?? null,
      trainingProgramId: row?.trainingProgramId ?? null,
    };
  }

  async patientIdsWithTargets(since: string): Promise<readonly string[]> {
    const rows = await this.db.tx.$queryRaw<{ patient_id: string }[]>`
      SELECT DISTINCT patient_id FROM tracking.daily_target
      WHERE local_date >= ${asDate(since)}::date
      ORDER BY patient_id`;
    return rows.map((row) => row.patient_id);
  }

  async overview(patientId: string): Promise<OverviewFacts> {
    const [days] = await this.db.tx.$queryRaw<
      { last_record: Date | null; first_target: Date | null; unread: bigint }[]
    >`
      SELECT
        (SELECT max(local_date) FROM (
           SELECT max(local_date) AS local_date FROM tracking.food_log WHERE patient_id = ${patientId}::uuid AND status = 'ACTIVE'
           UNION ALL SELECT max(local_date) FROM tracking.hydration_log WHERE patient_id = ${patientId}::uuid AND status = 'ACTIVE'
           UNION ALL SELECT max(local_date) FROM tracking.metric_log WHERE patient_id = ${patientId}::uuid AND status = 'ACTIVE'
           UNION ALL SELECT max(local_date) FROM tracking.daily_checkin WHERE patient_id = ${patientId}::uuid AND status = 'ACTIVE'
           UNION ALL SELECT max(local_date) FROM tracking.workout_log WHERE patient_id = ${patientId}::uuid AND status = 'ACTIVE'
           UNION ALL SELECT max(local_date) FROM tracking.note_log WHERE patient_id = ${patientId}::uuid
         ) AS last_days) AS last_record,
        (SELECT min(local_date) FROM tracking.daily_target WHERE patient_id = ${patientId}::uuid) AS first_target,
        (SELECT count(*) FROM tracking.note_log WHERE patient_id = ${patientId}::uuid AND read_at IS NULL) AS unread`;
    const checkin = await this.db.tx.dailyCheckin.findFirst({
      where: { patientId, status: 'ACTIVE' },
      orderBy: [{ localDate: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, localDate: true },
    });
    const readiness = checkin
      ? await this.db.tx.dailyReadiness.findFirst({
          where: { checkinId: checkin.id, localDate: checkin.localDate, status: 'CURRENT' },
          select: { indication: true },
        })
      : null;
    return {
      lastRecordDate: days?.last_record ? isoDate(days.last_record) : null,
      firstTargetDate: days?.first_target ? isoDate(days.first_target) : null,
      unreadNotes: Number(days?.unread ?? 0),
      latestCheckin: checkin
        ? {
            localDate: isoDate(checkin.localDate),
            indication: (readiness?.indication ?? null) as OverviewIndication,
          }
        : null,
    };
  }
}

type OverviewIndication = NonNullable<OverviewFacts['latestCheckin']>['indication'];

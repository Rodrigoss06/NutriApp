import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type {
  MovementPattern,
  PeriodizationPhase,
  ReviewKind,
  RoutineSplit,
  TrainingIntensity,
  TrainingLevel,
  TrainingObjective,
} from '@nutricoach/engine';
import {
  ID_GENERATOR,
  type IdGenerator,
  type OrganizationId,
  type UserId,
} from '@nutricoach/shared-kernel';
import type { TimelineCursor, TimelineEntry } from '../../../../clinical/index.js';
import type { Db } from '../../../../../platform/index.js';
import type {
  BlockApproval,
  ProgramHeaderChanges,
  ProgramPublication,
  ProgramRecord,
  ProgramStore,
  ProgramSummaryRecord,
  StoredPhase,
} from '../../../application/ports/program.ports.js';
import type { ProgramSnapshot } from '../../../application/program-document.js';
import type {
  LoadKind,
  Mesocycle,
  OneRmFormula,
  ProgramOrigin,
  ProgramSession,
  ProgramStatus,
  ProgramWeekPhase,
  SetType,
} from '../../../domain/program.js';

const isoDate = (value: Date | null): string | null =>
  value ? value.toISOString().slice(0, 10) : null;
const asDate = (value: string | null): Date | null =>
  value ? new Date(`${value}T00:00:00Z`) : null;
const num = (value: { toString(): string } | null): number | null =>
  value === null ? null : Number(value);

const SUMMARY = {
  id: true,
  organizationId: true,
  patientId: true,
  lineageId: true,
  versionNo: true,
  name: true,
  goal: true,
  status: true,
  origin: true,
  startDate: true,
  endDate: true,
  oneRmFormula: true,
  objective: true,
  level: true,
  daysPerWeek: true,
  split: true,
  macrocycleWeeks: true,
  periodizationValidFrom: true,
  templateVersion: true,
  athleteProfileId: true,
  publishedAt: true,
  createdBy: true,
  createdAt: true,
  version: true,
} as const;

const summaryOf = (row: {
  id: string;
  organizationId: string;
  patientId: string;
  lineageId: string;
  versionNo: number;
  name: string;
  goal: string | null;
  status: string;
  origin: string;
  startDate: Date | null;
  endDate: Date | null;
  oneRmFormula: string;
  objective: string | null;
  level: string | null;
  daysPerWeek: number | null;
  split: string | null;
  macrocycleWeeks: number | null;
  periodizationValidFrom: Date | null;
  templateVersion: string | null;
  athleteProfileId: string | null;
  publishedAt: Date | null;
  createdBy: string;
  createdAt: Date;
  version: number;
}): ProgramSummaryRecord => ({
  ...row,
  organizationId: row.organizationId as OrganizationId,
  status: row.status as ProgramStatus,
  origin: row.origin as ProgramOrigin,
  startDate: isoDate(row.startDate),
  endDate: isoDate(row.endDate),
  oneRmFormula: row.oneRmFormula as OneRmFormula,
  objective: row.objective as TrainingObjective | null,
  level: row.level as TrainingLevel | null,
  split: row.split as RoutineSplit | null,
  periodizationValidFrom: isoDate(row.periodizationValidFrom),
  createdBy: row.createdBy as UserId,
});

/** training.program y su estructura, con la transacción de la UnitOfWork. Las sesiones de una semana se reemplazan. */
@Injectable()
export class PrismaProgramStore implements ProgramStore {
  constructor(
    @Inject(TransactionHost) private readonly db: Db,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  async insert(program: ProgramRecord): Promise<void> {
    await this.db.tx.trainingProgram.create({
      data: {
        id: program.id,
        organizationId: program.organizationId,
        patientId: program.patientId,
        lineageId: program.lineageId,
        versionNo: program.versionNo,
        name: program.name,
        goal: program.goal,
        status: program.status,
        origin: program.origin,
        startDate: asDate(program.startDate),
        endDate: asDate(program.endDate),
        oneRmFormula: program.oneRmFormula,
        objective: program.objective,
        level: program.level,
        daysPerWeek: program.daysPerWeek,
        split: program.split,
        macrocycleWeeks: program.macrocycleWeeks,
        periodizationValidFrom: asDate(program.periodizationValidFrom),
        templateVersion: program.templateVersion,
        athleteProfileId: program.athleteProfileId,
        createdBy: program.createdBy,
        createdAt: program.createdAt,
        updatedAt: program.createdAt,
        version: program.version,
      },
    });
    await this.#insertMesocycles(program.organizationId, program.id, program.mesocycles);
  }

  async find(id: string): Promise<ProgramRecord | null> {
    const row = await this.db.tx.trainingProgram.findFirst({
      where: { id },
      select: {
        ...SUMMARY,
        mesocycles: {
          orderBy: { position: 'asc' },
          include: {
            programWeeks: {
              orderBy: { weekNo: 'asc' },
              include: {
                trainingSessions: {
                  orderBy: { position: 'asc' },
                  include: {
                    prescribedExercises: {
                      orderBy: { position: 'asc' },
                      include: { prescribedSets: { orderBy: { setNo: 'asc' } } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!row) return null;
    return {
      ...summaryOf(row),
      mesocycles: row.mesocycles.map((mesocycle) => ({
        id: mesocycle.id,
        position: mesocycle.position,
        name: mesocycle.name,
        focus: mesocycle.focus,
        weeks: mesocycle.programWeeks.map((week) => ({
          id: week.id,
          weekNo: week.weekNo,
          isDeload: week.isDeload,
          phaseEs: week.phaseEs,
          phaseGoalEs: week.phaseGoalEs,
          volumeFactor: num(week.volumeFactor),
          intensity: week.intensity as TrainingIntensity | null,
          targetRir: week.targetRir,
          reviewKind: week.reviewKind as ReviewKind | null,
          sessions: week.trainingSessions.map((session) => ({
            id: session.id,
            position: session.position,
            name: session.name,
            dayOfWeek: session.dayOfWeek,
            notes: session.notes,
            exercises: session.prescribedExercises.map((exercise) => ({
              id: exercise.id,
              exerciseId: exercise.exerciseId,
              position: exercise.position,
              supersetGroup: exercise.supersetGroup,
              notes: exercise.notes,
              movementPattern: exercise.movementPattern as MovementPattern | null,
              suggestedExerciseId: exercise.suggestedExerciseId,
              substitutionNote: exercise.substitutionNote,
              approvedBy: exercise.approvedBy,
              approvedAt: exercise.approvedAt,
              sets: exercise.prescribedSets.map((set) => ({
                setNo: set.setNo,
                setType: set.setType as SetType,
                repsMin: set.repsMin,
                repsMax: set.repsMax,
                loadKind: set.loadKind as LoadKind | null,
                loadValue: num(set.loadValue),
                restSeconds: set.restSeconds,
                tempo: set.tempo,
                durationSeconds: set.durationSeconds,
                distanceM: num(set.distanceM),
                met: num(set.met),
              })),
            })),
          })),
        })),
      })),
    };
  }

  async listByPatient(patientId: string): Promise<readonly ProgramSummaryRecord[]> {
    const rows = await this.db.tx.trainingProgram.findMany({
      where: { patientId },
      select: SUMMARY,
      orderBy: [{ createdAt: 'desc' }, { versionNo: 'desc' }],
    });
    return rows.map(summaryOf);
  }

  async lineage(lineageId: string): Promise<{ lastVersionNo: number; draftId: string | null }> {
    const rows = await this.db.tx.trainingProgram.findMany({
      where: { lineageId },
      select: { id: true, versionNo: true, status: true },
    });
    return {
      lastVersionNo: Math.max(0, ...rows.map((row) => row.versionNo)),
      draftId: rows.find((row) => row.status === 'DRAFT')?.id ?? null,
    };
  }

  async formulaOf(patientId: string, exceptProgramId: string | null): Promise<OneRmFormula | null> {
    const row = await this.db.tx.trainingProgram.findFirst({
      where: { patientId, ...(exceptProgramId ? { id: { not: exceptProgramId } } : {}) },
      select: { oneRmFormula: true },
      orderBy: { createdAt: 'desc' },
    });
    return (row?.oneRmFormula as OneRmFormula | undefined) ?? null;
  }

  async touch(
    id: string,
    version: number,
    now: Date,
    changes: ProgramHeaderChanges = {},
  ): Promise<boolean> {
    const { startDate, ...rest } = changes;
    const { count } = await this.db.tx.trainingProgram.updateMany({
      where: { id, version, status: 'DRAFT' },
      data: {
        ...rest,
        ...(startDate === undefined ? {} : { startDate: asDate(startDate) }),
        version: { increment: 1 },
        updatedAt: now,
      },
    });
    return count === 1;
  }

  async saveWeek(
    organizationId: string,
    weekId: string,
    phase: Partial<ProgramWeekPhase>,
    sessions: readonly ProgramSession[],
  ): Promise<void> {
    if (Object.keys(phase).length > 0) {
      await this.db.tx.programWeek.update({ where: { id: weekId }, data: phase });
    }
    await this.db.tx.trainingSession.deleteMany({ where: { weekId } });
    await this.#insertSessions(organizationId, [{ weekId, sessions }]);
  }

  async addMesocycle(
    organizationId: string,
    programId: string,
    mesocycle: Mesocycle,
  ): Promise<void> {
    await this.#insertMesocycles(organizationId, programId, [mesocycle]);
  }

  async removeMesocycle(mesocycleId: string): Promise<void> {
    await this.db.tx.mesocycle.deleteMany({ where: { id: mesocycleId } });
  }

  async renumber(mesocycles: readonly Mesocycle[]): Promise<void> {
    let weekNo = 0;
    for (const [index, mesocycle] of mesocycles.entries()) {
      if (mesocycle.position !== index + 1) {
        await this.db.tx.mesocycle.update({
          where: { id: mesocycle.id },
          data: { position: index + 1 },
        });
      }
      for (const week of mesocycle.weeks) {
        weekNo += 1;
        if (week.weekNo !== weekNo) {
          await this.db.tx.programWeek.update({ where: { id: week.id }, data: { weekNo } });
        }
      }
    }
  }

  async approveBlock(
    programId: string,
    day: number,
    order: number,
    approval: BlockApproval,
  ): Promise<number> {
    const { count } = await this.db.tx.prescribedExercise.updateMany({
      where: {
        position: order,
        trainingSession: {
          position: day,
          programWeek: { mesocycle: { programId } },
        },
      },
      data: {
        ...(approval.exerciseId ? { exerciseId: approval.exerciseId } : {}),
        substitutionNote: approval.note,
        approvedBy: approval.approvedBy,
        approvedAt: approval.approvedAt,
      },
    });
    return count;
  }

  async publish(id: string, version: number, publication: ProgramPublication): Promise<boolean> {
    const updated = await this.db.tx.$executeRaw`
      UPDATE training.program
      SET status = 'PUBLISHED', snapshot = ${JSON.stringify(publication.snapshot)}::jsonb,
          snapshot_schema_version = ${publication.snapshot.schemaVersion},
          snapshot_hash = decode(${publication.hash}, 'hex'), published_at = ${publication.publishedAt},
          published_by = ${publication.publishedBy}::uuid, start_date = ${publication.startDate}::date,
          end_date = ${publication.endDate}::date, version = version + 1,
          updated_at = ${publication.publishedAt}
      WHERE id = ${id}::uuid AND version = ${version} AND status = 'DRAFT'`;
    return updated === 1;
  }

  async supersedePublished(patientId: string, now: Date): Promise<string | null> {
    const [row] = await this.db.tx.$queryRaw<{ id: string }[]>`
      UPDATE training.program SET status = 'SUPERSEDED', version = version + 1, updated_at = ${now}
      WHERE patient_id = ${patientId}::uuid AND status = 'PUBLISHED'
      RETURNING id`;
    return row?.id ?? null;
  }

  async snapshot(id: string): Promise<ProgramSnapshot | null> {
    const [row] = await this.db.tx.$queryRaw<{ snapshot: ProgramSnapshot }[]>`
      SELECT snapshot FROM training.program WHERE id = ${id}::uuid AND status <> 'DRAFT'`;
    return row?.snapshot ?? null;
  }

  async status(id: string): Promise<ProgramStatus | null> {
    const row = await this.db.tx.trainingProgram.findUnique({
      where: { id },
      select: { status: true },
    });
    return row ? (row.status as ProgramStatus) : null;
  }

  async timeline(
    patientId: string,
    before: TimelineCursor | null,
    limit: number,
  ): Promise<readonly TimelineEntry[]> {
    const rows = await this.db.tx.$queryRaw<
      { id: string; published_at: Date; version_no: number }[]
    >`
      SELECT id, published_at, version_no FROM training.program
      WHERE patient_id = ${patientId}::uuid AND published_at IS NOT NULL
        AND (${before?.occurredAt ?? null}::timestamptz IS NULL
             OR (published_at, id) < (${before?.occurredAt ?? null}::timestamptz, ${before?.refId ?? null}::uuid))
      ORDER BY published_at DESC, id DESC
      LIMIT ${limit}`;
    return rows.map((row) => ({
      kind: 'TRAINING_PROGRAM_PUBLISHED',
      occurredAt: row.published_at,
      refId: row.id,
      label: String(row.version_no),
      detail: null,
    }));
  }

  async phases(
    objective: PeriodizationPhase['objective'],
    onDate: string,
  ): Promise<readonly StoredPhase[]> {
    const rows = await this.db.tx.periodizationPhase.findMany({
      where: { objective, validFrom: { lte: asDate(onDate) ?? undefined } },
      orderBy: { weekNo: 'asc' },
    });
    return rows.map((row) => ({
      objective: row.objective as TrainingObjective,
      weekNo: row.weekNo,
      phaseEs: row.phaseEs,
      phaseGoalEs: row.phaseGoalEs,
      volumeFactor: Number(row.volumeFactor),
      intensity: row.intensity as TrainingIntensity,
      targetRir: row.targetRir,
      isDeload: row.isDeload,
      reviewKind: row.reviewKind as ReviewKind,
      validFrom: row.validFrom.toISOString().slice(0, 10),
      own: row.organizationId !== null,
    }));
  }

  async #insertMesocycles(
    organizationId: string,
    programId: string,
    mesocycles: readonly Mesocycle[],
  ): Promise<void> {
    if (mesocycles.length === 0) return;
    await this.db.tx.mesocycle.createMany({
      data: mesocycles.map((mesocycle) => ({
        id: mesocycle.id,
        programId,
        organizationId,
        position: mesocycle.position,
        name: mesocycle.name,
        focus: mesocycle.focus,
        weeks: mesocycle.weeks.length,
      })),
    });
    await this.db.tx.programWeek.createMany({
      data: mesocycles.flatMap((mesocycle) =>
        mesocycle.weeks.map((week) => ({
          id: week.id,
          mesocycleId: mesocycle.id,
          organizationId,
          weekNo: week.weekNo,
          isDeload: week.isDeload,
          phaseEs: week.phaseEs,
          phaseGoalEs: week.phaseGoalEs,
          volumeFactor: week.volumeFactor,
          intensity: week.intensity,
          targetRir: week.targetRir,
          reviewKind: week.reviewKind,
        })),
      ),
    });
    await this.#insertSessions(
      organizationId,
      mesocycles.flatMap((mesocycle) =>
        mesocycle.weeks.map((week) => ({ weekId: week.id, sessions: week.sessions })),
      ),
    );
  }

  async #insertSessions(
    organizationId: string,
    weeks: readonly { readonly weekId: string; readonly sessions: readonly ProgramSession[] }[],
  ): Promise<void> {
    const sessions = weeks.flatMap(({ weekId, sessions: rows }) =>
      rows.map((session) => ({ session, weekId })),
    );
    if (sessions.length === 0) return;
    await this.db.tx.trainingSession.createMany({
      data: sessions.map(({ session, weekId }) => ({
        id: session.id,
        weekId,
        organizationId,
        position: session.position,
        name: session.name,
        dayOfWeek: session.dayOfWeek,
        notes: session.notes,
      })),
    });
    const exercises = sessions.flatMap(({ session }) =>
      session.exercises.map((exercise) => ({ exercise, sessionId: session.id })),
    );
    if (exercises.length === 0) return;
    await this.db.tx.prescribedExercise.createMany({
      data: exercises.map(({ exercise, sessionId }) => ({
        id: exercise.id,
        sessionId,
        organizationId,
        exerciseId: exercise.exerciseId,
        position: exercise.position,
        supersetGroup: exercise.supersetGroup,
        notes: exercise.notes,
        movementPattern: exercise.movementPattern,
        suggestedExerciseId: exercise.suggestedExerciseId,
        substitutionNote: exercise.substitutionNote,
        approvedBy: exercise.approvedBy,
        approvedAt: exercise.approvedAt,
      })),
    });
    await this.db.tx.prescribedSet.createMany({
      data: exercises.flatMap(({ exercise }) =>
        exercise.sets.map((set) => ({
          ...set,
          id: this.ids.newId<'PrescribedSetId'>(),
          prescribedExerciseId: exercise.id,
          organizationId,
        })),
      ),
    });
  }
}

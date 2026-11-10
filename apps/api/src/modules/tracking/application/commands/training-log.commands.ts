import { Inject, Injectable } from '@nestjs/common';
import { READINESS_JV, runMethod } from '@nutricoach/engine';
import {
  CLOCK,
  err,
  ID_GENERATOR,
  ok,
  UNIT_OF_WORK,
  type Clock,
  type DomainError,
  type IdGenerator,
  type Result,
  type SecurityContext,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import { atomically } from '../../../../platform/index.js';
import { ClinicalApi } from '../../../clinical/index.js';
import { addDays } from '../../domain/day-changes.js';
import {
  dayPerformance,
  locateSession,
  loggableSets,
  plannedTonnageKg,
  type SnapshotProgram,
  type SnapshotSession,
} from '../../domain/training-day.js';
import {
  CHECKIN_INVALID,
  NO_ACTIVE_PROGRAM,
  NOT_IN_PROGRAM,
  RECORD_NOT_FOUND,
  RECORD_VOIDED,
} from '../../domain/tracking-errors.js';
import { trainingDayOf } from '../active-training.js';
import { DAY_CHANGE_STORE, type DayChangeStore } from '../ports/day-changes.ports.js';
import {
  RECORD_STORE,
  type CheckinFields,
  type RecordStore,
  type StoredCheckin,
  type StoredWorkout,
  type WorkoutOutcome,
} from '../ports/records.ports.js';
import { itemClientId } from './record.commands.js';
import { patientOf, RecordGate, type Logged, type PatientContext } from './record-gate.js';

export interface CheckinInput extends CheckinFields {
  readonly clientId: string;
  readonly localDate: string;
}

export interface LoggedSetInput {
  readonly exerciseId: string;
  readonly setNo: number;
  readonly isWarmup: boolean;
  readonly reps: number | null;
  readonly loadKg: number | null;
  readonly rir: number | null;
  readonly rpe: number | null;
  readonly durationSeconds: number | null;
  readonly distanceM: number | null;
  readonly met: number | null;
  readonly stimulus: number | null;
  readonly fatigue: number | null;
}

export interface WorkoutInput {
  readonly clientId: string;
  readonly localDate: string;
  readonly sessionId: string | null;
  readonly outcome: WorkoutOutcome;
  readonly durationMinutes: number | null;
  readonly sessionRpe: number | null;
  readonly stimulus: number | null;
  readonly fatigue: number | null;
  readonly notes: string | null;
  readonly sets: readonly LoggedSetInput[];
}

const MS_PER_MINUTE = 60_000;

const sum = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0);

/**
 * El tonelaje del día para el rendimiento (P-09, ADR-080): las sesiones del programa registradas ese día, lo prescrito de cada una
 * frente a lo registrado. Una sesión sin kg y repeticiones fijas deja el planificado vacío; sin sesiones registradas, los dos. Una
 * sesión sin tonelaje, porque se marcó hecha sin series o sin peso, no dice nada del rendimiento: no cuenta, en vez de valer 0 %.
 */
function dayTonnage(
  program: SnapshotProgram | null,
  workouts: readonly StoredWorkout[],
): { readonly plannedTonnageKg: number | null; readonly loggedTonnageKg: number | null } {
  const done = workouts.filter(
    (workout) =>
      workout.sessionId !== null && workout.outcome !== 'SKIPPED' && workout.tonnageKg > 0,
  );
  if (!program || done.length === 0) return { plannedTonnageKg: null, loggedTonnageKg: null };
  const planned = done.map((workout) => {
    const place = workout.sessionId ? locateSession(program, workout.sessionId) : null;
    return place ? plannedTonnageKg(place.session) : null;
  });
  return {
    plannedTonnageKg: planned.every((value) => value !== null) ? sum(planned) : null,
    loggedTonnageKg: sum(done.map((workout) => workout.tonnageKg)),
  };
}

/**
 * El registro diario de entrenamiento y recuperación (RN-G11, 07 §9) y el entreno de una sesión con sus series (RF-29). El registro
 * diario calcula en su misma transacción la recuperación e indicación del día con READINESS_JV (RN-G14, RN-G15, RN-D01); registrarlo
 * otra vez ese día anula el anterior y su recuperación, sin borrar (RN-G12). Los síntomas del ciclo exigen MENSTRUAL_TRACKING
 * (RN-G17).
 */
@Injectable()
export class TrainingLogCommands {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(RECORD_STORE) private readonly store: RecordStore,
    @Inject(RecordGate) private readonly gate: RecordGate,
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
    @Inject(DAY_CHANGE_STORE) private readonly dayChanges: DayChangeStore,
  ) {}

  logCheckin(
    context: SecurityContext,
    input: CheckinInput,
  ): Promise<Result<Logged<StoredCheckin>, DomainError>> {
    const patient = patientOf(context);
    return atomically<Logged<StoredCheckin>>(this.uow, context, async () => {
      const lookup = () =>
        this.store.checkinByClientId(patient.patientId, input.localDate, input.clientId);
      const replay = await lookup();
      if (replay) return ok({ value: replay, replayed: true });
      const open = await this.gate.ensureOpen(patient, input.localDate);
      if (!open.ok) return open;
      if (input.menstrualSymptoms !== null) {
        const consent = await this.clinical.ensureMenstrualTrackingConsent(patient.patientId);
        if (!consent.ok) return consent;
      }

      const training = trainingDayOf(
        await this.store.activeTraining(patient.patientId),
        input.localDate,
        await this.dayChanges.active(
          patient.patientId,
          addDays(input.localDate, -1),
          input.localDate,
        ),
      );
      const workouts = await this.store.dayWorkouts(patient.patientId, input.localDate);
      const performance = dayPerformance(dayTonnage(training?.program ?? null, workouts), {
        planned: input.performancePlanned,
        actual: input.performanceActual,
      });
      const basis = await this.store.readinessBasis(input.localDate);
      if (!basis) throw new Error('No hay un umbral de recuperación vigente.');
      const run = runMethod(READINESS_JV, {
        day: {
          sessionMinutes: input.sessionMinutes,
          sessionRpe: input.sessionRpe,
          sleepHours: input.sleepHours,
          fatigue: input.fatigue,
          soreness: input.soreness,
          stress: input.stress,
          motivation: input.motivation,
          menstrualSymptoms: input.menstrualSymptoms,
          performancePlanned: performance.planned,
          performanceActual: performance.actual,
          restingHrBpm: input.restingHrBpm,
          hrvMs: input.hrvMs,
        },
        baseline: basis.baseline,
        thresholds: basis.thresholds,
      });
      if (!run.ok) return err(CHECKIN_INVALID);

      const current = await this.store.activeCheckin(patient.patientId, input.localDate);
      if (current) {
        await this.store.voidCheckin(current.id, input.localDate);
        await this.#emit(patient, 'tracking.checkin.voided', current.id, input.localDate);
      }
      const id = this.ids.newId<'DailyCheckinId'>();
      const { clientId, localDate, ...fields } = input;
      await this.store.insertCheckin({
        ...fields,
        id,
        organizationId: patient.organizationId,
        patientId: patient.patientId,
        localDate,
        clientId,
        programId: training?.program.programId ?? null,
        weekNo: training?.day.week.weekNo ?? null,
        sessionId:
          workouts.find((workout) => workout.sessionId !== null)?.sessionId ??
          (training?.day.sessions.length === 1 ? (training.day.sessions[0]?.id ?? null) : null),
      });
      const inserted = await lookup();
      if (!inserted) throw new Error('El registro diario no quedó guardado.');
      if (inserted.id !== id) return ok({ value: inserted, replayed: true });

      const { outputs } = run.result;
      await this.store.insertReadiness({
        id: this.ids.newId<'DailyReadinessId'>(),
        organizationId: patient.organizationId,
        patientId: patient.patientId,
        localDate,
        checkinId: id,
        methodCode: run.result.methodCode,
        methodVersion: run.result.methodVersion,
        engineVersion: run.result.engineVersion,
        thresholdId: basis.thresholdId,
        inputs: run.result.inputs,
        inputsHash: run.result.inputsHash,
        srpeLoad: outputs.srpeLoad,
        performancePct: outputs.performancePct,
        readinessScore: outputs.readinessScore,
        components: outputs.components,
        neutralComponents: outputs.neutralComponents,
        indication: outputs.indication,
        computedAt: this.clock.now(),
      });
      await this.#emit(patient, 'tracking.checkin.logged', id, localDate);
      const stored = await lookup();
      if (!stored) throw new Error('El registro diario no quedó guardado.');
      return ok({ value: stored, replayed: false });
    });
  }

  /** Anular el registro diario deja su recuperación SUPERSEDED: Hoy vuelve a pedir el registro (RN-G12). */
  voidCheckin(context: SecurityContext, id: string): Promise<Result<StoredCheckin, DomainError>> {
    const patient = patientOf(context);
    return atomically(this.uow, context, async () => {
      const current = await this.store.checkin(id);
      if (!current) return err(RECORD_NOT_FOUND);
      if (current.status === 'VOIDED') return err(RECORD_VOIDED);
      const open = await this.gate.ensureOpen(patient, current.localDate);
      if (!open.ok) return open;
      await this.store.voidCheckin(id, current.localDate);
      await this.#emit(patient, 'tracking.checkin.voided', id, current.localDate);
      return ok({
        ...current,
        status: 'VOIDED',
        readiness: current.readiness && { ...current.readiness, status: 'SUPERSEDED' },
      });
    });
  }

  /**
   * Una sesión del programa vigente con sus series (RF-29): cada ejercicio debe estar en esa sesión o, sin sesión, en el programa.
   * Cada serie congela el nombre del ejercicio y sus músculos (RN-F06); el tonelaje lo calcula la base (RN-F03).
   */
  logWorkout(
    context: SecurityContext,
    input: WorkoutInput,
  ): Promise<Result<Logged<StoredWorkout>, DomainError>> {
    const patient = patientOf(context);
    return atomically<Logged<StoredWorkout>>(this.uow, context, async () => {
      const lookup = () =>
        this.store.workoutByClientId(patient.patientId, input.localDate, input.clientId);
      const replay = await lookup();
      if (replay) return ok({ value: replay, replayed: true });
      const open = await this.gate.ensureOpen(patient, input.localDate);
      if (!open.ok) return open;

      const training = trainingDayOf(
        await this.store.activeTraining(patient.patientId),
        input.localDate,
        await this.dayChanges.active(
          patient.patientId,
          addDays(input.localDate, -1),
          input.localDate,
        ),
      );
      if (!training) return err(NO_ACTIVE_PROGRAM);
      const { program } = training;
      const located = input.sessionId ? locateSession(program, input.sessionId) : null;
      if (input.sessionId && !located) return err(NOT_IN_PROGRAM);
      const place = located ?? training.day;
      const sessions: readonly SnapshotSession[] = located
        ? [located.session]
        : program.mesocycles.flatMap((mesocycle) =>
            mesocycle.weeks.flatMap((week) => week.sessions),
          );
      const sets = loggableSets(sessions, input.sets);
      if (!sets) return err(NOT_IN_PROGRAM);

      const id = this.ids.newId<'WorkoutLogId'>();
      const finishedAt = input.durationMinutes === null ? null : this.clock.now();
      await this.store.insertWorkout({
        id,
        organizationId: patient.organizationId,
        patientId: patient.patientId,
        localDate: input.localDate,
        clientId: input.clientId,
        programId: program.programId,
        sessionId: input.sessionId,
        mesocycleId: place.mesocycleId,
        weekNo: place.week.weekNo,
        isDeload: place.week.isDeload,
        startedAt:
          finishedAt && input.durationMinutes !== null
            ? new Date(finishedAt.getTime() - input.durationMinutes * MS_PER_MINUTE)
            : null,
        finishedAt,
        outcome: input.outcome,
        sessionRpe: input.sessionRpe,
        stimulus: input.stimulus,
        fatigue: input.fatigue,
        notes: input.notes,
        sets: sets.map((set, index) => ({
          ...set,
          id: this.ids.newId<'SetLogId'>(),
          clientId: itemClientId(input.clientId, index + 1),
        })),
      });
      const stored = await lookup();
      if (!stored) throw new Error('El entreno no quedó guardado.');
      if (stored.id === id) {
        await this.#emit(patient, 'tracking.workout.logged', id, input.localDate);
      }
      return ok({ value: stored, replayed: stored.id !== id });
    });
  }

  /** Anular el entreno anula sus series (RN-G12); el registro diario ya calculado no cambia (RN-D08). */
  voidWorkout(context: SecurityContext, id: string): Promise<Result<StoredWorkout, DomainError>> {
    const patient = patientOf(context);
    return atomically(this.uow, context, async () => {
      const current = await this.store.workout(id);
      if (!current) return err(RECORD_NOT_FOUND);
      if (current.status === 'VOIDED') return err(RECORD_VOIDED);
      const open = await this.gate.ensureOpen(patient, current.localDate);
      if (!open.ok) return open;
      await this.store.voidWorkout(id, current.localDate);
      await this.#emit(patient, 'tracking.workout.voided', id, current.localDate);
      return ok({ ...current, status: 'VOIDED' });
    });
  }

  #emit(
    patient: PatientContext,
    type:
      | 'tracking.checkin.logged'
      | 'tracking.checkin.voided'
      | 'tracking.workout.logged'
      | 'tracking.workout.voided',
    aggregateId: string,
    localDate: string,
  ): Promise<void> {
    return this.gate.emit(
      { organizationId: patient.organizationId, userId: patient.userId, role: 'PATIENT' },
      type,
      aggregateId,
      { patientId: patient.patientId, localDate },
    );
  }
}

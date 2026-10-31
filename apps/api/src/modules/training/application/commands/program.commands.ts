import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  err,
  ID_GENERATOR,
  ok,
  OUTBOX,
  UNIT_OF_WORK,
  type Clock,
  type DomainError,
  type IdGenerator,
  type OrganizationId,
  type Outbox,
  type Result,
  type SecurityContext,
  type UnitOfWork,
  type UserId,
} from '@nutricoach/shared-kernel';
import { atomically } from '../../../../platform/index.js';
import { ClinicalApi } from '../../../clinical/index.js';
import { ExerciseApi } from '../../../exercise/index.js';
import {
  ATHLETE_PROFILE_REQUIRED,
  BLOCK_NOT_FOUND,
  copyMesocycles,
  copySessions,
  DEFAULT_ONE_RM_FORMULA,
  endDateOf,
  exerciseIdsOf,
  invalidSessions,
  MESOCYCLE_NOT_FOUND,
  ONE_RM_FORMULA_FIXED,
  ONLY_MANUAL_STRUCTURE,
  ONLY_PROPOSAL_APPROVAL,
  programDraftExists,
  programNotReady,
  programProblems,
  proposalBlocked,
  PROGRAM_NOT_DRAFT,
  PROGRAM_NOT_FOUND,
  PROGRAM_VERSION_CONFLICT,
  PROPOSAL_NAMES,
  sessionsFrom,
  sessionsProblems,
  unknownExercises,
  weeksOf,
  WEEK_NOT_FOUND,
  type Mesocycle,
  type OneRmFormula,
  type ProgramWeekPhase,
  type SessionInput,
} from '../../domain/program.js';
import { ATHLETE_PROFILE_STORE, type AthleteProfileStore } from '../ports/training.ports.js';
import {
  PROGRAM_STORE,
  type ProgramHeaderChanges,
  type ProgramRecord,
  type ProgramStore,
} from '../ports/program.ports.js';
import { programDocument, programSnapshot } from '../program-document.js';
import { currentPhaseTable, proposedProgram } from '../program-proposal.js';
import { trainingEvent, type TrainingEventType } from '../training-events.js';
import { TrainingSafety } from '../training-safety.js';

const localDateOf = (instant: Date, timeZone: string): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);

interface Actor {
  readonly organizationId: OrganizationId;
  readonly userId: UserId;
}

const actorOf = (context: SecurityContext): Actor => {
  if (!context.organizationId || !context.userId) {
    throw new Error('Un programa necesita organización y quién lo escribe.');
  }
  return { organizationId: context.organizationId, userId: context.userId };
};

/**
 * El programa de entrenamiento (RF-26, 02 §7): a mano o como propuesta, en borrador hasta publicarlo, y publicado no cambia
 * (RN-F12). Escribir exige ver al paciente, acceso de escritura y HEALTH_DATA (RN-A05, RN-B01). La propuesta no se genera ni se
 * publica con una llave cerrada (RN-F15); a mano se permite, y la pantalla avisa (ADR-070).
 */
@Injectable()
export class ProgramCommands {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(OUTBOX) private readonly outbox: Outbox,
    @Inject(PROGRAM_STORE) private readonly programs: ProgramStore,
    @Inject(ATHLETE_PROFILE_STORE) private readonly profiles: AthleteProfileStore,
    @Inject(TrainingSafety) private readonly safety: TrainingSafety,
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
    @Inject(ExerciseApi) private readonly exercises: ExerciseApi,
  ) {}

  #newId = (): string => this.ids.newId<'TrainingProgramId'>();

  /** Un programa a mano, vacío (RF-26). */
  create(
    context: SecurityContext,
    patientId: string,
    input: {
      readonly name: string;
      readonly goal: string | null;
      readonly startDate: string | null;
      readonly oneRmFormula: OneRmFormula | null;
    },
  ): Promise<Result<{ id: string }, DomainError>> {
    const actor = actorOf(context);
    return atomically(this.uow, context, async () => {
      const patient = await this.clinical.ensureRecordWritable(context, patientId);
      if (!patient.ok) return patient;
      const fixed = await this.programs.formulaOf(patientId, null);
      if (fixed && input.oneRmFormula && input.oneRmFormula !== fixed) {
        return err(ONE_RM_FORMULA_FIXED);
      }
      return this.#insertNew(context, actor, {
        patientId,
        name: input.name,
        goal: input.goal,
        startDate: input.startDate,
        oneRmFormula: input.oneRmFormula ?? fixed ?? DEFAULT_ONE_RM_FORMULA,
        origin: 'MANUAL',
        objective: null,
        level: null,
        daysPerWeek: null,
        split: null,
        macrocycleWeeks: null,
        periodizationValidFrom: null,
        templateVersion: null,
        athleteProfileId: null,
        mesocycles: [],
      });
    });
  }

  /**
   * La propuesta automática con su macrociclo (RN-F13, RN-F14, 07 §6 y §7), desde el perfil vigente. No hay propuesta mientras una
   * llave esté cerrada (RN-F15). Guarda la versión de la tabla de fases y de la plantilla que usó.
   */
  propose(
    context: SecurityContext,
    patientId: string,
    input: { readonly name: string | null },
  ): Promise<Result<{ id: string }, DomainError>> {
    const actor = actorOf(context);
    return atomically(this.uow, context, async () => {
      const patient = await this.clinical.ensureRecordWritable(context, patientId);
      if (!patient.ok) return patient;
      const profile = await this.profiles.latest(patientId);
      if (!profile) return err(ATHLETE_PROFILE_REQUIRED);
      const safety = await this.safety.of(patientId);
      if (safety.blocked) return err(proposalBlocked(safety.status));
      const today = localDateOf(this.clock.now(), patient.value.timezone);
      const proposed = proposedProgram({
        objective: profile.objective,
        level: profile.level,
        daysPerWeek: profile.daysPerWeek,
        macrocycleWeeks: profile.macrocycleWeeks,
        phases: currentPhaseTable(await this.programs.phases(profile.objective, today)),
        choices: await this.exercises.patternChoices(),
        newId: this.#newId,
      });
      if (!proposed.ok) return proposed;
      const { split, templateVersion, periodizationValidFrom, mesocycles } = proposed.value;
      return this.#insertNew(context, actor, {
        patientId,
        name: input.name ?? PROPOSAL_NAMES[profile.objective],
        goal: null,
        startDate: profile.startDate,
        oneRmFormula: (await this.programs.formulaOf(patientId, null)) ?? DEFAULT_ONE_RM_FORMULA,
        origin: 'PROPOSAL',
        objective: profile.objective,
        level: profile.level,
        daysPerWeek: profile.daysPerWeek,
        split,
        macrocycleWeeks: profile.macrocycleWeeks,
        periodizationValidFrom,
        templateVersion,
        athleteProfileId: profile.id,
        mesocycles,
      });
    });
  }

  /** La fórmula de 1RM es siempre la misma para un paciente: solo se cambia si no tiene otros programas (RN-F04). */
  update(
    context: SecurityContext,
    id: string,
    version: number,
    changes: ProgramHeaderChanges,
  ): Promise<Result<void, DomainError>> {
    return atomically(this.uow, context, async () => {
      const draft = await this.#draft(context, id, version);
      if (!draft.ok) return draft;
      if (changes.oneRmFormula && changes.oneRmFormula !== draft.value.oneRmFormula) {
        if (await this.programs.formulaOf(draft.value.patientId, id)) {
          return err(ONE_RM_FORMULA_FIXED);
        }
      }
      if (!(await this.programs.touch(id, version, this.clock.now(), changes))) {
        return err(PROGRAM_VERSION_CONFLICT);
      }
      return this.#updated(context, draft.value, Object.keys(changes));
    });
  }

  /** Un mesociclo con sus semanas vacías, contiguas a las anteriores (02 §7). */
  addMesocycle(
    context: SecurityContext,
    id: string,
    version: number,
    input: { readonly name: string; readonly focus: string | null; readonly weeks: number },
  ): Promise<Result<void, DomainError>> {
    const { organizationId } = actorOf(context);
    return atomically(this.uow, context, async () => {
      const draft = await this.#draft(context, id, version);
      if (!draft.ok) return draft;
      if (draft.value.origin !== 'MANUAL') return err(ONLY_MANUAL_STRUCTURE);
      if (!(await this.programs.touch(id, version, this.clock.now()))) {
        return err(PROGRAM_VERSION_CONFLICT);
      }
      const firstWeek = weeksOf(draft.value.mesocycles).length + 1;
      await this.programs.addMesocycle(organizationId, id, {
        id: this.#newId(),
        position: draft.value.mesocycles.length + 1,
        name: input.name,
        focus: input.focus,
        weeks: Array.from({ length: input.weeks }, (_, index) => ({
          id: this.#newId(),
          weekNo: firstWeek + index,
          isDeload: false,
          phaseEs: null,
          phaseGoalEs: null,
          volumeFactor: null,
          intensity: null,
          targetRir: null,
          reviewKind: null,
          sessions: [],
        })),
      });
      return this.#updated(context, draft.value, ['mesocycles']);
    });
  }

  removeMesocycle(
    context: SecurityContext,
    id: string,
    version: number,
    mesocycleId: string,
  ): Promise<Result<void, DomainError>> {
    return atomically(this.uow, context, async () => {
      const draft = await this.#draft(context, id, version);
      if (!draft.ok) return draft;
      if (draft.value.origin !== 'MANUAL') return err(ONLY_MANUAL_STRUCTURE);
      if (!draft.value.mesocycles.some((mesocycle) => mesocycle.id === mesocycleId)) {
        return err(MESOCYCLE_NOT_FOUND);
      }
      if (!(await this.programs.touch(id, version, this.clock.now()))) {
        return err(PROGRAM_VERSION_CONFLICT);
      }
      await this.programs.removeMesocycle(mesocycleId);
      await this.programs.renumber(
        draft.value.mesocycles.filter((mesocycle) => mesocycle.id !== mesocycleId),
      );
      return this.#updated(context, draft.value, ['mesocycles']);
    });
  }

  /** Reemplaza las sesiones de una semana; lo que no llega de su fase no cambia (P-07). */
  saveWeek(
    context: SecurityContext,
    id: string,
    version: number,
    weekId: string,
    input: {
      readonly phase: Partial<ProgramWeekPhase>;
      readonly sessions: readonly SessionInput[];
    },
  ): Promise<Result<void, DomainError>> {
    const { organizationId } = actorOf(context);
    return atomically(this.uow, context, async () => {
      const draft = await this.#draft(context, id, version);
      if (!draft.ok) return draft;
      const week = weeksOf(draft.value.mesocycles).find((w) => w.id === weekId);
      if (!week) return err(WEEK_NOT_FOUND);
      const sessions = sessionsFrom(input.sessions, week.sessions, this.#newId);
      const problems = sessionsProblems(sessions);
      if (problems.length > 0) return err(invalidSessions(problems));
      const ids = [...new Set(sessions.flatMap((s) => s.exercises.map((e) => e.exerciseId)))];
      const found = await this.exercises.exercisesById(ids);
      const missing = ids.filter((exerciseId) => !found.some((e) => e.id === exerciseId));
      if (missing.length > 0) return err(unknownExercises(missing));
      if (!(await this.programs.touch(id, version, this.clock.now()))) {
        return err(PROGRAM_VERSION_CONFLICT);
      }
      await this.programs.saveWeek(organizationId, weekId, input.phase, sessions);
      return this.#updated(context, draft.value, ['sessions']);
    });
  }

  /** Copia las sesiones de una semana a otras (RF-26): reemplaza lo que tuvieran, con su fase intacta. */
  duplicateWeek(
    context: SecurityContext,
    id: string,
    version: number,
    weekId: string,
    targetWeekIds: readonly string[],
  ): Promise<Result<void, DomainError>> {
    const { organizationId } = actorOf(context);
    return atomically(this.uow, context, async () => {
      const draft = await this.#draft(context, id, version);
      if (!draft.ok) return draft;
      const weeks = weeksOf(draft.value.mesocycles);
      const source = weeks.find((w) => w.id === weekId);
      if (!source) return err(WEEK_NOT_FOUND);
      if (source.sessions.length === 0) {
        return err(invalidSessions(['La semana que quieres duplicar no tiene sesiones.']));
      }
      const targets = [...new Set(targetWeekIds)];
      if (targets.some((target) => target === weekId || !weeks.some((w) => w.id === target))) {
        return err(WEEK_NOT_FOUND);
      }
      if (!(await this.programs.touch(id, version, this.clock.now()))) {
        return err(PROGRAM_VERSION_CONFLICT);
      }
      for (const target of targets) {
        await this.programs.saveWeek(
          organizationId,
          target,
          {},
          copySessions(source.sessions, this.#newId),
        );
      }
      return this.#updated(context, draft.value, ['sessions']);
    });
  }

  /**
   * El coach aprueba o sustituye un bloque de la propuesta, en todas sus semanas, con nota (RN-F14). La sustitución no cambia las
   * series, y el sugerido queda para saber de qué se partió.
   */
  approveBlock(
    context: SecurityContext,
    id: string,
    version: number,
    input: {
      readonly day: number;
      readonly order: number;
      readonly exerciseId: string | null;
      readonly note: string | null;
    },
  ): Promise<Result<void, DomainError>> {
    return atomically(this.uow, context, async () => {
      const draft = await this.#draft(context, id, version);
      if (!draft.ok) return draft;
      if (draft.value.origin !== 'PROPOSAL') return err(ONLY_PROPOSAL_APPROVAL);
      if (input.exerciseId) {
        const found = await this.exercises.exercisesById([input.exerciseId]);
        if (found.length === 0) return err(unknownExercises([input.exerciseId]));
      }
      if (!context.memberId) throw new Error('Quien aprueba es un miembro del equipo.');
      const now = this.clock.now();
      if (!(await this.programs.touch(id, version, now))) return err(PROGRAM_VERSION_CONFLICT);
      const touched = await this.programs.approveBlock(id, input.day, input.order, {
        exerciseId: input.exerciseId,
        note: input.note,
        approvedBy: context.memberId,
        approvedAt: now,
      });
      if (touched === 0) return err(BLOCK_NOT_FOUND);
      return this.#updated(context, draft.value, ['approved_by']);
    });
  }

  /**
   * Publica el borrador (RN-F12): congela su snapshot con su hash y el que estaba publicado pasa a SUPERSEDED. Una propuesta se
   * publica solo aprobada y con las llaves abiertas (RN-F14, RN-F15); a mano se permite con una llave cerrada, y el evento lo dice
   * para la auditoría (ADR-070).
   */
  publish(
    context: SecurityContext,
    id: string,
    version: number,
  ): Promise<Result<{ id: string; closedKey: boolean }, DomainError>> {
    const actor = actorOf(context);
    return atomically(this.uow, context, async () => {
      const program = await this.programs.find(id);
      if (!program) return err(PROGRAM_NOT_FOUND);
      const patient = await this.clinical.ensureRecordWritable(context, program.patientId);
      if (!patient.ok) return patient;
      if (program.status !== 'DRAFT') return err(PROGRAM_NOT_DRAFT);
      if (program.version !== version) return err(PROGRAM_VERSION_CONFLICT);
      const safety = await this.safety.of(program.patientId);
      if (program.origin === 'PROPOSAL' && safety.blocked) {
        return err(proposalBlocked(safety.status));
      }
      const problems = programProblems(program);
      if (problems.length > 0) return err(programNotReady(problems));

      const now = this.clock.now();
      const today = localDateOf(now, patient.value.timezone);
      const startDate = program.startDate ?? today;
      const document = programDocument(
        program.mesocycles,
        await this.exercises.exercisesById(exerciseIdsOf(program.mesocycles)),
      );
      const endDate = endDateOf(startDate, document.totalWeeks);
      const superseded = await this.programs.supersedePublished(program.patientId, now);
      const { snapshot, hash } = programSnapshot(document, {
        programId: id,
        lineageId: program.lineageId,
        versionNo: program.versionNo,
        patientId: program.patientId,
        name: program.name,
        goal: program.goal,
        origin: program.origin,
        oneRmFormula: program.oneRmFormula,
        objective: program.objective,
        level: program.level,
        daysPerWeek: program.daysPerWeek,
        split: program.split,
        macrocycleWeeks: program.macrocycleWeeks,
        periodizationValidFrom: program.periodizationValidFrom,
        templateVersion: program.templateVersion,
        athleteProfileId: program.athleteProfileId,
        startDate,
        endDate,
        publishedAt: now.toISOString(),
        publishedBy: actor.userId,
      });
      const published = await this.programs.publish(id, version, {
        snapshot,
        hash,
        publishedAt: now,
        publishedBy: actor.userId,
        startDate,
        endDate,
      });
      if (!published) return err(PROGRAM_VERSION_CONFLICT);
      if (superseded) {
        await this.#event(context, 'training.program.superseded', superseded, {
          patientId: program.patientId,
          supersededBy: id,
        });
      }
      await this.#event(context, 'training.program.published', id, {
        patientId: program.patientId,
        lineageId: program.lineageId,
        versionNo: program.versionNo,
        supersededProgramId: superseded,
        closedKey: safety.blocked,
      });
      return ok({ id, closedKey: safety.blocked });
    });
  }

  /**
   * La versión siguiente de un programa publicado o reemplazado (RN-F12): un borrador con lo mismo, también la tabla de fases que
   * usó (RN-F13). Una rutina tiene a lo más un borrador a la vez.
   */
  revise(context: SecurityContext, id: string): Promise<Result<{ id: string }, DomainError>> {
    const actor = actorOf(context);
    return atomically(this.uow, context, async () => {
      const source = await this.programs.find(id);
      if (!source) return err(PROGRAM_NOT_FOUND);
      const patient = await this.clinical.ensureRecordWritable(context, source.patientId);
      if (!patient.ok) return patient;
      if (source.status === 'DRAFT') return err(programDraftExists(source.id));
      const lineage = await this.programs.lineage(source.lineageId);
      if (lineage.draftId) return err(programDraftExists(lineage.draftId));
      const revisionId = this.#newId();
      const versionNo = lineage.lastVersionNo + 1;
      await this.programs.insert({
        ...source,
        id: revisionId,
        versionNo,
        status: 'DRAFT',
        publishedAt: null,
        createdBy: actor.userId,
        createdAt: this.clock.now(),
        version: 0,
        mesocycles: copyMesocycles(source.mesocycles, this.#newId),
      });
      await this.#event(context, 'training.program.created', revisionId, {
        patientId: source.patientId,
        lineageId: source.lineageId,
        versionNo,
        revisionOf: id,
      });
      return ok({ id: revisionId });
    });
  }

  async #insertNew(
    context: SecurityContext,
    actor: Actor,
    program: Omit<
      ProgramRecord,
      | 'id'
      | 'organizationId'
      | 'lineageId'
      | 'versionNo'
      | 'status'
      | 'endDate'
      | 'publishedAt'
      | 'createdBy'
      | 'createdAt'
      | 'version'
      | 'mesocycles'
    > & { readonly mesocycles: readonly Mesocycle[] },
  ): Promise<Result<{ id: string }, DomainError>> {
    const id = this.#newId();
    const lineageId = this.#newId();
    await this.programs.insert({
      ...program,
      id,
      organizationId: actor.organizationId,
      lineageId,
      versionNo: 1,
      status: 'DRAFT',
      endDate: null,
      publishedAt: null,
      createdBy: actor.userId,
      createdAt: this.clock.now(),
      version: 0,
    });
    await this.#event(context, 'training.program.created', id, {
      patientId: program.patientId,
      lineageId,
      versionNo: 1,
      origin: program.origin,
    });
    return ok({ id });
  }

  /** El borrador, con lo que exige escribir datos de salud de su paciente (RN-A05, RN-B01). */
  async #draft(
    context: SecurityContext,
    id: string,
    version: number,
  ): Promise<Result<ProgramRecord, DomainError>> {
    const program = await this.programs.find(id);
    if (!program) return err(PROGRAM_NOT_FOUND);
    const patient = await this.clinical.ensureRecordWritable(context, program.patientId);
    if (!patient.ok) return patient;
    if (program.status !== 'DRAFT') return err(PROGRAM_NOT_DRAFT);
    if (program.version !== version) return err(PROGRAM_VERSION_CONFLICT);
    return ok(program);
  }

  async #updated(
    context: SecurityContext,
    program: ProgramRecord,
    fields: readonly string[],
  ): Promise<Result<void, DomainError>> {
    await this.#event(context, 'training.program.updated', program.id, {
      patientId: program.patientId,
      fields,
    });
    return ok(undefined);
  }

  async #event(
    context: SecurityContext,
    type: TrainingEventType,
    aggregateId: string,
    payload: { readonly patientId: string; readonly [key: string]: unknown },
  ): Promise<void> {
    const actor = actorOf(context);
    await this.outbox.append(
      [
        trainingEvent(type, actor.organizationId, aggregateId, payload, {
          clock: this.clock,
          ids: this.ids,
        }),
      ],
      { actorUserId: actor.userId, actorRole: context.role },
    );
  }
}

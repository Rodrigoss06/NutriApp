import { Inject, Injectable } from '@nestjs/common';
import { BASE_BLOCK, weekSets } from '@nutricoach/engine';
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
} from '@nutricoach/shared-kernel';
import { atomically } from '../../../../platform/index.js';
import { ClinicalApi } from '../../../clinical/index.js';
import {
  copyMesocycles,
  PROGRAM_VERSION_CONFLICT,
  weeksOf,
  type ProgramSession,
} from '../../domain/program.js';
import {
  changesProgram,
  decisionProblem,
  NO_PUBLISHED_PROGRAM,
  REVIEW_ALREADY_DECIDED,
  REVIEW_NOT_FOUND,
  type DecisionInput,
} from '../../domain/weekly-review.js';
import { PROGRAM_STORE, type ProgramRecord, type ProgramStore } from '../ports/program.ports.js';
import { WEEKLY_REVIEW_STORE, type WeeklyReviewStore } from '../ports/weekly-review.ports.js';
import { trainingEvent, type TrainingEventType } from '../training-events.js';
import { WeeklyReviewService } from '../weekly-review.service.js';

/**
 * En una propuesta, las series de trabajo de cada ejercicio son las base por el factor de la semana (P-06, RN-F14), con el resto de
 * la prescripción igual; el calentamiento queda. En un programa a mano no se tocan: el coach las ajusta (ADR-086).
 */
export function proposalSessionsFor(
  sessions: readonly ProgramSession[],
  volumeFactor: number,
): readonly ProgramSession[] {
  const count = weekSets(BASE_BLOCK.sets, volumeFactor);
  return sessions.map((session) => ({
    ...session,
    exercises: session.exercises.map((exercise) => {
      const warmups = exercise.sets.filter((set) => set.setType === 'WARMUP');
      const working = exercise.sets.filter((set) => set.setType !== 'WARMUP');
      const [template] = working;
      if (!template) return exercise;
      const sets = [...warmups, ...Array.from({ length: count }, () => template)].map(
        (set, index) => ({ ...set, setNo: index + 1 }),
      );
      return { ...exercise, sets };
    }),
  }));
}

/**
 * La decisión del coach sobre el control semanal (RN-F17) y el cálculo a pedido. Mantener solo queda registrado. Ajustar o
 * descargar crea la versión siguiente del programa en borrador (o usa la que ya está en borrador) con el factor decidido en la
 * semana siguiente; nada cambia para el paciente hasta que el coach la publique (RN-F12, ADR-086). Decide quien escribe en el
 * expediente, con HEALTH_DATA vigente (RN-A05, RN-B01).
 */
@Injectable()
export class WeeklyReviewCommands {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(OUTBOX) private readonly outbox: Outbox,
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
    @Inject(WEEKLY_REVIEW_STORE) private readonly store: WeeklyReviewStore,
    @Inject(PROGRAM_STORE) private readonly programs: ProgramStore,
    @Inject(WeeklyReviewService) private readonly reviews: WeeklyReviewService,
  ) {}

  #newId = (): string => this.ids.newId<'TrainingProgramId'>();

  /** El coach abre el control (07 §10): calcula ya las semanas cerradas del programa publicado del paciente. */
  compute(
    context: SecurityContext,
    patientId: string,
  ): Promise<Result<{ written: number }, DomainError>> {
    return atomically(this.uow, context, async () => {
      const patient = await this.clinical.ensureRecordWritable(context, patientId);
      if (!patient.ok) return patient;
      const program = await this.store.publishedProgramOf(patientId);
      if (!program) return err(NO_PUBLISHED_PROGRAM);
      const organizationId = context.organizationId as OrganizationId;
      return ok({ written: await this.reviews.reviewProgram(organizationId, program.programId) });
    });
  }

  decide(
    context: SecurityContext,
    patientId: string,
    reviewId: string,
    input: DecisionInput,
  ): Promise<Result<{ reviewId: string; draftProgramId: string | null }, DomainError>> {
    return atomically(this.uow, context, async () => {
      const review = await this.store.find(reviewId);
      if (!review || review.patientId !== patientId) return err(REVIEW_NOT_FOUND);
      const patient = await this.clinical.ensureRecordWritable(context, patientId);
      if (!patient.ok) return patient;
      const problem = decisionProblem(review, input);
      if (problem) return err(problem);
      const memberId = context.memberId;
      if (!memberId) return err(REVIEW_NOT_FOUND);
      let draftProgramId: string | null = null;
      if (changesProgram(input.decision) && input.volumeFactor !== null) {
        const draft = await this.#nextWeekInDraft(
          context,
          review.programId,
          review.weekNo,
          input.volumeFactor,
        );
        if (!draft.ok) return draft;
        draftProgramId = draft.value;
      }
      const decided = await this.store.decide(reviewId, {
        coachDecision: input.decision,
        decidedVolumeFactor: changesProgram(input.decision) ? input.volumeFactor : null,
        decisionNote: input.note,
        decidedBy: memberId,
        decidedAt: this.clock.now(),
        resultingProgramId: draftProgramId,
      });
      if (!decided) return err(REVIEW_ALREADY_DECIDED);
      await this.#event(context, 'training.review.decided', reviewId, {
        patientId,
        weekNo: review.weekNo,
        decision: input.decision,
        fields: ['coach_decision', 'decided_volume_factor', 'decision_note'],
      });
      return ok({ reviewId, draftProgramId });
    });
  }

  /**
   * El borrador de la línea con el factor nuevo en la semana siguiente; null si la semana controlada era la última. Si la línea no
   * tiene borrador, lo crea desde su última versión publicada, como «revisar» (RN-F12).
   */
  async #nextWeekInDraft(
    context: SecurityContext,
    reviewedProgramId: string,
    weekNo: number,
    volumeFactor: number,
  ): Promise<Result<string | null, DomainError>> {
    const reviewed = await this.programs.find(reviewedProgramId);
    if (!reviewed) return ok(null);
    const lineage = await this.programs.lineage(reviewed.lineageId);
    let draft: ProgramRecord | null = lineage.draftId
      ? await this.programs.find(lineage.draftId)
      : null;
    let created = false;
    if (!draft) {
      const latest = await this.programs.latestSnapshot(reviewed.lineageId);
      const source = latest ? await this.programs.find(latest.programId) : reviewed;
      if (!source) return ok(null);
      if (!weeksOf(source.mesocycles).some((week) => week.weekNo === weekNo + 1)) return ok(null);
      draft = {
        ...source,
        id: this.#newId(),
        versionNo: lineage.lastVersionNo + 1,
        status: 'DRAFT',
        publishedAt: null,
        createdBy: context.userId ?? source.createdBy,
        createdAt: this.clock.now(),
        version: 0,
        mesocycles: copyMesocycles(source.mesocycles, this.#newId),
      };
      await this.programs.insert(draft);
      created = true;
    }
    const next = weeksOf(draft.mesocycles).find((week) => week.weekNo === weekNo + 1);
    if (!next) return ok(null);
    const organizationId = context.organizationId as OrganizationId;
    const sessions =
      draft.origin === 'PROPOSAL'
        ? proposalSessionsFor(next.sessions, volumeFactor)
        : next.sessions;
    if (!(await this.programs.touch(draft.id, draft.version, this.clock.now()))) {
      return err(PROGRAM_VERSION_CONFLICT);
    }
    await this.programs.saveWeek(organizationId, next.id, { volumeFactor }, sessions);
    if (created) {
      await this.#event(context, 'training.program.created', draft.id, {
        patientId: draft.patientId,
        lineageId: draft.lineageId,
        versionNo: draft.versionNo,
        revisionOf: reviewed.id,
      });
    }
    await this.#event(context, 'training.program.updated', draft.id, {
      patientId: draft.patientId,
      fields: ['volume_factor', 'sessions'],
    });
    return ok(draft.id);
  }

  async #event(
    context: SecurityContext,
    type: TrainingEventType,
    aggregateId: string,
    payload: { readonly patientId: string; readonly [key: string]: unknown },
  ): Promise<void> {
    await this.outbox.append(
      [
        trainingEvent(type, context.organizationId as OrganizationId, aggregateId, payload, {
          clock: this.clock,
          ids: this.ids,
        }),
      ],
      { actorUserId: context.userId, actorRole: context.role },
    );
  }
}

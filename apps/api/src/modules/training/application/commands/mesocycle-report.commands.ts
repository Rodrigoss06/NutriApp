import { Inject, Injectable } from '@nestjs/common';
import { canonicalJson, sha256Hex } from '@nutricoach/engine';
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
import { ClinicalApi, PATIENT_NOT_FOUND } from '../../../clinical/index.js';
import {
  cleanComment,
  cleanTexts,
  editProblem,
  mesocycleClosed,
  REPORT_EXISTS,
  REPORT_MESOCYCLE_NOT_FOUND,
  REPORT_NOT_FOUND,
  REPORT_VERSION_CONFLICT,
  sendProblem,
  type MesocycleReportTexts,
} from '../../domain/mesocycle-report.js';
import { PROGRAM_NOT_FOUND } from '../../domain/program.js';
import {
  MESOCYCLE_REPORT_SCHEMA_VERSION,
  MesocycleReportBuilder,
} from '../mesocycle-report-builder.js';
import {
  MESOCYCLE_REPORT_STORE,
  type MesocycleReportStore,
} from '../ports/mesocycle-report.ports.js';
import { PROGRAM_STORE, type ProgramStore } from '../ports/program.ports.js';
import { trainingEvent, type TrainingEventType } from '../training-events.js';
import { WeeklyReviewService } from '../weekly-review.service.js';

/** La fecha local del alumno (RN-G04). */
const localDateOf = (instant: Date, timeZone: string): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone }).format(instant);

/** Los textos que cambiaron, con el nombre de su columna, para la auditoría (RN-B03). */
const COLUMNS: Readonly<Record<keyof MesocycleReportTexts, string>> = {
  achievement: 'achievement',
  limitation: 'limitation',
  adjustment: 'adjustment',
  priority: 'priority',
};

/**
 * El informe del mesociclo (P14.5, PR 7a; P-28 y P-29; RN-G19; ADR-117). El coach lo crea, escribe el borrador y lo envía cuando
 * cierra la última semana del mesociclo: enviarlo congela lo que muestra (RN-D08). El alumno escribe su comentario desde la app.
 * Escribir datos de salud exige HEALTH_DATA vigente (RN-B01); cada escritura deja su evento y, con él, su auditoría (RN-B03).
 */
@Injectable()
export class MesocycleReportCommands {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(OUTBOX) private readonly outbox: Outbox,
    @Inject(MESOCYCLE_REPORT_STORE) private readonly reports: MesocycleReportStore,
    @Inject(PROGRAM_STORE) private readonly programs: ProgramStore,
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
    @Inject(MesocycleReportBuilder) private readonly builder: MesocycleReportBuilder,
    @Inject(WeeklyReviewService) private readonly weeklyReviews: WeeklyReviewService,
  ) {}

  /** El borrador del informe de un mesociclo del programa publicado del alumno: uno por mesociclo. */
  create(
    context: SecurityContext,
    patientId: string,
    input: { readonly programId: string; readonly mesocyclePosition: number },
  ): Promise<Result<{ id: string; version: number }, DomainError>> {
    return atomically(this.uow, context, async () => {
      const patient = await this.clinical.ensureRecordWritable(context, patientId);
      if (!patient.ok) return patient;
      const { organizationId, userId } = context;
      if (!organizationId || !userId) throw new Error('Un informe necesita quién lo crea.');
      const program = await this.programs.snapshot(input.programId);
      if (!program || program.patientId !== patientId) return err(PROGRAM_NOT_FOUND);
      const found = await this.builder.mesocycleOf(program.lineageId, input.mesocyclePosition);
      if (!found) return err(REPORT_MESOCYCLE_NOT_FOUND);
      await this.clinical.lockPatient(patientId);
      if (await this.reports.byPosition(program.lineageId, input.mesocyclePosition)) {
        return err(REPORT_EXISTS);
      }
      const id = this.ids.newId<'MesocycleReportId'>();
      const now = this.clock.now();
      await this.reports.insert({
        id,
        organizationId,
        patientId,
        programLineageId: program.lineageId,
        mesocyclePosition: input.mesocyclePosition,
        status: 'DRAFT',
        achievement: null,
        limitation: null,
        adjustment: null,
        priority: null,
        studentComment: null,
        studentCommentedAt: null,
        snapshot: null,
        sentAt: null,
        sentBy: null,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
        version: 0,
      });
      await this.#event(context, 'training.report.created', id, {
        patientId,
        lineageId: program.lineageId,
        mesocyclePosition: input.mesocyclePosition,
      });
      return ok({ id, version: 0 });
    });
  }

  /** Los textos del borrador, con la versión leída (If-Match, 06 §5). */
  saveTexts(
    context: SecurityContext,
    reportId: string,
    expectedVersion: number,
    texts: MesocycleReportTexts,
  ): Promise<Result<{ version: number }, DomainError>> {
    return atomically(this.uow, context, async () => {
      const report = await this.reports.find(reportId);
      if (!report) return err(REPORT_NOT_FOUND);
      const patient = await this.clinical.ensureRecordWritable(context, report.patientId);
      if (!patient.ok) return patient;
      const problem = editProblem(report);
      if (problem) return err(problem);
      const cleaned = cleanTexts(texts);
      if (!(await this.reports.saveTexts(reportId, expectedVersion, cleaned, this.clock.now()))) {
        return err(REPORT_VERSION_CONFLICT);
      }
      const fields = (Object.keys(COLUMNS) as (keyof MesocycleReportTexts)[])
        .filter((key) => cleaned[key] !== report[key])
        .map((key) => COLUMNS[key]);
      await this.#event(context, 'training.report.updated', reportId, {
        patientId: report.patientId,
        fields,
      });
      return ok({ version: expectedVersion + 1 });
    });
  }

  /** Lo envía: con el mesociclo cerrado y los cuatro textos, congela los números, el control semanal y la comparativa. */
  send(
    context: SecurityContext,
    reportId: string,
    expectedVersion: number,
  ): Promise<Result<{ version: number }, DomainError>> {
    return atomically(this.uow, context, async () => {
      const report = await this.reports.find(reportId);
      if (!report) return err(REPORT_NOT_FOUND);
      const patient = await this.clinical.ensureRecordWritable(context, report.patientId);
      if (!patient.ok) return patient;
      const sentAlready = editProblem(report);
      if (sentAlready) return err(sentAlready);
      if (report.version !== expectedVersion) return err(REPORT_VERSION_CONFLICT);
      const found = await this.builder.mesocycleOf(
        report.programLineageId,
        report.mesocyclePosition,
      );
      if (!found) return err(REPORT_MESOCYCLE_NOT_FOUND);
      const now = this.clock.now();
      const today = localDateOf(now, patient.value.timezone);
      const problem = sendProblem(report, mesocycleClosed(found.mesocycle, today));
      if (problem) return err(problem);
      const memberId = context.memberId;
      if (!memberId) throw new Error('Enviar un informe necesita el miembro del equipo.');
      // Las semanas cerradas que el trabajo de cada hora todavía no controló se controlan ya, como al abrir el control semanal: así
      // el informe no se congela sin el resumen de su última semana (07 §10).
      await this.weeklyReviews.reviewProgram(
        context.organizationId as OrganizationId,
        found.snapshot.programId,
      );
      const body = await this.builder.build(found.snapshot, found.mesocycle, today);
      const sent = await this.reports.send(reportId, expectedVersion, cleanTexts(report), {
        snapshot: body,
        snapshotSchemaVersion: MESOCYCLE_REPORT_SCHEMA_VERSION,
        snapshotHash: sha256Hex(canonicalJson(body)),
        sentAt: now,
        sentBy: memberId,
      });
      if (!sent) return err(REPORT_VERSION_CONFLICT);
      await this.#event(context, 'training.report.sent', reportId, { patientId: report.patientId });
      return ok({ version: expectedVersion + 1 });
    });
  }

  /** El comentario del alumno en un informe enviado, desde su app; vacío lo borra. */
  comment(
    context: SecurityContext,
    reportId: string,
    comment: string | null,
  ): Promise<
    Result<{ studentComment: string | null; studentCommentedAt: Date | null }, DomainError>
  > {
    return atomically(this.uow, context, async () => {
      const patientId = context.patientId;
      if (!patientId) return err(PATIENT_NOT_FOUND);
      const report = await this.reports.find(reportId);
      if (!report || report.patientId !== patientId) return err(REPORT_NOT_FOUND);
      const consent = await this.clinical.ensureHealthDataConsent(patientId);
      if (!consent.ok) return consent;
      const cleaned = cleanComment(comment);
      const now = this.clock.now();
      if (!(await this.reports.saveComment(reportId, cleaned, now))) return err(REPORT_NOT_FOUND);
      await this.#event(context, 'training.report.commented', reportId, {
        patientId,
        fields: ['student_comment'],
      });
      return ok({ studentComment: cleaned, studentCommentedAt: cleaned === null ? null : now });
    });
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

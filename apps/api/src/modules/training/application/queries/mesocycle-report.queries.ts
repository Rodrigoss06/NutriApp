import { Inject, Injectable } from '@nestjs/common';
import {
  AUDIT_PORT,
  CLOCK,
  err,
  ok,
  UNIT_OF_WORK,
  type AuditPort,
  type Clock,
  type DomainError,
  type Id,
  type PatientId,
  type Result,
  type SecurityContext,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import { ClinicalApi, PATIENT_NOT_FOUND } from '../../../clinical/index.js';
import {
  mesocycleClosed,
  REPORT_NOT_FOUND,
  reportMesocycle,
  type MesocycleReportRecord,
  type ReportMesocycle,
} from '../../domain/mesocycle-report.js';
import { PROGRAM_NOT_FOUND } from '../../domain/program.js';
import { MesocycleReportBuilder, type ReportBody } from '../mesocycle-report-builder.js';
import {
  MESOCYCLE_REPORT_STORE,
  type MesocycleReportStore,
} from '../ports/mesocycle-report.ports.js';
import { PROGRAM_STORE, type ProgramStore } from '../ports/program.ports.js';
import { WEEKLY_REVIEW_STORE, type WeeklyReviewStore } from '../ports/weekly-review.ports.js';

const localDateOf = (instant: Date, timeZone: string): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone }).format(instant);

export interface MesocycleReportView extends Omit<
  MesocycleReportRecord,
  'snapshot' | 'organizationId'
> {
  /** El borrador se calcula al leerlo; el enviado es lo que congeló (RN-D08). null si el mesociclo ya no está en el programa. */
  readonly body: ReportBody | null;
  /** Si ya cerró la última semana del mesociclo: solo entonces se envía (RN-G19). */
  readonly closed: boolean;
}

export interface MesocycleReportsView {
  readonly program: {
    readonly programId: string;
    readonly lineageId: string;
    readonly name: string;
  } | null;
  readonly mesocycles: readonly {
    readonly position: number;
    readonly name: string;
    readonly startDate: string;
    readonly endDate: string;
    readonly closed: boolean;
    readonly report: {
      readonly id: string;
      readonly status: MesocycleReportRecord['status'];
      readonly version: number;
      readonly sentAt: Date | null;
      readonly hasComment: boolean;
    } | null;
  }[];
}

export interface PatientReportSummary {
  readonly id: string;
  readonly programName: string;
  readonly mesocyclePosition: number;
  readonly mesocycleName: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly sentAt: Date;
  readonly hasComment: boolean;
}

const viewOf = (
  report: MesocycleReportRecord,
  body: ReportBody | null,
  closed: boolean,
): MesocycleReportView => {
  return {
    id: report.id,
    patientId: report.patientId,
    programLineageId: report.programLineageId,
    mesocyclePosition: report.mesocyclePosition,
    status: report.status,
    achievement: report.achievement,
    limitation: report.limitation,
    adjustment: report.adjustment,
    priority: report.priority,
    studentComment: report.studentComment,
    studentCommentedAt: report.studentCommentedAt,
    sentAt: report.sentAt,
    sentBy: report.sentBy,
    createdBy: report.createdBy,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
    version: report.version,
    body,
    closed,
  };
};

/**
 * Los informes del mesociclo (P14.5, PR 7a; RN-G19; ADR-117): para el equipo de atención, con su RLS (RN-A05), y para el alumno, que
 * solo ve los enviados. Leerlos deja un READ en la auditoría (RN-B03).
 */
@Injectable()
export class MesocycleReportQueries {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
    @Inject(MESOCYCLE_REPORT_STORE) private readonly reports: MesocycleReportStore,
    @Inject(PROGRAM_STORE) private readonly programs: ProgramStore,
    @Inject(WEEKLY_REVIEW_STORE) private readonly reviews: WeeklyReviewStore,
    @Inject(MesocycleReportBuilder) private readonly builder: MesocycleReportBuilder,
  ) {}

  /** Los mesociclos del programa publicado del alumno (o del que se pida, si es suyo), cada uno con su informe si lo tiene. */
  list(
    context: SecurityContext,
    patientId: string,
    programId: string | null,
  ): Promise<Result<MesocycleReportsView, DomainError>> {
    return this.uow.query(context, async () => {
      const patient = await this.clinical.patientRef(patientId);
      if (!patient) return err(PATIENT_NOT_FOUND);
      let lineageId: string | null;
      if (programId !== null) {
        const program = await this.programs.snapshot(programId);
        if (!program || program.patientId !== patientId) return err(PROGRAM_NOT_FOUND);
        lineageId = program.lineageId;
      } else {
        lineageId = (await this.reviews.publishedProgramOf(patientId))?.lineageId ?? null;
      }
      await this.audit.record(context, {
        action: 'READ',
        resourceType: 'training.mesocycle_report',
        resourceId: patientId as Id<string>,
        patientId: patientId as PatientId,
      });
      const snapshot = lineageId === null ? null : await this.programs.latestSnapshot(lineageId);
      if (!snapshot || lineageId === null) return ok({ program: null, mesocycles: [] });
      const today = localDateOf(this.clock.now(), patient.timezone);
      const reports = new Map(
        (await this.reports.ofLineage(lineageId)).map((report) => [
          report.mesocyclePosition,
          report,
        ]),
      );
      const mesocycles = snapshot.mesocycles
        .map((mesocycle) => reportMesocycle(snapshot, mesocycle.position))
        .filter((mesocycle): mesocycle is ReportMesocycle => mesocycle !== null)
        .sort((a, b) => a.position - b.position);
      return ok({
        program: { programId: snapshot.programId, lineageId, name: snapshot.name },
        mesocycles: mesocycles.map((mesocycle) => {
          const report = reports.get(mesocycle.position);
          return {
            position: mesocycle.position,
            name: mesocycle.name,
            startDate: mesocycle.startDate,
            endDate: mesocycle.endDate,
            closed: mesocycleClosed(mesocycle, today),
            report: report
              ? {
                  id: report.id,
                  status: report.status,
                  version: report.version,
                  sentAt: report.sentAt,
                  hasComment: report.studentComment !== null,
                }
              : null,
          };
        }),
      });
    });
  }

  /** Un informe para el equipo: el borrador con sus números de hoy, o el enviado como se congeló. */
  get(
    context: SecurityContext,
    reportId: string,
  ): Promise<Result<MesocycleReportView, DomainError>> {
    return this.uow.query(context, async () => {
      const report = await this.reports.find(reportId);
      const patient = report ? await this.clinical.patientRef(report.patientId) : null;
      if (!report || !patient) return err(REPORT_NOT_FOUND);
      await this.#audit(context, report);
      if (report.status === 'SENT') return ok(viewOf(report, report.snapshot as ReportBody, true));
      const today = localDateOf(this.clock.now(), patient.timezone);
      const found = await this.builder.mesocycleOf(
        report.programLineageId,
        report.mesocyclePosition,
      );
      if (!found) return ok(viewOf(report, null, false));
      return ok(
        viewOf(
          report,
          await this.builder.build(found.snapshot, found.mesocycle, today),
          mesocycleClosed(found.mesocycle, today),
        ),
      );
    });
  }

  /** Los informes enviados del alumno de la sesión, del más reciente al más antiguo. */
  mine(context: SecurityContext): Promise<readonly PatientReportSummary[]> {
    return this.uow.query(context, async () => {
      const patientId = context.patientId;
      if (!patientId) return [];
      const reports = await this.reports.sentOfPatient(patientId);
      await this.audit.record(context, {
        action: 'READ',
        resourceType: 'training.mesocycle_report',
        resourceId: patientId,
        patientId,
      });
      return reports.flatMap((report) => {
        const body = report.snapshot as ReportBody | null;
        return body && report.sentAt
          ? [
              {
                id: report.id,
                programName: body.program.name,
                mesocyclePosition: report.mesocyclePosition,
                mesocycleName: body.mesocycle.name,
                startDate: body.mesocycle.startDate,
                endDate: body.mesocycle.endDate,
                sentAt: report.sentAt,
                hasComment: report.studentComment !== null,
              },
            ]
          : [];
      });
    });
  }

  /** Un informe enviado del alumno de la sesión: la RLS no le deja ver un borrador ni el de otro. */
  myReport(
    context: SecurityContext,
    reportId: string,
  ): Promise<Result<MesocycleReportView, DomainError>> {
    return this.uow.query(context, async () => {
      const patientId = context.patientId;
      const report = patientId ? await this.reports.find(reportId) : null;
      if (!report || report.patientId !== patientId || report.status !== 'SENT') {
        return err(REPORT_NOT_FOUND);
      }
      await this.#audit(context, report);
      return ok(viewOf(report, report.snapshot as ReportBody, true));
    });
  }

  async #audit(context: SecurityContext, report: MesocycleReportRecord): Promise<void> {
    await this.audit.record(context, {
      action: 'READ',
      resourceType: 'training.mesocycle_report',
      resourceId: report.id as Id<string>,
      patientId: report.patientId as PatientId,
    });
  }
}

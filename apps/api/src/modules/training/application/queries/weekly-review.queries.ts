import { Inject, Injectable } from '@nestjs/common';
import {
  runMethod,
  WEEKLY_REVIEW_JV,
  type WeeklyAggregates,
  type WeeklyReason,
  type WeeklyReviewInput,
} from '@nutricoach/engine';
import {
  AUDIT_PORT,
  err,
  ok,
  UNIT_OF_WORK,
  type AuditPort,
  type DomainError,
  type Id,
  type PatientId,
  type Result,
  type SecurityContext,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import { ClinicalApi, PATIENT_NOT_FOUND } from '../../../clinical/index.js';
import type { ProgramStatus } from '../../domain/program.js';
import { REVIEW_NOT_FOUND, type WeeklyReviewRecord } from '../../domain/weekly-review.js';
import { PROGRAM_STORE, type ProgramStore } from '../ports/program.ports.js';
import { WEEKLY_REVIEW_STORE, type WeeklyReviewStore } from '../ports/weekly-review.ports.js';

export interface WeeklyReviewView extends WeeklyReviewRecord {
  /** Del motor con los insumos guardados: el mismo resultado (RN-D01). */
  readonly aggregates: WeeklyAggregates | null;
  readonly reasons: readonly WeeklyReason[];
  readonly resultingProgramStatus: ProgramStatus | null;
  /** Cuántos controles anteriores de la misma semana quedaron reemplazados por registros tardíos. */
  readonly supersededCount: number;
}

export interface WeeklyReviewsView {
  readonly program: {
    readonly programId: string;
    readonly lineageId: string;
    readonly name: string;
    readonly totalWeeks: number;
  } | null;
  readonly reviews: readonly WeeklyReviewView[];
}

/**
 * Los controles semanales de un programa para el equipo de atención (RF-42): los vigentes, semana a semana, con lo que dice el motor y
 * la decisión del coach (RN-F17). Con la RLS del equipo (RN-A05); la lectura queda en la auditoría (RN-B03).
 */
@Injectable()
export class WeeklyReviewQueries {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
    @Inject(WEEKLY_REVIEW_STORE) private readonly store: WeeklyReviewStore,
    @Inject(PROGRAM_STORE) private readonly programs: ProgramStore,
  ) {}

  /** Del programa publicado del paciente, o del que se pida si es suyo. */
  list(
    context: SecurityContext,
    patientId: string,
    programId: string | null,
  ): Promise<Result<WeeklyReviewsView, DomainError>> {
    return this.uow.query(context, async () => {
      if (!(await this.clinical.patientRef(patientId))) return err(PATIENT_NOT_FOUND);
      const id = programId ?? (await this.store.publishedProgramOf(patientId))?.programId ?? null;
      const snapshot = id === null ? null : await this.programs.snapshot(id);
      if (programId !== null && snapshot?.patientId !== patientId) return err(REVIEW_NOT_FOUND);
      await this.audit.record(context, {
        action: 'READ',
        resourceType: 'training.weekly_review',
        resourceId: patientId as Id<string>,
        patientId: patientId as PatientId,
      });
      if (!snapshot || snapshot.patientId !== patientId) return ok({ program: null, reviews: [] });
      const all = await this.store.listOfLineage(snapshot.lineageId);
      const reviews: WeeklyReviewView[] = [];
      for (const review of all.filter((r) => r.status === 'CURRENT')) {
        const run = runMethod(WEEKLY_REVIEW_JV, review.inputs as WeeklyReviewInput);
        reviews.push({
          ...review,
          aggregates: run.ok ? run.result.outputs.aggregates : null,
          reasons: run.ok ? run.result.outputs.reasons : [],
          resultingProgramStatus: review.resultingProgramId
            ? await this.programs.status(review.resultingProgramId)
            : null,
          supersededCount: all.filter(
            (r) => r.status === 'SUPERSEDED' && r.weekNo === review.weekNo,
          ).length,
        });
      }
      return ok({
        program: {
          programId: snapshot.programId,
          lineageId: snapshot.lineageId,
          name: snapshot.name,
          totalWeeks: snapshot.totalWeeks,
        },
        reviews: reviews.sort((a, b) => a.weekNo - b.weekNo),
      });
    });
  }
}

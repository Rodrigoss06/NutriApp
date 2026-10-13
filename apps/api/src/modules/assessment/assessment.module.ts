import { Module, type OnModuleInit } from '@nestjs/common';
import { ClinicalApi } from '../clinical/index.js';
import { AssessmentTimelineSource } from './application/assessment-timeline.js';
import { EvaluationCommands } from './application/commands/evaluation.commands.js';
import { TechnicalErrorCommands } from './application/commands/technical-error.commands.js';
import {
  EVALUATION_STORE,
  SITE_CATALOG,
  TECHNICAL_ERROR_STORE,
} from './application/ports/assessment.ports.js';
import { EvaluationQueries } from './application/queries/evaluation.queries.js';
import {
  EvaluationController,
  MeasurementSiteController,
  PatientEvaluationsController,
} from './adapters/in/http/evaluation.controller.js';
import { TechnicalErrorController } from './adapters/in/http/technical-error.controller.js';
import {
  PrismaEvaluationStore,
  PrismaSiteCatalog,
  PrismaTechnicalErrorStore,
} from './adapters/out/persistence/prisma-assessment.store.js';

/**
 * assessment (02 §2, núcleo): evaluaciones, tomas, consolidación, ETM y bioimpedancia manual. Usa a clinical por su
 * API pública (PatientRef y la escritura de datos de salud) y le suma sus evaluaciones a la línea de tiempo.
 */
@Module({
  controllers: [
    MeasurementSiteController,
    PatientEvaluationsController,
    EvaluationController,
    TechnicalErrorController,
  ],
  providers: [
    EvaluationCommands,
    TechnicalErrorCommands,
    EvaluationQueries,
    AssessmentTimelineSource,
    { provide: EVALUATION_STORE, useClass: PrismaEvaluationStore },
    { provide: SITE_CATALOG, useClass: PrismaSiteCatalog },
    { provide: TECHNICAL_ERROR_STORE, useClass: PrismaTechnicalErrorStore },
  ],
})
export class AssessmentModule implements OnModuleInit {
  constructor(
    private readonly clinical: ClinicalApi,
    private readonly timeline: AssessmentTimelineSource,
  ) {}

  onModuleInit(): void {
    this.clinical.registerTimelineSource(this.timeline);
  }
}

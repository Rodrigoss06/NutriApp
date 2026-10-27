import { Module, type OnModuleInit } from '@nestjs/common';
import { ClinicalApi } from '../clinical/index.js';
import { AssessmentApi } from './application/assessment-api.js';
import { AssessmentTimelineSource } from './application/assessment-timeline.js';
import { CalculationService } from './application/calculation.service.js';
import { CalculationCommands } from './application/commands/calculation.commands.js';
import { EvaluationCommands } from './application/commands/evaluation.commands.js';
import { TechnicalErrorCommands } from './application/commands/technical-error.commands.js';
import {
  CALCULATION_STORE,
  EVALUATION_STORE,
  SITE_CATALOG,
  TECHNICAL_ERROR_STORE,
} from './application/ports/assessment.ports.js';
import { EvaluationQueries } from './application/queries/evaluation.queries.js';
import { ResultsQueries } from './application/queries/results.queries.js';
import { ResultsAssembly } from './application/results-assembly.js';
import { CalculationConsumer } from './adapters/in/events/calculation.consumer.js';
import {
  EvaluationController,
  MeasurementSiteController,
  PatientEvaluationsController,
} from './adapters/in/http/evaluation.controller.js';
import {
  OrganizationPreferencesController,
  PatientPreferencesController,
  ResultsController,
} from './adapters/in/http/results.controller.js';
import { TechnicalErrorController } from './adapters/in/http/technical-error.controller.js';
import { PrismaCalculationStore } from './adapters/out/persistence/prisma-calculation.store.js';
import {
  PrismaEvaluationStore,
  PrismaSiteCatalog,
  PrismaTechnicalErrorStore,
} from './adapters/out/persistence/prisma-assessment.store.js';

/**
 * assessment (02 §2, núcleo): evaluaciones, tomas, consolidación, ETM, bioimpedancia manual, resultados calculados en
 * el worker al cerrar y rangos de referencia. Usa a clinical por su
 * API pública (PatientRef y la escritura de datos de salud) y le suma sus evaluaciones a la línea de tiempo.
 */
@Module({
  controllers: [
    MeasurementSiteController,
    PatientEvaluationsController,
    EvaluationController,
    TechnicalErrorController,
    ResultsController,
    OrganizationPreferencesController,
    PatientPreferencesController,
  ],
  providers: [
    EvaluationCommands,
    TechnicalErrorCommands,
    EvaluationQueries,
    CalculationService,
    AssessmentApi,
    CalculationCommands,
    ResultsQueries,
    ResultsAssembly,
    CalculationConsumer,
    AssessmentTimelineSource,
    { provide: EVALUATION_STORE, useClass: PrismaEvaluationStore },
    { provide: SITE_CATALOG, useClass: PrismaSiteCatalog },
    { provide: TECHNICAL_ERROR_STORE, useClass: PrismaTechnicalErrorStore },
    { provide: CALCULATION_STORE, useClass: PrismaCalculationStore },
  ],
  exports: [AssessmentApi],
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

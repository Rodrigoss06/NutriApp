import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { systemContext, type OrganizationId } from '@nutricoach/shared-kernel';
import {
  ConsumerRegistry,
  type EventConsumer,
  type OutboxEnvelope,
} from '../../../../../platform/index.js';
import { CalculationService } from '../../../application/calculation.service.js';
import {
  EVALUATION_STORE,
  type EvaluationStore,
} from '../../../application/ports/assessment.ports.js';

interface EvaluationClosedPayload {
  readonly evaluationId: string;
  readonly amendsEvaluationId: string | null;
}

/**
 * Al cerrar una evaluación, el worker la calcula (02 §8): resultados inmutables con su método y sus indicadores. Si
 * es una revisión, los resultados de la evaluación que enmienda quedan como histórico (RN-C07). Idempotente: la
 * entrega se registra en processed_event y, con los mismos insumos, el cálculo no crea nada.
 */
@Injectable()
export class CalculationConsumer implements EventConsumer, OnModuleInit {
  readonly name = 'assessment.calculation';
  readonly eventTypes = ['assessment.evaluation.closed'] as const;

  constructor(
    private readonly registry: ConsumerRegistry,
    private readonly calculation: CalculationService,
    @Inject(EVALUATION_STORE) private readonly evaluations: EvaluationStore,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async handle(event: OutboxEnvelope): Promise<void> {
    const { evaluationId, amendsEvaluationId } = event.payload as EvaluationClosedPayload;
    const evaluation = await this.evaluations.find(evaluationId);
    if (!evaluation || evaluation.status === 'DRAFT') return;
    await this.calculation.compute(
      systemContext(event.organizationId as OrganizationId | null),
      evaluation,
    );
    if (amendsEvaluationId)
      await this.calculation.supersedeAmended(amendsEvaluationId, evaluationId);
    // Si su revisión ya cerró antes de este cálculo, lo recién calculado también es histórico.
    const revision = (await this.evaluations.amendedBy([evaluationId])).get(evaluationId);
    if (revision) await this.calculation.supersedeAmended(evaluationId, revision);
  }
}

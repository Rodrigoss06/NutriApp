import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { OrganizationId, UserId } from '@nutricoach/shared-kernel';
import {
  ConsumerRegistry,
  type EventConsumer,
  type OutboxEnvelope,
} from '../../../../../platform/index.js';
import { DocumentGeneration } from '../../../application/document-generation.js';
import type { DocumentRequestedPayload } from '../../../application/documents-events.js';
import type { SourceType } from '../../../domain/sheet.js';

/** Lo que se publica y tiene ficha: se genera sin que nadie la pida (02 §8). */
const PUBLISHED: Readonly<Record<string, SourceType>> = {
  'nutrition.plan.published': 'NUTRITION_PLAN',
  'training.program.published': 'TRAINING_PROGRAM',
};

/**
 * Las fichas en el worker (02 §8): al publicarse un plan o un programa se genera su ficha sin que nadie la pida (RF-24), y
 * una ficha pedida desde el panel que todavía no existe se genera aquí. Idempotente: la entrega queda en processed_event y
 * un PDF igual se reutiliza (RN-H02).
 */
@Injectable()
export class SheetsConsumer implements EventConsumer, OnModuleInit {
  readonly name = 'documents.sheets';
  readonly eventTypes = [
    'nutrition.plan.published',
    'training.program.published',
    'documents.document.requested',
  ] as const;

  constructor(
    private readonly registry: ConsumerRegistry,
    @Inject(DocumentGeneration) private readonly generation: DocumentGeneration,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async handle(event: OutboxEnvelope): Promise<void> {
    if (!event.organizationId) return;
    const organizationId = event.organizationId as OrganizationId;
    const published = PUBLISHED[event.type];
    if (published) {
      await this.generation.generate(
        organizationId,
        { type: published, id: event.aggregateId },
        null,
      );
      return;
    }
    const payload = event.payload as DocumentRequestedPayload;
    await this.generation.generate(
      organizationId,
      { type: payload.sourceType, id: payload.sourceId },
      (event.metadata.actorUserId ?? null) as UserId | null,
    );
  }
}

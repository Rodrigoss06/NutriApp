import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { OrganizationId } from '@nutricoach/shared-kernel';
import {
  ConsumerRegistry,
  type EventConsumer,
  type OutboxEnvelope,
} from '../../../../../platform/index.js';
import { PatientExportBuilder } from '../../../application/patient-export-builder.js';

/**
 * El worker arma la exportación pedida (RN-B04, ADR-131). No cabe en una transacción: abre las suyas (`ownTransactions`) y es
 * idempotente porque solo arma un pedido pendiente.
 */
@Injectable()
export class PatientExportConsumer implements EventConsumer, OnModuleInit {
  readonly name = 'clinical.exports';
  readonly eventTypes = ['clinical.export.requested'] as const;
  readonly ownTransactions = true;

  constructor(
    private readonly registry: ConsumerRegistry,
    @Inject(PatientExportBuilder) private readonly builder: PatientExportBuilder,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async handle(event: OutboxEnvelope): Promise<void> {
    if (!event.organizationId) return;
    await this.builder.build(event.organizationId as OrganizationId, event.aggregateId);
  }
}

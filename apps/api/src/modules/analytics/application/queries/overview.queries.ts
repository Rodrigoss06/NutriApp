import { Inject, Injectable } from '@nestjs/common';
import {
  AUDIT_PORT,
  UNIT_OF_WORK,
  type AuditPort,
  type SecurityContext,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import type { OverviewAlert } from '../../domain/overview.js';
import {
  ANALYTICS_STORE,
  type AnalyticsStore,
  type OverviewPage,
  type OverviewRow,
} from '../ports/analytics.ports.js';

/**
 * El panel del profesional (RF-34): los pacientes con alertas que su equipo de atención ve (RN-A05), leídos de
 * `analytics.patient_overview` sin sumar registros por petición. La lectura queda en la auditoría (RN-B03).
 */
@Injectable()
export class OverviewQueries {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(ANALYTICS_STORE) private readonly store: AnalyticsStore,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
  ) {}

  async page(
    context: SecurityContext,
    alerts: readonly OverviewAlert[] | null,
    limit: number,
  ): Promise<OverviewPage> {
    const page = await this.uow.query(context, () => this.store.overviewPage(alerts, limit));
    await this.audit.record(context, {
      action: 'READ',
      resourceType: 'analytics.patient_overview',
    });
    return page;
  }

  /**
   * La fila de cada paciente pedido, con alertas o sin ellas: el tablero de pacientes y el resumen del expediente (ADR-137). La RLS
   * deja fuera a los que el equipo no ve (RN-A05) y la lectura queda en la auditoría (RN-B03).
   */
  async rows(
    context: SecurityContext,
    patientIds: readonly string[],
  ): Promise<readonly OverviewRow[]> {
    const rows = await this.uow.query(context, () => this.store.overviewRows(patientIds));
    await this.audit.record(context, {
      action: 'READ',
      resourceType: 'analytics.patient_overview',
    });
    return rows;
  }
}

import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  createDomainEvent,
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
import { TenancyApi } from '../../tenancy/index.js';
import { NO_THRESHOLDS } from '../domain/weekly-review.js';
import {
  WEEKLY_REVIEW_STORE,
  type ThresholdRow,
  type ThresholdValues,
  type WeeklyReviewStore,
} from './ports/weekly-review.ports.js';

const localDateOf = (instant: Date, timeZone: string): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone }).format(instant);

export interface ThresholdsView {
  /** Los que rigen hoy: los de la organización o, si no tiene, los de la V3. */
  readonly current: ThresholdRow;
  /** Los valores base de la V3, para volver a ellos. */
  readonly base: ThresholdRow;
  readonly own: boolean;
}

/**
 * Los umbrales de la organización (07 §11): editables y versionados, así un umbral nuevo no reescribe lo ya calculado (RN-G15).
 * Cambiarlos crea la versión de hoy en la fecha de la organización; un segundo cambio el mismo día corrige esa versión, y lo que ya
 * se calculó guarda los valores que usó en sus insumos (RN-D01, RN-D08).
 */
@Injectable()
export class ReadinessThresholds {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(OUTBOX) private readonly outbox: Outbox,
    @Inject(TenancyApi) private readonly tenancy: TenancyApi,
    @Inject(WEEKLY_REVIEW_STORE) private readonly store: WeeklyReviewStore,
  ) {}

  current(context: SecurityContext): Promise<Result<ThresholdsView, DomainError>> {
    return this.uow.query(context, async () => {
      const organizationId = context.organizationId as OrganizationId;
      const today = await this.#today(organizationId);
      const current = await this.store.thresholdFor(organizationId, today);
      const base = await this.store.baseThreshold(today);
      if (!current || !base) return err(NO_THRESHOLDS);
      return ok({ current, base, own: current.organizationId !== null });
    });
  }

  save(
    context: SecurityContext,
    values: ThresholdValues,
  ): Promise<Result<ThresholdRow, DomainError>> {
    return this.uow.run(context, async () => {
      const organizationId = context.organizationId as OrganizationId;
      const today = await this.#today(organizationId);
      const existing = await this.store.ownThresholdOn(organizationId, today);
      const row: ThresholdRow = existing
        ? { ...existing, ...values }
        : {
            id: this.ids.newId<'ReadinessThresholdId'>(),
            organizationId,
            validFrom: today,
            ...values,
          };
      if (existing) await this.store.updateThreshold(existing.id, values);
      else await this.store.insertThreshold(row);
      await this.outbox.append(
        [
          createDomainEvent(
            {
              type: 'training.threshold.changed',
              version: 1,
              organizationId,
              aggregateId: row.id,
              payload: { validFrom: today, fields: Object.keys(values) },
            },
            { clock: this.clock, ids: this.ids },
          ),
        ],
        { actorUserId: context.userId, actorRole: context.role },
      );
      return ok(row);
    });
  }

  async #today(organizationId: OrganizationId): Promise<string> {
    const organization = await this.tenancy.organization(organizationId);
    return localDateOf(this.clock.now(), organization?.timezone ?? 'America/Lima');
  }
}

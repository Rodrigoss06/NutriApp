import { Inject, Injectable } from '@nestjs/common';
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
  type Outbox,
  type Result,
  type SecurityContext,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import { atomically } from '../../../../platform/index.js';
import { TenancyApi } from '../../../tenancy/index.js';
import {
  canRecordTechnicalError,
  checkTechnicalErrorPairs,
  EVALUATOR_NOT_MEMBER,
  SITE_NOT_FOUND,
  TECHNICAL_ERROR_FORBIDDEN,
  TECHNICAL_ERROR_INVALID,
} from '../../domain/assessment-rules.js';
import { assessmentEvent } from '../assessment-events.js';
import { technicalError } from '../data-quality.js';
import {
  SITE_CATALOG,
  TECHNICAL_ERROR_STORE,
  type SiteCatalog,
  type TechnicalErrorRecord,
  type TechnicalErrorStore,
} from '../ports/assessment.ports.js';

export type TechnicalErrorInput =
  | {
      readonly source: 'CALCULATED';
      readonly validFrom: string;
      readonly sites: readonly {
        readonly siteCode: string;
        readonly pairs: readonly (readonly [number, number])[];
      }[];
    }
  | {
      readonly source: 'DECLARED';
      readonly validFrom: string;
      readonly sites: readonly {
        readonly siteCode: string;
        readonly temAbs: number;
        readonly temRelPct: number;
        readonly sampleSize?: number | null | undefined;
      }[];
    };

/**
 * ETM del evaluador por sitio (RN-C05, RF-12): calculado con TEM_ISAK desde un estudio de repetibilidad, guardando
 * los pares, o declarado. Solo se agregan filas: un estudio nuevo reemplaza al anterior desde su vigencia.
 */
@Injectable()
export class TechnicalErrorCommands {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(OUTBOX) private readonly outbox: Outbox,
    @Inject(TECHNICAL_ERROR_STORE) private readonly errors: TechnicalErrorStore,
    @Inject(SITE_CATALOG) private readonly catalog: SiteCatalog,
    @Inject(TenancyApi) private readonly tenancy: TenancyApi,
  ) {}

  record(
    context: SecurityContext,
    memberId: string,
    input: TechnicalErrorInput,
  ): Promise<Result<{ siteCodes: readonly string[] }, DomainError>> {
    const { organizationId, userId } = context;
    if (!organizationId || !userId) throw new Error('ETM sin organización activa.');
    const actor = { role: context.role, memberId: context.memberId ?? null };
    if (!canRecordTechnicalError(actor, memberId)) {
      return Promise.resolve(err(TECHNICAL_ERROR_FORBIDDEN));
    }
    return atomically(this.uow, context, async () => {
      if (!(await this.tenancy.isActiveMemberId(organizationId, memberId))) {
        return err(EVALUATOR_NOT_MEMBER);
      }
      const sites = new Map((await this.catalog.all()).map((site) => [site.code, site]));
      const createdAt = this.clock.now();
      const rows: TechnicalErrorRecord[] = [];
      for (const entry of input.sites) {
        const site = sites.get(entry.siteCode);
        if (!site) return err(SITE_NOT_FOUND(entry.siteCode));
        const base = {
          id: this.ids.newId<'TechnicalErrorId'>(),
          organizationId,
          memberId,
          siteCode: site.code,
          validFrom: input.validFrom,
          createdAt,
        };
        if ('pairs' in entry) {
          const invalid = checkTechnicalErrorPairs(site, entry.pairs);
          if (invalid) return err(invalid);
          const tem = technicalError(entry.pairs);
          if (!tem) return err(TECHNICAL_ERROR_INVALID(site.code));
          rows.push({
            ...base,
            source: 'CALCULATED',
            temAbs: tem.temAbs,
            temRelPct: tem.temRelPct,
            sampleSize: entry.pairs.length,
            pairs: entry.pairs,
          });
        } else {
          rows.push({
            ...base,
            source: 'DECLARED',
            temAbs: entry.temAbs,
            temRelPct: entry.temRelPct,
            sampleSize: entry.sampleSize ?? null,
            pairs: null,
          });
        }
      }
      await this.errors.insert(rows);
      const siteCodes = rows.map(({ siteCode }) => siteCode);
      await this.outbox.append(
        [
          assessmentEvent(
            'assessment.technicalerror.recorded',
            organizationId,
            memberId,
            { memberId, source: input.source, siteCodes },
            { clock: this.clock, ids: this.ids },
          ),
        ],
        { actorUserId: userId, actorRole: context.role },
      );
      return ok({ siteCodes });
    });
  }
}

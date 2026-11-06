import { Body, Controller, Get, Header, Put, Req } from '@nestjs/common';
import {
  readinessThresholdValuesSchema,
  type ReadinessThresholdsResponse,
} from '@nutricoach/contracts';
import { isErr, type SecurityContext } from '@nutricoach/shared-kernel';
import {
  parseBody,
  problemFromDomainError,
  ProblemException,
  RequirePermission,
  type ContextualRequest,
} from '../../../../../platform/index.js';
import type { ThresholdRow } from '../../../application/ports/weekly-review.ports.js';
import { ReadinessThresholds } from '../../../application/readiness-thresholds.js';

const contextOf = (request: ContextualRequest): SecurityContext => {
  if (!request.securityContext?.organizationId) {
    throw new ProblemException(403, {
      title: 'Elige con qué organización trabajas.',
      code: 'NC-TEN-011',
    });
  }
  return request.securityContext;
};

const rowOf = (row: ThresholdRow): ReadinessThresholdsResponse['current'] => ({
  id: row.id,
  validFrom: row.validFrom,
  neutralScore: row.neutralScore,
  readinessGreenMin: row.readinessGreenMin,
  readinessRedBelow: row.readinessRedBelow,
  performanceMinPct: row.performanceMinPct,
  weeklySleepMinHours: row.weeklySleepMinHours,
  fatigueSorenessAmberAbove: row.fatigueSorenessAmberAbove,
  nutritionMinPct: row.nutritionMinPct,
});

/** Los umbrales de la organización (07 §11): los lee todo el equipo y los cambian el dueño y los administradores (RF-42). */
@Controller('organization/readiness-thresholds')
export class ReadinessThresholdController {
  constructor(private readonly thresholds: ReadinessThresholds) {}

  @Get()
  @RequirePermission('organization.read')
  @Header('Cache-Control', 'no-store')
  async current(@Req() request: ContextualRequest): Promise<ReadinessThresholdsResponse> {
    return this.#view(contextOf(request));
  }

  @Put()
  @RequirePermission('organization.update')
  async save(
    @Req() request: ContextualRequest,
    @Body() body: unknown,
  ): Promise<ReadinessThresholdsResponse> {
    const context = contextOf(request);
    const saved = await this.thresholds.save(
      context,
      parseBody(readinessThresholdValuesSchema, body),
    );
    if (isErr(saved)) throw problemFromDomainError(saved.error, 422);
    return this.#view(context);
  }

  async #view(context: SecurityContext): Promise<ReadinessThresholdsResponse> {
    const result = await this.thresholds.current(context);
    if (isErr(result)) throw problemFromDomainError(result.error, 500);
    return {
      current: rowOf(result.value.current),
      base: rowOf(result.value.base),
      own: result.value.own,
    };
  }
}

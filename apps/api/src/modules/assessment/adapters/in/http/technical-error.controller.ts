import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { recordTechnicalErrorSchema, type TechnicalErrorsResponse } from '@nutricoach/contracts';
import { isErr } from '@nutricoach/shared-kernel';
import {
  parseBody,
  ProblemException,
  RequirePermission,
  type ContextualRequest,
} from '../../../../../platform/index.js';
import { TechnicalErrorCommands } from '../../../application/commands/technical-error.commands.js';
import {
  EvaluationQueries,
  type TechnicalErrorsView,
} from '../../../application/queries/evaluation.queries.js';
import { EVALUATOR_NOT_MEMBER } from '../../../domain/assessment-rules.js';
import { contextOf, problem } from './evaluation.controller.js';

const responseOf = (view: TechnicalErrorsView): TechnicalErrorsResponse => ({
  memberId: view.memberId,
  current: view.current.map((row) => ({
    id: row.id,
    memberId: row.memberId,
    siteCode: row.siteCode,
    source: row.source,
    temAbs: row.temAbs,
    temRelPct: row.temRelPct,
    mdc95: row.mdc95,
    sampleSize: row.sampleSize,
    pairs: row.pairs ? row.pairs.map(([a, b]) => [a, b] as [number, number]) : null,
    validFrom: row.validFrom,
    createdAt: row.createdAt.toISOString(),
  })),
  pooled: view.pooled.map((group) => ({
    family: group.family,
    unit: group.unit,
    siteCodes: [...group.siteCodes],
    temAbs: group.temAbs,
    temRelPct: group.temRelPct,
    mdc95: group.mdc95,
    methodCode: 'TEM_ISAK',
    methodVersion: group.methodVersion,
  })),
});

const notMember = () =>
  new ProblemException(404, { title: 'No encontrado.', code: EVALUATOR_NOT_MEMBER.code });

/** ETM del evaluador por sitio, calculado o declarado, y su CMD95 (RN-C05, RF-12). */
@Controller('members/:memberId/technical-errors')
export class TechnicalErrorController {
  constructor(
    private readonly commands: TechnicalErrorCommands,
    private readonly queries: EvaluationQueries,
  ) {}

  @Get()
  @RequirePermission('members.read')
  @Header('Cache-Control', 'no-store')
  async current(
    @Req() request: ContextualRequest,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ): Promise<TechnicalErrorsResponse> {
    const view = await this.queries.technicalErrors(contextOf(request), memberId);
    if (!view) throw notMember();
    return responseOf(view);
  }

  @Post()
  @RequirePermission('profile.self')
  async record(
    @Req() request: ContextualRequest,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() body: unknown,
  ): Promise<TechnicalErrorsResponse> {
    const context = contextOf(request);
    const result = await this.commands.record(
      context,
      memberId,
      parseBody(recordTechnicalErrorSchema, body),
    );
    if (isErr(result)) throw problem(result.error);
    const view = await this.queries.technicalErrors(context, memberId);
    if (!view) throw notMember();
    return responseOf(view);
  }
}

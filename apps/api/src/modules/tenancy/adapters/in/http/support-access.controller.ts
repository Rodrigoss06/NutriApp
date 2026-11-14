import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import {
  createSupportGrantSchema,
  type SupportGrant,
  type SupportGrantListResponse,
  type SupportStaffResponse,
} from '@nutricoach/contracts';
import { isErr, type DomainError, type SecurityContext } from '@nutricoach/shared-kernel';
import {
  parseBody,
  problemFromDomainError,
  ProblemException,
  RequirePermission,
  type ContextualRequest,
} from '../../../../../platform/index.js';
import { SupportGrantCommands } from '../../../application/commands/support-grant.commands.js';
import {
  SupportGrantQueries,
  type SupportGrantView,
} from '../../../application/queries/support-grant.queries.js';
import {
  SUPPORT_GRANT_NOT_FOUND,
  SUPPORT_USER_NOT_FOUND,
} from '../../../application/tenancy-errors.js';
import { SUPPORT_GRANT_NOT_ACTIVE } from '../../../domain/support-grant.js';

const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  [SUPPORT_GRANT_NOT_FOUND.code]: 404,
  [SUPPORT_GRANT_NOT_ACTIVE.code]: 409,
  [SUPPORT_USER_NOT_FOUND.code]: 422,
};
const problem = (error: DomainError) =>
  problemFromDomainError(error, STATUS_BY_CODE[error.code] ?? 422);

const contextOf = (request: ContextualRequest): SecurityContext => {
  if (!request.securityContext?.organizationId) {
    throw new ProblemException(403, {
      title: 'Elige con qué organización trabajas.',
      code: 'NC-TEN-011',
    });
  }
  return request.securityContext;
};

const toResponse = (grant: SupportGrantView): SupportGrant => ({
  id: grant.id,
  supportUserId: grant.supportUserId,
  supportName: grant.supportName,
  scope: grant.scope,
  reason: grant.reason,
  grantedBy: grant.grantedBy,
  createdAt: grant.createdAt.toISOString(),
  expiresAt: grant.expiresAt.toISOString(),
  revokedAt: grant.revokedAt?.toISOString() ?? null,
  status: grant.status,
});

/**
 * El soporte con permiso del dueño (RN-A09; ADR-124, ADR-129): a quién se le puede dar, los permisos de la organización, darlos y
 * revocarlos. Solo el dueño.
 */
@Controller('organization')
export class SupportAccessController {
  constructor(
    private readonly commands: SupportGrantCommands,
    private readonly queries: SupportGrantQueries,
  ) {}

  @Get('support-staff')
  @RequirePermission('support.manage')
  async staff(@Req() request: ContextualRequest): Promise<SupportStaffResponse> {
    return { staff: [...(await this.queries.staff(contextOf(request)))] };
  }

  @Get('support-grants')
  @RequirePermission('support.manage')
  async list(@Req() request: ContextualRequest): Promise<SupportGrantListResponse> {
    return { grants: (await this.queries.list(contextOf(request))).map(toResponse) };
  }

  @Post('support-grants')
  @RequirePermission('support.manage')
  async grant(@Req() request: ContextualRequest, @Body() body: unknown): Promise<SupportGrant> {
    const input = parseBody(createSupportGrantSchema, body);
    const context = contextOf(request);
    const result = await this.commands.grant(context, input);
    if (isErr(result)) throw problem(result.error);
    const created = (await this.queries.list(context)).find((g) => g.id === result.value.id);
    if (!created) throw new ProblemException(404, { title: 'No encontrado.', code: 'NC-TEN-048' });
    return toResponse(created);
  }

  @Post('support-grants/:grantId/revoke')
  @RequirePermission('support.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(
    @Req() request: ContextualRequest,
    @Param('grantId', new ParseUUIDPipe()) grantId: string,
  ): Promise<void> {
    const result = await this.commands.revoke(contextOf(request), grantId);
    if (isErr(result)) throw problem(result.error);
  }
}

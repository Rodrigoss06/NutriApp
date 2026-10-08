import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  acceptInvitationSchema,
  inspectInvitationSchema,
  inviteStaffSchema,
  setActiveOrganizationSchema,
  type AccountResponse,
  type InspectInvitationResponse,
  type InvitationListResponse,
} from '@nutricoach/contracts';
import {
  isErr,
  type DomainError,
  type OrganizationId,
  type SecurityContext,
} from '@nutricoach/shared-kernel';
import type { Response } from 'express';
import {
  AllowedWhenReadOnly,
  Authenticated,
  hashToken,
  parseBody,
  problemFromDomainError,
  ProblemException,
  Public,
  RATE_LIMITS,
  RateLimiter,
  rateLimitIp,
  readSessionToken,
  RequirePermission,
  setSessionCookie,
  type ContextualRequest,
} from '../../../../../platform/index.js';
import { ALREADY_MEMBER } from '../../../../tenancy/index.js';
import {
  ActiveOrganizationHandler,
  NOT_A_MEMBER,
} from '../../../application/commands/active-organization.handler.js';
import {
  ACCOUNT_CANNOT_JOIN,
  INVALID_INVITATION,
  INVITATION_NOT_FOUND,
  InvitationHandlers,
} from '../../../application/commands/invitation.handlers.js';
import { INVALID_CREDENTIALS } from '../../../domain/login-policy.js';
import { AccountQueries } from '../../../application/queries/account.queries.js';
import { toAccountResponse } from './account-response.js';
import { clientOf, sessionOf } from './request-client.js';

const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  [INVALID_INVITATION.code]: 410,
  [INVITATION_NOT_FOUND.code]: 404,
  [NOT_A_MEMBER.code]: 404,
  [INVALID_CREDENTIALS.code]: 401,
  [ACCOUNT_CANNOT_JOIN.code]: 409,
  [ALREADY_MEMBER.code]: 409,
};

const problem = (error: DomainError) => problemFromDomainError(error, STATUS_BY_CODE[error.code]);

const contextOf = (request: ContextualRequest): SecurityContext => {
  if (!request.securityContext?.organizationId) {
    throw new ProblemException(403, {
      title: 'Elige con qué organización trabajas.',
      code: 'NC-TEN-011',
    });
  }
  return request.securityContext;
};

/** Invitaciones de staff de la organización activa (RF-02): OWNER y ADMIN. */
@Controller('organization/invitations')
export class OrganizationInvitationController {
  constructor(private readonly invitations: InvitationHandlers) {}

  @Get()
  @RequirePermission('invitations.manage')
  async list(@Req() request: ContextualRequest): Promise<InvitationListResponse> {
    const rows = await this.invitations.list(contextOf(request));
    return {
      invitations: rows.map((row) => ({
        id: row.id,
        email: row.email,
        role: row.role,
        expiresAt: row.expiresAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  @Post()
  @RequirePermission('invitations.manage')
  async invite(@Req() request: ContextualRequest, @Body() body: unknown): Promise<{ id: string }> {
    const result = await this.invitations.invite(
      contextOf(request),
      parseBody(inviteStaffSchema, body),
    );
    if (isErr(result)) throw problem(result.error);
    return result.value;
  }

  @Post(':invitationId/resend')
  @RequirePermission('invitations.manage')
  async resend(
    @Req() request: ContextualRequest,
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
  ): Promise<{ id: string }> {
    const result = await this.invitations.resend(contextOf(request), invitationId);
    if (isErr(result)) throw problem(result.error);
    return result.value;
  }

  @Delete(':invitationId')
  @RequirePermission('invitations.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(
    @Req() request: ContextualRequest,
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
  ): Promise<void> {
    const result = await this.invitations.revoke(contextOf(request), invitationId);
    if (isErr(result)) throw problem(result.error);
  }
}

/** Abrir y aceptar una invitación con el token del fragmento (#TOKEN), que llega en el cuerpo. Sin caché. */
@Controller('invitations')
export class InvitationController {
  constructor(
    private readonly invitations: InvitationHandlers,
    private readonly queries: AccountQueries,
    private readonly rateLimiter: RateLimiter,
  ) {}

  @Post('inspect')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async inspect(
    @Req() request: ContextualRequest,
    @Body() body: unknown,
  ): Promise<InspectInvitationResponse> {
    await this.rateLimiter.consume(RATE_LIMITS.tokenLinkByIp, rateLimitIp(request.ip));
    const { token } = parseBody(inspectInvitationSchema, body);
    const result = await this.invitations.inspect(token);
    if (isErr(result)) throw problem(result.error);
    return result.value;
  }

  @Post('accept')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async accept(
    @Req() request: ContextualRequest,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ): Promise<AccountResponse> {
    await this.rateLimiter.consume(RATE_LIMITS.tokenLinkByIp, rateLimitIp(request.ip));
    const input = parseBody(acceptInvitationSchema, body);
    const currentToken = readSessionToken(request);
    const result = await this.invitations.accept({
      ...input,
      currentTokenHash: currentToken ? hashToken(currentToken) : null,
      ...clientOf(request),
    });
    if (isErr(result)) throw problem(result.error);
    const session = result.value;
    setSessionCookie(response, session.token, session.absoluteExpiresAt);
    const account = await this.queries.account(session.userId, session);
    if (!account) {
      throw new ProblemException(401, {
        title: 'Tu sesión no es válida. Vuelve a entrar.',
        code: 'NC-IAM-020',
      });
    }
    return toAccountResponse(account);
  }
}

/** Organización activa de la sesión (RF-02). Permitido en solo lectura: cambiar de organización no escribe datos. */
@Controller('session')
export class SessionController {
  constructor(
    private readonly activeOrganization: ActiveOrganizationHandler,
    private readonly queries: AccountQueries,
  ) {}

  @Post('active-organization')
  @Authenticated()
  @AllowedWhenReadOnly()
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async setActive(
    @Req() request: ContextualRequest,
    @Body() body: unknown,
  ): Promise<AccountResponse> {
    const session = sessionOf(request);
    const { organizationId } = parseBody(setActiveOrganizationSchema, body);
    const result = await this.activeOrganization.execute(session, organizationId as OrganizationId);
    if (isErr(result)) throw problem(result.error);
    const account = await this.queries.account(session.userId, {
      ...session,
      activeOrganizationId: organizationId as OrganizationId,
    });
    if (!account) {
      throw new ProblemException(401, {
        title: 'Tu sesión no es válida. Vuelve a entrar.',
        code: 'NC-IAM-020',
      });
    }
    return toAccountResponse(account);
  }
}

import { Body, Controller, Delete, Header, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { enterSupportSessionSchema, type AccountResponse } from '@nutricoach/contracts';
import { isErr, type OrganizationId } from '@nutricoach/shared-kernel';
import {
  parseBody,
  PlatformOnly,
  problemFromDomainError,
  ProblemException,
  type ContextualRequest,
} from '../../../../../platform/index.js';
import { SupportSessionHandler } from '../../../application/commands/support-session.handler.js';
import { AccountQueries } from '../../../application/queries/account.queries.js';
import { toAccountResponse } from './account-response.js';
import { sessionOf } from './request-client.js';

/**
 * El modo soporte de la sesión PLATFORM (RN-A09, ADR-129): entrar a una organización con un permiso del dueño vigente y salir. Las dos
 * responden la cuenta, con `support` al entrar y sin él al salir.
 */
@Controller('platform/support/session')
@PlatformOnly()
export class SupportSessionController {
  constructor(
    private readonly handler: SupportSessionHandler,
    private readonly queries: AccountQueries,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async enter(@Req() request: ContextualRequest, @Body() body: unknown): Promise<AccountResponse> {
    const session = sessionOf(request);
    const { organizationId } = parseBody(enterSupportSessionSchema, body);
    const result = await this.handler.enter(session, organizationId as OrganizationId);
    if (isErr(result)) throw problemFromDomainError(result.error, 404);
    return this.#account(request, organizationId as OrganizationId);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async leave(@Req() request: ContextualRequest): Promise<AccountResponse> {
    await this.handler.leave(sessionOf(request));
    return this.#account(request, null);
  }

  async #account(
    request: ContextualRequest,
    activeOrganizationId: OrganizationId | null,
  ): Promise<AccountResponse> {
    const session = sessionOf(request);
    const account = await this.queries.account(session.userId, {
      ...session,
      activeOrganizationId,
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

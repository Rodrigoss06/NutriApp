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
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  changePasswordSchema,
  updateAccountSchema,
  type AccountResponse,
  type SessionListResponse,
} from '@nutricoach/contracts';
import { isErr } from '@nutricoach/shared-kernel';
import type { Response } from 'express';
import {
  AllowedWhenReadOnly,
  Authenticated,
  clearSessionCookie,
  parseBody,
  problemFromDomainError,
  ProblemException,
  setSessionCookie,
  type ContextualRequest,
} from '../../../../../platform/index.js';
import { EndSessionsHandler } from '../../../application/commands/end-sessions.handler.js';
import { PasswordHandlers } from '../../../application/commands/password.handlers.js';
import { UpdateAccountHandler } from '../../../application/commands/update-account.handler.js';
import { AccountQueries } from '../../../application/queries/account.queries.js';
import { toAccountResponse, toSessionList } from './account-response.js';
import { clientOf, sessionOf } from './request-client.js';

/** La propia cuenta (/panel/cuenta): nombre, contraseña y sesiones activas. */
@Controller('account')
@Authenticated()
export class AccountController {
  constructor(
    private readonly queries: AccountQueries,
    private readonly updateAccount: UpdateAccountHandler,
    private readonly passwords: PasswordHandlers,
    private readonly endSessions: EndSessionsHandler,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async get(@Req() request: ContextualRequest): Promise<AccountResponse> {
    const session = sessionOf(request);
    const account = await this.queries.account(session.userId, session);
    if (!account)
      throw new ProblemException(401, {
        title: 'Tu sesión no es válida. Vuelve a entrar.',
        code: 'NC-IAM-020',
      });
    return toAccountResponse(account);
  }

  @Patch()
  @Header('Cache-Control', 'no-store')
  async update(@Req() request: ContextualRequest, @Body() body: unknown): Promise<AccountResponse> {
    const session = sessionOf(request);
    const { displayName } = parseBody(updateAccountSchema, body);
    await this.updateAccount.execute(session.userId, displayName);
    return this.get(request);
  }

  /** Pide la actual, revoca todas las sesiones y abre una nueva en este equipo (RN-A08). */
  @Post('password')
  @AllowedWhenReadOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header('Cache-Control', 'no-store')
  async changePassword(
    @Req() request: ContextualRequest,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ): Promise<void> {
    const session = sessionOf(request);
    const input = parseBody(changePasswordSchema, body);
    const result = await this.passwords.change(session.userId, session, {
      ...input,
      ...clientOf(request),
    });
    if (isErr(result)) throw problemFromDomainError(result.error);
    setSessionCookie(response, result.value.token, result.value.absoluteExpiresAt);
  }

  @Get('sessions')
  @Header('Cache-Control', 'no-store')
  async sessions(@Req() request: ContextualRequest): Promise<SessionListResponse> {
    const session = sessionOf(request);
    return toSessionList(await this.queries.sessionsOf(session.userId, session.sessionId));
  }

  /** Cerrar una sesión de la lista; si es la actual, también se borra la cookie. */
  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(
    @Req() request: ContextualRequest,
    @Res({ passthrough: true }) response: Response,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    const session = sessionOf(request);
    if (!(await this.endSessions.revokeOne(session.userId, id))) {
      throw new ProblemException(404, { title: 'No encontrado.', code: 'NC-IAM-021' });
    }
    if (id === session.sessionId) clearSessionCookie(response);
  }

  /** Cerrar sesión en todos los equipos (RN-A08), este incluido. */
  @Post('sessions/revoke-all')
  @AllowedWhenReadOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeAll(
    @Req() request: ContextualRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.endSessions.revokeAll(sessionOf(request).userId);
    clearSessionCookie(response);
  }
}

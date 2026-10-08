import { Body, Controller, Header, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import {
  loginRequestSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  type AccountResponse,
} from '@nutricoach/contracts';
import { isErr } from '@nutricoach/shared-kernel';
import type { Response } from 'express';
import {
  AllowedWhenReadOnly,
  Authenticated,
  clearSessionCookie,
  hashToken,
  parseBody,
  problemFromDomainError,
  ProblemException,
  Public,
  RATE_LIMITS,
  RateLimiter,
  rateLimitEmail,
  rateLimitIp,
  readSessionToken,
  setSessionCookie,
  type ContextualRequest,
} from '../../../../../platform/index.js';
import { EndSessionsHandler } from '../../../application/commands/end-sessions.handler.js';
import { LoginHandler } from '../../../application/commands/login.handler.js';
import { PasswordHandlers } from '../../../application/commands/password.handlers.js';
import { AccountQueries } from '../../../application/queries/account.queries.js';
import { toAccountResponse } from './account-response.js';
import { clientOf, sessionOf } from './request-client.js';

/** Entrar, salir y recuperar la contraseña (RF-01). Respuestas sin caché. */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly login: LoginHandler,
    private readonly endSessions: EndSessionsHandler,
    private readonly passwords: PasswordHandlers,
    private readonly queries: AccountQueries,
    private readonly rateLimiter: RateLimiter,
  ) {}

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async signIn(
    @Req() request: ContextualRequest,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ): Promise<AccountResponse> {
    await this.rateLimiter.consume(RATE_LIMITS.loginByIp, rateLimitIp(request.ip));
    const input = parseBody(loginRequestSchema, body);
    const currentToken = readSessionToken(request);
    const result = await this.login.execute({
      ...input,
      currentTokenHash: currentToken ? hashToken(currentToken) : null,
      ...clientOf(request),
    });
    if (isErr(result)) throw problemFromDomainError(result.error, 401);
    const session = result.value;
    setSessionCookie(response, session.token, session.absoluteExpiresAt);
    const account = await this.queries.account(session.userId, session);
    if (!account)
      throw new ProblemException(401, {
        title: 'Tu sesión no es válida. Vuelve a entrar.',
        code: 'NC-IAM-020',
      });
    return toAccountResponse(account);
  }

  @Post('logout')
  @Authenticated()
  @AllowedWhenReadOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  async signOut(
    @Req() request: ContextualRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const session = sessionOf(request);
    await this.endSessions.logout(session.userId, session.sessionId);
    clearSessionCookie(response);
  }

  /** Responde 202 siempre: no dice si el correo tiene cuenta. El enlace sale por el worker. */
  @Post('password-reset')
  @Public()
  @HttpCode(HttpStatus.ACCEPTED)
  @Header('Cache-Control', 'no-store')
  async requestReset(@Req() request: ContextualRequest, @Body() body: unknown): Promise<void> {
    await this.rateLimiter.consume(RATE_LIMITS.resetByIp, rateLimitIp(request.ip));
    const { email } = parseBody(passwordResetRequestSchema, body);
    await this.rateLimiter.consume(RATE_LIMITS.resetByEmail, rateLimitEmail(email));
    await this.passwords.requestReset(email);
  }

  @Post('password-reset/confirm')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header('Cache-Control', 'no-store')
  async confirmReset(@Req() request: ContextualRequest, @Body() body: unknown): Promise<void> {
    await this.rateLimiter.consume(RATE_LIMITS.tokenLinkByIp, rateLimitIp(request.ip));
    const { token, newPassword } = parseBody(passwordResetConfirmSchema, body);
    const result = await this.passwords.confirmReset(token, newPassword);
    if (isErr(result)) throw problemFromDomainError(result.error);
  }
}

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import {
  changeSubscriptionSchema,
  createOrganizationSchema,
  graceDaysSchema,
  type PlanListResponse,
  type PlatformOrganizationListResponse,
} from '@nutricoach/contracts';
import {
  isErr,
  type DomainError,
  type OrganizationId,
  type UserId,
} from '@nutricoach/shared-kernel';
import {
  parseBody,
  PlatformOnly,
  problemFromDomainError,
  ProblemException,
  type ContextualRequest,
} from '../../../../../platform/index.js';
import { ALREADY_MEMBER, PLAN_NOT_FOUND, SLUG_TAKEN } from '../../../../tenancy/index.js';
import { BackofficeCommands } from '../../../application/backoffice.commands.js';

const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  [PLAN_NOT_FOUND.code]: 422,
  [SLUG_TAKEN.code]: 409,
  [ALREADY_MEMBER.code]: 409,
};

const problem = (error: DomainError) => problemFromDomainError(error, STATUS_BY_CODE[error.code]);

const actorOf = (request: ContextualRequest): UserId => {
  const userId = request.securityContext?.userId;
  if (!userId)
    throw new ProblemException(401, {
      title: 'Tu sesión no es válida. Vuelve a entrar.',
      code: 'NC-IAM-020',
    });
  return userId;
};

/** Panel interno de la plataforma (RF-39): planes, organizaciones y suscripciones. Solo sesiones PLATFORM. */
@Controller('platform')
@PlatformOnly()
export class PlatformController {
  constructor(private readonly backoffice: BackofficeCommands) {}

  @Get('plans')
  async plans(@Req() request: ContextualRequest): Promise<PlanListResponse> {
    const plans = await this.backoffice.listPlans(actorOf(request));
    return {
      plans: plans.map(
        ({
          code,
          name,
          maxActivePatients,
          maxProfessionals,
          durationMonths,
          priceCents,
          currency,
          isActive,
        }) => ({
          code,
          name,
          maxActivePatients,
          maxProfessionals,
          durationMonths,
          priceCents,
          currency,
          isActive,
        }),
      ),
    };
  }

  @Get('organizations')
  async organizations(
    @Req() request: ContextualRequest,
  ): Promise<PlatformOrganizationListResponse> {
    const organizations = await this.backoffice.listOrganizations(actorOf(request));
    return {
      organizations: organizations.map((o) => ({
        id: o.id,
        name: o.name,
        slug: o.slug,
        status: o.status,
        timezone: o.timezone,
        subscription: o.subscription && {
          planCode: o.subscription.planCode,
          startsOn: o.subscription.startsOn,
          endsOn: o.subscription.endsOn,
        },
      })),
    };
  }

  @Post('organizations')
  async create(@Req() request: ContextualRequest, @Body() body: unknown): Promise<{ id: string }> {
    const result = await this.backoffice.createOrganization(
      actorOf(request),
      parseBody(createOrganizationSchema, body),
    );
    if (isErr(result)) throw problem(result.error);
    return result.value;
  }

  @Post('organizations/:organizationId/subscriptions')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changeSubscription(
    @Req() request: ContextualRequest,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() body: unknown,
  ): Promise<void> {
    const actor = actorOf(request);
    const input = parseBody(changeSubscriptionSchema, body);
    await this.#ensureExists(actor, organizationId as OrganizationId);
    const result = await this.backoffice.changeSubscription(
      actor,
      organizationId as OrganizationId,
      input,
    );
    if (isErr(result)) throw problem(result.error);
  }

  @Put('organizations/:organizationId/grace-days')
  @HttpCode(HttpStatus.NO_CONTENT)
  async setGraceDays(
    @Req() request: ContextualRequest,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() body: unknown,
  ): Promise<void> {
    const actor = actorOf(request);
    const { value } = parseBody(graceDaysSchema, body);
    await this.#ensureExists(actor, organizationId as OrganizationId);
    const result = await this.backoffice.setGraceDays(
      actor,
      organizationId as OrganizationId,
      value,
    );
    if (isErr(result)) throw problem(result.error);
  }

  async #ensureExists(actor: UserId, organizationId: OrganizationId): Promise<void> {
    if (!(await this.backoffice.exists(actor, organizationId))) {
      throw new ProblemException(404, { title: 'No encontrado.', code: 'NC-TEN-023' });
    }
  }
}

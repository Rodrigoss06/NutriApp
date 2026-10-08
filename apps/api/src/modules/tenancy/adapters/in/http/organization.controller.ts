import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Put,
  Req,
} from '@nestjs/common';
import {
  updateMemberSchema,
  updateOrganizationSchema,
  updateSettingSchema,
  type MemberListResponse,
  type OrganizationResponse,
  type SettingsResponse,
  type SubscriptionResponse,
} from '@nutricoach/contracts';
import { isErr, type SecurityContext } from '@nutricoach/shared-kernel';
import {
  parseBody,
  problemFromDomainError,
  ProblemException,
  RequirePermission,
  type ContextualRequest,
} from '../../../../../platform/index.js';
import { OrganizationCommands } from '../../../application/commands/organization.commands.js';
import { OrganizationQueries } from '../../../application/queries/organization.queries.js';
import { MEMBER_NOT_FOUND, VERSION_CONFLICT } from '../../../application/tenancy-errors.js';

const contextOf = (request: ContextualRequest): SecurityContext => {
  if (!request.securityContext?.organizationId) {
    throw new ProblemException(403, {
      title: 'Elige con qué organización trabajas.',
      code: 'NC-TEN-011',
    });
  }
  return request.securityContext;
};

/** Estado de un error de tenancy: 404 si no existe (06 §5), 409 si cambió la versión, 422 con regla. */
const statusOf = (code: string, rule?: string): number => {
  if (code === MEMBER_NOT_FOUND.code) return 404;
  if (code === VERSION_CONFLICT.code) return 409;
  return rule ? 422 : 400;
};

/** La organización activa (RF-02, RF-03): datos, miembros, suscripción y ajustes. */
@Controller('organization')
export class OrganizationController {
  constructor(
    private readonly commands: OrganizationCommands,
    private readonly queries: OrganizationQueries,
  ) {}

  @Get()
  @RequirePermission('organization.read')
  async get(@Req() request: ContextualRequest): Promise<OrganizationResponse> {
    const organization = await this.queries.organization(contextOf(request));
    if (!organization)
      throw new ProblemException(404, { title: 'No encontrado.', code: 'NC-TEN-023' });
    return organization;
  }

  /** Bloqueo optimista con If-Match: la versión que se leyó (06 §5). */
  @Patch()
  @RequirePermission('organization.update')
  async update(
    @Req() request: ContextualRequest,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: unknown,
  ): Promise<OrganizationResponse> {
    const version = Number(ifMatch?.replaceAll('"', ''));
    if (!Number.isInteger(version)) {
      throw new ProblemException(428, {
        title: 'Falta la versión en If-Match.',
        code: 'NC-PLT-428',
      });
    }
    const result = await this.commands.update(
      contextOf(request),
      version,
      parseBody(updateOrganizationSchema, body),
    );
    if (isErr(result))
      throw problemFromDomainError(result.error, statusOf(result.error.code, result.error.rule));
    return this.get(request);
  }

  @Get('members')
  @RequirePermission('members.read')
  async members(@Req() request: ContextualRequest): Promise<MemberListResponse> {
    return {
      members: [
        ...(await this.queries.members(contextOf(request))),
      ] as MemberListResponse['members'],
    };
  }

  @Patch('members/:memberId')
  @RequirePermission('members.manage')
  async changeMember(
    @Req() request: ContextualRequest,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() body: unknown,
  ): Promise<MemberListResponse> {
    const result = await this.commands.changeMember(
      contextOf(request),
      memberId,
      parseBody(updateMemberSchema, body),
    );
    if (isErr(result))
      throw problemFromDomainError(result.error, statusOf(result.error.code, result.error.rule));
    return this.members(request);
  }

  @Delete('members/:memberId')
  @RequirePermission('members.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @Req() request: ContextualRequest,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ): Promise<void> {
    const result = await this.commands.removeMember(contextOf(request), memberId);
    if (isErr(result))
      throw problemFromDomainError(result.error, statusOf(result.error.code, result.error.rule));
  }

  @Get('subscription')
  @RequirePermission('subscription.read')
  async subscription(@Req() request: ContextualRequest): Promise<SubscriptionResponse> {
    const view = await this.queries.subscription(contextOf(request));
    return {
      subscription: view.subscription && {
        planCode: view.subscription.planCode,
        planName: view.subscription.planName,
        status: view.subscription.status,
        startsOn: view.subscription.startsOn,
        endsOn: view.subscription.endsOn,
        maxActivePatients: view.subscription.maxActivePatients,
        maxProfessionals: view.subscription.maxProfessionals,
      },
      graceDays: view.graceDays,
      readOnlyFrom: view.readOnlyFrom,
      usage: view.usage,
    };
  }

  @Get('settings')
  @RequirePermission('organization.read')
  settings(@Req() request: ContextualRequest): Promise<SettingsResponse> {
    return this.queries.settings(contextOf(request));
  }

  @Put('settings/:key')
  @RequirePermission('organization.update')
  async setSetting(
    @Req() request: ContextualRequest,
    @Param('key') key: string,
    @Body() body: unknown,
  ): Promise<SettingsResponse> {
    const { value } = parseBody(updateSettingSchema, body);
    const result = await this.commands.setSetting(contextOf(request), key, value);
    if (isErr(result)) throw problemFromDomainError(result.error, 422);
    return this.settings(request);
  }
}

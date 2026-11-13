import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import {
  createMotivationalMessageSchema,
  updateAppSettingsSchema,
  updateMotivationalMessageSchema,
  type AppSettings,
  type MeApp,
  type MotivationalMessage,
  type MotivationalMessagesResponse,
} from '@nutricoach/contracts';
import { isErr } from '@nutricoach/shared-kernel';
import {
  parseBody,
  PatientOnly,
  RequirePermission,
  type ContextualRequest,
} from '../../../../../platform/index.js';
import { ContentCommands } from '../../../application/content.commands.js';
import { ContentQueries } from '../../../application/content.queries.js';
import { contextOf, messageOf, problem, settingsOf } from './content-http.js';

const uuid = new ParseUUIDPipe({ version: '7' });

/** La app de cada paciente (RF-27): sus ajustes y sus mensajes, para su equipo de atención (RN-A05). */
@Controller('patients/:patientId')
export class PatientAppController {
  constructor(
    private readonly commands: ContentCommands,
    private readonly queries: ContentQueries,
  ) {}

  @Get('app-settings')
  @RequirePermission('patients.read')
  async settings(
    @Req() request: ContextualRequest,
    @Param('patientId', uuid) patientId: string,
  ): Promise<AppSettings> {
    const result = await this.queries.settings(contextOf(request), patientId);
    if (isErr(result)) throw problem(result.error);
    return settingsOf(result.value);
  }

  @Put('app-settings')
  @RequirePermission('patients.write')
  async updateSettings(
    @Req() request: ContextualRequest,
    @Param('patientId', uuid) patientId: string,
    @Body() body: unknown,
  ): Promise<AppSettings> {
    const input = parseBody(updateAppSettingsSchema, body);
    const result = await this.commands.updateSettings(contextOf(request), patientId, input);
    if (isErr(result)) throw problem(result.error);
    return settingsOf(result.value);
  }

  @Get('motivational-messages')
  @RequirePermission('patients.read')
  async messages(
    @Req() request: ContextualRequest,
    @Param('patientId', uuid) patientId: string,
  ): Promise<MotivationalMessagesResponse> {
    const result = await this.queries.messages(contextOf(request), patientId);
    if (isErr(result)) throw problem(result.error);
    return { messages: result.value.map(messageOf) };
  }

  @Post('motivational-messages')
  @RequirePermission('patients.write')
  @HttpCode(HttpStatus.CREATED)
  async createMessage(
    @Req() request: ContextualRequest,
    @Param('patientId', uuid) patientId: string,
    @Body() body: unknown,
  ): Promise<MotivationalMessage> {
    const input = parseBody(createMotivationalMessageSchema, body);
    const result = await this.commands.createMessage(contextOf(request), patientId, input);
    if (isErr(result)) throw problem(result.error);
    return messageOf(result.value);
  }

  @Patch('motivational-messages/:messageId')
  @RequirePermission('patients.write')
  async updateMessage(
    @Req() request: ContextualRequest,
    @Param('patientId', uuid) patientId: string,
    @Param('messageId', uuid) messageId: string,
    @Body() body: unknown,
  ): Promise<MotivationalMessage> {
    const changes = parseBody(updateMotivationalMessageSchema, body);
    const result = await this.commands.updateMessage(
      contextOf(request),
      patientId,
      messageId,
      changes,
    );
    if (isErr(result)) throw problem(result.error);
    return messageOf(result.value);
  }
}

/** Los mensajes para todos los pacientes de la organización: los escribe el dueño o un administrador. */
@Controller('motivational-messages')
export class MotivationalMessagesController {
  constructor(
    private readonly commands: ContentCommands,
    private readonly queries: ContentQueries,
  ) {}

  @Get()
  @RequirePermission('organization.read')
  async list(@Req() request: ContextualRequest): Promise<MotivationalMessagesResponse> {
    const result = await this.queries.messages(contextOf(request), null);
    if (isErr(result)) throw problem(result.error);
    return { messages: result.value.map(messageOf) };
  }

  @Post()
  @RequirePermission('organization.update')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Req() request: ContextualRequest,
    @Body() body: unknown,
  ): Promise<MotivationalMessage> {
    const input = parseBody(createMotivationalMessageSchema, body);
    const result = await this.commands.createMessage(contextOf(request), null, input);
    if (isErr(result)) throw problem(result.error);
    return messageOf(result.value);
  }

  @Patch(':messageId')
  @RequirePermission('organization.update')
  async update(
    @Req() request: ContextualRequest,
    @Param('messageId', uuid) messageId: string,
    @Body() body: unknown,
  ): Promise<MotivationalMessage> {
    const changes = parseBody(updateMotivationalMessageSchema, body);
    const result = await this.commands.updateMessage(contextOf(request), null, messageId, changes);
    if (isErr(result)) throw problem(result.error);
    return messageOf(result.value);
  }
}

/** La app del paciente de la sesión (02 §10): nunca envía su id. */
@Controller('me')
export class MeAppController {
  constructor(private readonly queries: ContentQueries) {}

  @Get('app')
  @PatientOnly()
  async app(@Req() request: ContextualRequest): Promise<MeApp> {
    const view = await this.queries.meApp(contextOf(request));
    return {
      themeColor: view.themeColor,
      welcomeMessage: view.welcomeMessage,
      enabledSections: [...view.enabledSections],
      allowWeightLog: view.allowWeightLog,
      message: view.message ? { id: view.message.id, body: view.message.body } : null,
      features: view.features,
    };
  }
}

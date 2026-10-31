import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
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
  addMesocycleSchema,
  approveBlockSchema,
  createProgramSchema,
  createProposalSchema,
  duplicateWeekSchema,
  saveProgramWeekSchema,
  updateProgramSchema,
  type ProgramDetail,
  type ProgramListResponse,
  type ProgramSummary,
} from '@nutricoach/contracts';
import { isErr, type DomainError, type SecurityContext } from '@nutricoach/shared-kernel';
import {
  parseBody,
  problemFromDomainError,
  ProblemException,
  RequirePermission,
  type ContextualRequest,
} from '../../../../../platform/index.js';
import {
  PATIENT_ARCHIVED,
  PATIENT_NOT_FOUND,
  WRITE_ACCESS_REQUIRED,
} from '../../../../clinical/index.js';
import { ProgramCommands } from '../../../application/commands/program.commands.js';
import type { ProgramSummaryRecord } from '../../../application/ports/program.ports.js';
import { ProgramQueries, type ProgramView } from '../../../application/queries/program.queries.js';
import {
  BLOCK_NOT_FOUND,
  MESOCYCLE_NOT_FOUND,
  ONLY_MANUAL_STRUCTURE,
  ONLY_PROPOSAL_APPROVAL,
  PROGRAM_NOT_DRAFT,
  PROGRAM_NOT_FOUND,
  PROGRAM_VERSION_CONFLICT,
  WEEK_NOT_FOUND,
} from '../../../domain/program.js';

const DRAFT_EXISTS = 'NC-TRA-012';

const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  [PATIENT_NOT_FOUND.code]: 404,
  [PROGRAM_NOT_FOUND.code]: 404,
  [WEEK_NOT_FOUND.code]: 404,
  [MESOCYCLE_NOT_FOUND.code]: 404,
  [BLOCK_NOT_FOUND.code]: 404,
  [PATIENT_ARCHIVED.code]: 409,
  [PROGRAM_NOT_DRAFT.code]: 409,
  [PROGRAM_VERSION_CONFLICT.code]: 409,
  [ONLY_MANUAL_STRUCTURE.code]: 409,
  [ONLY_PROPOSAL_APPROVAL.code]: 409,
  [DRAFT_EXISTS]: 409,
  [WRITE_ACCESS_REQUIRED.code]: 403,
};

const problem = (error: DomainError) =>
  problemFromDomainError(error, STATUS_BY_CODE[error.code] ?? 422);
const notFound = (code = PROGRAM_NOT_FOUND.code) =>
  new ProblemException(404, { title: 'No encontrado.', code });

const contextOf = (request: ContextualRequest): SecurityContext => {
  if (!request.securityContext?.organizationId) {
    throw new ProblemException(403, {
      title: 'Elige con qué organización trabajas.',
      code: 'NC-TEN-011',
    });
  }
  return request.securityContext;
};

/** La versión leída, en If-Match (06 §5); sin ella, 428. */
function versionOf(ifMatch: string | undefined): number {
  const version = Number(ifMatch?.replaceAll('"', ''));
  if (!ifMatch || !Number.isInteger(version)) {
    throw new ProblemException(428, { title: 'Falta la versión en If-Match.', code: 'NC-PLT-428' });
  }
  return version;
}

const summaryOf = (program: ProgramSummaryRecord): ProgramSummary => ({
  id: program.id,
  patientId: program.patientId,
  lineageId: program.lineageId,
  versionNo: program.versionNo,
  name: program.name,
  goal: program.goal,
  status: program.status,
  origin: program.origin,
  startDate: program.startDate,
  endDate: program.endDate,
  oneRmFormula: program.oneRmFormula,
  objective: program.objective,
  level: program.level,
  daysPerWeek: program.daysPerWeek,
  split: program.split,
  macrocycleWeeks: program.macrocycleWeeks,
  periodizationValidFrom: program.periodizationValidFrom,
  templateVersion: program.templateVersion,
  publishedAt: program.publishedAt?.toISOString() ?? null,
  createdAt: program.createdAt.toISOString(),
  version: program.version,
});

const detailOf = (view: ProgramView): ProgramDetail => {
  const { totalWeeks, setsMethod, mesocycles } = view.document;
  return {
    ...summaryOf(view),
    document: {
      totalWeeks,
      setsMethod,
      mesocycles: mesocycles as ProgramDetail['document']['mesocycles'],
    },
    publishProblems: [...view.publishProblems],
  };
};

/** Los programas de entrenamiento de un paciente (RF-26): a mano o como propuesta (RN-F14). */
@Controller('patients/:patientId/training-programs')
export class PatientProgramsController {
  constructor(
    private readonly commands: ProgramCommands,
    private readonly queries: ProgramQueries,
  ) {}

  @Get()
  @RequirePermission('patients.read')
  @Header('Cache-Control', 'no-store')
  async list(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
  ): Promise<ProgramListResponse> {
    const programs = await this.queries.list(contextOf(request), patientId);
    if (!programs) throw notFound(PATIENT_NOT_FOUND.code);
    return { programs: programs.map(summaryOf) };
  }

  @Post()
  @RequirePermission('patients.write')
  async create(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() body: unknown,
  ): Promise<{ id: string }> {
    const result = await this.commands.create(
      contextOf(request),
      patientId,
      parseBody(createProgramSchema, body),
    );
    if (isErr(result)) throw problem(result.error);
    return result.value;
  }

  /** La propuesta con su macrociclo, desde el perfil. Con una llave cerrada no hay propuesta (RN-F15). */
  @Post('proposal')
  @RequirePermission('patients.write')
  async propose(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() body: unknown,
  ): Promise<{ id: string }> {
    const result = await this.commands.propose(
      contextOf(request),
      patientId,
      parseBody(createProposalSchema, body),
    );
    if (isErr(result)) throw problem(result.error);
    return result.value;
  }
}

/** Un programa por su id: encabezado, mesociclos, semanas, aprobación, publicación y versiones. */
@Controller('training-programs')
export class ProgramController {
  constructor(
    private readonly commands: ProgramCommands,
    private readonly queries: ProgramQueries,
  ) {}

  @Get(':id')
  @RequirePermission('patients.read')
  @Header('Cache-Control', 'no-store')
  async get(
    @Req() request: ContextualRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProgramDetail> {
    const view = await this.queries.get(contextOf(request), id);
    if (!view) throw notFound();
    return detailOf(view);
  }

  @Patch(':id')
  @RequirePermission('patients.write')
  async update(
    @Req() request: ContextualRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: unknown,
  ): Promise<ProgramDetail> {
    const { name, goal, startDate, oneRmFormula } = parseBody(updateProgramSchema, body);
    const result = await this.commands.update(contextOf(request), id, versionOf(ifMatch), {
      ...(name === undefined ? {} : { name }),
      ...(goal === undefined ? {} : { goal }),
      ...(startDate === undefined ? {} : { startDate }),
      ...(oneRmFormula === undefined ? {} : { oneRmFormula }),
    });
    if (isErr(result)) throw problem(result.error);
    return this.get(request, id);
  }

  @Post(':id/mesocycles')
  @RequirePermission('patients.write')
  async addMesocycle(
    @Req() request: ContextualRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: unknown,
  ): Promise<ProgramDetail> {
    const result = await this.commands.addMesocycle(
      contextOf(request),
      id,
      versionOf(ifMatch),
      parseBody(addMesocycleSchema, body),
    );
    if (isErr(result)) throw problem(result.error);
    return this.get(request, id);
  }

  @Delete(':id/mesocycles/:mesocycleId')
  @RequirePermission('patients.write')
  async removeMesocycle(
    @Req() request: ContextualRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('mesocycleId', ParseUUIDPipe) mesocycleId: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<ProgramDetail> {
    const result = await this.commands.removeMesocycle(
      contextOf(request),
      id,
      versionOf(ifMatch),
      mesocycleId,
    );
    if (isErr(result)) throw problem(result.error);
    return this.get(request, id);
  }

  @Put(':id/weeks/:weekId')
  @RequirePermission('patients.write')
  async saveWeek(
    @Req() request: ContextualRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('weekId', ParseUUIDPipe) weekId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: unknown,
  ): Promise<ProgramDetail> {
    const { sessions, ...phase } = parseBody(saveProgramWeekSchema, body);
    const result = await this.commands.saveWeek(
      contextOf(request),
      id,
      versionOf(ifMatch),
      weekId,
      {
        phase,
        sessions,
      },
    );
    if (isErr(result)) throw problem(result.error);
    return this.get(request, id);
  }

  /** Duplicar semana (RF-26): copia sus sesiones a las semanas de destino. */
  @Post(':id/weeks/:weekId/duplicate')
  @RequirePermission('patients.write')
  @HttpCode(HttpStatus.OK)
  async duplicateWeek(
    @Req() request: ContextualRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('weekId', ParseUUIDPipe) weekId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: unknown,
  ): Promise<ProgramDetail> {
    const { targetWeekIds } = parseBody(duplicateWeekSchema, body);
    const result = await this.commands.duplicateWeek(
      contextOf(request),
      id,
      versionOf(ifMatch),
      weekId,
      targetWeekIds,
    );
    if (isErr(result)) throw problem(result.error);
    return this.get(request, id);
  }

  /** El coach aprueba o sustituye un bloque de la propuesta, en todas las semanas (RN-F14). */
  @Post(':id/blocks/approve')
  @RequirePermission('patients.write')
  @HttpCode(HttpStatus.OK)
  async approveBlock(
    @Req() request: ContextualRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: unknown,
  ): Promise<ProgramDetail> {
    const result = await this.commands.approveBlock(
      contextOf(request),
      id,
      versionOf(ifMatch),
      parseBody(approveBlockSchema, body),
    );
    if (isErr(result)) throw problem(result.error);
    return this.get(request, id);
  }

  @Post(':id/publish')
  @RequirePermission('patients.write')
  @HttpCode(HttpStatus.OK)
  async publish(
    @Req() request: ContextualRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<ProgramDetail> {
    const result = await this.commands.publish(contextOf(request), id, versionOf(ifMatch));
    if (isErr(result)) throw problem(result.error);
    return this.get(request, id);
  }

  /** La versión siguiente de un programa publicado: un borrador con lo mismo (RN-F12). */
  @Post(':id/revise')
  @RequirePermission('patients.write')
  async revise(
    @Req() request: ContextualRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ id: string }> {
    const result = await this.commands.revise(contextOf(request), id);
    if (isErr(result)) throw problem(result.error);
    return result.value;
  }
}

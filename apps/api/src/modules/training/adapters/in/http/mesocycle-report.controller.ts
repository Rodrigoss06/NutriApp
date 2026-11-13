import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import {
  createMesocycleReportSchema,
  mesocycleReportCommentSchema,
  saveMesocycleReportSchema,
  type MesocycleReport,
  type MesocycleReportBody,
  type MesocycleReportCommentResponse,
  type MesocycleReportsResponse,
  type MesocycleReportVersion,
  type PatientMesocycleReportsResponse,
} from '@nutricoach/contracts';
import { isErr, type DomainError, type SecurityContext } from '@nutricoach/shared-kernel';
import { z } from 'zod';
import {
  type ContextualRequest,
  parseBody,
  PatientOnly,
  ProblemException,
  problemFromDomainError,
  RequireFeature,
  RequirePermission,
} from '../../../../../platform/index.js';
import { evolutionOf } from '../../../../assessment/index.js';
import {
  PATIENT_ARCHIVED,
  PATIENT_NOT_FOUND,
  WRITE_ACCESS_REQUIRED,
} from '../../../../clinical/index.js';
import { MesocycleReportCommands } from '../../../application/commands/mesocycle-report.commands.js';
import type { ReportBody } from '../../../application/mesocycle-report-builder.js';
import {
  MesocycleReportQueries,
  type MesocycleReportView,
} from '../../../application/queries/mesocycle-report.queries.js';
import {
  REPORT_ALREADY_SENT,
  REPORT_EXISTS,
  REPORT_MESOCYCLE_NOT_FOUND,
  REPORT_NOT_CLOSED,
  REPORT_NOT_FOUND,
  REPORT_TEXTS_REQUIRED,
  REPORT_VERSION_CONFLICT,
} from '../../../domain/mesocycle-report.js';
import { PROGRAM_NOT_FOUND } from '../../../domain/program.js';

const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  [PATIENT_NOT_FOUND.code]: 404,
  [PROGRAM_NOT_FOUND.code]: 404,
  [REPORT_NOT_FOUND.code]: 404,
  [REPORT_MESOCYCLE_NOT_FOUND.code]: 404,
  [WRITE_ACCESS_REQUIRED.code]: 403,
  [PATIENT_ARCHIVED.code]: 409,
  [REPORT_EXISTS.code]: 409,
  [REPORT_NOT_CLOSED.code]: 409,
  [REPORT_ALREADY_SENT.code]: 409,
  [REPORT_VERSION_CONFLICT.code]: 409,
  [REPORT_TEXTS_REQUIRED.code]: 422,
};

const problem = (error: DomainError) =>
  problemFromDomainError(error, STATUS_BY_CODE[error.code] ?? 422);
const uuid = z.uuid();

const staffContextOf = (request: ContextualRequest): SecurityContext => {
  if (!request.securityContext?.organizationId) {
    throw new ProblemException(403, {
      title: 'Elige con qué organización trabajas.',
      code: 'NC-TEN-011',
    });
  }
  return request.securityContext;
};

const patientContextOf = (request: ContextualRequest): SecurityContext => {
  const context = request.securityContext;
  if (context?.role !== 'PATIENT' || !context.patientId) {
    throw new ProblemException(403, {
      title: 'Esta sección es de la app del paciente.',
      code: 'NC-PLT-013',
    });
  }
  return context;
};

/** La versión leída, en If-Match (06 §5); sin ella, 428. */
function versionOf(ifMatch: string | undefined): number {
  const version = Number(ifMatch?.replaceAll('"', ''));
  if (!ifMatch || !Number.isInteger(version)) {
    throw new ProblemException(428, { title: 'Falta la versión en If-Match.', code: 'NC-PLT-428' });
  }
  return version;
}

/** Lo que muestra el informe, con el método de cada número (RN-D01, RN-D02) y el nombre de cada ejercicio con récord. */
const bodyOf = (body: ReportBody): MesocycleReportBody => ({
  schemaVersion: body.schemaVersion,
  computedOn: body.computedOn,
  program: {
    programId: body.program.programId,
    name: body.program.name,
    versionNo: body.program.versionNo,
    oneRmMethod: body.program.oneRmMethod && { ...body.program.oneRmMethod },
  },
  mesocycle: {
    ...body.mesocycle,
    weeks: body.mesocycle.weeks.map((week) => ({ ...week })),
  },
  numbers: body.numbers && {
    method: { code: body.numbers.methodCode, version: body.numbers.methodVersion },
    engineVersion: body.numbers.engineVersion,
    inputsHash: body.numbers.inputsHash,
    weeks: body.numbers.outputs.weeks.map((week) => ({ ...week })),
    total: { ...body.numbers.outputs.total },
    averages: { ...body.numbers.outputs.averages },
    records: body.numbers.outputs.records.map((record) => ({
      ...record,
      exerciseName: body.exerciseNames[record.exerciseId] ?? 'Ejercicio',
    })),
  },
  reviews: body.reviews.map((review) => ({ ...review, method: { ...review.method } })),
  evolution: body.evolution && evolutionOf(body.evolution),
});

const reportOf = (report: MesocycleReportView): MesocycleReport => ({
  id: report.id,
  patientId: report.patientId,
  mesocyclePosition: report.mesocyclePosition,
  status: report.status,
  achievement: report.achievement,
  limitation: report.limitation,
  adjustment: report.adjustment,
  priority: report.priority,
  studentComment: report.studentComment,
  studentCommentedAt: report.studentCommentedAt?.toISOString() ?? null,
  sentAt: report.sentAt?.toISOString() ?? null,
  version: report.version,
  closed: report.closed,
  body: report.body && bodyOf(report.body),
});

/**
 * Los informes del mesociclo de un alumno para su equipo de atención (P14.5, PR 7a; RN-G19; ADR-117): con la RLS del equipo
 * (RN-A05); fuera de él, 404. Leerlos deja un READ en la auditoría (RN-B03).
 */
@RequireFeature('MESOCYCLE_REPORT')
@Controller('patients/:patientId/mesocycle-reports')
export class PatientMesocycleReportsController {
  constructor(
    private readonly queries: MesocycleReportQueries,
    private readonly commands: MesocycleReportCommands,
  ) {}

  @Get()
  @RequirePermission('patients.read')
  @Header('Cache-Control', 'no-store')
  async list(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Query('programId') programId?: string,
  ): Promise<MesocycleReportsResponse> {
    if (programId !== undefined && !uuid.safeParse(programId).success) {
      throw new ProblemException(400, {
        title: 'El programa debe ser un identificador válido.',
        code: 'NC-PLT-400',
      });
    }
    const result = await this.queries.list(staffContextOf(request), patientId, programId ?? null);
    if (isErr(result)) throw problem(result.error);
    return {
      program: result.value.program && { ...result.value.program },
      mesocycles: result.value.mesocycles.map((mesocycle) => ({
        ...mesocycle,
        report: mesocycle.report && {
          ...mesocycle.report,
          sentAt: mesocycle.report.sentAt?.toISOString() ?? null,
        },
      })),
    };
  }

  @Post()
  @RequirePermission('patients.write')
  async create(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() body: unknown,
  ): Promise<MesocycleReportVersion> {
    const input = parseBody(createMesocycleReportSchema, body);
    const result = await this.commands.create(staffContextOf(request), patientId, input);
    if (isErr(result)) throw problem(result.error);
    return result.value;
  }
}

/** Un informe del mesociclo para el equipo: el borrador se edita con If-Match y se envía al cerrar el mesociclo (RN-G19). */
@RequireFeature('MESOCYCLE_REPORT')
@Controller('mesocycle-reports')
export class MesocycleReportController {
  constructor(
    private readonly queries: MesocycleReportQueries,
    private readonly commands: MesocycleReportCommands,
  ) {}

  @Get(':id')
  @RequirePermission('patients.read')
  @Header('Cache-Control', 'no-store')
  async get(
    @Req() request: ContextualRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MesocycleReport> {
    const result = await this.queries.get(staffContextOf(request), id);
    if (isErr(result)) throw problem(result.error);
    return reportOf(result.value);
  }

  @Put(':id')
  @RequirePermission('patients.write')
  async save(
    @Req() request: ContextualRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: unknown,
  ): Promise<MesocycleReportVersion> {
    const version = versionOf(ifMatch);
    const input = parseBody(saveMesocycleReportSchema, body);
    const result = await this.commands.saveTexts(staffContextOf(request), id, version, input);
    if (isErr(result)) throw problem(result.error);
    return { id, version: result.value.version };
  }

  @Post(':id/send')
  @RequirePermission('patients.write')
  @HttpCode(HttpStatus.OK)
  async send(
    @Req() request: ContextualRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<MesocycleReportVersion> {
    const result = await this.commands.send(staffContextOf(request), id, versionOf(ifMatch));
    if (isErr(result)) throw problem(result.error);
    return { id, version: result.value.version };
  }
}

/** Los informes enviados del alumno, en su app (rutas /me: nunca envía su id), y su comentario. */
@RequireFeature('MESOCYCLE_REPORT')
@Controller('me/mesocycle-reports')
export class MeMesocycleReportsController {
  constructor(
    private readonly queries: MesocycleReportQueries,
    private readonly commands: MesocycleReportCommands,
  ) {}

  @Get()
  @PatientOnly()
  @Header('Cache-Control', 'no-store')
  async list(@Req() request: ContextualRequest): Promise<PatientMesocycleReportsResponse> {
    const reports = await this.queries.mine(patientContextOf(request));
    return {
      reports: reports.map((report) => ({ ...report, sentAt: report.sentAt.toISOString() })),
    };
  }

  @Get(':id')
  @PatientOnly()
  @Header('Cache-Control', 'no-store')
  async get(
    @Req() request: ContextualRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MesocycleReport> {
    const result = await this.queries.myReport(patientContextOf(request), id);
    if (isErr(result)) throw problem(result.error);
    return reportOf(result.value);
  }

  @Put(':id/comment')
  @PatientOnly()
  async comment(
    @Req() request: ContextualRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<MesocycleReportCommentResponse> {
    const { comment } = parseBody(mesocycleReportCommentSchema, body);
    const result = await this.commands.comment(patientContextOf(request), id, comment);
    if (isErr(result)) throw problem(result.error);
    return {
      studentComment: result.value.studentComment,
      studentCommentedAt: result.value.studentCommentedAt?.toISOString() ?? null,
    };
  }
}

import { Controller, Get, Header, Param, ParseUUIDPipe, Post, Req, Res } from '@nestjs/common';
import type { PatientExport, PatientExportListResponse } from '@nutricoach/contracts';
import { isErr, type DomainError, type SecurityContext } from '@nutricoach/shared-kernel';
import type { Response } from 'express';
import {
  AllowedWhenReadOnly,
  PatientOnly,
  ProblemException,
  problemFromDomainError,
  RequirePermission,
  type ContextualRequest,
} from '../../../../../platform/index.js';
import { PatientExportCommands } from '../../../application/commands/patient-export.commands.js';
import {
  PatientExportQueries,
  type PatientExportFile,
} from '../../../application/queries/patient-export.queries.js';
import { PATIENT_NOT_FOUND } from '../../../domain/clinical-rules.js';
import {
  EXPORT_EXPIRED,
  EXPORT_FAILED,
  EXPORT_NOT_ALLOWED,
  EXPORT_NOT_FOUND,
  EXPORT_NOT_READY,
  type PatientExportRecord,
} from '../../../domain/patient-export.js';

const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  [PATIENT_NOT_FOUND.code]: 404,
  [EXPORT_NOT_FOUND.code]: 404,
  [EXPORT_NOT_ALLOWED.code]: 403,
  [EXPORT_NOT_READY.code]: 409,
  [EXPORT_FAILED.code]: 409,
  [EXPORT_EXPIRED.code]: 410,
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

const patientContextOf = (request: ContextualRequest): SecurityContext & { patientId: string } => {
  const context = request.securityContext;
  if (context?.role !== 'PATIENT' || !context.patientId) {
    throw new ProblemException(403, {
      title: 'Esta sección es de la app del paciente.',
      code: 'NC-PLT-013',
    });
  }
  return context as SecurityContext & { patientId: string };
};

const exportOf = (record: PatientExportRecord): PatientExport => ({
  id: record.id,
  status: record.status,
  createdAt: record.createdAt.toISOString(),
  readyAt: record.readyAt?.toISOString() ?? null,
  expiresAt: record.expiresAt?.toISOString() ?? null,
  sizeBytes: record.sizeBytes,
});

/** Solo por la API, con sesión: como adjunto, sin adivinar el tipo y sin caché (ADR-038, ADR-124). */
function sendZip(response: Response, file: PatientExportFile): void {
  response
    .status(200)
    .set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${file.fileName}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    })
    .send(file.content);
}

/**
 * La exportación de un paciente desde el panel (RF-07, RN-B04; ADR-131): la piden el responsable o el dueño, con la RLS del equipo
 * (RN-A05); fuera de él, 404. Cada uno ve y descarga solo las suyas. Vale en solo lectura (RN-A02); el soporte no exporta.
 */
@Controller('patients/:patientId/exports')
export class PatientExportsController {
  constructor(
    private readonly commands: PatientExportCommands,
    private readonly queries: PatientExportQueries,
  ) {}

  /** POST /api/v1/patients/:patientId/exports: 202 con el pedido; 200 con el que ya estaba pendiente. */
  @Post()
  @RequirePermission('patients.export')
  @AllowedWhenReadOnly()
  async request(
    @Req() request: ContextualRequest,
    @Res({ passthrough: true }) response: Response,
    @Param('patientId', ParseUUIDPipe) patientId: string,
  ): Promise<PatientExport> {
    const result = await this.commands.request(contextOf(request), patientId);
    if (isErr(result)) throw problem(result.error);
    response.status(result.value.created ? 202 : 200);
    return exportOf(result.value.export);
  }

  /** GET /api/v1/patients/:patientId/exports: las que pidió quien pregunta en los últimos 7 días. */
  @Get()
  @RequirePermission('patients.export')
  @Header('Cache-Control', 'no-store')
  async list(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
  ): Promise<PatientExportListResponse> {
    const result = await this.queries.list(contextOf(request), patientId);
    if (isErr(result)) throw problem(result.error);
    return { exports: result.value.exports.map(exportOf), timezone: result.value.timezone };
  }

  /** GET /api/v1/patients/:patientId/exports/:exportId/file: el ZIP, auditado como EXPORT (RN-B03). */
  @Get(':exportId/file')
  @RequirePermission('patients.export')
  async file(
    @Req() request: ContextualRequest,
    @Res() response: Response,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Param('exportId', ParseUUIDPipe) exportId: string,
  ): Promise<void> {
    const result = await this.queries.file(contextOf(request), patientId, exportId);
    if (isErr(result)) throw problem(result.error);
    sendZip(response, result.value);
  }
}

/** Sus datos desde la app (RN-B04): el paciente de la sesión pide, ve y descarga las suyas. */
@Controller('me/exports')
export class MeExportsController {
  constructor(
    private readonly commands: PatientExportCommands,
    private readonly queries: PatientExportQueries,
  ) {}

  /** POST /api/v1/me/exports: 202 con el pedido; 200 con el que ya estaba pendiente. */
  @Post()
  @PatientOnly()
  @AllowedWhenReadOnly()
  async request(
    @Req() request: ContextualRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PatientExport> {
    const result = await this.commands.requestAsPatient(patientContextOf(request));
    if (isErr(result)) throw problem(result.error);
    response.status(result.value.created ? 202 : 200);
    return exportOf(result.value.export);
  }

  @Get()
  @PatientOnly()
  @Header('Cache-Control', 'no-store')
  async list(@Req() request: ContextualRequest): Promise<PatientExportListResponse> {
    const result = await this.queries.listForPatient(patientContextOf(request));
    if (isErr(result)) throw problem(result.error);
    return { exports: result.value.exports.map(exportOf), timezone: result.value.timezone };
  }

  @Get(':exportId/file')
  @PatientOnly()
  async file(
    @Req() request: ContextualRequest,
    @Res() response: Response,
    @Param('exportId', ParseUUIDPipe) exportId: string,
  ): Promise<void> {
    const context = patientContextOf(request);
    const result = await this.queries.file(context, context.patientId, exportId);
    if (isErr(result)) throw problem(result.error);
    sendZip(response, result.value);
  }
}

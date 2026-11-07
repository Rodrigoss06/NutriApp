import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, Res } from '@nestjs/common';
import {
  documentSourceSchema,
  mySheetRequestSchema,
  type DocumentSource,
  type DocumentStatusResponse,
  type MySheets as MySheetsResponse,
} from '@nutricoach/contracts';
import { isErr, type DomainError, type SecurityContext } from '@nutricoach/shared-kernel';
import type { Response } from 'express';
import {
  AllowedWhenReadOnly,
  parseBody,
  PatientOnly,
  problemFromDomainError,
  ProblemException,
  RequirePermission,
  type ContextualRequest,
} from '../../../../../platform/index.js';
import { DocumentRequests, type DocumentStatus } from '../../../application/document-requests.js';
import { MY_SHEET_ORDER, MySheets } from '../../../application/my-sheets.js';
import type { SheetSource } from '../../../application/sheet-sources.js';
import { DOCUMENT_NOT_FOUND, SOURCE_NOT_READY } from '../../../domain/document-errors.js';
import { sheetFileName } from '../../../domain/sheet.js';

const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  [DOCUMENT_NOT_FOUND.code]: 404,
  [SOURCE_NOT_READY.code]: 409,
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

/** Sin `kind`, o con ANTHROPOMETRY, la ficha de siempre del origen; con EVOLUTION, la evolución hasta la evaluación. */
const sourceOf = (input: DocumentSource): SheetSource => ({
  type: input.sourceType,
  id: input.sourceId,
  ...(input.kind === 'EVOLUTION' ? { kind: 'EVOLUTION' as const } : {}),
});

function statusOf(status: DocumentStatus): DocumentStatusResponse {
  if (status.status === 'PENDING') return { status: 'PENDING' };
  const { document } = status;
  return {
    status: 'READY',
    document: {
      id: document.id,
      kind: document.kind,
      sourceType: document.sourceType,
      sourceId: document.sourceId,
      templateVersion: document.templateVersion,
      sha256: document.sha256,
      generatedAt: document.generatedAt.toISOString(),
      fileName: sheetFileName(document.kind),
    },
  };
}

/** Las fichas PDF de un paciente (RF-24): pedir la de un plan publicado o una evaluación cerrada y ver si ya está. */
@Controller('patients/:patientId/documents')
export class PatientDocumentsController {
  constructor(private readonly requests: DocumentRequests) {}

  /**
   * POST /api/v1/patients/:patientId/documents: 200 con la ficha si ya existe un PDF igual; si no, 202 y la genera el
   * worker. Exportar vale en solo lectura (RN-A02).
   */
  @Post()
  @RequirePermission('patients.read')
  @AllowedWhenReadOnly()
  async request(
    @Req() request: ContextualRequest,
    @Res({ passthrough: true }) response: Response,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() body: unknown,
  ): Promise<DocumentStatusResponse> {
    const result = await this.requests.request(
      contextOf(request),
      patientId,
      sourceOf(parseBody(documentSourceSchema, body)),
    );
    if (isErr(result)) throw problem(result.error);
    response.status(result.value.status === 'READY' ? 200 : 202);
    return statusOf(result.value);
  }

  /** GET /api/v1/patients/:patientId/documents/status?sourceType=…&sourceId=…: si la ficha pedida ya está. */
  @Get('status')
  @RequirePermission('patients.read')
  async status(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Query() query: unknown,
  ): Promise<DocumentStatusResponse> {
    const result = await this.requests.status(
      contextOf(request),
      patientId,
      sourceOf(parseBody(documentSourceSchema, query)),
    );
    if (isErr(result)) throw problem(result.error);
    return statusOf(result.value);
  }
}

/** La descarga de una ficha: solo por la API, como adjunto, con la visibilidad del paciente y auditada (ADR-038). */
@Controller('documents')
export class DocumentsController {
  constructor(private readonly requests: DocumentRequests) {}

  /** GET /api/v1/documents/:documentId/file */
  @Get(':documentId/file')
  @RequirePermission('patients.read')
  async file(
    @Req() request: ContextualRequest,
    @Res() response: Response,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ): Promise<void> {
    sendSheet(response, await this.requests.file(contextOf(request), documentId));
  }
}

/** El PDF como adjunto, sin adivinar el tipo (ADR-038). */
function sendSheet(response: Response, file: { content: Buffer; fileName: string } | null): void {
  if (!file) throw problem(DOCUMENT_NOT_FOUND);
  response
    .status(200)
    .set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${file.fileName}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    })
    .send(file.content);
}

/**
 * Las fichas vigentes en la app del paciente (ADR-080, ADR-095): pide una por su nombre (`item`) y la API elige su origen con el id
 * de la sesión. La descarga va con su RLS y queda auditada (RN-B03).
 */
@Controller('me/documents')
export class MeDocumentsController {
  constructor(
    private readonly requests: DocumentRequests,
    private readonly sheets: MySheets,
  ) {}

  /** GET /api/v1/me/documents: las que puede descargar ahora. */
  @Get()
  @PatientOnly()
  async list(@Req() request: ContextualRequest): Promise<MySheetsResponse> {
    const sources = await this.sheets.sources(contextOf(request));
    return { sheets: MY_SHEET_ORDER.filter((item) => sources[item]).map((item) => ({ item })) };
  }

  /** POST /api/v1/me/documents: 200 con la ficha si ya existe un PDF igual; si no, 202 y la genera el worker. */
  @Post()
  @PatientOnly()
  async request(
    @Req() request: ContextualRequest,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ): Promise<DocumentStatusResponse> {
    const context = contextOf(request);
    const source = await this.#source(context, parseBody(mySheetRequestSchema, body).item);
    const result = await this.requests.requestForPatient(context, source);
    if (isErr(result)) throw problem(result.error);
    response.status(result.value.status === 'READY' ? 200 : 202);
    return statusOf(result.value);
  }

  /** GET /api/v1/me/documents/status?item=…: si la ficha que pidió ya está. */
  @Get('status')
  @PatientOnly()
  async status(
    @Req() request: ContextualRequest,
    @Query() query: unknown,
  ): Promise<DocumentStatusResponse> {
    const context = contextOf(request);
    const source = await this.#source(context, parseBody(mySheetRequestSchema, query).item);
    const result = await this.requests.statusForPatient(context, source);
    if (isErr(result)) throw problem(result.error);
    return statusOf(result.value);
  }

  /** GET /api/v1/me/documents/:documentId/file: una ficha suya, como adjunto. */
  @Get(':documentId/file')
  @PatientOnly()
  async file(
    @Req() request: ContextualRequest,
    @Res() response: Response,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ): Promise<void> {
    sendSheet(response, await this.requests.file(contextOf(request), documentId));
  }

  async #source(
    context: SecurityContext,
    item: (typeof MY_SHEET_ORDER)[number],
  ): Promise<SheetSource> {
    const source = (await this.sheets.sources(context))[item];
    if (!source) throw problem(DOCUMENT_NOT_FOUND);
    return source;
  }
}

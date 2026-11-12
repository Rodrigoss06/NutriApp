import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  addRecordDocumentSchema,
  replaceRecordDocumentContentSchema,
  reviewRecordDocumentSchema,
  type RecordDocument,
  type RecordDocumentChanged,
  type RecordDocumentsResponse,
} from '@nutricoach/contracts';
import { isErr, type DomainError, type SecurityContext } from '@nutricoach/shared-kernel';
import type { Response } from 'express';
import {
  EXTENSIONS,
  MAX_UPLOAD_BYTES,
  parseBody,
  PatientOnly,
  problemFromDomainError,
  ProblemException,
  RequirePermission,
  type AllowedMime,
  type ContextualRequest,
} from '../../../../../platform/index.js';
import { RecordDocumentCommands } from '../../../application/commands/record-document.commands.js';
import type { RecordDocumentRecord } from '../../../application/ports/record-document.ports.js';
import {
  RecordDocumentQueries,
  type RecordDocumentFile,
  type RecordDocumentsView,
} from '../../../application/queries/record-document.queries.js';
import {
  PATIENT_ARCHIVED,
  PATIENT_NOT_FOUND,
  WRITE_ACCESS_REQUIRED,
} from '../../../domain/clinical-rules.js';
import {
  RECORD_DOCUMENT_FILE_UNSUPPORTED,
  RECORD_DOCUMENT_LOCKED,
  RECORD_DOCUMENT_NOT_FOUND,
  RECORD_DOCUMENT_NOT_REVIEWABLE,
  RECORD_DOCUMENT_VERSION_CONFLICT,
} from '../../../domain/record-document.js';

const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  [PATIENT_NOT_FOUND.code]: 404,
  [RECORD_DOCUMENT_NOT_FOUND.code]: 404,
  [WRITE_ACCESS_REQUIRED.code]: 403,
  [PATIENT_ARCHIVED.code]: 409,
  [RECORD_DOCUMENT_LOCKED.code]: 409,
  [RECORD_DOCUMENT_NOT_REVIEWABLE.code]: 409,
  [RECORD_DOCUMENT_VERSION_CONFLICT.code]: 409,
  [RECORD_DOCUMENT_FILE_UNSUPPORTED.code]: 415,
};

// Las reglas con código RN (contenido, consentimientos) son 422 (06 §5).
const problem = (error: DomainError) =>
  problemFromDomainError(error, STATUS_BY_CODE[error.code] ?? 422);

/** El archivo en el campo «file» y, si viene en multipart, los campos de texto; hasta 5 MB por el parser (ADR-038). */
const UPLOAD = FileInterceptor('file', {
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 3, fieldSize: 4096 },
});

interface UploadedDocument {
  readonly buffer: Buffer;
}

const bytesOf = (file: UploadedDocument | undefined): Uint8Array | null =>
  file ? new Uint8Array(file.buffer) : null;

function versionOf(ifMatch: string | undefined): number {
  const version = Number(ifMatch?.replaceAll('"', ''));
  if (!ifMatch || !Number.isInteger(version)) {
    throw new ProblemException(428, { title: 'Falta la versión en If-Match.', code: 'NC-PLT-428' });
  }
  return version;
}

const staffContextOf = (request: ContextualRequest): SecurityContext => {
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

const documentOf = (document: RecordDocumentRecord): RecordDocument => ({
  id: document.id,
  category: document.category,
  title: document.title,
  status: document.status,
  content:
    document.linkUrl !== null
      ? { kind: 'LINK', url: document.linkUrl }
      : document.file
        ? {
            kind: 'FILE',
            mimeType: document.file.mimeType as Extract<
              RecordDocument['content'],
              { kind: 'FILE' }
            >['mimeType'],
            sizeBytes: document.file.sizeBytes,
          }
        : null,
  reviewNote: document.reviewNote,
  createdByRole: document.createdByRole,
  createdAt: document.createdAt.toISOString(),
  contentByRole: document.contentByRole,
  contentAt: document.contentAt?.toISOString() ?? null,
  reviewedAt: document.reviewedAt?.toISOString() ?? null,
  version: document.version,
});

const documentsOf = (view: RecordDocumentsView): RecordDocumentsResponse => ({
  consents: { ...view.consents },
  documents: view.documents.map(documentOf),
});

/** Un nombre de archivo sin tildes ni símbolos, con el título del documento: «analisis-de-sangre.pdf». */
export function downloadName(title: string, mimeType: string): string {
  const slug = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  return `${slug || 'documento'}.${EXTENSIONS[mimeType as AllowedMime]}`;
}

/** Solo por la API: con la visibilidad del contexto, auditado, como adjunto y sin adivinar el tipo (ADR-038). */
function sendFile(response: Response, file: RecordDocumentFile | null): void {
  if (!file) throw problem(RECORD_DOCUMENT_NOT_FOUND);
  response
    .status(200)
    .set({
      'Content-Type': file.mimeType,
      'Content-Disposition': `attachment; filename="${downloadName(file.title, file.mimeType)}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    })
    .send(file.content);
}

/**
 * El expediente de documentos de un alumno para su equipo de atención (P14.5, PR 8; RN-G21; ADR-122): con la RLS del equipo
 * (RN-A05); fuera de él, 404. Cada lectura queda en la auditoría (RN-B03).
 */
@Controller('patients/:patientId/record-documents')
export class PatientRecordDocumentsController {
  constructor(
    private readonly queries: RecordDocumentQueries,
    private readonly commands: RecordDocumentCommands,
  ) {}

  @Get()
  @RequirePermission('patients.read')
  @Header('Cache-Control', 'no-store')
  async list(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
  ): Promise<RecordDocumentsResponse> {
    const result = await this.queries.list(staffContextOf(request), patientId);
    if (isErr(result)) throw problem(result.error);
    return documentsOf(result.value);
  }

  /** Un pedido (solo título y categoría) o un documento con su enlace, en JSON, o con su archivo, en multipart. */
  @Post()
  @RequirePermission('patients.write')
  @UseInterceptors(UPLOAD)
  async add(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() body: unknown,
    @UploadedFile() file: UploadedDocument | undefined,
  ): Promise<RecordDocumentChanged> {
    const input = parseBody(addRecordDocumentSchema, body);
    const result = await this.commands.addAsStaff(
      staffContextOf(request),
      patientId,
      input,
      bytesOf(file),
    );
    if (isErr(result)) throw problem(result.error);
    return result.value;
  }
}

/** Un documento por su id, para el equipo: reemplazar su contenido, revisarlo, borrarlo o descargar su archivo. */
@Controller('record-documents')
export class RecordDocumentController {
  constructor(
    private readonly queries: RecordDocumentQueries,
    private readonly commands: RecordDocumentCommands,
  ) {}

  @Put(':id/content')
  @RequirePermission('patients.write')
  @UseInterceptors(UPLOAD)
  async replace(
    @Req() request: ContextualRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: unknown,
    @UploadedFile() file: UploadedDocument | undefined,
  ): Promise<RecordDocumentChanged> {
    const version = versionOf(ifMatch);
    const { linkUrl } = parseBody(replaceRecordDocumentContentSchema, body);
    const result = await this.commands.replaceAsStaff(staffContextOf(request), id, version, {
      linkUrl,
      file: bytesOf(file),
    });
    if (isErr(result)) throw problem(result.error);
    return result.value;
  }

  @Put(':id/review')
  @RequirePermission('patients.write')
  async review(
    @Req() request: ContextualRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: unknown,
  ): Promise<RecordDocumentChanged> {
    const version = versionOf(ifMatch);
    const review = parseBody(reviewRecordDocumentSchema, body);
    const result = await this.commands.review(staffContextOf(request), id, version, review);
    if (isErr(result)) throw problem(result.error);
    return result.value;
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('patients.write')
  async remove(
    @Req() request: ContextualRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<void> {
    const result = await this.commands.deleteAsStaff(
      staffContextOf(request),
      id,
      versionOf(ifMatch),
    );
    if (isErr(result)) throw problem(result.error);
  }

  @Get(':id/file')
  @RequirePermission('patients.read')
  async file(
    @Req() request: ContextualRequest,
    @Res() response: Response,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    sendFile(response, await this.queries.file(staffContextOf(request), id));
  }
}

/** El expediente del alumno en su app (rutas /me: nunca envía su id); sus escrituras llevan Idempotency-Key (06 §5). */
@Controller('me/record-documents')
export class MeRecordDocumentsController {
  constructor(
    private readonly queries: RecordDocumentQueries,
    private readonly commands: RecordDocumentCommands,
  ) {}

  @Get()
  @PatientOnly()
  @Header('Cache-Control', 'no-store')
  async list(@Req() request: ContextualRequest): Promise<RecordDocumentsResponse> {
    const context = patientContextOf(request);
    const result = await this.queries.list(context, context.patientId);
    if (isErr(result)) throw problem(result.error);
    return documentsOf(result.value);
  }

  @Post()
  @PatientOnly()
  @UseInterceptors(UPLOAD)
  async add(
    @Req() request: ContextualRequest,
    @Body() body: unknown,
    @UploadedFile() file: UploadedDocument | undefined,
  ): Promise<RecordDocumentChanged> {
    const input = parseBody(addRecordDocumentSchema, body);
    const result = await this.commands.addAsPatient(
      patientContextOf(request),
      input,
      bytesOf(file),
    );
    if (isErr(result)) throw problem(result.error);
    return result.value;
  }

  @Put(':id/content')
  @PatientOnly()
  @UseInterceptors(UPLOAD)
  async replace(
    @Req() request: ContextualRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: unknown,
    @UploadedFile() file: UploadedDocument | undefined,
  ): Promise<RecordDocumentChanged> {
    const version = versionOf(ifMatch);
    const { linkUrl } = parseBody(replaceRecordDocumentContentSchema, body);
    const result = await this.commands.replaceAsPatient(patientContextOf(request), id, version, {
      linkUrl,
      file: bytesOf(file),
    });
    if (isErr(result)) throw problem(result.error);
    return result.value;
  }

  @Delete(':id')
  @HttpCode(204)
  @PatientOnly()
  async remove(
    @Req() request: ContextualRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<void> {
    const result = await this.commands.deleteAsPatient(
      patientContextOf(request),
      id,
      versionOf(ifMatch),
    );
    if (isErr(result)) throw problem(result.error);
  }

  @Get(':id/file')
  @PatientOnly()
  async file(
    @Req() request: ContextualRequest,
    @Res() response: Response,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    sendFile(response, await this.queries.file(patientContextOf(request), id));
  }
}

import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { ProgressPhotosResponse, ProgressPhotoUploadResponse } from '@nutricoach/contracts';
import { isErr, type DomainError, type SecurityContext } from '@nutricoach/shared-kernel';
import type { Response } from 'express';
import { z } from 'zod';
import {
  EXTENSIONS,
  MAX_UPLOAD_BYTES,
  PatientOnly,
  problemFromDomainError,
  ProblemException,
  RequirePermission,
  type AllowedMime,
  type ContextualRequest,
} from '../../../../../platform/index.js';
import {
  PATIENT_ARCHIVED,
  PATIENT_NOT_FOUND,
  WRITE_ACCESS_REQUIRED,
} from '../../../../clinical/index.js';
import { ProgressPhotoCommands } from '../../../application/commands/progress-photo.commands.js';
import {
  ProgressPhotoQueries,
  type PhotoFile,
  type ProgressPhotosView,
} from '../../../application/queries/progress-photo.queries.js';
import {
  PHOTO_MESOCYCLE_NOT_FOUND,
  PHOTO_NOT_FOUND,
  PHOTO_UNSUPPORTED,
  PHOTO_VIEWS,
  PHOTOS_NOT_OPEN,
  type PhotoView,
} from '../../../domain/progress-photo.js';

const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  [PATIENT_NOT_FOUND.code]: 404,
  [PHOTO_NOT_FOUND.code]: 404,
  [PHOTO_MESOCYCLE_NOT_FOUND.code]: 404,
  [WRITE_ACCESS_REQUIRED.code]: 403,
  [PATIENT_ARCHIVED.code]: 409,
  [PHOTOS_NOT_OPEN.code]: 409,
  [PHOTO_UNSUPPORTED.code]: 415,
};

const problem = (error: DomainError) =>
  problemFromDomainError(error, STATUS_BY_CODE[error.code] ?? 422);

const VIEW_FILE_NAMES: Readonly<Record<PhotoView, string>> = {
  FRONT: 'frontal',
  SIDE: 'lateral',
  BACK: 'posterior',
};

const slotSchema = z.object({
  position: z.coerce.number().int().min(1).max(100),
  view: z.enum(PHOTO_VIEWS),
});

/** El mesociclo y la vista de la ruta; fuera de rango, 400. */
function slotOf(position: string, view: string): { position: number; view: PhotoView } {
  const parsed = slotSchema.safeParse({ position, view });
  if (!parsed.success) {
    throw new ProblemException(400, {
      title: 'Indica el mesociclo y la vista: FRONT, SIDE o BACK.',
      code: 'NC-PLT-400',
    });
  }
  return parsed.data;
}

interface UploadedPhoto {
  readonly buffer: Buffer;
}

function contentOf(photo: UploadedPhoto | undefined): Uint8Array {
  if (!photo) {
    throw new ProblemException(400, {
      title: 'Adjunta la foto en el campo «photo».',
      code: 'NC-TRA-040',
    });
  }
  return new Uint8Array(photo.buffer);
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

const photosOf = (view: ProgressPhotosView): ProgressPhotosResponse => ({
  consentActive: view.consentActive,
  programs: view.programs.map((program) => ({
    ...program,
    mesocycles: program.mesocycles.map((mesocycle) => ({ ...mesocycle })),
  })),
  photos: view.photos.map((photo) => ({ ...photo, uploadedAt: photo.uploadedAt.toISOString() })),
});

/** Solo por la API: con la visibilidad del paciente, auditada, como adjunto y sin adivinar el tipo (ADR-038). */
function sendPhoto(response: Response, file: PhotoFile | null): void {
  if (!file) throw problem(PHOTO_NOT_FOUND);
  response
    .status(200)
    .set({
      'Content-Type': file.mimeType,
      'Content-Disposition': `attachment; filename="foto-${VIEW_FILE_NAMES[file.view]}.${EXTENSIONS[file.mimeType as AllowedMime]}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    })
    .send(file.content);
}

const UPLOAD = FileInterceptor('photo', {
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 0 },
});

/**
 * Las fotos de progreso de un alumno para su equipo de atención (P14.5, PR 6b; RN-G20; ADR-119): con la RLS del equipo (RN-A05);
 * fuera de él, 404. Cada lectura queda en la auditoría (RN-B03).
 */
@Controller('patients/:patientId/progress-photos')
export class PatientProgressPhotosController {
  constructor(
    private readonly queries: ProgressPhotoQueries,
    private readonly commands: ProgressPhotoCommands,
  ) {}

  @Get()
  @RequirePermission('patients.read')
  @Header('Cache-Control', 'no-store')
  async list(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
  ): Promise<ProgressPhotosResponse> {
    const result = await this.queries.list(staffContextOf(request), patientId);
    if (isErr(result)) throw problem(result.error);
    return photosOf(result.value);
  }

  /** La foto en un pedido multipart (campo «photo»), acotado a 5 MB por el parser (ADR-038). */
  @Post(':position/:view')
  @RequirePermission('patients.write')
  @UseInterceptors(UPLOAD)
  async upload(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Param('position') position: string,
    @Param('view') view: string,
    @UploadedFile() photo: UploadedPhoto | undefined,
  ): Promise<ProgressPhotoUploadResponse> {
    const slot = slotOf(position, view);
    const result = await this.commands.uploadAsStaff(
      staffContextOf(request),
      patientId,
      slot.position,
      slot.view,
      contentOf(photo),
    );
    if (isErr(result)) throw problem(result.error);
    return result.value;
  }
}

/** Una foto por su id, para el equipo. */
@Controller('progress-photos')
export class ProgressPhotoController {
  constructor(private readonly queries: ProgressPhotoQueries) {}

  @Get(':id/file')
  @RequirePermission('patients.read')
  async file(
    @Req() request: ContextualRequest,
    @Res() response: Response,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    sendPhoto(response, await this.queries.file(staffContextOf(request), id));
  }
}

/** Las fotos del alumno en su app (rutas /me: nunca envía su id); sus POST llevan Idempotency-Key (06 §5). */
@Controller('me/progress-photos')
export class MeProgressPhotosController {
  constructor(
    private readonly queries: ProgressPhotoQueries,
    private readonly commands: ProgressPhotoCommands,
  ) {}

  @Get()
  @PatientOnly()
  @Header('Cache-Control', 'no-store')
  async list(@Req() request: ContextualRequest): Promise<ProgressPhotosResponse> {
    const context = patientContextOf(request);
    const result = await this.queries.list(context, context.patientId);
    if (isErr(result)) throw problem(result.error);
    return photosOf(result.value);
  }

  @Post(':position/:view')
  @PatientOnly()
  @UseInterceptors(UPLOAD)
  async upload(
    @Req() request: ContextualRequest,
    @Param('position') position: string,
    @Param('view') view: string,
    @UploadedFile() photo: UploadedPhoto | undefined,
  ): Promise<ProgressPhotoUploadResponse> {
    const slot = slotOf(position, view);
    const result = await this.commands.uploadAsPatient(
      patientContextOf(request),
      slot.position,
      slot.view,
      contentOf(photo),
    );
    if (isErr(result)) throw problem(result.error);
    return result.value;
  }

  @Get(':id/file')
  @PatientOnly()
  async file(
    @Req() request: ContextualRequest,
    @Res() response: Response,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    sendPhoto(response, await this.queries.file(patientContextOf(request), id));
  }
}

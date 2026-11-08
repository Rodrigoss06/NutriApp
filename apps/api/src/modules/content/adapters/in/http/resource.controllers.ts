import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  assignResourceSchema,
  createResourceSchema,
  RESOURCE_STATUSES,
  updateResourceSchema,
  uploadResourceFieldsSchema,
  type AssignedResources,
  type MeResourceDetail,
  type MeResources,
  type Resource,
  type ResourceDetail,
  type ResourceList,
} from '@nutricoach/contracts';
import { isErr } from '@nutricoach/shared-kernel';
import type { Response } from 'express';
import { z } from 'zod';
import {
  MAX_UPLOAD_BYTES,
  parseBody,
  PatientOnly,
  ProblemException,
  RequirePermission,
  type ContextualRequest,
} from '../../../../../platform/index.js';
import type {
  AssignmentView,
  ResourceSummary,
} from '../../../application/ports/resources.ports.js';
import { ResourceCommands } from '../../../application/resource.commands.js';
import { ResourceQueries } from '../../../application/resource.queries.js';
import type { ResourceRecord } from '../../../domain/resources.js';
import { contextOf, problem } from './content-http.js';

const uuid = new ParseUUIDPipe({ version: '7' });
const libraryQuery = z.object({ status: z.enum(RESOURCE_STATUSES).optional() });

/** Lo que llega del parser multipart: solo los bytes, ya acotados a 5 MB. El nombre original no se usa. */
interface UploadedPdf {
  readonly buffer: Buffer;
}

const summaryOf = (resource: ResourceSummary): Resource => ({
  id: resource.id,
  kind: resource.kind,
  title: resource.title,
  url: resource.url,
  tags: [...resource.tags],
  status: resource.status,
  assignedCount: resource.assignedCount,
  createdAt: resource.createdAt.toISOString(),
});

const detailOf = (resource: ResourceRecord, assignedCount: number): ResourceDetail => ({
  ...summaryOf({ ...resource, assignedCount }),
  bodyMarkdown: resource.bodyMarkdown,
});

const assignedOf = (assignment: AssignmentView) => ({
  id: assignment.resource.id,
  kind: assignment.resource.kind,
  title: assignment.resource.title,
  url: assignment.resource.url,
  tags: [...assignment.resource.tags],
  assignedAt: assignment.assignedAt.toISOString(),
  viewedAt: assignment.viewedAt?.toISOString() ?? null,
});

/** El PDF como adjunto, sin adivinar el tipo (ADR-038). */
function sendPdf(response: Response, file: { content: Buffer; fileName: string } | null): void {
  if (!file) throw new ProblemException(404, { title: 'No encontrado.', code: 'NC-CON-003' });
  response
    .status(200)
    .set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${file.fileName}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    })
    .send(file.content);
}

/** La biblioteca de material de la organización (RF-30, ADR-094): la escribe cualquier profesional. */
@Controller('resources')
export class ResourcesController {
  constructor(
    private readonly commands: ResourceCommands,
    private readonly queries: ResourceQueries,
  ) {}

  @Get()
  @RequirePermission('catalog.read')
  async list(@Req() request: ContextualRequest, @Query() query: unknown): Promise<ResourceList> {
    const { status } = parseBody(libraryQuery, query);
    const resources = await this.queries.library(contextOf(request), status ?? null);
    return { resources: resources.map(summaryOf) };
  }

  @Post()
  @RequirePermission('catalog.write')
  async create(@Req() request: ContextualRequest, @Body() body: unknown): Promise<ResourceDetail> {
    const result = await this.commands.create(
      contextOf(request),
      parseBody(createResourceSchema, body),
    );
    if (isErr(result)) throw problem(result.error);
    return detailOf(result.value, 0);
  }

  /** Un PDF en un multipart (campo «file», hasta 5 MB) con su título y sus etiquetas. */
  @Post('file')
  @RequirePermission('catalog.write')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 2, fieldSize: 1024 },
    }),
  )
  async upload(
    @Req() request: ContextualRequest,
    @Body() body: unknown,
    @UploadedFile() file: UploadedPdf | undefined,
  ): Promise<ResourceDetail> {
    const fields = parseBody(uploadResourceFieldsSchema, body);
    if (!file) {
      throw new ProblemException(400, {
        title: 'Adjunta el PDF en el campo «file».',
        code: 'NC-CON-007',
      });
    }
    const result = await this.commands.upload(
      contextOf(request),
      fields,
      new Uint8Array(file.buffer),
    );
    if (isErr(result)) throw problem(result.error);
    return detailOf(result.value, 0);
  }

  @Get(':resourceId')
  @RequirePermission('catalog.read')
  async detail(
    @Req() request: ContextualRequest,
    @Param('resourceId', uuid) resourceId: string,
  ): Promise<ResourceDetail> {
    const result = await this.queries.detail(contextOf(request), resourceId);
    if (isErr(result)) throw problem(result.error);
    return detailOf(result.value, result.value.assignedCount);
  }

  @Patch(':resourceId')
  @RequirePermission('catalog.write')
  async update(
    @Req() request: ContextualRequest,
    @Param('resourceId', uuid) resourceId: string,
    @Body() body: unknown,
  ): Promise<ResourceDetail> {
    const context = contextOf(request);
    const result = await this.commands.update(
      context,
      resourceId,
      parseBody(updateResourceSchema, body),
    );
    if (isErr(result)) throw problem(result.error);
    const detail = await this.queries.detail(context, resourceId);
    if (isErr(detail)) throw problem(detail.error);
    return detailOf(detail.value, detail.value.assignedCount);
  }

  @Get(':resourceId/file')
  @RequirePermission('catalog.read')
  async file(
    @Req() request: ContextualRequest,
    @Param('resourceId', uuid) resourceId: string,
    @Res() response: Response,
  ): Promise<void> {
    sendPdf(response, await this.queries.file(contextOf(request), resourceId));
  }
}

/** El material asignado a un paciente, para su equipo de atención (RN-A05). */
@Controller('patients/:patientId/resources')
export class PatientResourcesController {
  constructor(
    private readonly commands: ResourceCommands,
    private readonly queries: ResourceQueries,
  ) {}

  @Get()
  @RequirePermission('patients.read')
  async list(
    @Req() request: ContextualRequest,
    @Param('patientId', uuid) patientId: string,
  ): Promise<AssignedResources> {
    const result = await this.queries.ofPatient(contextOf(request), patientId);
    if (isErr(result)) throw problem(result.error);
    return {
      resources: result.value.map((assignment) => ({
        ...assignedOf(assignment),
        status: assignment.resource.status,
      })),
    };
  }

  @Post()
  @RequirePermission('patients.write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async assign(
    @Req() request: ContextualRequest,
    @Param('patientId', uuid) patientId: string,
    @Body() body: unknown,
  ): Promise<void> {
    const { resourceId } = parseBody(assignResourceSchema, body);
    const result = await this.commands.assign(contextOf(request), patientId, resourceId);
    if (isErr(result)) throw problem(result.error);
  }

  @Delete(':resourceId')
  @RequirePermission('patients.write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unassign(
    @Req() request: ContextualRequest,
    @Param('patientId', uuid) patientId: string,
    @Param('resourceId', uuid) resourceId: string,
  ): Promise<void> {
    const result = await this.commands.unassign(contextOf(request), patientId, resourceId);
    if (isErr(result)) throw problem(result.error);
  }
}

/** El material en la app del paciente de la sesión (RF-30): nunca envía su id. */
@Controller('me/resources')
export class MeResourcesController {
  constructor(
    private readonly commands: ResourceCommands,
    private readonly queries: ResourceQueries,
  ) {}

  @Get()
  @PatientOnly()
  async list(@Req() request: ContextualRequest): Promise<MeResources> {
    const resources = await this.queries.mine(contextOf(request));
    return { resources: resources.map(assignedOf) };
  }

  @Get(':resourceId')
  @PatientOnly()
  async detail(
    @Req() request: ContextualRequest,
    @Param('resourceId', uuid) resourceId: string,
  ): Promise<MeResourceDetail> {
    const result = await this.queries.mineDetail(contextOf(request), resourceId);
    if (isErr(result)) throw problem(result.error);
    return { ...assignedOf(result.value), bodyMarkdown: result.value.bodyMarkdown };
  }

  /** Lo abrió (ADR-086): la app lo pide al mostrarlo; repetirlo no cambia la primera hora. */
  @Post(':resourceId/view')
  @PatientOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  async view(
    @Req() request: ContextualRequest,
    @Param('resourceId', uuid) resourceId: string,
  ): Promise<void> {
    const result = await this.commands.markViewed(contextOf(request), resourceId);
    if (isErr(result)) throw problem(result.error);
  }

  @Get(':resourceId/file')
  @PatientOnly()
  async file(
    @Req() request: ContextualRequest,
    @Param('resourceId', uuid) resourceId: string,
    @Res() response: Response,
  ): Promise<void> {
    sendPdf(response, await this.queries.file(contextOf(request), resourceId));
  }
}

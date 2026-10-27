import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Put,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { updateBrandingSchema, type BrandingResponse } from '@nutricoach/contracts';
import { isErr, type DomainError, type SecurityContext } from '@nutricoach/shared-kernel';
import type { Response } from 'express';
import {
  EXTENSIONS,
  parseBody,
  problemFromDomainError,
  ProblemException,
  RequirePermission,
  type AllowedMime,
  type ContextualRequest,
} from '../../../../../platform/index.js';
import { BrandingCommands } from '../../../application/commands/branding.commands.js';
import type { BrandingRow } from '../../../application/ports/tenancy.ports.js';
import { BrandingQueries } from '../../../application/queries/branding.queries.js';
import {
  LOGO_RULES,
  LOGO_TOO_HEAVY,
  LOGO_TOO_LARGE,
  LOGO_UNSUPPORTED,
} from '../../../domain/branding.js';

const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  [LOGO_UNSUPPORTED.code]: 415,
  [LOGO_TOO_HEAVY.code]: 413,
  [LOGO_TOO_LARGE.code]: 422,
};

const problem = (error: DomainError) => problemFromDomainError(error, STATUS_BY_CODE[error.code]);

const contextOf = (request: ContextualRequest): SecurityContext => {
  if (!request.securityContext?.organizationId) {
    throw new ProblemException(403, {
      title: 'Elige con qué organización trabajas.',
      code: 'NC-TEN-011',
    });
  }
  return request.securityContext;
};

/** Lo que llega del parser multipart: solo los bytes, ya acotados a 1 MB. El nombre original no se usa. */
interface UploadedLogo {
  readonly buffer: Buffer;
}

const toResponse = (branding: BrandingRow | null): BrandingResponse => ({
  displayName: branding?.displayName ?? null,
  primaryColor: branding?.primaryColor ?? null,
  secondaryColor: branding?.secondaryColor ?? null,
  contact: {
    phone: branding?.contact.phone ?? null,
    email: branding?.contact.email ?? null,
    website: branding?.contact.website ?? null,
  },
  pdfFooter: branding?.pdfFooter ?? null,
  logoFileId: branding?.logoFileId ?? null,
  updatedAt: branding?.updatedAt.toISOString() ?? null,
});

/**
 * Marca de las fichas de la organización (RN-H03, P11): la ven todos los miembros; la cambian el dueño y los
 * administradores. Solo cambia las fichas: el panel y el tema del paciente llegan con la marca completa de P15.
 */
@Controller('organization/branding')
export class BrandingController {
  constructor(
    private readonly commands: BrandingCommands,
    private readonly queries: BrandingQueries,
  ) {}

  @Get()
  @RequirePermission('organization.read')
  async get(@Req() request: ContextualRequest): Promise<BrandingResponse> {
    return toResponse(await this.queries.organizationBranding(contextOf(request)));
  }

  /** Reemplaza el nombre, los colores, el contacto y el pie; el logo no se toca. */
  @Put()
  @RequirePermission('organization.update')
  async update(
    @Req() request: ContextualRequest,
    @Body() body: unknown,
  ): Promise<BrandingResponse> {
    const result = await this.commands.update(
      contextOf(request),
      parseBody(updateBrandingSchema, body),
    );
    if (isErr(result)) throw problem(result.error);
    return this.get(request);
  }

  /** El logo en un multipart (campo «logo»), acotado a 1 MB por el parser y revisado entero (ADR-066). */
  @Put('logo')
  @RequirePermission('organization.update')
  @UseInterceptors(
    FileInterceptor('logo', { limits: { fileSize: LOGO_RULES.maxBytes, files: 1, fields: 0 } }),
  )
  async replaceLogo(
    @Req() request: ContextualRequest,
    @UploadedFile() logo: UploadedLogo | undefined,
  ): Promise<BrandingResponse> {
    if (!logo) {
      throw new ProblemException(400, {
        title: 'Adjunta el logo en el campo «logo».',
        code: 'NC-TEN-043',
      });
    }
    const result = await this.commands.replaceLogo(contextOf(request), new Uint8Array(logo.buffer));
    if (isErr(result)) throw problem(result.error);
    return this.get(request);
  }

  @Delete('logo')
  @RequirePermission('organization.update')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeLogo(@Req() request: ContextualRequest): Promise<void> {
    const result = await this.commands.removeLogo(contextOf(request));
    if (isErr(result)) throw problem(result.error);
  }

  /** El logo vigente, solo por la API: como adjunto y sin adivinar el tipo (ADR-038). Un <img> lo muestra igual. */
  @Get('logo')
  @RequirePermission('organization.read')
  async logo(@Req() request: ContextualRequest, @Res() response: Response): Promise<void> {
    const file = await this.queries.organizationLogo(contextOf(request));
    if (!file) throw new ProblemException(404, { title: 'No encontrado.', code: 'NC-TEN-044' });
    response
      .status(200)
      .set({
        'Content-Type': file.mimeType,
        'Content-Disposition': `attachment; filename="logo.${EXTENSIONS[file.mimeType as AllowedMime]}"`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
      })
      .send(file.content);
  }
}

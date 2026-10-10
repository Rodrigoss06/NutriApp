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
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  grantConsentSchema,
  patientSearchSchema,
  registerPatientSchema,
  setCareTeamMemberSchema,
  updatePatientSchema,
  type ConsentDocumentListResponse,
  type ConsentListResponse,
  type PatientListResponse,
  type PatientResponse,
} from '@nutricoach/contracts';
import { isErr, type DomainError, type SecurityContext } from '@nutricoach/shared-kernel';
import type { Response } from 'express';
import {
  EXTENSIONS,
  MAX_UPLOAD_BYTES,
  parseBody,
  problemFromDomainError,
  ProblemException,
  RequirePermission,
  type AllowedMime,
  type ContextualRequest,
} from '../../../../../platform/index.js';
import { ConsentCommands } from '../../../application/commands/consent.commands.js';
import { PatientCommands } from '../../../application/commands/patient.commands.js';
import { PatientQueries, type PatientView } from '../../../application/queries/patient.queries.js';
import {
  ALREADY_IN_STATUS,
  CANNOT_REMOVE_RESPONSIBLE,
  CONSENT_ALREADY_ACTIVE,
  CONSENT_DOCUMENT_NOT_CURRENT,
  CONSENT_NOT_FOUND,
  DOCUMENT_TAKEN,
  INVALID_DOCUMENT,
  NOT_RESPONSIBLE,
  PATIENT_ARCHIVED,
  PATIENT_NOT_FOUND,
  RESPONSIBLE_NOT_MEMBER,
  UNSUPPORTED_EVIDENCE,
  VERSION_CONFLICT,
  WRITE_ACCESS_REQUIRED,
} from '../../../domain/clinical-rules.js';

const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  [PATIENT_NOT_FOUND.code]: 404,
  [CONSENT_NOT_FOUND.code]: 404,
  [VERSION_CONFLICT.code]: 409,
  [DOCUMENT_TAKEN.code]: 409,
  [CONSENT_ALREADY_ACTIVE.code]: 409,
  [ALREADY_IN_STATUS.code]: 409,
  [NOT_RESPONSIBLE.code]: 403,
  [WRITE_ACCESS_REQUIRED.code]: 403,
  [INVALID_DOCUMENT.code]: 400,
  [UNSUPPORTED_EVIDENCE.code]: 415,
  // Paciente archivado: conflicto de estado (06 §5).
  [PATIENT_ARCHIVED.code]: 409,
  // Reglas del caso de uso sin código RN: también son 422 (06 §5).
  [CANNOT_REMOVE_RESPONSIBLE.code]: 422,
  [RESPONSIBLE_NOT_MEMBER.code]: 422,
  [CONSENT_DOCUMENT_NOT_CURRENT.code]: 422,
};

const problem = (error: DomainError) => problemFromDomainError(error, STATUS_BY_CODE[error.code]);
const notFound = () =>
  new ProblemException(404, { title: 'No encontrado.', code: PATIENT_NOT_FOUND.code });

const contextOf = (request: ContextualRequest): SecurityContext => {
  if (!request.securityContext?.organizationId) {
    throw new ProblemException(403, {
      title: 'Elige con qué organización trabajas.',
      code: 'NC-TEN-011',
    });
  }
  return request.securityContext;
};

const clientOf = (request: ContextualRequest) => ({
  ip: request.ip ?? null,
  userAgent: request.header('user-agent')?.slice(0, 512) ?? null,
});

const toResponse = (view: PatientView): PatientResponse => ({
  id: view.id,
  code: view.code,
  firstName: view.firstName,
  lastName: view.lastName,
  sex: view.sex,
  birthDate: view.birthDate,
  population: view.population,
  status: view.status,
  responsibleMemberId: view.responsibleMemberId,
  documentType: view.documentType,
  documentLast4: view.documentLast4,
  email: view.email,
  hasPhone: view.phoneEnc !== null,
  timezone: view.timezone,
  ageYears: view.ageYears,
  careTeam: view.careTeam.map((m) => ({ memberId: m.memberId, role: m.role, access: m.access })),
  version: view.version,
});

/** Lo que llega del parser multipart: solo los bytes, ya acotados a 5 MB. El nombre original no se usa. */
interface UploadedEvidence {
  readonly buffer: Buffer;
}

/**
 * Pacientes, equipo de atención y consentimiento (RF-05, RF-08). La RLS decide a quién se ve (RN-A05); el caso de uso,
 * quién escribe. La ficha y la evidencia se auditan al leerse (RN-B03).
 */
@Controller('patients')
export class PatientController {
  constructor(
    private readonly commands: PatientCommands,
    private readonly consentCommands: ConsentCommands,
    private readonly queries: PatientQueries,
  ) {}

  @Get()
  @RequirePermission('patients.read')
  async search(
    @Req() request: ContextualRequest,
    @Query() query: unknown,
  ): Promise<PatientListResponse> {
    const page = await this.queries.search(
      contextOf(request),
      parseBody(patientSearchSchema, query),
    );
    return {
      patients: page.patients.map((p) => ({
        id: p.id,
        code: p.code,
        firstName: p.firstName,
        lastName: p.lastName,
        sex: p.sex,
        birthDate: p.birthDate,
        population: p.population,
        status: p.status,
        responsibleMemberId: p.responsibleMemberId,
      })),
      nextCursor: page.nextCursor,
    };
  }

  @Post()
  @RequirePermission('patients.write')
  async register(
    @Req() request: ContextualRequest,
    @Body() body: unknown,
  ): Promise<{ id: string }> {
    const result = await this.commands.register(
      contextOf(request),
      parseBody(registerPatientSchema, body),
    );
    if (isErr(result)) throw problem(result.error);
    return result.value;
  }

  @Get('consent-documents')
  @RequirePermission('patients.read')
  async documents(@Req() request: ContextualRequest): Promise<ConsentDocumentListResponse> {
    const documents = await this.queries.currentDocuments(contextOf(request));
    return {
      documents: documents.map((d) => ({
        id: d.id,
        purpose: d.purpose,
        version: d.version,
        bodyMarkdown: d.bodyMarkdown,
        provisional: d.version.endsWith('-provisional'),
      })),
    };
  }

  @Get(':patientId')
  @RequirePermission('patients.read')
  @Header('Cache-Control', 'no-store')
  async get(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
  ): Promise<PatientResponse> {
    const view = await this.queries.get(contextOf(request), patientId);
    if (!view) throw notFound();
    return toResponse(view);
  }

  @Patch(':patientId')
  @RequirePermission('patients.write')
  async update(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: unknown,
  ): Promise<PatientResponse> {
    const version = Number(ifMatch?.replaceAll('"', ''));
    if (!Number.isInteger(version)) {
      throw new ProblemException(428, {
        title: 'Falta la versión en If-Match.',
        code: 'NC-PLT-428',
      });
    }
    const result = await this.commands.update(
      contextOf(request),
      patientId,
      version,
      parseBody(updatePatientSchema, body),
    );
    if (isErr(result)) throw problem(result.error);
    return this.get(request, patientId);
  }

  @Post(':patientId/archive')
  @RequirePermission('patients.write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
  ): Promise<void> {
    const result = await this.commands.archive(contextOf(request), patientId);
    if (isErr(result)) throw problem(result.error);
  }

  @Post(':patientId/reactivate')
  @RequirePermission('patients.write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async reactivate(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
  ): Promise<void> {
    const result = await this.commands.reactivate(contextOf(request), patientId);
    if (isErr(result)) throw problem(result.error);
  }

  @Put(':patientId/care-team/:memberId')
  @RequirePermission('patients.write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async setCareTeamMember(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() body: unknown,
  ): Promise<void> {
    const input = parseBody(setCareTeamMemberSchema, body);
    const result = await this.commands.setCareTeamMember(contextOf(request), patientId, {
      memberId,
      ...input,
    });
    if (isErr(result)) throw problem(result.error);
  }

  @Delete(':patientId/care-team/:memberId')
  @RequirePermission('patients.write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeCareTeamMember(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ): Promise<void> {
    const result = await this.commands.removeCareTeamMember(
      contextOf(request),
      patientId,
      memberId,
    );
    if (isErr(result)) throw problem(result.error);
  }

  @Get(':patientId/consents')
  @RequirePermission('patients.read')
  async consents(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
  ): Promise<ConsentListResponse> {
    const consents = await this.queries.consents(contextOf(request), patientId);
    if (!consents) throw notFound();
    return {
      consents: consents.map((c) => ({
        id: c.id,
        purpose: c.purpose,
        documentVersion: c.documentVersion,
        channel: c.channel,
        grantedAt: c.grantedAt.toISOString(),
        revokedAt: c.revokedAt?.toISOString() ?? null,
        hasEvidence: c.evidenceFileId !== null,
      })),
    };
  }

  /** Consentimiento y evidencia en un solo pedido multipart (campo «evidence»), acotado a 5 MB por el parser. */
  @Post(':patientId/consents')
  @RequirePermission('patients.write')
  @UseInterceptors(
    FileInterceptor('evidence', {
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 5, fieldSize: 1024 },
    }),
  )
  async grant(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() body: unknown,
    @UploadedFile() evidence: UploadedEvidence | undefined,
  ): Promise<{ id: string }> {
    const input = parseBody(grantConsentSchema, body);
    const result = await this.consentCommands.grant(contextOf(request), patientId, {
      ...input,
      evidence: evidence ? new Uint8Array(evidence.buffer) : null,
      ...clientOf(request),
    });
    if (isErr(result)) throw problem(result.error);
    return result.value;
  }

  @Post(':patientId/consents/:consentId/revoke')
  @RequirePermission('patients.write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Param('consentId', ParseUUIDPipe) consentId: string,
  ): Promise<void> {
    const result = await this.consentCommands.revoke(contextOf(request), patientId, consentId);
    if (isErr(result)) throw problem(result.error);
  }

  /** Descarga solo por la API: con la visibilidad del paciente, auditada, como adjunto y sin adivinar el tipo. */
  @Get(':patientId/consents/:consentId/evidence')
  @RequirePermission('patients.read')
  async evidence(
    @Req() request: ContextualRequest,
    @Res() response: Response,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Param('consentId', ParseUUIDPipe) consentId: string,
  ): Promise<void> {
    const file = await this.queries.evidence(contextOf(request), patientId, consentId);
    if (!file) throw notFound();
    const extension = EXTENSIONS[file.mimeType as AllowedMime];
    response
      .status(200)
      .set({
        'Content-Type': file.mimeType,
        'Content-Disposition': `attachment; filename="evidencia-consentimiento.${extension}"`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
      })
      .send(file.content);
  }
}

import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import {
  grantMyConsentSchema,
  recordScreeningSchema,
  SELF_SERVICE_CONSENT_PURPOSES,
  type MeConsents,
  type MeScreening,
} from '@nutricoach/contracts';
import { isErr, type DomainError, type SecurityContext } from '@nutricoach/shared-kernel';
import {
  parseBody,
  PatientOnly,
  problemFromDomainError,
  ProblemException,
  type ContextualRequest,
} from '../../../../../platform/index.js';
import { PatientSelfService } from '../../../application/patient-self-service.js';
import {
  CONSENT_ALREADY_ACTIVE,
  CONSENT_NOT_FOUND,
  PATIENT_ARCHIVED,
  PATIENT_NOT_FOUND,
} from '../../../domain/clinical-rules.js';

const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  [PATIENT_NOT_FOUND.code]: 404,
  [CONSENT_NOT_FOUND.code]: 404,
  [CONSENT_ALREADY_ACTIVE.code]: 409,
  [PATIENT_ARCHIVED.code]: 409,
};

const problem = (error: DomainError) =>
  problemFromDomainError(error, STATUS_BY_CODE[error.code] ?? 422);

const contextOf = (request: ContextualRequest): SecurityContext => {
  const context = request.securityContext;
  if (context?.role !== 'PATIENT' || !context.patientId) {
    throw new ProblemException(403, {
      title: 'Esta sección es de la app del paciente.',
      code: 'NC-PLT-013',
    });
  }
  return context;
};

/**
 * Lo que el paciente decide sobre su expediente desde la app (02 §10): las finalidades opcionales, como el seguimiento del ciclo
 * menstrual (RN-G17), y su cribado previo al ejercicio (07 §3.2). Nunca envía su id.
 */
@Controller('me')
export class MeClinicalController {
  constructor(private readonly self: PatientSelfService) {}

  @Get('consents')
  @PatientOnly()
  async consents(@Req() request: ContextualRequest): Promise<MeConsents> {
    const consents = await this.self.myConsents(contextOf(request));
    return {
      consents: consents.map((consent) => ({
        ...consent,
        grantedAt: consent.grantedAt?.toISOString() ?? null,
      })),
    };
  }

  @Post('consents')
  @PatientOnly()
  @HttpCode(HttpStatus.CREATED)
  async grant(@Req() request: ContextualRequest, @Body() body: unknown): Promise<{ id: string }> {
    const { purpose } = parseBody(grantMyConsentSchema, body);
    const result = await this.self.grant(contextOf(request), purpose, {
      ip: request.ip ?? null,
      userAgent: request.header('user-agent')?.slice(0, 512) ?? null,
    });
    if (isErr(result)) throw problem(result.error);
    return result.value;
  }

  @Post('consents/:purpose/revoke')
  @PatientOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(
    @Req() request: ContextualRequest,
    @Param('purpose') purpose: string,
  ): Promise<void> {
    const allowed = SELF_SERVICE_CONSENT_PURPOSES.find((value) => value === purpose);
    if (!allowed)
      throw new ProblemException(404, { title: 'No encontrado.', code: CONSENT_NOT_FOUND.code });
    const result = await this.self.revoke(contextOf(request), allowed);
    if (isErr(result)) throw problem(result.error);
  }

  @Get('screening')
  @PatientOnly()
  async screening(@Req() request: ContextualRequest): Promise<MeScreening> {
    const latest = await this.self.screening(contextOf(request));
    return {
      latest: latest
        ? { answeredAt: latest.answeredAt.toISOString(), awaitingReview: latest.awaitingReview }
        : null,
    };
  }

  @Post('screening')
  @PatientOnly()
  @HttpCode(HttpStatus.CREATED)
  async answerScreening(
    @Req() request: ContextualRequest,
    @Body() body: unknown,
  ): Promise<{ id: string }> {
    const { answers } = parseBody(recordScreeningSchema, body);
    const result = await this.self.answerScreening(contextOf(request), answers);
    if (isErr(result)) throw problem(result.error);
    return result.value;
  }
}

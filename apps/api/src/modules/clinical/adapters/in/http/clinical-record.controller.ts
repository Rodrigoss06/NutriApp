import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import {
  ANAMNESIS_FORM,
  anamnesisAnswersV2Schema,
  clinicalHistoryAnswersV1Schema,
  createClinicalNoteSchema,
  createConditionSchema,
  createGoalSchema,
  historyRevisionNumberSchema,
  invitePatientSchema,
  LEGACY_HISTORY_FORM,
  recordScreeningSchema,
  reviewScreeningSchema,
  saveClinicalHistorySchema,
  screeningAnswersSchema,
  timelineQuerySchema,
  updateConditionSchema,
  updateGoalSchema,
  type ClinicalHistoryResponse,
  type ClinicalHistoryRevision,
  type ClinicalNoteListResponse,
  type ConditionListResponse,
  type GoalListResponse,
  type ScreeningListResponse,
  type TimelineResponse,
} from '@nutricoach/contracts';
import { isErr, type DomainError, type SecurityContext } from '@nutricoach/shared-kernel';
import {
  parseBody,
  problemFromDomainError,
  ProblemException,
  RequirePermission,
  type ContextualRequest,
} from '../../../../../platform/index.js';
import { ACCOUNT_EXISTS_FOR_PATIENT, EMAIL_HAS_PENDING_INVITATION } from '../../../../iam/index.js';
import { ClinicalRecordCommands } from '../../../application/commands/clinical-record.commands.js';
import { PatientInvitationCommands } from '../../../application/commands/patient-invitation.commands.js';
import type { HistoryRevisionRecord } from '../../../application/ports/clinical.ports.js';
import { ClinicalRecordQueries } from '../../../application/queries/clinical-record.queries.js';
import {
  CONDITION_NOT_FOUND,
  GOAL_NOT_FOUND,
  HISTORY_REVISION_CONFLICT,
  NOTE_NOT_FOUND,
  PATIENT_ALREADY_LINKED,
  PATIENT_ARCHIVED,
  PATIENT_EMAIL_REQUIRED,
  PATIENT_NOT_FOUND,
  SCREENING_NOT_FOUND,
  SCREENING_NOT_REVIEWABLE,
  WRITE_ACCESS_REQUIRED,
} from '../../../domain/clinical-rules.js';

const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  [PATIENT_NOT_FOUND.code]: 404,
  [CONDITION_NOT_FOUND.code]: 404,
  [GOAL_NOT_FOUND.code]: 404,
  [NOTE_NOT_FOUND.code]: 404,
  [SCREENING_NOT_FOUND.code]: 404,
  [SCREENING_NOT_REVIEWABLE.code]: 409,
  [HISTORY_REVISION_CONFLICT.code]: 409,
  [PATIENT_ARCHIVED.code]: 409,
  [PATIENT_ALREADY_LINKED.code]: 409,
  [ACCOUNT_EXISTS_FOR_PATIENT.code]: 409,
  [EMAIL_HAS_PENDING_INVITATION.code]: 409,
  [WRITE_ACCESS_REQUIRED.code]: 403,
  // Regla del caso de uso sin código RN: también es 422 (06 §5).
  [PATIENT_EMAIL_REQUIRED.code]: 422,
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

/** Las respuestas se guardaron validadas con el esquema de su formulario: la v1 solo se lee. */
const revisionOf = (record: HistoryRevisionRecord): ClinicalHistoryRevision => {
  const meta = {
    revision: record.revision,
    recordedAt: record.recordedAt.toISOString(),
    recordedBy: record.recordedBy,
  };
  if (record.formCode !== ANAMNESIS_FORM.code) {
    return {
      ...meta,
      formCode: LEGACY_HISTORY_FORM.code,
      formVersion: LEGACY_HISTORY_FORM.version,
      answers: clinicalHistoryAnswersV1Schema.parse(record.answers),
      profile: null,
    };
  }
  return {
    ...meta,
    formCode: ANAMNESIS_FORM.code,
    formVersion: ANAMNESIS_FORM.version,
    answers: anamnesisAnswersV2Schema.parse(record.answers),
    profile: record.profile && {
      ...record.profile,
      domainScores: { ...record.profile.domainScores },
      classes: { ...record.profile.classes },
      computedAt: record.profile.computedAt.toISOString(),
    },
  };
};

/**
 * Expediente del paciente (RF-09, RF-10, RF-43): historia clínica versionada con su perfil de rendimiento, condiciones,
 * objetivos, notas, línea de tiempo e invitación a la app (RN-A06). Escribir datos de salud exige HEALTH_DATA (RN-B01);
 * leer deja un READ (RN-B03).
 */
@Controller('patients/:patientId')
export class ClinicalRecordController {
  constructor(
    private readonly commands: ClinicalRecordCommands,
    private readonly queries: ClinicalRecordQueries,
    private readonly invitations: PatientInvitationCommands,
  ) {}

  @Get('clinical-history')
  @RequirePermission('patients.read')
  @Header('Cache-Control', 'no-store')
  async history(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
  ): Promise<ClinicalHistoryResponse> {
    const view = await this.queries.history(contextOf(request), patientId);
    if (!view) throw notFound();
    return {
      current: view.current && revisionOf(view.current),
      revisions: view.revisions.map((r) => ({
        revision: r.revision,
        formCode:
          r.formCode === ANAMNESIS_FORM.code ? ANAMNESIS_FORM.code : LEGACY_HISTORY_FORM.code,
        recordedAt: r.recordedAt.toISOString(),
        recordedBy: r.recordedBy,
      })),
    };
  }

  /** Una revisión anterior: la v1, que ya no se edita, y cada perfil de rendimiento anterior. */
  @Get('clinical-history/revisions/:revision')
  @RequirePermission('patients.read')
  @Header('Cache-Control', 'no-store')
  async historyRevision(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Param('revision') revision: string,
  ): Promise<ClinicalHistoryRevision> {
    const record = await this.queries.historyRevision(
      contextOf(request),
      patientId,
      parseBody(historyRevisionNumberSchema, revision),
    );
    if (!record) throw notFound();
    return revisionOf(record);
  }

  /** Cada guardado es una revisión nueva de la anamnesis V2 sobre expectedRevision; si alguien guardó antes, 409. */
  @Put('clinical-history')
  @RequirePermission('patients.write')
  async saveHistory(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() body: unknown,
  ): Promise<{ revision: number }> {
    const input = parseBody(saveClinicalHistorySchema, body);
    const result = await this.commands.saveHistory(
      contextOf(request),
      patientId,
      input.expectedRevision,
      input.answers,
    );
    if (isErr(result)) throw problem(result.error);
    return result.value;
  }

  /** El cribado previo al ejercicio, con su historial (RN-F15, 07 §3.2). */
  @Get('screenings')
  @RequirePermission('patients.read')
  @Header('Cache-Control', 'no-store')
  async screenings(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
  ): Promise<ScreeningListResponse> {
    const screenings = await this.queries.screenings(contextOf(request), patientId);
    if (!screenings) throw notFound();
    return {
      screenings: screenings.map((s) => ({
        id: s.id,
        formVersion: s.formVersion,
        ruleVersion: s.ruleVersion,
        answers: screeningAnswersSchema.parse(s.answers),
        status: s.status,
        answeredBy: s.answeredBy,
        answeredAt: s.answeredAt.toISOString(),
        review: s.review && {
          decision: s.review.decision,
          note: s.review.note,
          reviewedBy: s.review.reviewedBy,
          reviewedAt: s.review.reviewedAt.toISOString(),
        },
      })),
    };
  }

  @Post('screenings')
  @RequirePermission('patients.write')
  async recordScreening(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() body: unknown,
  ): Promise<{ id: string }> {
    const { answers } = parseBody(recordScreeningSchema, body);
    const result = await this.commands.recordScreening(contextOf(request), patientId, answers);
    if (isErr(result)) throw problem(result.error);
    return result.value;
  }

  @Post('screenings/:screeningId/review')
  @RequirePermission('patients.write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async reviewScreening(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Param('screeningId', ParseUUIDPipe) screeningId: string,
    @Body() body: unknown,
  ): Promise<void> {
    const result = await this.commands.reviewScreening(
      contextOf(request),
      patientId,
      screeningId,
      parseBody(reviewScreeningSchema, body),
    );
    if (isErr(result)) throw problem(result.error);
  }

  @Get('conditions')
  @RequirePermission('patients.read')
  async conditions(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
  ): Promise<ConditionListResponse> {
    const conditions = await this.queries.conditions(contextOf(request), patientId);
    if (!conditions) throw notFound();
    return {
      conditions: conditions.map((c) => ({
        id: c.id,
        kind: c.kind,
        label: c.label,
        codeSystem: c.codeSystem,
        code: c.code,
        status: c.status,
        since: c.since,
        notes: c.notes,
        createdAt: c.createdAt.toISOString(),
      })),
    };
  }

  @Post('conditions')
  @RequirePermission('patients.write')
  async addCondition(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() body: unknown,
  ): Promise<{ id: string }> {
    const result = await this.commands.addCondition(
      contextOf(request),
      patientId,
      parseBody(createConditionSchema, body),
    );
    if (isErr(result)) throw problem(result.error);
    return result.value;
  }

  @Patch('conditions/:conditionId')
  @RequirePermission('patients.write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateCondition(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Param('conditionId', ParseUUIDPipe) conditionId: string,
    @Body() body: unknown,
  ): Promise<void> {
    const result = await this.commands.updateCondition(
      contextOf(request),
      patientId,
      conditionId,
      parseBody(updateConditionSchema, body),
    );
    if (isErr(result)) throw problem(result.error);
  }

  @Get('goals')
  @RequirePermission('patients.read')
  async goals(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
  ): Promise<GoalListResponse> {
    const goals = await this.queries.goals(contextOf(request), patientId);
    if (!goals) throw notFound();
    return {
      goals: goals.map((g) => ({
        id: g.id,
        kind: g.kind,
        metricCode: g.metricCode,
        targetValue: g.targetValue,
        targetDate: g.targetDate,
        status: g.status,
        notes: g.notes,
        createdAt: g.createdAt.toISOString(),
      })),
    };
  }

  @Post('goals')
  @RequirePermission('patients.write')
  async addGoal(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() body: unknown,
  ): Promise<{ id: string }> {
    const result = await this.commands.addGoal(
      contextOf(request),
      patientId,
      parseBody(createGoalSchema, body),
    );
    if (isErr(result)) throw problem(result.error);
    return result.value;
  }

  @Patch('goals/:goalId')
  @RequirePermission('patients.write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateGoal(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Param('goalId', ParseUUIDPipe) goalId: string,
    @Body() body: unknown,
  ): Promise<void> {
    const result = await this.commands.updateGoal(
      contextOf(request),
      patientId,
      goalId,
      parseBody(updateGoalSchema, body),
    );
    if (isErr(result)) throw problem(result.error);
  }

  @Get('notes')
  @RequirePermission('patients.read')
  async notes(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
  ): Promise<ClinicalNoteListResponse> {
    const notes = await this.queries.notes(contextOf(request), patientId);
    if (!notes) throw notFound();
    return {
      notes: notes.map((n) => ({
        id: n.id,
        authorMemberId: n.authorMemberId,
        body: n.body,
        visibility: n.visibility,
        amendsNoteId: n.amendsNoteId,
        createdAt: n.createdAt.toISOString(),
      })),
    };
  }

  @Post('notes')
  @RequirePermission('patients.write')
  async addNote(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() body: unknown,
  ): Promise<{ id: string }> {
    const result = await this.commands.addNote(
      contextOf(request),
      patientId,
      parseBody(createClinicalNoteSchema, body),
    );
    if (isErr(result)) throw problem(result.error);
    return result.value;
  }

  @Get('timeline')
  @RequirePermission('patients.read')
  @Header('Cache-Control', 'no-store')
  async timeline(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Query() query: unknown,
  ): Promise<TimelineResponse> {
    const page = await this.queries.timeline(
      contextOf(request),
      patientId,
      parseBody(timelineQuerySchema, query),
    );
    if (!page) throw notFound();
    return {
      items: page.items.map((i) => ({
        kind: i.kind,
        occurredAt: i.occurredAt.toISOString(),
        refId: i.refId,
        label: i.label,
        detail: i.detail,
      })),
      nextCursor: page.nextCursor,
    };
  }

  /** Invitar (o reenviar) el acceso a la app: el correo lo envía el worker con el enlace de un solo uso. */
  @Post('invitation')
  @RequirePermission('patients.write')
  async invite(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() body: unknown,
  ): Promise<{ id: string }> {
    const result = await this.invitations.invite(
      contextOf(request),
      patientId,
      parseBody(invitePatientSchema, body ?? {}),
    );
    if (isErr(result)) throw problem(result.error);
    return result.value;
  }
}

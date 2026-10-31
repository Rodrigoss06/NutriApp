import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Put, Req } from '@nestjs/common';
import {
  saveAthleteProfileSchema,
  type AthleteProfileResponse,
  type TrainingSafetyResponse,
} from '@nutricoach/contracts';
import { isErr, type DomainError, type SecurityContext } from '@nutricoach/shared-kernel';
import {
  parseBody,
  problemFromDomainError,
  ProblemException,
  RequirePermission,
  type ContextualRequest,
} from '../../../../../platform/index.js';
import {
  PATIENT_ARCHIVED,
  PATIENT_NOT_FOUND,
  WRITE_ACCESS_REQUIRED,
} from '../../../../clinical/index.js';
import { AthleteProfileCommands } from '../../../application/commands/athlete-profile.commands.js';
import { TrainingSafetyQueries } from '../../../application/queries/training-safety.queries.js';
import { PROFILE_REVISION_CONFLICT } from '../../../domain/athlete-profile.js';

const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  [PATIENT_NOT_FOUND.code]: 404,
  [PATIENT_ARCHIVED.code]: 409,
  [PROFILE_REVISION_CONFLICT.code]: 409,
  [WRITE_ACCESS_REQUIRED.code]: 403,
};

const problem = (error: DomainError) =>
  problemFromDomainError(error, STATUS_BY_CODE[error.code] ?? 422);
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

/** El perfil de entrenamiento (07 §2) y las tres llaves de seguridad (RF-41, RN-F15) de un paciente. */
@Controller('patients/:patientId')
export class TrainingSafetyController {
  constructor(
    private readonly commands: AthleteProfileCommands,
    private readonly queries: TrainingSafetyQueries,
  ) {}

  @Get('athlete-profile')
  @RequirePermission('patients.read')
  @Header('Cache-Control', 'no-store')
  async profile(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
  ): Promise<AthleteProfileResponse> {
    const profile = await this.queries.profile(contextOf(request), patientId);
    if (profile === undefined) throw notFound();
    return {
      current: profile && {
        revision: profile.revision,
        objective: profile.objective,
        level: profile.level,
        daysPerWeek: profile.daysPerWeek,
        minutesPerSession: profile.minutesPerSession,
        equipmentCodes: [...profile.equipmentCodes],
        startDate: profile.startDate,
        macrocycleWeeks: profile.macrocycleWeeks,
        medicalClearance: profile.medicalClearance,
        alarmSymptoms: profile.alarmSymptoms,
        injuriesNote: profile.injuriesNote,
        restrictionsNote: profile.restrictionsNote,
        baselineWeightKg: profile.baselineWeightKg,
        baselineRestingHrBpm: profile.baselineRestingHrBpm,
        baselineHrvMs: profile.baselineHrvMs,
        sleepTargetHours: profile.sleepTargetHours,
        testTargets: { ...profile.testTargets },
        notes: profile.notes,
        recordedBy: profile.recordedBy,
        recordedAt: profile.recordedAt.toISOString(),
      },
    };
  }

  /** Cada guardado es una revisión nueva sobre expectedRevision; si alguien guardó antes, 409. */
  @Put('athlete-profile')
  @RequirePermission('patients.write')
  async saveProfile(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() body: unknown,
  ): Promise<{ revision: number }> {
    const { expectedRevision, ...input } = parseBody(saveAthleteProfileSchema, body);
    const result = await this.commands.save(contextOf(request), patientId, expectedRevision, input);
    if (isErr(result)) throw problem(result.error);
    return result.value;
  }

  @Get('training-safety')
  @RequirePermission('patients.read')
  @Header('Cache-Control', 'no-store')
  async safety(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
  ): Promise<TrainingSafetyResponse> {
    const safety = await this.queries.safetyOf(contextOf(request), patientId);
    if (!safety) throw notFound();
    return {
      status: safety.status,
      blocked: safety.blocked,
      medicalClearance: safety.medicalClearance,
      alarmSymptoms: safety.alarmSymptoms,
      movement: { ...safety.movement },
      screening: safety.screening && {
        ...safety.screening,
        answeredAt: safety.screening.answeredAt.toISOString(),
      },
    };
  }
}

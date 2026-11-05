import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import {
  adjustRecordSchema,
  markAppNotesReadSchema,
  type AppNote,
  type AppNotesResponse,
  type PatientDay,
  type RecordAdjustment,
} from '@nutricoach/contracts';
import { isErr, type DomainError, type SecurityContext } from '@nutricoach/shared-kernel';
import { z } from 'zod';
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
import { AdjustmentCommands } from '../../../application/commands/adjustment.commands.js';
import type {
  StoredAdjustment,
  StoredCheckin,
  StoredNote,
  StoredSetLog,
} from '../../../application/ports/records.ports.js';
import { PatientRecordsQueries } from '../../../application/queries/patient-records.queries.js';
import { RECORD_NOT_FOUND } from '../../../domain/tracking-errors.js';

const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  [PATIENT_NOT_FOUND.code]: 404,
  [RECORD_NOT_FOUND.code]: 404,
  [WRITE_ACCESS_REQUIRED.code]: 403,
  [PATIENT_ARCHIVED.code]: 409,
};

const problem = (error: DomainError) =>
  problemFromDomainError(error, STATUS_BY_CODE[error.code] ?? 422);
const notFound = () =>
  new ProblemException(404, { title: 'No encontrado.', code: PATIENT_NOT_FOUND.code });
const isoDate = z.iso.date();

const contextOf = (request: ContextualRequest): SecurityContext => {
  if (!request.securityContext?.organizationId) {
    throw new ProblemException(403, {
      title: 'Elige con qué organización trabajas.',
      code: 'NC-TEN-011',
    });
  }
  return request.securityContext;
};

const dateOf = (value: string): string => {
  const parsed = isoDate.safeParse(value);
  if (!parsed.success) {
    throw new ProblemException(400, {
      title: 'La fecha debe ser AAAA-MM-DD.',
      code: 'NC-PLT-400',
    });
  }
  return parsed.data;
};

const noteOf = (note: StoredNote): AppNote => ({
  id: note.id,
  clientId: note.clientId,
  localDate: note.localDate,
  body: note.body,
  createdAt: note.createdAt.toISOString(),
  readAt: note.readAt?.toISOString() ?? null,
});

const setOf = (set: StoredSetLog): PatientDay['workouts'][number]['sets'][number] => ({
  id: set.id,
  workoutLogId: set.workoutLogId,
  exerciseId: set.exerciseId,
  exerciseName: set.exerciseName,
  setNo: set.setNo,
  isWarmup: set.isWarmup,
  reps: set.reps,
  loadKg: set.loadKg,
  rir: set.rir,
  rpe: set.rpe,
  durationSeconds: set.durationSeconds,
  distanceM: set.distanceM,
  tonnageKg: set.tonnageKg,
  status: set.status,
});

const adjustmentOf = (adjustment: StoredAdjustment): RecordAdjustment => ({
  ...adjustment,
  correctedValues: adjustment.correctedValues && { ...adjustment.correctedValues },
  createdAt: adjustment.createdAt.toISOString(),
});

const checkinOf = (checkin: StoredCheckin): NonNullable<PatientDay['checkin']> => ({
  ...checkin,
  readiness: checkin.readiness && {
    indication: checkin.readiness.indication,
    readinessScore: checkin.readiness.readinessScore,
    components: { ...checkin.readiness.components },
    neutralComponents: [...checkin.readiness.neutralComponents],
    srpeLoad: checkin.readiness.srpeLoad,
    performancePct: checkin.readiness.performancePct,
    methodCode: checkin.readiness.methodCode,
    methodVersion: checkin.readiness.methodVersion,
  },
});

/**
 * Los registros del paciente para su equipo de atención (RN-G01): se leen, no se editan. El profesional los corrige con un ajuste
 * que guarda autor y motivo (RN-G02), y las notas del paciente quedan leídas cuando alguien del equipo las abre (RN-G13).
 */
@Controller('patients/:patientId')
export class PatientRecordsController {
  constructor(
    private readonly queries: PatientRecordsQueries,
    private readonly commands: AdjustmentCommands,
  ) {}

  @Get('records/:date')
  @RequirePermission('patients.read')
  @Header('Cache-Control', 'no-store')
  async day(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Param('date') date: string,
  ): Promise<PatientDay> {
    const view = await this.queries.day(contextOf(request), patientId, dateOf(date));
    if (!view) throw notFound();
    return {
      localDate: view.localDate,
      foods: view.foods.map((log) => ({ ...log, loggedAt: log.loggedAt.toISOString() })),
      hydration: view.hydration.map((log) => ({ ...log, loggedAt: log.loggedAt.toISOString() })),
      notes: view.notes.map(noteOf),
      metrics: view.metrics.map((metric) => ({
        ...metric,
        metricCode: metric.metricCode as PatientDay['metrics'][number]['metricCode'],
      })),
      checkin: view.checkin && checkinOf(view.checkin),
      workouts: view.workouts.map((workout) => ({
        ...workout,
        sets: workout.sets.map(setOf),
      })),
      adjustments: view.adjustments.map(adjustmentOf),
      totals: view.totals,
      originalTotals: view.originalTotals,
      waterMl: view.waterMl,
      originalWaterMl: view.originalWaterMl,
    };
  }

  /** Las notas del paciente que nadie del equipo abrió (RN-G13). */
  @Get('app-notes/unread')
  @RequirePermission('patients.read')
  @Header('Cache-Control', 'no-store')
  async unreadNotes(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
  ): Promise<AppNotesResponse> {
    const notes = await this.queries.unreadNotes(contextOf(request), patientId);
    if (!notes) throw notFound();
    return { notes: notes.map(noteOf) };
  }

  @Post('app-notes/read')
  @RequirePermission('patients.read')
  @HttpCode(HttpStatus.OK)
  async markRead(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() body: unknown,
  ): Promise<{ marked: number }> {
    const { noteIds } = parseBody(markAppNotesReadSchema, body);
    const result = await this.commands.markNotesRead(contextOf(request), patientId, noteIds);
    if (isErr(result)) throw problem(result.error);
    return { marked: result.value.marked };
  }

  /** El ajuste del profesional (RN-G02): excluir o corregir, con su motivo. El registro original no cambia. */
  @Post('record-adjustments')
  @RequirePermission('patients.write')
  @HttpCode(HttpStatus.CREATED)
  async adjust(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() body: unknown,
  ): Promise<RecordAdjustment> {
    const result = await this.commands.adjust(
      contextOf(request),
      patientId,
      parseBody(adjustRecordSchema, body),
    );
    if (isErr(result)) throw problem(result.error);
    return adjustmentOf(result.value);
  }
}

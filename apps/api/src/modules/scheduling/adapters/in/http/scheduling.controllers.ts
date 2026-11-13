import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import {
  agendaQuerySchema,
  changeAppointmentStatusSchema,
  createAppointmentSchema,
  putAvailabilitySchema,
  updateAppointmentSchema,
  type AgendaResponse,
  type Appointment,
  type AvailabilityResponse,
  type MeAppointment,
  type MeAppointmentsResponse,
} from '@nutricoach/contracts';
import { CLOCK, isErr, type Clock } from '@nutricoach/shared-kernel';
import {
  parseBody,
  PatientOnly,
  ProblemException,
  RequirePermission,
  type ContextualRequest,
} from '../../../../../platform/index.js';
import { SchedulingCommands } from '../../../application/scheduling.commands.js';
import { SchedulingQueries } from '../../../application/scheduling.queries.js';
import { attendancePending, type AppointmentRecord } from '../../../domain/appointment.js';
import { contextOf, problem } from './scheduling-http.js';

const uuid = new ParseUUIDPipe({ version: '7' });
const anyUuid = new ParseUUIDPipe();

/** La versión de If-Match: sin ella, 428 (06 §5). */
function versionOf(ifMatch: string | undefined): number {
  const version = Number(ifMatch?.replaceAll('"', ''));
  if (!ifMatch || !Number.isInteger(version) || version < 0) {
    throw new ProblemException(428, { title: 'Falta la versión en If-Match.', code: 'NC-PLT-428' });
  }
  return version;
}

const appointmentOf = (appointment: AppointmentRecord, now: Date): Appointment => ({
  id: appointment.id,
  memberId: appointment.memberId,
  patientId: appointment.patientId,
  kind: appointment.kind,
  mode: appointment.mode,
  location: appointment.location,
  meetingUrl: appointment.meetingUrl,
  startsAt: appointment.startsAt.toISOString(),
  endsAt: appointment.endsAt.toISOString(),
  status: appointment.status,
  notes: appointment.notes,
  reminderSentAt: appointment.reminderSentAt?.toISOString() ?? null,
  attendancePending: attendancePending(appointment, now),
  createdAt: appointment.createdAt.toISOString(),
  version: appointment.version,
});

const myAppointmentOf = (appointment: AppointmentRecord): MeAppointment => ({
  id: appointment.id,
  kind: appointment.kind,
  mode: appointment.mode,
  location: appointment.location,
  meetingUrl: appointment.meetingUrl,
  startsAt: appointment.startsAt.toISOString(),
  endsAt: appointment.endsAt.toISOString(),
  status: appointment.status,
});

/** La agenda de la organización (RF-37, ADR-125): citas por rango de fechas locales, crear, reprogramar y cambiar de estado. */
@Controller('appointments')
export class AppointmentsController {
  constructor(
    private readonly commands: SchedulingCommands,
    private readonly queries: SchedulingQueries,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  @Get()
  @RequirePermission('agenda.read')
  async agenda(
    @Req() request: ContextualRequest,
    @Query() query: unknown,
  ): Promise<AgendaResponse> {
    const { from, to, memberId } = parseBody(agendaQuerySchema, query);
    const agenda = await this.queries.agenda(contextOf(request), from, to, memberId ?? null);
    const now = this.clock.now();
    return {
      timezone: agenda.timezone,
      appointments: agenda.appointments.map((a) => appointmentOf(a, now)),
    };
  }

  @Post()
  @RequirePermission('agenda.write')
  async book(@Req() request: ContextualRequest, @Body() body: unknown): Promise<Appointment> {
    const input = parseBody(createAppointmentSchema, body);
    const result = await this.commands.book(contextOf(request), {
      ...input,
      startsAt: new Date(input.startsAt),
      endsAt: new Date(input.endsAt),
    });
    if (isErr(result)) throw problem(result.error);
    return appointmentOf(result.value, this.clock.now());
  }

  @Get(':appointmentId')
  @RequirePermission('agenda.read')
  async one(
    @Req() request: ContextualRequest,
    @Param('appointmentId', uuid) appointmentId: string,
  ): Promise<Appointment> {
    const result = await this.queries.appointment(contextOf(request), appointmentId);
    if (isErr(result)) throw problem(result.error);
    return appointmentOf(result.value, this.clock.now());
  }

  @Patch(':appointmentId')
  @RequirePermission('agenda.write')
  async edit(
    @Req() request: ContextualRequest,
    @Param('appointmentId', uuid) appointmentId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: unknown,
  ): Promise<Appointment> {
    const version = versionOf(ifMatch);
    const input = parseBody(updateAppointmentSchema, body);
    const result = await this.commands.edit(contextOf(request), appointmentId, version, {
      ...input,
      startsAt: input.startsAt === undefined ? undefined : new Date(input.startsAt),
      endsAt: input.endsAt === undefined ? undefined : new Date(input.endsAt),
    });
    if (isErr(result)) throw problem(result.error);
    return appointmentOf(result.value, this.clock.now());
  }

  @Put(':appointmentId/status')
  @RequirePermission('agenda.write')
  async changeStatus(
    @Req() request: ContextualRequest,
    @Param('appointmentId', uuid) appointmentId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: unknown,
  ): Promise<Appointment> {
    const version = versionOf(ifMatch);
    const { status } = parseBody(changeAppointmentStatusSchema, body);
    const result = await this.commands.changeStatus(
      contextOf(request),
      appointmentId,
      version,
      status,
    );
    if (isErr(result)) throw problem(result.error);
    return appointmentOf(result.value, this.clock.now());
  }
}

/** La disponibilidad semanal de un profesional: la leen todos; la cambian él, el dueño o un administrador. */
@Controller('members/:memberId/availability')
export class AvailabilityController {
  constructor(
    private readonly commands: SchedulingCommands,
    private readonly queries: SchedulingQueries,
  ) {}

  @Get()
  @RequirePermission('agenda.read')
  async read(
    @Req() request: ContextualRequest,
    @Param('memberId', anyUuid) memberId: string,
  ): Promise<AvailabilityResponse> {
    const availability = await this.queries.availability(contextOf(request), memberId);
    return { memberId, timezone: availability.timezone, slots: [...availability.slots] };
  }

  @Put()
  @RequirePermission('agenda.write')
  async replace(
    @Req() request: ContextualRequest,
    @Param('memberId', anyUuid) memberId: string,
    @Body() body: unknown,
  ): Promise<AvailabilityResponse> {
    const { slots } = parseBody(putAvailabilitySchema, body);
    const context = contextOf(request);
    const result = await this.commands.replaceAvailability(context, memberId, slots);
    if (isErr(result)) throw problem(result.error);
    const availability = await this.queries.availability(context, memberId);
    return { memberId, timezone: availability.timezone, slots: [...availability.slots] };
  }
}

/** Las citas de un paciente en su expediente: las que el contexto ve (RN-A05). */
@Controller('patients/:patientId/appointments')
export class PatientAppointmentsController {
  constructor(
    private readonly queries: SchedulingQueries,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  @Get()
  @RequirePermission('patients.read')
  async list(
    @Req() request: ContextualRequest,
    @Param('patientId', uuid) patientId: string,
  ): Promise<AgendaResponse> {
    const result = await this.queries.patientAppointments(contextOf(request), patientId);
    if (isErr(result)) throw problem(result.error);
    const now = this.clock.now();
    return {
      timezone: result.value.timezone,
      appointments: result.value.appointments.map((a) => appointmentOf(a, now)),
    };
  }
}

/** Las citas del paciente en su app, sin las notas del profesional (02 §10). */
@Controller('me/appointments')
export class MeAppointmentsController {
  constructor(private readonly queries: SchedulingQueries) {}

  @Get()
  @PatientOnly()
  async mine(@Req() request: ContextualRequest): Promise<MeAppointmentsResponse> {
    const mine = await this.queries.myAppointments(contextOf(request));
    return {
      timezone: mine.timezone,
      upcoming: mine.upcoming.map(myAppointmentOf),
      past: mine.past.map(myAppointmentOf),
    };
  }
}

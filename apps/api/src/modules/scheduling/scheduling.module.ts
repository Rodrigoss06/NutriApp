import { Inject, Module, type OnModuleInit } from '@nestjs/common';
import { ClinicalApi } from '../clinical/index.js';
import { SchedulingMailConsumer } from './adapters/in/events/scheduling-mail.consumer.js';
import {
  AppointmentsController,
  AvailabilityController,
  MeAppointmentsController,
  PatientAppointmentsController,
} from './adapters/in/http/scheduling.controllers.js';
import { RemindersJob } from './adapters/in/jobs/reminders.job.js';
import { PrismaSchedulingStore } from './adapters/out/persistence/prisma-scheduling.store.js';
import { SCHEDULING_STORE } from './application/ports/scheduling.ports.js';
import { RemindersHandler } from './application/reminders.handler.js';
import { SchedulingApi } from './application/scheduling-api.js';
import { SchedulingCommands } from './application/scheduling.commands.js';
import { SchedulingQueries } from './application/scheduling.queries.js';
import { SchedulingTimelineSource } from './application/scheduling-timeline.js';

/**
 * scheduling (02 §2): la disponibilidad de los profesionales y sus citas (RF-37), con la exclusión de cruces en la base (RN-J01),
 * el recordatorio por correo 24 horas antes (RN-J02) y las horas en UTC (RN-J03). Solo la asistencia a las sesiones (P-32).
 */
@Module({
  controllers: [
    AppointmentsController,
    AvailabilityController,
    PatientAppointmentsController,
    MeAppointmentsController,
  ],
  providers: [
    SchedulingApi,
    SchedulingCommands,
    SchedulingQueries,
    RemindersHandler,
    RemindersJob,
    SchedulingTimelineSource,
    SchedulingMailConsumer,
    { provide: SCHEDULING_STORE, useClass: PrismaSchedulingStore },
  ],
  exports: [SchedulingApi],
})
export class SchedulingModule implements OnModuleInit {
  constructor(
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
    @Inject(SchedulingTimelineSource) private readonly timeline: SchedulingTimelineSource,
  ) {}

  /** Las citas suman sus hechos a la línea de tiempo del expediente (RF-10). */
  onModuleInit(): void {
    this.clinical.registerTimelineSource(this.timeline);
  }
}

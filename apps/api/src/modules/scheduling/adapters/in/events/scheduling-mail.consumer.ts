import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { CLOCK, type Clock, type OrganizationId } from '@nutricoach/shared-kernel';
import {
  ConsumerRegistry,
  MAILER,
  type EventConsumer,
  type MailerPort,
  type OutboxEnvelope,
} from '../../../../../platform/index.js';
import { ClinicalApi } from '../../../../clinical/index.js';
import { TenancyApi } from '../../../../tenancy/index.js';
import {
  SCHEDULING_STORE,
  type SchedulingStore,
} from '../../../application/ports/scheduling.ports.js';
import { reminderMail } from './reminder-mail.js';

/**
 * El correo del recordatorio desde el worker (RN-J02). El evento trae solo el id de la cita: el correo y el nombre del paciente se
 * leen aquí, en el contexto SYSTEM de la organización. Si la cita ya no está confirmada, ya empezó o el paciente no tiene correo,
 * no se envía nada. Si el envío falla, la cola reintenta.
 */
@Injectable()
export class SchedulingMailConsumer implements EventConsumer, OnModuleInit {
  readonly name = 'scheduling.mailer';
  readonly eventTypes = ['scheduling.reminder.requested'] as const;

  constructor(
    private readonly registry: ConsumerRegistry,
    @Inject(MAILER) private readonly mailer: MailerPort,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(SCHEDULING_STORE) private readonly store: SchedulingStore,
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
    @Inject(TenancyApi) private readonly tenancy: TenancyApi,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async handle(event: OutboxEnvelope): Promise<void> {
    if (!event.organizationId) return;
    const appointment = await this.store.find(event.aggregateId);
    if (appointment?.status !== 'CONFIRMED' || !appointment.patientId) return;
    if (appointment.startsAt.getTime() <= this.clock.now().getTime()) return;
    const contact = await this.clinical.reminderContact(appointment.patientId);
    if (!contact) return;
    const organization = await this.tenancy.organization(event.organizationId as OrganizationId);
    if (!organization) return;
    await this.mailer.send(
      reminderMail(
        contact.email,
        contact.firstName,
        organization.name,
        appointment,
        organization.timezone,
      ),
    );
  }
}

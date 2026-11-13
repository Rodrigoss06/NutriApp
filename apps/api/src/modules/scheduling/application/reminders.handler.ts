import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  ID_GENERATOR,
  OUTBOX,
  systemContext,
  UNIT_OF_WORK,
  type Clock,
  type IdGenerator,
  type Outbox,
  type SecurityContext,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import { TenancyApi } from '../../tenancy/index.js';
import { REMINDER_LEAD_MS, reminderDue } from '../domain/appointment.js';
import { SCHEDULING_STORE, type SchedulingStore } from './ports/scheduling.ports.js';
import { schedulingEvent } from './scheduling-events.js';

/** Contexto de plataforma para listar las organizaciones: la RLS de tenancy se lo permite a PLATFORM_ADMIN. */
const platformContext: SecurityContext = {
  organizationId: null,
  userId: null,
  role: 'PLATFORM_ADMIN',
  patientId: null,
};

/**
 * RN-J02 en el worker: las citas confirmadas que empiezan dentro de las próximas 24 horas y todavía no tienen recordatorio. Cada una
 * en su transacción, como SYSTEM de su organización: marca `reminder_sent_at` con bloqueo optimista y deja el pedido del correo en
 * el outbox, así un reintento no lo duplica. El correo lo envía el consumidor scheduling.mailer.
 */
@Injectable()
export class RemindersHandler {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(OUTBOX) private readonly outbox: Outbox,
    @Inject(TenancyApi) private readonly tenancy: TenancyApi,
    @Inject(SCHEDULING_STORE) private readonly store: SchedulingStore,
  ) {}

  async execute(): Promise<number> {
    const organizations = await this.uow.query(platformContext, () =>
      this.tenancy.organizationIds(),
    );
    let requested = 0;
    for (const organizationId of organizations) {
      const now = this.clock.now();
      const due = await this.uow.query(systemContext(organizationId), () =>
        this.store.dueReminders(now, new Date(now.getTime() + REMINDER_LEAD_MS)),
      );
      for (const appointment of due.filter((a) => reminderDue(a, now))) {
        const marked = await this.uow.run(systemContext(organizationId), async () => {
          if (
            !(await this.store.update(
              appointment.id,
              appointment.version,
              { reminderSentAt: now },
              now,
            ))
          ) {
            return false;
          }
          await this.outbox.append(
            [
              schedulingEvent(
                'scheduling.reminder.requested',
                organizationId,
                appointment.id,
                { patientId: appointment.patientId, memberId: appointment.memberId },
                { clock: this.clock, ids: this.ids },
              ),
            ],
            { actorUserId: null, actorRole: 'SYSTEM' },
          );
          return true;
        });
        if (marked) requested += 1;
      }
    }
    return requested;
  }
}

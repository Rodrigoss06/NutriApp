import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '@nutricoach/shared-kernel';
import { SCHEDULING_STORE, type SchedulingStore } from './ports/scheduling.ports.js';

/**
 * API pública de la agenda para otros contextos (02 §3), en la transacción de quien llama: analytics pide la próxima cita de cada
 * paciente para el panel del profesional (RF-34).
 */
@Injectable()
export class SchedulingApi {
  constructor(
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(SCHEDULING_STORE) private readonly store: SchedulingStore,
  ) {}

  /** La próxima cita programada o confirmada de cada paciente que el contexto ve. */
  nextAppointments(patientIds: readonly string[]): Promise<ReadonlyMap<string, Date>> {
    return this.store.nextForPatients(patientIds, this.clock.now());
  }
}

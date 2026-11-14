import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  err,
  ID_GENERATOR,
  ok,
  OUTBOX,
  UNIT_OF_WORK,
  type Clock,
  type DomainError,
  type IdGenerator,
  type Outbox,
  type Result,
  type SecurityContext,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import { FileRegistry } from '../../../../platform/index.js';
import { PATIENT_NOT_FOUND } from '../../domain/clinical-rules.js';
import { canSuppress } from '../../domain/patient-suppression.js';
import { clinicalEvent } from '../clinical-events.js';
import { PATIENT_STORE, type PatientStore } from '../ports/clinical.ports.js';
import { actorOf } from './patient.commands.js';

export interface Suppressed {
  /** Archivos del paciente borrados: fotos, expediente, evidencias, fichas y exportaciones. */
  readonly filesDeleted: number;
  /** De esos, los que no se pudieron borrar del almacenamiento: ya están marcados borrados y nadie los descarga. */
  readonly notDiscarded: number;
}

/**
 * La supresión del paciente (RF-07, RN-B05; ADR-124, ADR-133): el dueño la confirma con el código de un paciente archivado y
 * clinical.anonymize_patient anonimiza todo en la base, en una transacción. Después de confirmar se borran los bytes de sus archivos.
 * Irreversible: el paciente sigue archivado, sin datos que lo identifiquen, y no se reactiva.
 */
@Injectable()
export class PatientSuppressionCommands {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(PATIENT_STORE) private readonly patients: PatientStore,
    @Inject(FileRegistry) private readonly files: FileRegistry,
    @Inject(OUTBOX) private readonly outbox: Outbox,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  async suppress(
    context: SecurityContext,
    patientId: string,
    code: string,
  ): Promise<Result<Suppressed, DomainError>> {
    const actor = actorOf(context);
    const done = await this.uow.run(
      context,
      async (): Promise<Result<readonly string[], DomainError>> => {
        const patient = await this.patients.find(patientId);
        if (!patient) return err(PATIENT_NOT_FOUND);
        const denied = canSuppress(actor, patient, code);
        if (denied) return err(denied);
        const keys = await this.patients.anonymize(patient.id);
        await this.outbox.append(
          [
            clinicalEvent(
              'clinical.patient.anonymized',
              actor.organizationId,
              patient.id,
              { patientId: patient.id, filesDeleted: keys.length },
              { clock: this.clock, ids: this.ids },
            ),
          ],
          { actorUserId: actor.userId, actorRole: context.role },
        );
        return ok(keys);
      },
    );
    if (!done.ok) return done;
    let notDiscarded = 0;
    for (const key of done.value) {
      try {
        await this.files.discard(key);
      } catch {
        notDiscarded += 1;
      }
    }
    return ok({ filesDeleted: done.value.length, notDiscarded });
  }
}

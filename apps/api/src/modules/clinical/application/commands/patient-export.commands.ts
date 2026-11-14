import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  err,
  ID_GENERATOR,
  ok,
  OUTBOX,
  systemContext,
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
import { TenancyApi } from '../../../tenancy/index.js';
import { PATIENT_NOT_FOUND } from '../../domain/clinical-rules.js';
import {
  canRequestExport,
  EXPORT_STALE_MS,
  reusablePending,
  type ExportRequesterRole,
  type PatientExportRecord,
} from '../../domain/patient-export.js';
import { clinicalEvent } from '../clinical-events.js';
import { PATIENT_STORE, type PatientStore } from '../ports/clinical.ports.js';
import { PATIENT_EXPORT_STORE, type PatientExportStore } from '../ports/patient-export.ports.js';
import { actorOf } from './patient.commands.js';

/** Contexto de plataforma para listar las organizaciones: la RLS de tenancy se lo permite a PLATFORM_ADMIN. */
const platformContext: SecurityContext = {
  organizationId: null,
  userId: null,
  role: 'PLATFORM_ADMIN',
  patientId: null,
};

export interface RequestedExport {
  readonly export: PatientExportRecord;
  /** false si ya había uno pendiente de quien pide: se devuelve ese. */
  readonly created: boolean;
}

/**
 * Pedir la exportación del paciente (RF-07, RN-B04; ADR-131): el responsable o el dueño desde el panel, o el paciente desde su app.
 * Vale en solo lectura: exportar no es editar (RN-A02). El worker la arma (PatientExportBuilder) y un trabajo de cada hora borra el
 * archivo de las que vencieron y da por fallidas las que no terminaron.
 */
@Injectable()
export class PatientExportCommands {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(PATIENT_EXPORT_STORE) private readonly store: PatientExportStore,
    @Inject(PATIENT_STORE) private readonly patients: PatientStore,
    @Inject(FileRegistry) private readonly files: FileRegistry,
    @Inject(TenancyApi) private readonly tenancy: TenancyApi,
    @Inject(OUTBOX) private readonly outbox: Outbox,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  /** Desde el panel: el paciente con la RLS del equipo (RN-A05) y, de ese equipo, el responsable o el dueño. */
  request(
    context: SecurityContext,
    patientId: string,
  ): Promise<Result<RequestedExport, DomainError>> {
    const actor = actorOf(context);
    return this.uow.run(context, async () => {
      const patient = await this.patients.find(patientId);
      if (!patient) return err(PATIENT_NOT_FOUND);
      const denied = canRequestExport(actor, patient);
      if (denied) return err(denied);
      return ok(await this.#request(context, patient.id, 'STAFF', actor.memberId));
    });
  }

  /** Desde la app: el paciente de la sesión, nunca uno de la petición (02 §10). */
  requestAsPatient(
    context: SecurityContext & { patientId: string },
  ): Promise<Result<RequestedExport, DomainError>> {
    return this.uow.run(context, async () =>
      ok(await this.#request(context, context.patientId, 'PATIENT', null)),
    );
  }

  async #request(
    context: SecurityContext,
    patientId: string,
    role: ExportRequesterRole,
    memberId: string | null,
  ): Promise<RequestedExport> {
    const { organizationId, userId } = context;
    if (!organizationId || !userId)
      throw new Error('Una exportación necesita la organización y quien la pide.');
    const now = this.clock.now();
    const recent = await this.store.listByRequester(
      patientId,
      userId,
      new Date(now.getTime() - EXPORT_STALE_MS),
    );
    const pending = reusablePending(recent, now);
    if (pending) return { export: pending, created: false };
    const record = {
      id: this.ids.newId<'PatientExportId'>(),
      organizationId,
      patientId,
      requestedBy: userId,
      requestedByRole: role,
      requestedByMember: memberId,
      createdAt: now,
    };
    await this.store.insert(record);
    await this.outbox.append(
      [
        clinicalEvent(
          'clinical.export.requested',
          organizationId,
          record.id,
          { patientId, requestedByRole: role },
          { clock: this.clock, ids: this.ids },
        ),
      ],
      { actorUserId: userId, actorRole: context.role },
    );
    return {
      export: {
        ...record,
        status: 'PENDING',
        fileId: null,
        sizeBytes: null,
        readyAt: null,
        expiresAt: null,
      },
      created: true,
    };
  }

  /**
   * El trabajo de cada hora, en cada organización como SYSTEM: borra el archivo de las listas que vencieron (sus bytes, después de
   * confirmar) y da por fallidas las pendientes de hace más de una hora. Devuelve cuántas cerró y cuántos archivos no se pudieron
   * borrar del almacenamiento (ya están marcados borrados: nadie los descarga).
   */
  async closeDue(): Promise<{ readonly closed: number; readonly notDiscarded: number }> {
    const organizations = await this.uow.query(platformContext, () =>
      this.tenancy.organizationIds(),
    );
    let closed = 0;
    let notDiscarded = 0;
    for (const organizationId of organizations) {
      const now = this.clock.now();
      const retired = await this.uow.run(systemContext(organizationId), async () => {
        const due = await this.store.toClose(now, new Date(now.getTime() - EXPORT_STALE_MS));
        const keys: string[] = [];
        for (const record of due.expired) {
          const key = record.fileId ? await this.files.retire(record.fileId, now) : null;
          if (key) keys.push(key);
          await this.store.close(record.id, 'EXPIRED');
        }
        for (const record of due.stale) await this.store.close(record.id, 'FAILED');
        closed += due.expired.length + due.stale.length;
        return keys;
      });
      for (const key of retired) {
        try {
          await this.files.discard(key);
        } catch {
          notDiscarded += 1;
        }
      }
    }
    return { closed, notDiscarded };
  }
}

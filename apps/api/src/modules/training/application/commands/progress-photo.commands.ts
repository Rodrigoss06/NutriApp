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
  systemContext,
} from '@nutricoach/shared-kernel';
import { atomically, FileRegistry } from '../../../../platform/index.js';
import { ClinicalApi, PATIENT_ARCHIVED, PATIENT_NOT_FOUND } from '../../../clinical/index.js';
import {
  PHOTO_MESOCYCLE_NOT_FOUND,
  PHOTO_MIME_TYPES,
  PHOTO_UNSUPPORTED,
  photosOpen,
  PHOTOS_NOT_OPEN,
  type PhotoView,
} from '../../domain/progress-photo.js';
import { MesocycleReportBuilder } from '../mesocycle-report-builder.js';
import { PROGRESS_PHOTO_STORE, type ProgressPhotoStore } from '../ports/progress-photo.ports.js';
import { trainingEvent } from '../training-events.js';

const localDateOf = (instant: Date, timeZone: string): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone }).format(instant);

type Uploader = 'PATIENT' | 'STAFF';

/**
 * Las fotos de progreso (P14.5, PR 6b; P-30; RN-G20; ADR-119). Las suben el alumno desde su app y el coach desde el panel, tres
 * vistas por mesociclo del programa publicado, desde su última semana; subir otra la reemplaza y el archivo anterior se borra.
 * Exigen HEALTH_DATA (RN-B01) y su consentimiento propio vigente. Los bytes se escriben antes de la transacción y se descartan si
 * esta falla (ADR-038). Al archivar al alumno o al revocar, `purge` las borra todas.
 */
@Injectable()
export class ProgressPhotoCommands {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(OUTBOX) private readonly outbox: Outbox,
    @Inject(FileRegistry) private readonly files: FileRegistry,
    @Inject(PROGRESS_PHOTO_STORE) private readonly photos: ProgressPhotoStore,
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
    @Inject(MesocycleReportBuilder) private readonly builder: MesocycleReportBuilder,
  ) {}

  /** El coach, desde el panel: con acceso de escritura en el expediente (RN-A05). */
  uploadAsStaff(
    context: SecurityContext,
    patientId: string,
    position: number,
    view: PhotoView,
    content: Uint8Array,
  ): Promise<Result<{ id: string }, DomainError>> {
    return this.#upload(context, patientId, 'STAFF', position, view, content);
  }

  /** El alumno, desde su app: sale de la sesión. */
  uploadAsPatient(
    context: SecurityContext,
    position: number,
    view: PhotoView,
    content: Uint8Array,
  ): Promise<Result<{ id: string }, DomainError>> {
    if (!context.patientId) return Promise.resolve(err(PATIENT_NOT_FOUND));
    return this.#upload(context, context.patientId, 'PATIENT', position, view, content);
  }

  /**
   * Borra todas las fotos del paciente y marca borrados sus archivos (RN-G20): al archivarlo o cuando revoca el consentimiento. En la
   * transacción de quien llama; devuelve las claves de los bytes para descartarlos. Sin fotos, no hace nada.
   */
  async purge(
    patientId: string,
  ): Promise<{ readonly removed: number; readonly keys: readonly string[] }> {
    const removed = await this.photos.deleteOfPatient(patientId);
    const now = this.clock.now();
    const keys: string[] = [];
    for (const photo of removed) {
      const key = await this.files.retire(photo.fileId, now);
      if (key) keys.push(key);
    }
    return { removed: removed.length, keys };
  }

  async #upload(
    context: SecurityContext,
    patientId: string,
    uploader: Uploader,
    position: number,
    view: PhotoView,
    content: Uint8Array,
  ): Promise<Result<{ id: string }, DomainError>> {
    const { organizationId, userId } = context;
    if (!organizationId || !userId) throw new Error('Una foto necesita quién la sube.');
    const lookup = () => this.builder.publishedMesocycle(patientId, position);
    // El alumno no lee training.program: su app lee la copia vigente (05.2). Su programa publicado, solo el suyo, lo busca el
    // sistema antes de abrir la transacción del alumno.
    const preloaded =
      uploader === 'PATIENT'
        ? await this.uow.query(systemContext(organizationId), lookup)
        : undefined;
    if (preloaded === null) return err(PHOTO_MESOCYCLE_NOT_FOUND);
    const file = await this.files.write(organizationId, content);
    if (!file) return err(PHOTO_UNSUPPORTED);
    if (!PHOTO_MIME_TYPES.has(file.mimeType)) {
      await this.files.discard(file.key);
      return err(PHOTO_UNSUPPORTED);
    }
    try {
      const result = await atomically<{ id: string; replacedKey: string | null }>(
        this.uow,
        context,
        async () => {
          const access = await this.#access(context, patientId, uploader);
          if (!access.ok) return access;
          const consent = await this.clinical.ensureProgressPhotosConsent(patientId);
          if (!consent.ok) return consent;
          const found = preloaded ?? (await lookup());
          if (!found) return err(PHOTO_MESOCYCLE_NOT_FOUND);
          const now = this.clock.now();
          if (!photosOpen(found.mesocycle, localDateOf(now, access.value.timezone))) {
            return err(PHOTOS_NOT_OPEN);
          }
          await this.files.register({
            ...file,
            sizeBytes: content.byteLength,
            organizationId,
            purpose: 'PROGRESS_PHOTO',
            uploadedBy: userId,
          });
          const existing = await this.photos.byView(found.lineageId, position, view);
          const uploaded = {
            fileId: file.id,
            uploadedBy: userId,
            uploadedByRole: uploader,
            uploadedAt: now,
          };
          let id: string;
          let replacedKey: string | null = null;
          if (existing) {
            // Se marca borrado mientras la foto todavía lo nombra: así la RLS del alumno lo deja.
            replacedKey = await this.files.retire(existing.fileId, now);
            await this.photos.replace(existing.id, uploaded);
            id = existing.id;
          } else {
            id = this.ids.newId<'ProgressPhotoId'>();
            await this.photos.insert({
              id,
              organizationId,
              patientId,
              programLineageId: found.lineageId,
              mesocyclePosition: position,
              view,
              ...uploaded,
            });
          }
          await this.outbox.append(
            [
              trainingEvent(
                'training.photo.uploaded',
                organizationId,
                id,
                { patientId, mesocyclePosition: position, view, replaced: existing !== null },
                { clock: this.clock, ids: this.ids },
              ),
            ],
            { actorUserId: userId, actorRole: context.role },
          );
          return ok({ id, replacedKey });
        },
      );
      if (!result.ok) {
        await this.files.discard(file.key);
        return result;
      }
      // Los bytes de la foto reemplazada se descartan después de confirmar (ADR-038).
      if (result.value.replacedKey) await this.files.discard(result.value.replacedKey);
      return ok({ id: result.value.id });
    } catch (error) {
      await this.files.discard(file.key);
      throw error;
    }
  }

  /** El coach necesita escribir en el expediente; el alumno, estar activo y HEALTH_DATA vigente. */
  async #access(
    context: SecurityContext,
    patientId: string,
    uploader: Uploader,
  ): Promise<Result<{ timezone: string }, DomainError>> {
    if (uploader === 'STAFF') return this.clinical.ensureRecordWritable(context, patientId);
    const patient = await this.clinical.patientRef(patientId);
    if (!patient) return err(PATIENT_NOT_FOUND);
    if (patient.status === 'ARCHIVED') return err(PATIENT_ARCHIVED);
    const health = await this.clinical.ensureHealthDataConsent(patientId);
    return health.ok ? ok({ timezone: patient.timezone }) : health;
  }
}

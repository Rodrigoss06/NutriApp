import { Inject, Injectable } from '@nestjs/common';
import {
  AUDIT_PORT,
  CLOCK,
  err,
  ok,
  UNIT_OF_WORK,
  type AuditPort,
  type Clock,
  type DomainError,
  type Id,
  type PatientId,
  type Result,
  type SecurityContext,
  type UnitOfWork,
  systemContext,
} from '@nutricoach/shared-kernel';
import { FileRegistry } from '../../../../platform/index.js';
import { ClinicalApi, PATIENT_NOT_FOUND } from '../../../clinical/index.js';
import { reportMesocycle, type ReportMesocycle } from '../../domain/mesocycle-report.js';
import { photosOpen, type ProgressPhotoRecord } from '../../domain/progress-photo.js';
import { PROGRAM_STORE, type ProgramStore } from '../ports/program.ports.js';
import { PROGRESS_PHOTO_STORE, type ProgressPhotoStore } from '../ports/progress-photo.ports.js';
import { WEEKLY_REVIEW_STORE, type WeeklyReviewStore } from '../ports/weekly-review.ports.js';

const localDateOf = (instant: Date, timeZone: string): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone }).format(instant);

export interface PhotoProgramView {
  readonly lineageId: string;
  readonly name: string;
  /** El programa publicado del alumno: el único donde se suben fotos. */
  readonly current: boolean;
  readonly mesocycles: readonly {
    readonly position: number;
    readonly name: string;
    readonly startDate: string;
    readonly endDate: string;
    /** Si ya se suben sus fotos: desde su última semana y solo en el programa publicado (RN-G20). */
    readonly open: boolean;
  }[];
}

export interface ProgressPhotosView {
  /** Con el consentimiento revocado o el alumno archivado, no se ve ninguna foto (RN-G20). */
  readonly consentActive: boolean;
  readonly programs: readonly PhotoProgramView[];
  readonly photos: readonly Omit<
    ProgressPhotoRecord,
    'organizationId' | 'patientId' | 'fileId' | 'uploadedBy'
  >[];
}

export interface PhotoFile {
  readonly content: Buffer;
  readonly mimeType: string;
  readonly view: ProgressPhotoRecord['view'];
}

/**
 * Las fotos de progreso (P14.5, PR 6b; RN-G20; ADR-119): para el equipo de atención, con su RLS (RN-A05), y para el alumno, las
 * suyas. Solo se ven con el alumno activo y su consentimiento vigente. Cada lectura queda en la auditoría (RN-B03).
 */
@Injectable()
export class ProgressPhotoQueries {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(FileRegistry) private readonly files: FileRegistry,
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
    @Inject(PROGRESS_PHOTO_STORE) private readonly photos: ProgressPhotoStore,
    @Inject(PROGRAM_STORE) private readonly programs: ProgramStore,
    @Inject(WEEKLY_REVIEW_STORE) private readonly reviews: WeeklyReviewStore,
  ) {}

  async list(
    context: SecurityContext,
    patientId: string | null,
  ): Promise<Result<ProgressPhotosView, DomainError>> {
    const base = await this.uow.query(context, async () => {
      const patient = patientId ? await this.clinical.patientRef(patientId) : null;
      if (!patientId || !patient) return null;
      await this.audit.record(context, {
        action: 'READ',
        resourceType: 'training.progress_photo',
        resourceId: patientId as Id<string>,
        patientId: patientId as PatientId,
      });
      const consentActive =
        patient.status !== 'ARCHIVED' &&
        (await this.clinical.ensureProgressPhotosConsent(patientId)).ok;
      const photos = consentActive ? await this.photos.ofPatient(patientId) : [];
      return { patientId, timezone: patient.timezone, consentActive, photos };
    });
    if (!base) return err(PATIENT_NOT_FOUND);
    const { consentActive, photos } = base;
    // El alumno no lee training.program: su app lee la copia vigente (05.2). Sus programas, solo los suyos, los lee el sistema.
    const programContext =
      context.role === 'PATIENT' && context.organizationId
        ? systemContext(context.organizationId)
        : context;
    const programs = await this.uow.query(programContext, async () => {
      const current = (await this.reviews.publishedProgramOf(base.patientId))?.lineageId ?? null;
      const lineages = [
        ...new Set([...(current ? [current] : []), ...photos.map((p) => p.programLineageId)]),
      ];
      const today = localDateOf(this.clock.now(), base.timezone);
      const found: PhotoProgramView[] = [];
      for (const lineageId of lineages) {
        const snapshot = await this.programs.latestSnapshot(lineageId);
        if (snapshot?.patientId !== base.patientId) continue;
        const mesocycles = snapshot.mesocycles
          .map((mesocycle) => reportMesocycle(snapshot, mesocycle.position))
          .filter((mesocycle): mesocycle is ReportMesocycle => mesocycle !== null)
          .sort((a, b) => a.position - b.position);
        found.push({
          lineageId,
          name: snapshot.name,
          current: lineageId === current,
          mesocycles: mesocycles.map((mesocycle) => ({
            position: mesocycle.position,
            name: mesocycle.name,
            startDate: mesocycle.startDate,
            endDate: mesocycle.endDate,
            open: lineageId === current && consentActive && photosOpen(mesocycle, today),
          })),
        });
      }
      return found;
    });
    return ok({
      consentActive,
      programs,
      photos: photos.map(
        ({ id, programLineageId, mesocyclePosition, view, uploadedByRole, uploadedAt }) => ({
          id,
          programLineageId,
          mesocyclePosition,
          view,
          uploadedByRole,
          uploadedAt,
        }),
      ),
    });
  }

  /** Una foto: con el alumno activo y su consentimiento vigente; si no, como si no existiera. */
  file(context: SecurityContext, photoId: string): Promise<PhotoFile | null> {
    return this.uow.query(context, async () => {
      const photo = await this.photos.find(photoId);
      if (!photo || (context.role === 'PATIENT' && photo.patientId !== context.patientId)) {
        return null;
      }
      const patient = await this.clinical.patientRef(photo.patientId);
      if (!patient || patient.status === 'ARCHIVED') return null;
      if (!(await this.clinical.ensureProgressPhotosConsent(photo.patientId)).ok) return null;
      const file = await this.files.read(photo.fileId);
      if (!file) return null;
      await this.audit.record(context, {
        action: 'READ',
        resourceType: 'training.progress_photo',
        resourceId: photo.id as Id<string>,
        patientId: photo.patientId as PatientId,
      });
      return { content: file.content, mimeType: file.mimeType, view: photo.view };
    });
  }
}

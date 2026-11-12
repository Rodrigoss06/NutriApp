import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { Db } from '../../../../../platform/index.js';
import type { ProgressPhotoStore } from '../../../application/ports/progress-photo.ports.js';
import type { PhotoView, ProgressPhotoRecord } from '../../../domain/progress-photo.js';

type PhotoRow = Awaited<
  ReturnType<PrismaProgressPhotoStore['db']['tx']['progressPhoto']['findFirstOrThrow']>
>;

const toPhoto = (row: PhotoRow): ProgressPhotoRecord => ({
  id: row.id,
  organizationId: row.organizationId,
  patientId: row.patientId,
  programLineageId: row.programLineageId,
  mesocyclePosition: row.mesocyclePosition,
  view: row.view as PhotoView,
  fileId: row.fileId,
  uploadedBy: row.uploadedBy,
  uploadedByRole: row.uploadedByRole as ProgressPhotoRecord['uploadedByRole'],
  uploadedAt: row.uploadedAt,
});

/** training.progress_photo (ADR-119): sin RETURNING, porque el alumno escribe y la RLS decide qué ve. */
@Injectable()
export class PrismaProgressPhotoStore implements ProgressPhotoStore {
  constructor(@Inject(TransactionHost) readonly db: Db) {}

  async insert(photo: ProgressPhotoRecord): Promise<void> {
    await this.db.tx.progressPhoto.createMany({ data: [{ ...photo }] });
  }

  async find(id: string): Promise<ProgressPhotoRecord | null> {
    const row = await this.db.tx.progressPhoto.findUnique({ where: { id } });
    return row ? toPhoto(row) : null;
  }

  async byView(
    lineageId: string,
    position: number,
    view: PhotoView,
  ): Promise<ProgressPhotoRecord | null> {
    const row = await this.db.tx.progressPhoto.findFirst({
      where: { programLineageId: lineageId, mesocyclePosition: position, view },
    });
    return row ? toPhoto(row) : null;
  }

  async replace(
    id: string,
    file: {
      readonly fileId: string;
      readonly uploadedBy: string;
      readonly uploadedByRole: 'PATIENT' | 'STAFF';
      readonly uploadedAt: Date;
    },
  ): Promise<void> {
    await this.db.tx.progressPhoto.updateMany({ where: { id }, data: { ...file } });
  }

  async ofPatient(patientId: string): Promise<readonly ProgressPhotoRecord[]> {
    const rows = await this.db.tx.progressPhoto.findMany({
      where: { patientId },
      orderBy: [{ mesocyclePosition: 'asc' }, { view: 'asc' }],
    });
    return rows.map(toPhoto);
  }

  async deleteOfPatient(patientId: string): Promise<readonly ProgressPhotoRecord[]> {
    const rows = await this.db.tx.progressPhoto.findMany({ where: { patientId } });
    if (rows.length > 0) await this.db.tx.progressPhoto.deleteMany({ where: { patientId } });
    return rows.map(toPhoto);
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { Db } from '../../../../../platform/index.js';
import type {
  NewRecordDocument,
  RecordDocumentChanges,
  RecordDocumentRecord,
  RecordDocumentStore,
} from '../../../application/ports/record-document.ports.js';
import type {
  DocumentActor,
  RecordDocumentCategory,
  RecordDocumentStatus,
} from '../../../domain/record-document.js';

const WITH_FILE = { fileObject: { select: { mimeType: true, sizeBytes: true } } } as const;

/** Lo que se lee de una fila con su archivo (WITH_FILE). */
interface DocumentRow {
  readonly id: string;
  readonly organizationId: string;
  readonly patientId: string;
  readonly category: string;
  readonly title: string;
  readonly status: string;
  readonly linkUrl: string | null;
  readonly fileId: string | null;
  readonly reviewNote: string | null;
  readonly createdBy: string;
  readonly createdByRole: string;
  readonly createdAt: Date;
  readonly contentByRole: string | null;
  readonly contentAt: Date | null;
  readonly reviewedAt: Date | null;
  readonly version: number;
  readonly fileObject: { readonly mimeType: string; readonly sizeBytes: bigint } | null;
}

const toDocument = (row: DocumentRow): RecordDocumentRecord => ({
  id: row.id,
  organizationId: row.organizationId,
  patientId: row.patientId,
  category: row.category as RecordDocumentCategory,
  title: row.title,
  status: row.status as RecordDocumentStatus,
  linkUrl: row.linkUrl,
  fileId: row.fileId,
  file: row.fileObject
    ? { mimeType: row.fileObject.mimeType, sizeBytes: Number(row.fileObject.sizeBytes) }
    : null,
  reviewNote: row.reviewNote,
  createdBy: row.createdBy,
  createdByRole: row.createdByRole as DocumentActor,
  createdAt: row.createdAt,
  contentByRole: row.contentByRole as DocumentActor | null,
  contentAt: row.contentAt,
  reviewedAt: row.reviewedAt,
  version: row.version,
});

/**
 * clinical.record_document (ADR-122): sin RETURNING, porque el alumno escribe y la RLS decide qué ve. Los borrados no se leen: la
 * fila queda solo como rastro de quién la borró y cuándo.
 */
@Injectable()
export class PrismaRecordDocumentStore implements RecordDocumentStore {
  constructor(@Inject(TransactionHost) readonly db: Db) {}

  async insert(document: NewRecordDocument): Promise<void> {
    const { content, ...row } = document;
    await this.db.tx.recordDocument.createMany({
      data: [
        {
          ...row,
          contentBy: content?.by ?? null,
          contentByRole: content?.role ?? null,
          contentAt: content ? document.createdAt : null,
        },
      ],
    });
  }

  async find(id: string): Promise<RecordDocumentRecord | null> {
    const row = await this.db.tx.recordDocument.findFirst({
      where: { id, deletedAt: null },
      include: WITH_FILE,
    });
    return row ? toDocument(row) : null;
  }

  async listOfPatient(patientId: string): Promise<readonly RecordDocumentRecord[]> {
    const rows = await this.db.tx.recordDocument.findMany({
      where: { patientId, deletedAt: null },
      include: WITH_FILE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(toDocument);
  }

  async update(
    id: string,
    expectedVersion: number,
    changes: RecordDocumentChanges,
  ): Promise<boolean> {
    const { count } = await this.db.tx.recordDocument.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data: {
        version: expectedVersion + 1,
        ...(changes.status ? { status: changes.status } : {}),
        ...(changes.content
          ? {
              linkUrl: changes.content.linkUrl,
              fileId: changes.content.fileId,
              contentBy: changes.content.by,
              contentByRole: changes.content.role,
              contentAt: changes.content.at,
            }
          : {}),
        ...(changes.reviewNote === undefined ? {} : { reviewNote: changes.reviewNote }),
        ...(changes.reviewed
          ? { reviewedBy: changes.reviewed.by, reviewedAt: changes.reviewed.at }
          : {}),
        ...(changes.deleted
          ? {
              deletedBy: changes.deleted.by,
              deletedAt: changes.deleted.at,
              linkUrl: null,
              fileId: null,
            }
          : {}),
      },
    });
    return count === 1;
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { OrganizationId, UserId } from '@nutricoach/shared-kernel';
import type { Db } from '../../../../../platform/index.js';
import type {
  DocumentKey,
  DocumentStore,
  GeneratedDocumentRecord,
} from '../../../application/ports/documents.ports.js';
import type { SheetKind, SourceType } from '../../../domain/sheet.js';

const bytes = (hex: string): Uint8Array<ArrayBuffer> => new Uint8Array(Buffer.from(hex, 'hex'));
const hex = (value: Uint8Array): string => Buffer.from(value).toString('hex');

interface DocumentRow {
  id: string;
  organizationId: string;
  patientId: string;
  kind: string;
  sourceType: string;
  sourceId: string;
  sourceHash: Uint8Array;
  templateVersion: string;
  brandingHash: Uint8Array;
  fileId: string;
  sha256: Uint8Array;
  generatedBy: string;
  generatedAt: Date;
}

const recordOf = (row: DocumentRow): GeneratedDocumentRecord => ({
  id: row.id,
  organizationId: row.organizationId as OrganizationId,
  patientId: row.patientId,
  kind: row.kind as SheetKind,
  sourceType: row.sourceType as SourceType,
  sourceId: row.sourceId,
  sourceHash: hex(row.sourceHash),
  templateVersion: row.templateVersion,
  brandingHash: hex(row.brandingHash),
  fileId: row.fileId,
  sha256: hex(row.sha256),
  generatedBy: row.generatedBy as UserId,
  generatedAt: row.generatedAt,
});

/** documents.template y generated_document con la transacción de la UnitOfWork (RLS y equipo de atención). */
@Injectable()
export class PrismaDocumentStore implements DocumentStore {
  constructor(@Inject(TransactionHost) private readonly db: Db) {}

  async activeTemplateVersion(kind: SheetKind): Promise<string | null> {
    // La RLS de catálogo deja ver la global y la propia; la propia va primero.
    const template = await this.db.tx.documentTemplate.findFirst({
      where: { kind, status: 'ACTIVE' },
      orderBy: { organizationId: { sort: 'asc', nulls: 'last' } },
      select: { version: true },
    });
    return template?.version ?? null;
  }

  async findByKey(key: DocumentKey): Promise<GeneratedDocumentRecord | null> {
    const row = await this.db.tx.generatedDocument.findFirst({
      where: {
        kind: key.kind,
        sourceType: key.sourceType,
        sourceId: key.sourceId,
        sourceHash: bytes(key.sourceHash),
        templateVersion: key.templateVersion,
        brandingHash: bytes(key.brandingHash),
      },
    });
    return row ? recordOf(row) : null;
  }

  async find(id: string): Promise<GeneratedDocumentRecord | null> {
    const row = await this.db.tx.generatedDocument.findUnique({ where: { id } });
    return row ? recordOf(row) : null;
  }

  async insert(record: GeneratedDocumentRecord): Promise<boolean> {
    const { count } = await this.db.tx.generatedDocument.createMany({
      data: [
        {
          id: record.id,
          organizationId: record.organizationId,
          patientId: record.patientId,
          kind: record.kind,
          sourceType: record.sourceType,
          sourceId: record.sourceId,
          sourceHash: bytes(record.sourceHash),
          templateVersion: record.templateVersion,
          brandingHash: bytes(record.brandingHash),
          fileId: record.fileId,
          sha256: bytes(record.sha256),
          generatedBy: record.generatedBy,
          generatedAt: record.generatedAt,
        },
      ],
      skipDuplicates: true,
    });
    return count === 1;
  }
}

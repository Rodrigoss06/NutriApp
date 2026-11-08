import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { Db } from '../../../../../platform/index.js';
import type {
  AssignmentView,
  ResourceStore,
  ResourceSummary,
} from '../../../application/ports/resources.ports.js';
import type {
  ResourceChanges,
  ResourceKind,
  ResourceRecord,
  ResourceStatus,
} from '../../../domain/resources.js';

const SUMMARY = {
  id: true,
  kind: true,
  title: true,
  fileId: true,
  url: true,
  tags: true,
  status: true,
  createdBy: true,
  createdAt: true,
} as const;

interface SummaryModel {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly fileId: string | null;
  readonly url: string | null;
  readonly tags: string[];
  readonly status: string;
  readonly createdBy: string;
  readonly createdAt: Date;
}

const toSummary = (row: SummaryModel): Omit<ResourceRecord, 'bodyMarkdown'> => ({
  id: row.id,
  kind: row.kind as ResourceKind,
  title: row.title,
  fileId: row.fileId,
  url: row.url,
  tags: row.tags,
  status: row.status as ResourceStatus,
  createdBy: row.createdBy,
  createdAt: row.createdAt,
});

@Injectable()
export class PrismaResourceStore implements ResourceStore {
  constructor(@Inject(TransactionHost) private readonly db: Db) {}

  async library(status: ResourceStatus | null): Promise<readonly ResourceSummary[]> {
    const rows = await this.db.tx.educationalResource.findMany({
      where: status ? { status } : {},
      select: { ...SUMMARY, _count: { select: { resourceAssignments: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map((row) => ({
      ...toSummary(row),
      assignedCount: row._count.resourceAssignments,
    }));
  }

  async find(id: string): Promise<ResourceRecord | null> {
    const row = await this.db.tx.educationalResource.findUnique({
      where: { id },
      select: { ...SUMMARY, bodyMarkdown: true },
    });
    return row ? { ...toSummary(row), bodyMarkdown: row.bodyMarkdown } : null;
  }

  async insert(row: ResourceRecord & { readonly organizationId: string }): Promise<void> {
    await this.db.tx.educationalResource.createMany({
      data: [
        {
          id: row.id,
          organizationId: row.organizationId,
          title: row.title,
          kind: row.kind,
          fileId: row.fileId,
          url: row.url,
          bodyMarkdown: row.bodyMarkdown,
          tags: [...row.tags],
          status: row.status,
          createdBy: row.createdBy,
          createdAt: row.createdAt,
        },
      ],
    });
  }

  async update(id: string, changes: ResourceChanges): Promise<void> {
    const { tags, ...rest } = changes;
    await this.db.tx.educationalResource.updateMany({
      where: { id },
      data: { ...rest, ...(tags ? { tags: [...tags] } : {}) },
    });
  }

  async assignments(patientId: string, activeOnly: boolean): Promise<readonly AssignmentView[]> {
    const rows = await this.db.tx.resourceAssignment.findMany({
      where: {
        patientId,
        ...(activeOnly ? { educationalResource: { status: 'ACTIVE' } } : {}),
      },
      select: { assignedAt: true, viewedAt: true, educationalResource: { select: SUMMARY } },
      orderBy: [{ assignedAt: 'desc' }, { resourceId: 'desc' }],
    });
    return rows.map((row) => ({
      resource: toSummary(row.educationalResource),
      assignedAt: row.assignedAt,
      viewedAt: row.viewedAt,
    }));
  }

  async assignment(resourceId: string, patientId: string): Promise<AssignmentView | null> {
    const row = await this.db.tx.resourceAssignment.findUnique({
      where: { resourceId_patientId: { resourceId, patientId } },
      select: { assignedAt: true, viewedAt: true, educationalResource: { select: SUMMARY } },
    });
    return row
      ? {
          resource: toSummary(row.educationalResource),
          assignedAt: row.assignedAt,
          viewedAt: row.viewedAt,
        }
      : null;
  }

  async assign(row: {
    resourceId: string;
    patientId: string;
    organizationId: string;
    assignedBy: string;
    assignedAt: Date;
  }): Promise<boolean> {
    const { count } = await this.db.tx.resourceAssignment.createMany({
      data: [row],
      skipDuplicates: true,
    });
    return count > 0;
  }

  async unassign(resourceId: string, patientId: string): Promise<boolean> {
    const { count } = await this.db.tx.resourceAssignment.deleteMany({
      where: { resourceId, patientId },
    });
    return count > 0;
  }

  async markViewed(resourceId: string): Promise<boolean> {
    const [row] = await this.db.tx.$queryRaw<{ marked: boolean }[]>`
      SELECT app.mark_resource_viewed(${resourceId}::uuid) AS marked`;
    return row?.marked ?? false;
  }
}

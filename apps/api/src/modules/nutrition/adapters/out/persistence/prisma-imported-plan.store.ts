import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { OrganizationId, UserId } from '@nutricoach/shared-kernel';
import type { Db } from '../../../../../platform/index.js';
import type {
  ImportedPlanRecord,
  ImportedPlanStore,
} from '../../../application/ports/nutrition.ports.js';

const isoDate = (value: Date): string => value.toISOString().slice(0, 10);
const dateOf = (value: string): Date => new Date(`${value}T00:00:00.000Z`);
const numberOrNull = (value: { toString(): string } | null): number | null =>
  value === null ? null : Number(value.toString());

type Row = Awaited<ReturnType<Db['tx']['importedPlan']['findFirstOrThrow']>>;

const recordOf = (row: Row): ImportedPlanRecord => ({
  id: row.id,
  organizationId: row.organizationId as OrganizationId,
  patientId: row.patientId,
  validFrom: isoDate(row.validFrom),
  validTo: row.validTo ? isoDate(row.validTo) : null,
  targetKcal: numberOrNull(row.targetKcal),
  targetProteinG: numberOrNull(row.targetProteinG),
  targetFatG: numberOrNull(row.targetFatG),
  targetChoG: numberOrNull(row.targetChoG),
  hydrationTargetMl: row.hydrationTargetMl,
  instructions: row.instructions,
  createdBy: row.createdBy as UserId,
  createdAt: row.createdAt,
});

/** nutrition.imported_plan con la transacción de la UnitOfWork (ADR-135). */
@Injectable()
export class PrismaImportedPlanStore implements ImportedPlanStore {
  constructor(@Inject(TransactionHost) private readonly db: Db) {}

  async insert(plan: ImportedPlanRecord): Promise<void> {
    await this.db.tx.importedPlan.createMany({
      data: [
        {
          ...plan,
          validFrom: dateOf(plan.validFrom),
          validTo: plan.validTo ? dateOf(plan.validTo) : null,
        },
      ],
    });
  }

  async listByPatient(patientId: string): Promise<readonly ImportedPlanRecord[]> {
    const rows = await this.db.tx.importedPlan.findMany({
      where: { patientId },
      orderBy: [{ validFrom: 'desc' }, { id: 'desc' }],
    });
    return rows.map(recordOf);
  }

  async find(id: string): Promise<ImportedPlanRecord | null> {
    const row = await this.db.tx.importedPlan.findUnique({ where: { id } });
    return row ? recordOf(row) : null;
  }
}

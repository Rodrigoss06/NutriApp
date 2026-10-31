import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { Db } from '../../../../../platform/index.js';
import type { FoodExclusionStore } from '../../../application/ports/nutrition.ports.js';

/** nutrition.food_exclusion con la transacción de la UnitOfWork. */
@Injectable()
export class PrismaFoodExclusionStore implements FoodExclusionStore {
  constructor(@Inject(TransactionHost) private readonly db: Db) {}

  forPatient(
    patientId: string,
  ): Promise<readonly { readonly conditionId: string; readonly foodId: string }[]> {
    return this.db.tx.foodExclusion.findMany({
      where: { patientId },
      select: { conditionId: true, foodId: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async replace(row: Parameters<FoodExclusionStore['replace']>[0]): Promise<void> {
    const { organizationId, patientId, conditionId, foodIds, createdBy, now } = row;
    await this.db.tx.foodExclusion.deleteMany({ where: { conditionId } });
    await this.db.tx.foodExclusion.createMany({
      data: foodIds.map((foodId) => ({
        conditionId,
        foodId,
        organizationId,
        patientId,
        createdBy,
        createdAt: now,
      })),
    });
  }
}

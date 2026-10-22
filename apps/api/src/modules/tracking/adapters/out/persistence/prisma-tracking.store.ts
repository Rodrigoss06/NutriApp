import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { Db } from '../../../../../platform/index.js';
import type {
  ActiveNutritionPlan,
  TrackingStore,
} from '../../../application/ports/tracking.ports.js';
import type { DailyTarget } from '../../../domain/active-plan.js';

interface ActiveRow {
  patient_id: string;
  plan_id: string;
  published_at: string;
  targets: { kcal: number; choG: number; proteinG: number; fatG: number };
  water_ml: number | null;
}

const activeOf = (row: ActiveRow): ActiveNutritionPlan => ({
  patientId: row.patient_id,
  planId: row.plan_id,
  publishedAt: row.published_at,
  target: { ...row.targets, waterMl: row.water_ml },
});

/** La copia del plan vigente y la meta de cada día (02 §3), con la transacción de la UnitOfWork. */
@Injectable()
export class PrismaTrackingStore implements TrackingStore {
  constructor(@Inject(TransactionHost) private readonly db: Db) {}

  async activeNutritionPlan(patientId: string): Promise<ActiveNutritionPlan | null> {
    const [row] = await this.db.tx.$queryRaw<ActiveRow[]>`
      SELECT patient_id, nutrition_plan_id AS plan_id, nutrition_snapshot->>'publishedAt' AS published_at,
             nutrition_snapshot->'targets' AS targets,
             (nutrition_snapshot->>'hydrationTargetMl')::int AS water_ml
      FROM tracking.active_plan_view
      WHERE patient_id = ${patientId}::uuid AND nutrition_plan_id IS NOT NULL
      FOR UPDATE`;
    return row ? activeOf(row) : null;
  }

  async saveActiveNutritionPlan(plan: {
    readonly patientId: string;
    readonly organizationId: string;
    readonly planId: string;
    readonly snapshot: unknown;
    readonly effectiveFrom: string;
  }): Promise<void> {
    await this.db.tx.$executeRaw`
      INSERT INTO tracking.active_plan_view (patient_id, organization_id, nutrition_plan_id, nutrition_snapshot,
                                             effective_from, updated_at)
      VALUES (${plan.patientId}::uuid, ${plan.organizationId}::uuid, ${plan.planId}::uuid,
              ${JSON.stringify(plan.snapshot)}::jsonb, ${plan.effectiveFrom}::date, now())
      ON CONFLICT (patient_id) DO UPDATE
        SET nutrition_plan_id = excluded.nutrition_plan_id, nutrition_snapshot = excluded.nutrition_snapshot,
            effective_from = excluded.effective_from, updated_at = now()`;
  }

  async activeNutritionPlans(): Promise<readonly ActiveNutritionPlan[]> {
    const rows = await this.db.tx.$queryRaw<ActiveRow[]>`
      SELECT patient_id, nutrition_plan_id AS plan_id, nutrition_snapshot->>'publishedAt' AS published_at,
             nutrition_snapshot->'targets' AS targets,
             (nutrition_snapshot->>'hydrationTargetMl')::int AS water_ml
      FROM tracking.active_plan_view WHERE nutrition_plan_id IS NOT NULL
      ORDER BY patient_id`;
    return rows.map(activeOf);
  }

  async setDailyTarget(
    row: {
      readonly patientId: string;
      readonly organizationId: string;
      readonly localDate: string;
      readonly planId: string;
      readonly target: DailyTarget;
    },
    mode: 'REPLACE' | 'KEEP',
  ): Promise<boolean> {
    const { target } = row;
    const written =
      mode === 'REPLACE'
        ? await this.db.tx.$executeRaw`
            INSERT INTO tracking.daily_target (patient_id, local_date, organization_id, nutrition_plan_id, kcal,
                                               cho_g, protein_g, fat_g, water_ml)
            VALUES (${row.patientId}::uuid, ${row.localDate}::date, ${row.organizationId}::uuid,
                    ${row.planId}::uuid, ${target.kcal}, ${target.choG}, ${target.proteinG}, ${target.fatG},
                    ${target.waterMl})
            ON CONFLICT (patient_id, local_date) DO UPDATE
              SET nutrition_plan_id = excluded.nutrition_plan_id, kcal = excluded.kcal, cho_g = excluded.cho_g,
                  protein_g = excluded.protein_g, fat_g = excluded.fat_g, water_ml = excluded.water_ml`
        : await this.db.tx.$executeRaw`
            INSERT INTO tracking.daily_target (patient_id, local_date, organization_id, nutrition_plan_id, kcal,
                                               cho_g, protein_g, fat_g, water_ml)
            VALUES (${row.patientId}::uuid, ${row.localDate}::date, ${row.organizationId}::uuid,
                    ${row.planId}::uuid, ${target.kcal}, ${target.choG}, ${target.proteinG}, ${target.fatG},
                    ${target.waterMl})
            ON CONFLICT (patient_id, local_date) DO NOTHING`;
    return written === 1;
  }
}

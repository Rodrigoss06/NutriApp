import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { Db } from '../../../../../platform/index.js';
import type {
  ActiveNutritionPlan,
  ActiveProgram,
  TrackingStore,
} from '../../../application/ports/tracking.ports.js';
import type { DailyTarget } from '../../../domain/active-plan.js';
import type { ProgramCalendar, TrainingDayTarget } from '../../../domain/active-program.js';

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

interface ActiveProgramRow {
  patient_id: string;
  program_id: string;
  published_at: string;
  start_date: string;
  schedule: Pick<ProgramCalendar, 'weeks'>;
}

const activeProgramOf = (row: ActiveProgramRow): ActiveProgram => ({
  patientId: row.patient_id,
  programId: row.program_id,
  publishedAt: row.published_at,
  calendar: { startDate: row.start_date, weeks: row.schedule.weeks },
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
            ON CONFLICT (patient_id, local_date) DO UPDATE
              SET nutrition_plan_id = excluded.nutrition_plan_id, kcal = excluded.kcal, cho_g = excluded.cho_g,
                  protein_g = excluded.protein_g, fat_g = excluded.fat_g, water_ml = excluded.water_ml
              WHERE tracking.daily_target.nutrition_plan_id IS NULL`;
    return written === 1;
  }

  async activeProgram(patientId: string): Promise<ActiveProgram | null> {
    const [row] = await this.db.tx.$queryRaw<ActiveProgramRow[]>`
      SELECT patient_id, training_program_id AS program_id, training_snapshot->>'publishedAt' AS published_at,
             training_snapshot->>'startDate' AS start_date, training_snapshot->'schedule' AS schedule
      FROM tracking.active_plan_view
      WHERE patient_id = ${patientId}::uuid AND training_program_id IS NOT NULL
      FOR UPDATE`;
    return row ? activeProgramOf(row) : null;
  }

  async saveActiveProgram(program: {
    readonly patientId: string;
    readonly organizationId: string;
    readonly programId: string;
    readonly snapshot: unknown;
    readonly effectiveFrom: string;
  }): Promise<void> {
    await this.db.tx.$executeRaw`
      INSERT INTO tracking.active_plan_view (patient_id, organization_id, training_program_id, training_snapshot,
                                             effective_from, updated_at)
      VALUES (${program.patientId}::uuid, ${program.organizationId}::uuid, ${program.programId}::uuid,
              ${JSON.stringify(program.snapshot)}::jsonb, ${program.effectiveFrom}::date, now())
      ON CONFLICT (patient_id) DO UPDATE
        SET training_program_id = excluded.training_program_id, training_snapshot = excluded.training_snapshot,
            updated_at = now()`;
  }

  async activePrograms(): Promise<readonly ActiveProgram[]> {
    const rows = await this.db.tx.$queryRaw<ActiveProgramRow[]>`
      SELECT patient_id, training_program_id AS program_id, training_snapshot->>'publishedAt' AS published_at,
             training_snapshot->>'startDate' AS start_date, training_snapshot->'schedule' AS schedule
      FROM tracking.active_plan_view WHERE training_program_id IS NOT NULL
      ORDER BY patient_id`;
    return rows.map(activeProgramOf);
  }

  async setTrainingTarget(
    row: {
      readonly patientId: string;
      readonly organizationId: string;
      readonly localDate: string;
      readonly target: TrainingDayTarget;
    },
    mode: 'REPLACE' | 'KEEP',
  ): Promise<boolean> {
    const { plannedSessions, plannedSets } = row.target;
    const sets = JSON.stringify(plannedSets);
    const written =
      mode === 'REPLACE'
        ? await this.db.tx.$executeRaw`
            INSERT INTO tracking.daily_target (patient_id, local_date, organization_id, planned_sessions, planned_sets)
            VALUES (${row.patientId}::uuid, ${row.localDate}::date, ${row.organizationId}::uuid, ${plannedSessions},
                    ${sets}::jsonb)
            ON CONFLICT (patient_id, local_date) DO UPDATE
              SET planned_sessions = excluded.planned_sessions, planned_sets = excluded.planned_sets`
        : await this.db.tx.$executeRaw`
            INSERT INTO tracking.daily_target (patient_id, local_date, organization_id, planned_sessions, planned_sets)
            VALUES (${row.patientId}::uuid, ${row.localDate}::date, ${row.organizationId}::uuid, ${plannedSessions},
                    ${sets}::jsonb)
            ON CONFLICT (patient_id, local_date) DO UPDATE
              SET planned_sessions = excluded.planned_sessions, planned_sets = excluded.planned_sets
              WHERE tracking.daily_target.planned_sessions IS NULL`;
    return written === 1;
  }
}

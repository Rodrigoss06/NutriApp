import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { OrganizationId, UserId } from '@nutricoach/shared-kernel';
import type { Db } from '../../../../../platform/index.js';
import type { TimelineCursor, TimelineEntry } from '../../../../clinical/index.js';
import type { EnergyGoal, EnergyStrategy } from '../../../domain/energy-rules.js';
import type { PrescriptionComponents } from '../../../application/energy-calculation.js';
import type {
  EnergyPrescriptionRecord,
  EnergyPrescriptionStore,
  PrescribedActivity,
} from '../../../application/ports/nutrition.ports.js';

/** components guarda los sobres del motor y el tipo de ajuste que eligió el profesional. */
interface StoredComponents extends PrescriptionComponents {
  readonly adjustmentKind: EnergyPrescriptionRecord['adjustmentKind'];
}

const json = (value: unknown): object => JSON.parse(JSON.stringify(value)) as object;
const number = (outputs: Readonly<Record<string, unknown>>, key: string): number => {
  const value = outputs[key];
  if (typeof value !== 'number') throw new Error(`Salida ${key} sin número.`);
  return value;
};

type Row = Awaited<ReturnType<Db['tx']['energyPrescription']['findFirstOrThrow']>>;

function toRecord(row: Row): EnergyPrescriptionRecord {
  // Se guardaron tal como los devolvió el motor (RN-D01).
  const { adjustmentKind, ...components } = row.components as unknown as StoredComponents;
  return {
    id: row.id,
    organizationId: row.organizationId as OrganizationId,
    patientId: row.patientId,
    evaluationId: row.evaluationId,
    calculationResultId: row.calculationResultId,
    sex: row.sex as 'M' | 'F',
    ageYears: Number(row.ageYears),
    weightKg: Number(row.weightKg),
    heightCm: Number(row.heightCm),
    fatFreeMassKg: row.fatFreeMassKg === null ? null : Number(row.fatFreeMassKg),
    ffmMethodCode: row.ffmMethodCode,
    strategy: row.strategy as EnergyStrategy,
    pal: Number(row.pal),
    activities: row.activities as unknown as PrescribedActivity[],
    goal: row.goal as EnergyGoal,
    adjustmentKind,
    fatKgPerMonth: Number(components.adjustment.inputs.fatChangeKgPerMonth),
    targetFatPct:
      typeof components.projection?.inputs.targetFatPct === 'number'
        ? components.projection.inputs.targetFatPct
        : null,
    proteinGPerKg: Number(row.proteinGPerKg),
    fatPctKcal: Number(row.fatPctKcal),
    components,
    engineVersion: row.engineVersion,
    inputsHash: Buffer.from(row.inputsHash).toString('hex'),
    createdBy: row.createdBy as UserId,
    createdAt: row.createdAt,
  };
}

/** nutrition.energy_prescription con la transacción de la UnitOfWork y su RLS (RN-A01, RN-A05). */
@Injectable()
export class PrismaEnergyPrescriptionStore implements EnergyPrescriptionStore {
  constructor(@Inject(TransactionHost) private readonly db: Db) {}

  async insert(record: EnergyPrescriptionRecord): Promise<void> {
    const { components } = record;
    const projection = components.projection;
    await this.db.tx.energyPrescription.create({
      data: {
        id: record.id,
        organizationId: record.organizationId,
        patientId: record.patientId,
        evaluationId: record.evaluationId,
        calculationResultId: record.calculationResultId,
        weightKg: record.weightKg,
        heightCm: record.heightCm,
        ageYears: record.ageYears,
        sex: record.sex,
        fatFreeMassKg: record.fatFreeMassKg,
        ffmMethodCode: record.ffmMethodCode,
        rmrMethodCode: components.rmr.methodCode,
        rmrMethodVersion: components.rmr.methodVersion,
        rmrKcal: number(components.rmr.outputs, 'rmrKcal'),
        strategy: record.strategy,
        pal: record.pal,
        activities: json(record.activities),
        exerciseKcalDay: number(components.exercise.outputs, 'dailyAverageNetKcal'),
        tdeeKcal: number(components.tee.outputs, 'teeKcal'),
        teeMethodCode: components.tee.methodCode,
        teeMethodVersion: components.tee.methodVersion,
        goal: record.goal,
        adjustmentKcal: -number(components.adjustment.outputs, 'deficitKcal'),
        targetKcal: number(components.adjustment.outputs, 'targetKcal'),
        proteinGPerKg: record.proteinGPerKg,
        fatPctKcal: record.fatPctKcal,
        proteinG: number(components.macros.outputs, 'proteinG'),
        fatG: number(components.macros.outputs, 'fatG'),
        choG: number(components.macros.outputs, 'choG'),
        projection: json({
          kind: 'INITIAL_ESTIMATE',
          weeklyRatePct: number(components.adjustment.outputs, 'weeklyRatePct'),
          ...(projection
            ? {
                targetFatPct: projection.inputs.targetFatPct,
                targetWeightKg: projection.outputs.targetWeightKg,
                monthsToTarget: projection.outputs.monthsToTarget,
                estimatedDate: projection.estimatedDate,
              }
            : {}),
        }),
        components: json({ ...components, adjustmentKind: record.adjustmentKind }),
        engineVersion: record.engineVersion,
        inputsHash: new Uint8Array(Buffer.from(record.inputsHash, 'hex')),
        createdBy: record.createdBy,
        createdAt: record.createdAt,
      },
    });
  }

  async find(id: string): Promise<EnergyPrescriptionRecord | null> {
    const row = await this.db.tx.energyPrescription.findUnique({ where: { id } });
    return row ? toRecord(row) : null;
  }

  async listByPatient(patientId: string): Promise<readonly EnergyPrescriptionRecord[]> {
    const rows = await this.db.tx.energyPrescription.findMany({
      where: { patientId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(toRecord);
  }

  async timeline(
    patientId: string,
    before: TimelineCursor | null,
    limit: number,
  ): Promise<readonly TimelineEntry[]> {
    const rows = await this.db.tx.$queryRaw<{ id: string; created_at: Date; goal: string }[]>`
      SELECT id, created_at, goal FROM nutrition.energy_prescription
      WHERE patient_id = ${patientId}::uuid
        AND (${before?.occurredAt ?? null}::timestamptz IS NULL
             OR (created_at, id) < (${before?.occurredAt ?? null}::timestamptz, ${before?.refId ?? null}::uuid))
      ORDER BY created_at DESC, id DESC
      LIMIT ${limit}`;
    return rows.map((row) => ({
      kind: 'ENERGY_PRESCRIBED',
      occurredAt: row.created_at,
      refId: row.id,
      label: row.goal,
      detail: null,
    }));
  }
}

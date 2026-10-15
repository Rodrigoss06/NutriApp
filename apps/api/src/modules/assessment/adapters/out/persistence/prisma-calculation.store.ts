import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { OrganizationId } from '@nutricoach/shared-kernel';
import type { Db } from '../../../../../platform/index.js';
import type {
  CalculationStore,
  MetricRow,
  StoredResult,
} from '../../../application/ports/assessment.ports.js';
import type { MethodPurpose, PreferenceRow } from '../../../domain/calculation-plan.js';
import type { InterpretationTone, ReferenceRange } from '../../../domain/interpretation.js';

const num = (value: { toString(): string } | null): number | null =>
  value === null ? null : Number(value);

/** Resultados inmutables, preferencias de métodos y rangos de referencia (05.1), con la RLS del contexto. */
@Injectable()
export class PrismaCalculationStore implements CalculationStore {
  constructor(@Inject(TransactionHost) private readonly db: Db) {}

  async results(evaluationIds: readonly string[]): Promise<readonly StoredResult[]> {
    if (evaluationIds.length === 0) return [];
    const rows = await this.db.tx.calculationResult.findMany({
      where: { evaluationId: { in: [...evaluationIds] } },
      orderBy: [{ computedAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      evaluationId: row.evaluationId,
      patientId: row.patientId,
      methodCode: row.methodCode,
      methodVersion: row.methodVersion,
      engineVersion: row.engineVersion,
      // Insumos, salidas y avisos se guardaron tal como los devolvió el motor (RN-D01).
      inputs: row.inputs as Record<string, unknown>,
      inputsHash: Buffer.from(row.inputsHash).toString('hex'),
      outputs: row.outputs as Record<string, unknown>,
      warnings: row.warnings as unknown as StoredResult['warnings'],
      status: row.status as StoredResult['status'],
      supersededBy: row.supersededBy,
      measuredAt: row.measuredAt,
      computedAt: row.computedAt,
    }));
  }

  async insertResult(
    organizationId: OrganizationId,
    result: StoredResult,
    metrics: readonly MetricRow[],
  ): Promise<void> {
    await this.db.tx.calculationResult.create({
      data: {
        id: result.id,
        organizationId,
        patientId: result.patientId,
        evaluationId: result.evaluationId,
        methodCode: result.methodCode,
        methodVersion: result.methodVersion,
        engineVersion: result.engineVersion,
        inputs: JSON.parse(JSON.stringify(result.inputs)) as object,
        inputsHash: new Uint8Array(Buffer.from(result.inputsHash, 'hex')),
        outputs: JSON.parse(JSON.stringify(result.outputs)) as object,
        warnings: result.warnings.map((warning) => ({ ...warning })),
        status: result.status,
        supersededBy: result.supersededBy,
        measuredAt: result.measuredAt,
        computedAt: result.computedAt,
      },
    });
    if (metrics.length === 0) return;
    await this.db.tx.resultMetric.createMany({
      data: metrics.map((metric) => ({
        resultId: result.id,
        metricCode: metric.metricCode,
        organizationId,
        patientId: result.patientId,
        methodCode: metric.methodCode,
        measuredAt: result.measuredAt,
        value: metric.value,
        unit: metric.unit,
        zScore: metric.zScore,
      })),
    });
  }

  async setStatus(
    id: string,
    status: StoredResult['status'],
    supersededBy: string | null,
  ): Promise<void> {
    await this.db.tx.calculationResult.update({ where: { id }, data: { status, supersededBy } });
  }

  async preferenceRows(patientId: string | null): Promise<readonly PreferenceRow[]> {
    const rows = await this.db.tx.methodPreference.findMany({
      where: {
        organizationId: { not: null },
        OR: [{ patientId: null }, ...(patientId ? [{ patientId }] : [])],
      },
    });
    return rows.map((row) => ({
      organizationLevel: row.patientId === null,
      population: row.population as PreferenceRow['population'],
      purpose: row.purpose as MethodPurpose,
      methodCode: row.methodCode,
    }));
  }

  async savePreference(
    organizationId: OrganizationId,
    id: string,
    target: { readonly patientId: string } | { readonly population: string },
    purpose: MethodPurpose,
    methodCode: string,
  ): Promise<void> {
    const patientId = 'patientId' in target ? target.patientId : null;
    const population = 'population' in target ? target.population : null;
    await this.db.tx.$executeRaw`
      INSERT INTO assessment.method_preference (id, organization_id, patient_id, population, purpose, method_code)
      VALUES (${id}::uuid, ${organizationId}::uuid, ${patientId}::uuid, ${population}, ${purpose}, ${methodCode})
      ON CONFLICT (organization_id, patient_id, population, purpose)
      DO UPDATE SET method_code = EXCLUDED.method_code`;
  }

  async deletePreference(
    target: { readonly patientId: string } | { readonly population: string },
    purpose: MethodPurpose,
  ): Promise<boolean> {
    const { count } = await this.db.tx.methodPreference.deleteMany({
      where:
        'patientId' in target
          ? { patientId: target.patientId, purpose }
          : { patientId: null, population: target.population, purpose },
    });
    return count > 0;
  }

  async referenceRanges(): Promise<readonly ReferenceRange[]> {
    const rows = await this.db.tx.referenceRange.findMany();
    return rows.map((row) => ({
      id: row.id,
      organizationId: row.organizationId,
      metricCode: row.metricCode,
      sex: row.sex as ReferenceRange['sex'],
      minAge: num(row.minAge),
      maxAge: num(row.maxAge),
      population: row.population,
      minValue: num(row.minValue),
      maxValue: num(row.maxValue),
      label: row.label,
      tone: (row.severity ?? 'NEUTRAL') as InterpretationTone,
      source: row.source,
      validFrom: row.validFrom.toISOString().slice(0, 10),
    }));
  }
}

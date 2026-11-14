import type {
  OrganizationId,
  SecurityContext,
  UnitOfWork,
  UserId,
} from '@nutricoach/shared-kernel';
import { describe, expect, it } from 'vitest';
import type { AssessmentApi } from '../../assessment/index.js';
import type { TrackingApi } from '../../tracking/index.js';
import type { DocumentGeneration } from './document-generation.js';
import { DocumentsExportSource } from './documents-export-source.js';
import type { SheetSource } from './sheet-sources.js';

const ORG = '0192f0a0-0000-7000-8000-00000000000a' as OrganizationId;

describe('RN-B04 · las fichas en la exportación del paciente (ADR-131)', () => {
  it('genera las vigentes que falten, cada una en su transacción, como SYSTEM de la organización', async () => {
    const transactions: { kind: 'run' | 'query'; context: SecurityContext }[] = [];
    const uow: UnitOfWork = {
      run: (context, work) => {
        transactions.push({ kind: 'run', context });
        return work();
      },
      query: (context, work) => {
        transactions.push({ kind: 'query', context });
        return work();
      },
    };
    const generated: { source: SheetSource; by: UserId | null }[] = [];
    const source = new DocumentsExportSource(
      uow,
      {
        activePlans: () => Promise.resolve({ nutritionPlanId: 'plan', trainingProgramId: null }),
      } as unknown as TrackingApi,
      {
        closedEvaluationIds: () => Promise.resolve(['eva-2', 'eva-1']),
      } as unknown as AssessmentApi,
      {
        generate: (_org: OrganizationId, sheet: SheetSource, by: UserId | null) => {
          generated.push({ source: sheet, by });
          return Promise.resolve(null);
        },
      } as unknown as DocumentGeneration,
    );

    await source.prepare(ORG, 'paciente');

    expect(generated.map((g) => g.source)).toEqual([
      { type: 'NUTRITION_PLAN', id: 'plan' },
      { type: 'EVALUATION', id: 'eva-2' },
      { type: 'EVALUATION', id: 'eva-2', kind: 'EVOLUTION' },
    ]);
    expect(generated.every((g) => g.by === null)).toBe(true);
    expect(transactions.map((t) => t.kind)).toEqual(['query', 'run', 'run', 'run']);
    expect(
      transactions.every((t) => t.context.role === 'SYSTEM' && t.context.organizationId === ORG),
    ).toBe(true);
    expect(source.tables).toEqual([{ table: 'documents.generated_document' }]);
  });
});

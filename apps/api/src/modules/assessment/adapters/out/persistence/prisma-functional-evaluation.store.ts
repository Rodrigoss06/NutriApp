import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { MovementTestStatus } from '@nutricoach/engine';
import type { OrganizationId, UserId } from '@nutricoach/shared-kernel';
import type { Db } from '../../../../../platform/index.js';
import type {
  FunctionalCatalog,
  FunctionalEvaluationRecord,
  FunctionalEvaluationStore,
  MovementTestRow,
  PatientSnapshot,
  PhysicalResultRow,
} from '../../../application/ports/assessment.ports.js';
import type { EvaluationStatus } from '../../../domain/assessment-rules.js';
import type {
  ClosedPhysicalEvaluation,
  EvaluationModality,
  FunctionalKind,
  PhysicalMoment,
} from '../../../domain/functional-evaluation.js';

const isoDate = (value: Date): string => value.toISOString().slice(0, 10);
const asDate = (value: string): Date => new Date(`${value}T00:00:00Z`);
const FUNCTIONAL_KINDS: readonly FunctionalKind[] = ['MOVEMENT', 'FITNESS'];

const FIELDS = {
  id: true,
  organizationId: true,
  patientId: true,
  evaluatorMemberId: true,
  kind: true,
  moment: true,
  measuredAt: true,
  localDate: true,
  patientSnapshot: true,
  status: true,
  revision: true,
  amendsEvaluationId: true,
  amendReason: true,
  closedAt: true,
  notes: true,
  createdBy: true,
  createdAt: true,
  version: true,
} as const;

const toRecord = (row: {
  id: string;
  organizationId: string;
  patientId: string;
  evaluatorMemberId: string;
  kind: string;
  moment: string | null;
  measuredAt: Date;
  localDate: Date;
  patientSnapshot: unknown;
  status: string;
  revision: number;
  amendsEvaluationId: string | null;
  amendReason: string | null;
  closedAt: Date | null;
  notes: string | null;
  createdBy: string;
  createdAt: Date;
  version: number;
}): FunctionalEvaluationRecord => ({
  ...row,
  organizationId: row.organizationId as OrganizationId,
  kind: row.kind as FunctionalKind,
  moment: row.moment as PhysicalMoment | null,
  localDate: isoDate(row.localDate),
  patientSnapshot: row.patientSnapshot as PatientSnapshot,
  status: row.status as EvaluationStatus,
  createdBy: row.createdBy as UserId,
});

/** Postura y pruebas físicas con la transacción de la UnitOfWork y su RLS. Sus filas no se actualizan: se reemplazan. */
@Injectable()
export class PrismaFunctionalEvaluationStore implements FunctionalEvaluationStore {
  constructor(@Inject(TransactionHost) private readonly db: Db) {}

  async catalog(): Promise<FunctionalCatalog> {
    const movement = await this.db.tx.movementTest.findMany({ orderBy: { displayOrder: 'asc' } });
    const physical = await this.db.tx.physicalTest.findMany({ orderBy: { displayOrder: 'asc' } });
    return {
      movementTests: movement.map((test) => ({
        code: test.code,
        name: test.nameEs,
        kind: test.kind as 'STATIC' | 'DYNAMIC',
        region: test.regionEs,
      })),
      physicalTests: physical.map((test) => ({
        code: test.code,
        domain: test.domain,
        name: test.nameEs,
        protocol: test.protocolEs,
        unit: test.unit,
      })),
    };
  }

  async insert(evaluation: FunctionalEvaluationRecord): Promise<void> {
    await this.db.tx.evaluation.create({
      data: {
        id: evaluation.id,
        organizationId: evaluation.organizationId,
        patientId: evaluation.patientId,
        evaluatorMemberId: evaluation.evaluatorMemberId,
        kind: evaluation.kind,
        moment: evaluation.moment,
        measuredAt: evaluation.measuredAt,
        localDate: asDate(evaluation.localDate),
        conditions: {},
        patientSnapshot: { ...evaluation.patientSnapshot },
        status: evaluation.status,
        revision: evaluation.revision,
        amendsEvaluationId: evaluation.amendsEvaluationId,
        amendReason: evaluation.amendReason,
        closedAt: evaluation.closedAt,
        notes: evaluation.notes,
        createdBy: evaluation.createdBy,
        createdAt: evaluation.createdAt,
        updatedAt: evaluation.createdAt,
        version: evaluation.version,
      },
    });
  }

  async find(id: string): Promise<FunctionalEvaluationRecord | null> {
    const row = await this.db.tx.evaluation.findFirst({
      where: { id, kind: { in: [...FUNCTIONAL_KINDS] } },
      select: FIELDS,
    });
    return row ? toRecord(row) : null;
  }

  async listByPatient(
    patientId: string,
    kind: FunctionalKind,
  ): Promise<readonly FunctionalEvaluationRecord[]> {
    const rows = await this.db.tx.evaluation.findMany({
      where: { patientId, kind },
      select: FIELDS,
      orderBy: [{ measuredAt: 'desc' }, { revision: 'desc' }],
    });
    return rows.map(toRecord);
  }

  async movementTests(evaluationId: string): Promise<readonly MovementTestRow[]> {
    const rows = await this.db.tx.movementScreen.findMany({
      where: { evaluationId },
      include: { movementTest: { select: { displayOrder: true } } },
      orderBy: { movementTest: { displayOrder: 'asc' } },
    });
    return rows.map((row) => ({
      testCode: row.testCode,
      rightScore: row.rightScore,
      leftScore: row.leftScore,
      pain: row.pain,
      asymmetry: row.asymmetry,
      status: row.status as MovementTestStatus,
      ruleVersion: row.ruleVersion,
      modality: row.modality as EvaluationModality,
      observation: row.observation,
      actionNote: row.actionNote,
      reliabilityNote: row.reliabilityNote,
      evidenceFileId: row.evidenceFileId,
      evidenceUrl: row.evidenceUrl,
    }));
  }

  async physicalResults(evaluationId: string): Promise<readonly PhysicalResultRow[]> {
    const rows = await this.db.tx.physicalTestResult.findMany({
      where: { evaluationId },
      orderBy: { physicalTest: { displayOrder: 'asc' } },
    });
    return rows.map((row) => ({
      testCode: row.testCode,
      value: Number(row.value),
      unit: row.unit,
      modality: row.modality as EvaluationModality,
      notes: row.notes,
      evidenceFileId: row.evidenceFileId,
      evidenceUrl: row.evidenceUrl,
    }));
  }

  async replaceMovementTest(
    evaluation: FunctionalEvaluationRecord,
    row: MovementTestRow,
  ): Promise<void> {
    await this.removeMovementTest(evaluation.id, row.testCode);
    await this.db.tx.movementScreen.createMany({
      data: [
        {
          ...row,
          evaluationId: evaluation.id,
          organizationId: evaluation.organizationId,
          patientId: evaluation.patientId,
        },
      ],
    });
  }

  async replacePhysicalResult(
    evaluation: FunctionalEvaluationRecord,
    row: PhysicalResultRow,
  ): Promise<void> {
    await this.removePhysicalResult(evaluation.id, row.testCode);
    await this.db.tx.physicalTestResult.createMany({
      data: [
        {
          ...row,
          evaluationId: evaluation.id,
          organizationId: evaluation.organizationId,
          patientId: evaluation.patientId,
        },
      ],
    });
  }

  async removeMovementTest(evaluationId: string, testCode: string): Promise<boolean> {
    const { count } = await this.db.tx.movementScreen.deleteMany({
      where: { evaluationId, testCode },
    });
    return count > 0;
  }

  async removePhysicalResult(evaluationId: string, testCode: string): Promise<boolean> {
    const { count } = await this.db.tx.physicalTestResult.deleteMany({
      where: { evaluationId, testCode },
    });
    return count > 0;
  }

  async movementKeys(patientId: string): Promise<{
    readonly evaluated: boolean;
    readonly statuses: readonly MovementTestStatus[];
  }> {
    const current = await this.db.tx.evaluation.findFirst({
      where: { patientId, kind: 'MOVEMENT', status: 'CLOSED' },
      orderBy: [{ measuredAt: 'desc' }, { revision: 'desc' }],
      select: { movementScreens: { select: { status: true } } },
    });
    const drafts = await this.db.tx.evaluation.findMany({
      where: { patientId, kind: 'MOVEMENT', status: 'DRAFT' },
      select: { movementScreens: { select: { status: true } } },
    });
    return {
      evaluated: current !== null,
      statuses: [...(current ? [current] : []), ...drafts].flatMap((evaluation) =>
        evaluation.movementScreens.map((row) => row.status as MovementTestStatus),
      ),
    };
  }

  async closedPhysical(patientId: string): Promise<readonly ClosedPhysicalEvaluation[]> {
    const rows = await this.db.tx.evaluation.findMany({
      where: { patientId, kind: 'FITNESS', status: 'CLOSED' },
      orderBy: [{ measuredAt: 'desc' }, { revision: 'desc' }],
      select: {
        moment: true,
        localDate: true,
        physicalTestResults: { select: { testCode: true, value: true } },
      },
    });
    return rows.map((row) => ({
      moment: row.moment as PhysicalMoment,
      localDate: isoDate(row.localDate),
      results: row.physicalTestResults.map((result) => ({
        testCode: result.testCode,
        value: Number(result.value),
      })),
    }));
  }
}

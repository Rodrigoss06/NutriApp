import { Inject, Injectable } from '@nestjs/common';
import {
  AUDIT_PORT,
  UNIT_OF_WORK,
  type AuditPort,
  type Id,
  type PatientId,
  type SecurityContext,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import { FileRegistry } from '../../../../platform/index.js';
import { ClinicalApi } from '../../../clinical/index.js';
import {
  physicalTestSummary,
  type FunctionalKind,
  type PhysicalTestSummaryRow,
} from '../../domain/functional-evaluation.js';
import {
  EVALUATION_STORE,
  FUNCTIONAL_EVALUATION_STORE,
  type EvaluationStore,
  type FunctionalCatalog,
  type FunctionalEvaluationRecord,
  type FunctionalEvaluationStore,
  type MovementTestRow,
  type PhysicalResultRow,
} from '../ports/assessment.ports.js';

export interface FunctionalEvaluationSummaryView extends FunctionalEvaluationRecord {
  readonly amendedByEvaluationId: string | null;
}

export interface FunctionalEvaluationView extends FunctionalEvaluationSummaryView {
  readonly movementTests: readonly MovementTestRow[];
  readonly physicalResults: readonly PhysicalResultRow[];
}

/** Lecturas de postura y pruebas físicas (RF-41). La RLS aplica RN-A05; cada lectura clínica deja un READ (RN-B03). */
@Injectable()
export class FunctionalEvaluationQueries {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(EVALUATION_STORE) private readonly evaluations: EvaluationStore,
    @Inject(FUNCTIONAL_EVALUATION_STORE) private readonly functional: FunctionalEvaluationStore,
    @Inject(ClinicalApi) private readonly clinical: ClinicalApi,
    private readonly files: FileRegistry,
  ) {}

  /** Los catálogos globales, que no son datos de un paciente. */
  catalog(context: SecurityContext): Promise<FunctionalCatalog> {
    return this.uow.query(context, () => this.functional.catalog());
  }

  /** null si no se ve al paciente. */
  async list(
    context: SecurityContext,
    patientId: string,
    kind: FunctionalKind,
  ): Promise<readonly FunctionalEvaluationSummaryView[] | null> {
    const rows = await this.uow.query(context, async () => {
      if (!(await this.clinical.patientRef(patientId))) return null;
      const evaluations = await this.functional.listByPatient(patientId, kind);
      const amendedBy = await this.evaluations.amendedBy(evaluations.map(({ id }) => id));
      return evaluations.map((e) => ({ ...e, amendedByEvaluationId: amendedBy.get(e.id) ?? null }));
    });
    if (!rows) return null;
    await this.#audited(context, patientId, patientId);
    return rows;
  }

  /** null si no existe o no se ve a su paciente. */
  async get(context: SecurityContext, id: string): Promise<FunctionalEvaluationView | null> {
    const view = await this.uow.query(context, async () => {
      const evaluation = await this.functional.find(id);
      if (!evaluation) return null;
      const amendedBy = await this.evaluations.amendedBy([id]);
      return {
        ...evaluation,
        amendedByEvaluationId: amendedBy.get(id) ?? null,
        movementTests: await this.functional.movementTests(id),
        physicalResults: await this.functional.physicalResults(id),
      };
    });
    if (!view) return null;
    await this.#audited(context, id, view.patientId);
    return view;
  }

  /** Cada prueba física por momento, con su cambio y su estado (07 §4). null si no se ve al paciente. */
  async physicalSummary(
    context: SecurityContext,
    patientId: string,
  ): Promise<readonly PhysicalTestSummaryRow[] | null> {
    const rows = await this.uow.query(context, async () => {
      if (!(await this.clinical.patientRef(patientId))) return null;
      const { physicalTests } = await this.functional.catalog();
      return physicalTestSummary(
        physicalTests.map((test) => test.code),
        await this.functional.closedPhysical(patientId),
      );
    });
    if (!rows) return null;
    await this.#audited(context, patientId, patientId);
    return rows;
  }

  /** El archivo de una prueba, solo por la API y auditado (ADR-038). null si no hay o no se ve. */
  async evidence(
    context: SecurityContext,
    id: string,
    testCode: string,
  ): Promise<{ content: Buffer; mimeType: string } | null> {
    const found = await this.uow.query(context, async () => {
      const evaluation = await this.functional.find(id);
      if (!evaluation) return null;
      const rows =
        evaluation.kind === 'MOVEMENT'
          ? await this.functional.movementTests(id)
          : await this.functional.physicalResults(id);
      const fileId = rows.find((row) => row.testCode === testCode)?.evidenceFileId;
      const file = fileId ? await this.files.read(fileId) : null;
      return file ? { file, patientId: evaluation.patientId } : null;
    });
    if (!found) return null;
    await this.#audited(context, id, found.patientId);
    return found.file;
  }

  async #audited(context: SecurityContext, resourceId: string, patientId: string): Promise<void> {
    await this.audit.record(context, {
      action: 'READ',
      resourceType: 'assessment.evaluation',
      resourceId: resourceId as Id<string>,
      patientId: patientId as PatientId,
    });
  }
}

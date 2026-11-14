import { Inject, Injectable } from '@nestjs/common';
import {
  systemContext,
  UNIT_OF_WORK,
  type OrganizationId,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import { AssessmentApi } from '../../assessment/index.js';
import type { PatientExportSource } from '../../clinical/index.js';
import { TrackingApi } from '../../tracking/index.js';
import { DocumentGeneration } from './document-generation.js';
import { mySheetSources } from './my-sheets.js';

/**
 * Lo de documents en la exportación del paciente (RN-B04, ADR-131): las filas de sus fichas y, antes, las fichas vigentes que falten
 * (el plan y la rutina que ve, y los resultados y la evolución de su última evaluación cerrada), para que el ZIP traiga todas. Los PDF
 * van en la carpeta fichas con los demás archivos del paciente. Corre en el worker; DocumentsModule la registra al iniciar.
 */
@Injectable()
export class DocumentsExportSource implements PatientExportSource {
  readonly context = 'documents';
  readonly tables = [{ table: 'documents.generated_document' }] as const;

  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(TrackingApi) private readonly tracking: TrackingApi,
    @Inject(AssessmentApi) private readonly assessment: AssessmentApi,
    @Inject(DocumentGeneration) private readonly generation: DocumentGeneration,
  ) {}

  /** Cada ficha en su transacción: dibujar varias en una sola no cabe en su tiempo. */
  async prepare(organizationId: OrganizationId, patientId: string): Promise<void> {
    const system = systemContext(organizationId);
    const sources = await this.uow.query(system, async () =>
      mySheetSources({
        plans: await this.tracking.activePlans(patientId),
        closedEvaluationIds: await this.assessment.closedEvaluationIds(patientId),
      }),
    );
    for (const source of Object.values(sources)) {
      await this.uow.run(system, () => this.generation.generate(organizationId, source, null));
    }
  }
}

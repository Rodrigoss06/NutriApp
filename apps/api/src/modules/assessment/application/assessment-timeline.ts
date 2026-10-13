import { Inject, Injectable } from '@nestjs/common';
import type { TimelineCursor, TimelineEntry, TimelineSource } from '../../clinical/index.js';
import { EVALUATION_STORE, type EvaluationStore } from './ports/assessment.ports.js';

/** Las evaluaciones cerradas en la línea de tiempo del expediente (RF-10): las registra el módulo al iniciar. */
@Injectable()
export class AssessmentTimelineSource implements TimelineSource {
  constructor(@Inject(EVALUATION_STORE) private readonly evaluations: EvaluationStore) {}

  entries(
    patientId: string,
    before: TimelineCursor | null,
    limit: number,
  ): Promise<readonly TimelineEntry[]> {
    return this.evaluations.closedTimeline(patientId, before, limit);
  }
}

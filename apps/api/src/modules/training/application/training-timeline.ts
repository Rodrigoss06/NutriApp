import { Inject, Injectable } from '@nestjs/common';
import type { TimelineCursor, TimelineEntry, TimelineSource } from '../../clinical/index.js';
import { PROGRAM_STORE, type ProgramStore } from './ports/program.ports.js';

/** Los programas publicados en la línea de tiempo del expediente (RF-10). */
@Injectable()
export class TrainingTimelineSource implements TimelineSource {
  constructor(@Inject(PROGRAM_STORE) private readonly programs: ProgramStore) {}

  entries(
    patientId: string,
    before: TimelineCursor | null,
    limit: number,
  ): Promise<readonly TimelineEntry[]> {
    return this.programs.timeline(patientId, before, limit);
  }
}

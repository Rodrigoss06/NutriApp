import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '@nutricoach/shared-kernel';
import type { TimelineCursor, TimelineEntry, TimelineSource } from '../../clinical/index.js';
import { SCHEDULING_STORE, type SchedulingStore } from './ports/scheduling.ports.js';

/** Las citas que ya empezaron, sin las canceladas, en la línea de tiempo del expediente (RF-10, ADR-125). */
@Injectable()
export class SchedulingTimelineSource implements TimelineSource {
  constructor(
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(SCHEDULING_STORE) private readonly store: SchedulingStore,
  ) {}

  entries(
    patientId: string,
    before: TimelineCursor | null,
    limit: number,
  ): Promise<readonly TimelineEntry[]> {
    return this.store.timeline(patientId, this.clock.now(), before, limit);
  }
}

import { Inject, Injectable } from '@nestjs/common';
import {
  AUDIT_PORT,
  UNIT_OF_WORK,
  type AuditPort,
  type Id,
  type PatientId,
  type SecurityContext,
  type UnitOfWork,
  type UserId,
} from '@nutricoach/shared-kernel';
import {
  CLINICAL_RECORD_STORE,
  PATIENT_STORE,
  type ClinicalRecordStore,
  type ConditionRecord,
  type GoalRecord,
  type HistoryRevisionRecord,
  type NoteRecord,
  type PatientStore,
  type TimelineRecord,
} from '../ports/clinical.ports.js';
import { newestFirst, TimelineSources } from '../timeline-sources.js';

export interface HistoryView {
  readonly current: HistoryRevisionRecord | null;
  readonly revisions: readonly {
    revision: number;
    formCode: string;
    recordedAt: Date;
    recordedBy: UserId;
  }[];
}

export interface TimelinePage {
  readonly items: readonly TimelineRecord[];
  readonly nextCursor: string | null;
}

const encodeCursor = (item: TimelineRecord): string =>
  Buffer.from(JSON.stringify([item.occurredAt.toISOString(), item.refId])).toString('base64url');
function decodeCursor(cursor: string | undefined): { occurredAt: Date; refId: string } | null {
  if (!cursor) return null;
  try {
    const [at, refId] = JSON.parse(Buffer.from(cursor, 'base64url').toString()) as [
      unknown,
      unknown,
    ];
    const occurredAt = typeof at === 'string' ? new Date(at) : null;
    return occurredAt && !Number.isNaN(occurredAt.getTime()) && typeof refId === 'string'
      ? { occurredAt, refId }
      : null;
  } catch {
    return null;
  }
}

/**
 * Lecturas del expediente (RF-09, RF-10). La RLS deja ver solo lo que RN-A05 y AUTHOR_ONLY permiten. Toda lectura
 * de datos clínicos deja un READ en la auditoría (RN-B03); si no se ve al paciente, no hay nada que auditar.
 */
@Injectable()
export class ClinicalRecordQueries {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(PATIENT_STORE) private readonly patients: PatientStore,
    @Inject(CLINICAL_RECORD_STORE) private readonly records: ClinicalRecordStore,
    @Inject(TimelineSources) private readonly sources: TimelineSources,
  ) {}

  history(context: SecurityContext, patientId: string): Promise<HistoryView | null> {
    return this.#read(context, patientId, 'clinical.clinical_history', async () => ({
      current: await this.records.latestHistory(patientId),
      revisions: await this.records.historyRevisions(patientId),
    }));
  }

  /** Una revisión por su número: así se sigue leyendo la v1, que ya no se edita, y cada perfil anterior. */
  historyRevision(
    context: SecurityContext,
    patientId: string,
    revision: number,
  ): Promise<HistoryRevisionRecord | null> {
    return this.#read(context, patientId, 'clinical.clinical_history', () =>
      this.records.historyRevision(patientId, revision),
    );
  }

  conditions(
    context: SecurityContext,
    patientId: string,
  ): Promise<readonly ConditionRecord[] | null> {
    return this.#read(context, patientId, 'clinical.condition', () =>
      this.records.conditions(patientId),
    );
  }

  goals(context: SecurityContext, patientId: string): Promise<readonly GoalRecord[] | null> {
    return this.#read(context, patientId, 'clinical.goal', () => this.records.goals(patientId));
  }

  notes(context: SecurityContext, patientId: string): Promise<readonly NoteRecord[] | null> {
    return this.#read(context, patientId, 'clinical.clinical_note', () =>
      this.records.notes(patientId),
    );
  }

  /** La línea de tiempo del expediente, de lo más reciente a lo más antiguo. */
  timeline(
    context: SecurityContext,
    patientId: string,
    params: { cursor?: string | undefined; limit: number },
  ): Promise<TimelinePage | null> {
    return this.#read(context, patientId, 'clinical.timeline', async () => {
      const before = decodeCursor(params.cursor);
      // Cada fuente da su página, en la misma transacción y una tras otra; la mezcla se ordena igual que el SQL y se
      // corta en limit + 1.
      const pages = [await this.records.timeline(patientId, before, params.limit + 1)];
      for (const source of this.sources.all()) {
        pages.push(await source.entries(patientId, before, params.limit + 1));
      }
      const rows = pages
        .flat()
        .sort(newestFirst)
        .slice(0, params.limit + 1);
      const items = rows.slice(0, params.limit);
      const last = items.at(-1);
      return { items, nextCursor: rows.length > params.limit && last ? encodeCursor(last) : null };
    });
  }

  async #read<T>(
    context: SecurityContext,
    patientId: string,
    resourceType: string,
    work: () => Promise<T>,
  ): Promise<T | null> {
    const result = await this.uow.query(context, async () =>
      (await this.patients.find(patientId)) ? { value: await work() } : null,
    );
    if (!result) return null;
    await this.audit.record(context, {
      action: 'READ',
      resourceType,
      resourceId: patientId as Id<string>,
      patientId: patientId as PatientId,
    });
    return result.value;
  }
}

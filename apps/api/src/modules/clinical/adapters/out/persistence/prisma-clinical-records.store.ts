import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { OrganizationId, UserId } from '@nutricoach/shared-kernel';
import type { Db } from '../../../../../platform/index.js';
import type {
  ConditionKind,
  ConditionStatus,
  GoalKind,
  GoalStatus,
  NoteVisibility,
} from '../../../domain/clinical-rules.js';
import type {
  ClinicalRecordStore,
  ConditionRecord,
  GoalRecord,
  HistoryRevisionRecord,
  NoteRecord,
  TimelineKind,
  TimelineRecord,
} from '../../../application/ports/clinical.ports.js';

const isoDate = (value: Date): string => value.toISOString().slice(0, 10);
const optionalDate = (value: Date | null): string | null => (value ? isoDate(value) : null);
const asDate = (value: string): Date => new Date(`${value}T00:00:00Z`);

const CONDITION_FIELDS = {
  id: true,
  patientId: true,
  kind: true,
  label: true,
  codeSystem: true,
  code: true,
  status: true,
  since: true,
  notes: true,
  createdAt: true,
} as const;

const GOAL_FIELDS = {
  id: true,
  patientId: true,
  kind: true,
  metricCode: true,
  targetValue: true,
  targetDate: true,
  status: true,
  notes: true,
  createdAt: true,
} as const;

const NOTE_FIELDS = {
  id: true,
  patientId: true,
  authorMemberId: true,
  body: true,
  visibility: true,
  amendsNoteId: true,
  createdAt: true,
} as const;

const toCondition = (row: {
  id: string;
  patientId: string;
  kind: string;
  label: string;
  codeSystem: string | null;
  code: string | null;
  status: string;
  since: Date | null;
  notes: string | null;
  createdAt: Date;
}): ConditionRecord => ({
  ...row,
  kind: row.kind as ConditionKind,
  status: row.status as ConditionStatus,
  since: optionalDate(row.since),
});

const toNote = (row: {
  id: string;
  patientId: string;
  authorMemberId: string;
  body: string;
  visibility: string;
  amendsNoteId: string | null;
  createdAt: Date;
}): NoteRecord => ({ ...row, visibility: row.visibility as NoteVisibility });

/**
 * Historia clínica, condiciones, objetivos, notas y línea de tiempo con la transacción de la UnitOfWork. La RLS deja
 * ver solo lo que RN-A05 y AUTHOR_ONLY permiten; la historia y las notas no se actualizan (permisos de la base), y de
 * condiciones y objetivos solo cambian el estado y las notas.
 */
@Injectable()
export class PrismaClinicalRecordStore implements ClinicalRecordStore {
  constructor(@Inject(TransactionHost) private readonly db: Db) {}

  async lockPatient(patientId: string): Promise<void> {
    await this.db.tx
      .$executeRaw`SELECT 1 FROM clinical.patient WHERE id = ${patientId}::uuid FOR UPDATE`;
  }

  async latestHistory(patientId: string): Promise<HistoryRevisionRecord | null> {
    const row = await this.db.tx.clinicalHistory.findFirst({
      where: { patientId },
      orderBy: { revision: 'desc' },
      select: {
        id: true,
        revision: true,
        formCode: true,
        formVersion: true,
        answers: true,
        recordedAt: true,
        recordedBy: true,
      },
    });
    return row ? { ...row, recordedBy: row.recordedBy as UserId } : null;
  }

  async historyRevisions(
    patientId: string,
  ): Promise<readonly { revision: number; recordedAt: Date; recordedBy: UserId }[]> {
    const rows = await this.db.tx.clinicalHistory.findMany({
      where: { patientId },
      orderBy: { revision: 'desc' },
      select: { revision: true, recordedAt: true, recordedBy: true },
    });
    return rows.map((row) => ({ ...row, recordedBy: row.recordedBy as UserId }));
  }

  async insertHistory(
    revision: Parameters<ClinicalRecordStore['insertHistory']>[0],
  ): Promise<void> {
    await this.db.tx.clinicalHistory.createMany({
      data: [{ ...revision, answers: revision.answers as object }],
    });
  }

  async conditions(patientId: string): Promise<readonly ConditionRecord[]> {
    const rows = await this.db.tx.condition.findMany({
      where: { patientId },
      select: CONDITION_FIELDS,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
    return rows.map(toCondition);
  }

  async insertCondition(
    condition: ConditionRecord & { organizationId: OrganizationId; createdBy: UserId },
  ): Promise<void> {
    const { since, ...rest } = condition;
    await this.db.tx.condition.createMany({
      data: [{ ...rest, since: since ? asDate(since) : null }],
    });
  }

  async updateCondition(
    patientId: string,
    conditionId: string,
    changes: { status?: ConditionStatus; notes?: string | null },
  ): Promise<boolean> {
    const { count } = await this.db.tx.condition.updateMany({
      where: { id: conditionId, patientId },
      data: changes,
    });
    return count === 1;
  }

  async goals(patientId: string): Promise<readonly GoalRecord[]> {
    const rows = await this.db.tx.goal.findMany({
      where: { patientId },
      select: GOAL_FIELDS,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
    return rows.map((row) => ({
      ...row,
      kind: row.kind as GoalKind,
      status: row.status as GoalStatus,
      targetValue: row.targetValue === null ? null : Number(row.targetValue),
      targetDate: optionalDate(row.targetDate),
    }));
  }

  async insertGoal(
    goal: GoalRecord & { organizationId: OrganizationId; createdBy: UserId },
  ): Promise<void> {
    const { targetDate, ...rest } = goal;
    await this.db.tx.goal.createMany({
      data: [{ ...rest, targetDate: targetDate ? asDate(targetDate) : null }],
    });
  }

  async updateGoal(
    patientId: string,
    goalId: string,
    changes: { status?: GoalStatus; notes?: string | null },
  ): Promise<boolean> {
    const { count } = await this.db.tx.goal.updateMany({
      where: { id: goalId, patientId },
      data: changes,
    });
    return count === 1;
  }

  async notes(patientId: string): Promise<readonly NoteRecord[]> {
    const rows = await this.db.tx.clinicalNote.findMany({
      where: { patientId },
      select: NOTE_FIELDS,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toNote);
  }

  async findNote(patientId: string, noteId: string): Promise<NoteRecord | null> {
    const row = await this.db.tx.clinicalNote.findFirst({
      where: { id: noteId, patientId },
      select: NOTE_FIELDS,
    });
    return row ? toNote(row) : null;
  }

  async insertNote(note: NoteRecord & { organizationId: OrganizationId }): Promise<void> {
    await this.db.tx.clinicalNote.createMany({ data: [note] });
  }

  /** Hechos del expediente en orden inverso; cada tabla con su RLS (las notas AUTHOR_ONLY ajenas no aparecen). */
  async timeline(
    patientId: string,
    before: { occurredAt: Date; refId: string } | null,
    limit: number,
  ): Promise<readonly TimelineRecord[]> {
    const rows = await this.db.tx.$queryRaw<
      { kind: string; occurred_at: Date; ref_id: string; label: string; detail: string | null }[]
    >`
      SELECT kind, occurred_at, ref_id, label, detail FROM (
        SELECT 'PATIENT_REGISTERED' AS kind, p.created_at AS occurred_at, p.id AS ref_id, p.code AS label,
               NULL::text AS detail
        FROM clinical.patient p WHERE p.id = ${patientId}::uuid
        UNION ALL
        SELECT 'CONSENT_GRANTED', c.granted_at, c.id, c.purpose, NULL FROM clinical.consent c
        WHERE c.patient_id = ${patientId}::uuid
        UNION ALL
        SELECT 'CONSENT_REVOKED', c.revoked_at, c.id, c.purpose, NULL FROM clinical.consent c
        WHERE c.patient_id = ${patientId}::uuid AND c.revoked_at IS NOT NULL
        UNION ALL
        SELECT 'HISTORY_REVISED', h.recorded_at, h.id, h.revision::text, NULL FROM clinical.clinical_history h
        WHERE h.patient_id = ${patientId}::uuid
        UNION ALL
        SELECT 'CONDITION_RECORDED', co.created_at, co.id, co.kind, co.label FROM clinical.condition co
        WHERE co.patient_id = ${patientId}::uuid
        UNION ALL
        SELECT 'GOAL_RECORDED', g.created_at, g.id, g.kind, NULL FROM clinical.goal g
        WHERE g.patient_id = ${patientId}::uuid
        UNION ALL
        SELECT 'NOTE_WRITTEN', n.created_at, n.id, n.visibility, NULL FROM clinical.clinical_note n
        WHERE n.patient_id = ${patientId}::uuid
      ) t
      WHERE (${before?.occurredAt ?? null}::timestamptz IS NULL
             OR (occurred_at, ref_id) < (${before?.occurredAt ?? null}::timestamptz, ${before?.refId ?? null}::uuid))
      ORDER BY occurred_at DESC, ref_id DESC
      LIMIT ${limit}`;
    return rows.map((row) => ({
      kind: row.kind as TimelineKind,
      occurredAt: row.occurred_at,
      refId: row.ref_id,
      label: row.label,
      detail: row.detail,
    }));
  }
}

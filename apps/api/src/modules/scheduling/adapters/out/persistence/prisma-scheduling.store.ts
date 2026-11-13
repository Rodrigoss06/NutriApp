import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { Db } from '../../../../../platform/index.js';
import type { TimelineCursor, TimelineEntry } from '../../../../clinical/index.js';
import type {
  AppointmentChanges,
  NewAppointment,
  SchedulingStore,
} from '../../../application/ports/scheduling.ports.js';
import { AppointmentOverlap } from '../../../application/scheduling.commands.js';
import type {
  AppointmentKind,
  AppointmentMode,
  AppointmentRecord,
  AppointmentStatus,
} from '../../../domain/appointment.js';
import type { AvailabilitySlot } from '../../../domain/availability.js';

/** La restricción de exclusión de 0010 (RN-J01): PostgreSQL la nombra así y responde 23P01. */
const OVERLAP_CONSTRAINT = 'appointment_member_id_tstzrange_excl';

/** ¿El error es el cruce de citas? Busca el código o el nombre de la restricción en el error y sus causas. */
export function isOverlapViolation(error: unknown): boolean {
  const seen = new Set<object>();
  const visit = (value: unknown, depth: number): boolean => {
    if (value === null || typeof value !== 'object' || depth > 5 || seen.has(value)) return false;
    seen.add(value);
    const record = value as Record<string, unknown>;
    if (record.code === '23P01' || record.originalCode === '23P01') return true;
    if (typeof record.message === 'string' && record.message.includes(OVERLAP_CONSTRAINT))
      return true;
    return ['cause', 'meta', 'error', 'driverAdapterError'].some((key) =>
      visit(record[key], depth + 1),
    );
  };
  return visit(error, 0);
}

interface AppointmentRow {
  readonly id: string;
  readonly organizationId: string;
  readonly memberId: string;
  readonly patientId: string | null;
  readonly kind: string;
  readonly mode: string;
  readonly location: string | null;
  readonly meetingUrl: string | null;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly status: string;
  readonly notes: string | null;
  readonly reminderSentAt: Date | null;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly version: number;
}

const toAppointment = (row: AppointmentRow): AppointmentRecord => ({
  ...row,
  kind: row.kind as AppointmentKind,
  mode: row.mode as AppointmentMode,
  status: row.status as AppointmentStatus,
});

const ACTIVE: readonly AppointmentStatus[] = ['SCHEDULED', 'CONFIRMED'];

/** hh:mm de una columna time (Prisma la lee como fecha del 1970-01-01 en UTC). */
const clock = (value: Date): string => value.toISOString().slice(11, 16);
const asTime = (hhmm: string): Date => new Date(`1970-01-01T${hhmm}:00.000Z`);

/**
 * scheduling.appointment y scheduling.availability (05.3), en la transacción de la UnitOfWork. Sin RETURNING: la RLS decide qué
 * ve cada contexto. Un cruce rechazado por la base sube como AppointmentOverlap y revierte la transacción (RN-J01).
 */
@Injectable()
export class PrismaSchedulingStore implements SchedulingStore {
  constructor(@Inject(TransactionHost) readonly db: Db) {}

  async insert(appointment: NewAppointment): Promise<void> {
    await this.#overlapAware(() => this.db.tx.appointment.createMany({ data: [appointment] }));
  }

  async find(id: string): Promise<AppointmentRecord | null> {
    const row = await this.db.tx.appointment.findFirst({ where: { id } });
    return row ? toAppointment(row) : null;
  }

  async update(
    id: string,
    version: number,
    changes: AppointmentChanges,
    updatedAt: Date,
  ): Promise<boolean> {
    const { count } = await this.#overlapAware(() =>
      this.db.tx.appointment.updateMany({
        where: { id, version },
        data: { ...changes, updatedAt, version: { increment: 1 } },
      }),
    );
    return count === 1;
  }

  async range(
    from: Date,
    to: Date,
    memberId: string | null,
  ): Promise<readonly AppointmentRecord[]> {
    const rows = await this.db.tx.appointment.findMany({
      where: { startsAt: { gte: from, lt: to }, ...(memberId ? { memberId } : {}) },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toAppointment);
  }

  async forPatient(patientId: string): Promise<readonly AppointmentRecord[]> {
    const rows = await this.db.tx.appointment.findMany({
      where: { patientId },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toAppointment);
  }

  async dueReminders(after: Date, until: Date): Promise<readonly AppointmentRecord[]> {
    const rows = await this.db.tx.appointment.findMany({
      where: { status: 'CONFIRMED', reminderSentAt: null, startsAt: { gt: after, lte: until } },
      orderBy: [{ startsAt: 'asc' }],
    });
    return rows.map(toAppointment);
  }

  async nextForPatients(
    patientIds: readonly string[],
    from: Date,
  ): Promise<ReadonlyMap<string, Date>> {
    if (patientIds.length === 0) return new Map();
    const rows = await this.db.tx.appointment.groupBy({
      by: ['patientId'],
      where: {
        patientId: { in: [...patientIds] },
        status: { in: [...ACTIVE] },
        startsAt: { gt: from },
      },
      _min: { startsAt: true },
    });
    return new Map(
      rows.flatMap((row) =>
        row.patientId && row._min.startsAt ? [[row.patientId, row._min.startsAt] as const] : [],
      ),
    );
  }

  async timeline(
    patientId: string,
    startedBy: Date,
    before: TimelineCursor | null,
    limit: number,
  ): Promise<readonly TimelineEntry[]> {
    const rows = await this.db.tx.$queryRaw<
      { id: string; starts_at: Date; kind: string; status: string }[]
    >`
      SELECT id, starts_at, kind, status FROM scheduling.appointment
      WHERE patient_id = ${patientId}::uuid AND status <> 'CANCELLED' AND starts_at <= ${startedBy}
        AND (${before?.occurredAt ?? null}::timestamptz IS NULL
             OR (starts_at, id) < (${before?.occurredAt ?? null}::timestamptz, ${before?.refId ?? null}::uuid))
      ORDER BY starts_at DESC, id DESC
      LIMIT ${limit}`;
    return rows.map((row) => ({
      kind: 'APPOINTMENT',
      occurredAt: row.starts_at,
      refId: row.id,
      label: row.kind,
      detail: row.status,
    }));
  }

  async availability(memberId: string): Promise<readonly AvailabilitySlot[]> {
    const rows = await this.db.tx.availability.findMany({
      where: { memberId, validTo: null },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
    return rows.map((row) => ({
      dayOfWeek: row.dayOfWeek,
      startTime: clock(row.startTime),
      endTime: clock(row.endTime),
    }));
  }

  async replaceAvailability(
    organizationId: string,
    memberId: string,
    slots: readonly (AvailabilitySlot & { readonly id: string })[],
    validFrom: string,
  ): Promise<void> {
    await this.db.tx.availability.deleteMany({ where: { memberId } });
    if (slots.length === 0) return;
    await this.db.tx.availability.createMany({
      data: slots.map((slot) => ({
        id: slot.id,
        organizationId,
        memberId,
        dayOfWeek: slot.dayOfWeek,
        startTime: asTime(slot.startTime),
        endTime: asTime(slot.endTime),
        validFrom: new Date(`${validFrom}T00:00:00.000Z`),
        validTo: null,
      })),
    });
  }

  async #overlapAware<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (isOverlapViolation(error)) throw new AppointmentOverlap();
      throw error;
    }
  }
}

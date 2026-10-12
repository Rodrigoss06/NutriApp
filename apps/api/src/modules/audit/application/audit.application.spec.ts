import type {
  OrganizationId,
  SecurityContext,
  UnitOfWork,
  UserId,
} from '@nutricoach/shared-kernel';
import { describe, expect, it } from 'vitest';
import type { ClinicalApi } from '../../clinical/index.js';
import type { IamApi } from '../../iam/index.js';
import type { AuditLogFilter, AuditLogRecord, AuditLogStore } from './ports/audit-log.port.js';
import { AuditQueries } from './queries/audit.queries.js';

const OWNER: SecurityContext = {
  organizationId: '0192f0a0-0000-7000-8000-00000000000a' as OrganizationId,
  userId: '0192f0a0-0000-7000-8000-0000000000aa' as UserId,
  role: 'OWNER',
  patientId: null,
};
const ACTOR = '0192f0a0-0000-7000-8000-0000000000ab' as UserId;
const PATIENT = '0192f0a0-0000-7000-8000-0000000000c1';

const uow: UnitOfWork = {
  run: (_context, work) => work(),
  query: (_context, work) => work(),
};

/** Bitácora en memoria con el orden y el cursor de la consulta real: de lo más reciente a lo más antiguo. */
class MemoryLog implements AuditLogStore {
  readonly filters: AuditLogFilter[] = [];
  constructor(readonly rows: AuditLogRecord[]) {}
  list(filter: AuditLogFilter) {
    this.filters.push(filter);
    return Promise.resolve(
      this.rows
        .filter((r) => r.occurredAt >= filter.from && r.occurredAt <= filter.to)
        .filter((r) => !filter.patientId || r.patientId === filter.patientId)
        .filter((r) => !filter.userId || r.actorUserId === filter.userId)
        .filter((r) => !filter.action || r.action === filter.action)
        .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime() || b.id.localeCompare(a.id))
        .filter(
          (r) =>
            !filter.after ||
            r.occurredAt < filter.after.occurredAt ||
            (r.occurredAt.getTime() === filter.after.occurredAt.getTime() &&
              r.id < filter.after.id),
        )
        .slice(0, filter.limit),
    );
  }
}

const row = (
  id: string,
  minute: number,
  overrides: Partial<AuditLogRecord> = {},
): AuditLogRecord => ({
  id,
  occurredAt: new Date(Date.UTC(2026, 9, 10, 15, minute)),
  actorUserId: ACTOR,
  actorRole: 'PROFESSIONAL',
  action: 'READ',
  resourceType: 'clinical.patient',
  resourceId: PATIENT,
  patientId: PATIENT,
  changedFields: [],
  outcome: 'SUCCESS',
  requestId: null,
  ...overrides,
});

const iam = {
  displayNames: (ids: readonly UserId[]) =>
    Promise.resolve(new Map(ids.filter((id) => id === ACTOR).map((id) => [id, 'Lucía Torres']))),
} as unknown as IamApi;
const clinical = {
  patientCodes: (ids: readonly string[]) =>
    Promise.resolve(new Map(ids.filter((id) => id === PATIENT).map((id) => [id, 'P-000001']))),
} as unknown as ClinicalApi;

const range = { from: '2026-10-10T00:00:00-05:00', to: '2026-10-10T23:59:59-05:00' };

describe('RF-06 · consulta de auditoría del dueño', () => {
  it('muestra el nombre de quien actuó y el código del paciente; sin actor o sin paciente, nulos', async () => {
    const log = new MemoryLog([
      row('a', 1),
      row('b', 2, { actorUserId: null, actorRole: 'SYSTEM', patientId: null, action: 'LOGOUT' }),
    ]);
    const page = await new AuditQueries(uow, log, iam, clinical).list(OWNER, {
      ...range,
      limit: 10,
    });
    expect(page.events.map((e) => [e.id, e.actorName, e.patientCode])).toEqual([
      ['b', null, null],
      ['a', 'Lucía Torres', 'P-000001'],
    ]);
    expect(page.nextCursor).toBeNull();
  });

  it('pasa los filtros a la bitácora y pagina con un cursor opaco; un cursor ilegible empieza de nuevo', async () => {
    const log = new MemoryLog([
      row('a', 1),
      row('b', 2),
      row('c', 3),
      row('d', 4, { action: 'UPDATE' }),
    ]);
    const queries = new AuditQueries(uow, log, iam, clinical);
    const filters = { ...range, patientId: PATIENT, userId: ACTOR, action: 'READ', limit: 2 };
    const first = await queries.list(OWNER, filters);
    expect(first.events.map((e) => e.id)).toEqual(['c', 'b']);
    expect(log.filters[0]).toMatchObject({
      from: new Date('2026-10-10T05:00:00Z'),
      patientId: PATIENT,
      userId: ACTOR,
      action: 'READ',
      after: null,
      limit: 3,
    });
    const second = await queries.list(OWNER, { ...filters, cursor: first.nextCursor ?? undefined });
    expect(second.events.map((e) => e.id)).toEqual(['a']);
    expect(second.nextCursor).toBeNull();
    const garbage = await queries.list(OWNER, { ...range, limit: 10, cursor: '%%%' });
    expect(garbage.events).toHaveLength(4);
    expect(log.filters.at(-1)?.after).toBeNull();
  });
});

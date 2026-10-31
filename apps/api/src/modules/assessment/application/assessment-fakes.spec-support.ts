import {
  domainError,
  err,
  ok,
  type AuditEntry,
  type AuditPort,
  type DomainError,
  type DomainEvent,
  type Id,
  type OrganizationId,
  type Outbox,
  type Result,
  type SecurityContext,
  type UnitOfWork,
  type UserId,
} from '@nutricoach/shared-kernel';
import { v7 as uuidv7 } from 'uuid';
import catalogSeed from '../../../../../../seeds/assessment/measurement-sites.json' with { type: 'json' };
import type {
  ClinicalApi,
  PatientRef,
  TimelineCursor,
  TimelineEntry,
} from '../../clinical/index.js';
import type { FileRegistry } from '../../../platform/index.js';
import type { TenancyApi } from '../../tenancy/index.js';
import type { Population } from '@nutricoach/engine';
import type { SiteDefinition } from '../domain/assessment-rules.js';
import type { MethodPurpose, PreferenceRow } from '../domain/calculation-plan.js';
import type { ReferenceRange } from '../domain/interpretation.js';
import type {
  BiaReadingRecord,
  CalculationStore,
  MetricRow,
  StoredResult,
  EvaluationChanges,
  EvaluationRecord,
  EvaluationStore,
  FunctionalCatalog,
  FunctionalEvaluationRecord,
  FunctionalEvaluationStore,
  MeasurementRow,
  MovementTestRow,
  PhysicalResultRow,
  SiteCatalog,
  TechnicalErrorRecord,
  TechnicalErrorStore,
} from './ports/assessment.ports.js';

export const ORG = '0192f0a0-0000-7000-8000-00000000000a' as OrganizationId;
export const SITES = catalogSeed.sites as SiteDefinition[];

export class FakeClock {
  current = new Date('2026-10-13T13:30:00.000Z');
  now(): Date {
    return this.current;
  }
}

export const fakeIds = { newId: <T extends string>() => uuidv7() as Id<T> };

/** Corre el trabajo y, si lanza, deshace lo que los almacenes en memoria anotaron (como un ROLLBACK). */
export class FakeUow implements UnitOfWork {
  readonly #stores: { snapshot(): () => void }[] = [];

  track(...stores: { snapshot(): () => void }[]): this {
    this.#stores.push(...stores);
    return this;
  }

  async run<T>(_context: SecurityContext, work: () => Promise<T>): Promise<T> {
    const restores = this.#stores.map((store) => store.snapshot());
    try {
      return await work();
    } catch (error) {
      restores.forEach((restore) => {
        restore();
      });
      throw error;
    }
  }

  query<T>(_context: SecurityContext, work: () => Promise<T>): Promise<T> {
    return work();
  }
}

export class FakeOutbox implements Outbox {
  readonly events: DomainEvent[] = [];
  append(events: readonly DomainEvent[]): Promise<void> {
    this.events.push(...events);
    return Promise.resolve();
  }
  snapshot(): () => void {
    const size = this.events.length;
    return () => {
      this.events.length = size;
    };
  }
  types(): string[] {
    return this.events.map((event) => event.type);
  }
}

export class FakeAudit implements AuditPort {
  readonly entries: AuditEntry[] = [];
  record(_context: SecurityContext, entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
}

export const staffContext = (
  role: 'OWNER' | 'ADMIN' | 'PROFESSIONAL',
  memberId: string,
): SecurityContext => ({
  organizationId: ORG,
  userId: `${memberId.slice(0, -1)}u` as UserId,
  role,
  patientId: null,
  memberId: memberId as Id<'MemberId'>,
});

const DENIED = domainError({ code: 'NC-CLI-020', message: 'Sin acceso de escritura.' });
const NO_CONSENT = domainError({
  code: 'NC-CLI-009',
  rule: 'RN-B01',
  message: 'Sin consentimiento HEALTH_DATA.',
});
const NO_IMAGES = domainError({
  code: 'NC-CLI-031',
  rule: 'RN-B01',
  message: 'Sin consentimiento IMAGES.',
});

/** clinical visto desde assessment: el paciente que se ve y quién escribe en su expediente. */
export class FakeClinical {
  readonly patients = new Map<string, PatientRef>();
  /** memberId con escritura en el equipo de cada paciente. */
  readonly writers = new Map<string, Set<string>>();
  readonly consented = new Set<string>();
  readonly images = new Set<string>();
  readonly sources: {
    entries(p: string, b: TimelineCursor | null, l: number): Promise<readonly TimelineEntry[]>;
  }[] = [];

  add(ref: PatientRef, writer: string): void {
    this.patients.set(ref.id, ref);
    this.writers.set(ref.id, new Set([writer]));
    this.consented.add(ref.id);
  }

  asApi(): ClinicalApi {
    return {
      patientRef: (id: string) => Promise.resolve(this.patients.get(id) ?? null),
      ensureRecordWritable: (
        context: SecurityContext,
        id: string,
      ): Promise<Result<PatientRef, DomainError>> => {
        const patient = this.patients.get(id);
        if (!patient)
          return Promise.resolve(
            err(domainError({ code: 'NC-CLI-005', message: 'No encontrado.' })),
          );
        if (!this.writers.get(id)?.has(context.memberId ?? '')) return Promise.resolve(err(DENIED));
        if (!this.consented.has(id)) return Promise.resolve(err(NO_CONSENT));
        return Promise.resolve(ok(patient));
      },
      ensureImagesConsent: (id: string): Promise<Result<void, DomainError>> =>
        Promise.resolve(this.images.has(id) ? ok(undefined) : err(NO_IMAGES)),
      registerTimelineSource: (source: FakeClinical['sources'][number]) => {
        this.sources.push(source);
      },
    } as unknown as ClinicalApi;
  }
}

export function fakeTenancy(
  members: Set<string>,
  options: { timezone?: string; leeCoefficient?: number | null } = {},
): TenancyApi {
  return {
    isActiveMemberId: (_org: OrganizationId, memberId: string) =>
      Promise.resolve(members.has(memberId)),
    organization: () => Promise.resolve({ timezone: options.timezone ?? 'America/Lima' }),
    leeReferenceGroupCoefficient: () =>
      Promise.resolve(options.leeCoefficient === undefined ? 0 : options.leeCoefficient),
  } as unknown as TenancyApi;
}

export const memoryCatalog: SiteCatalog = { all: () => Promise.resolve(SITES) };

const clone = <T>(value: T): T => structuredClone(value);

export class MemoryEvaluations implements EvaluationStore {
  rows = new Map<string, EvaluationRecord>();
  measurementRows = new Map<string, Map<string, MeasurementRow>>();
  bia = new Map<string, BiaReadingRecord[]>();

  snapshot(): () => void {
    const saved = clone({ rows: this.rows, m: this.measurementRows, bia: this.bia });
    return () => {
      this.rows = saved.rows;
      this.measurementRows = saved.m;
      this.bia = saved.bia;
    };
  }

  insert(evaluation: EvaluationRecord) {
    if (
      [...this.rows.values()].some(
        (r) => r.amendsEvaluationId && r.amendsEvaluationId === evaluation.amendsEvaluationId,
      )
    ) {
      return Promise.reject(new Error('evaluation_amended_once'));
    }
    this.rows.set(evaluation.id, clone(evaluation));
    return Promise.resolve();
  }
  find(id: string) {
    const row = this.rows.get(id);
    return Promise.resolve(row ? clone(row) : null);
  }
  listByPatient(patientId: string) {
    return Promise.resolve(
      [...this.rows.values()]
        .filter((r) => r.patientId === patientId)
        .sort((a, b) => b.measuredAt.getTime() - a.measuredAt.getTime() || b.revision - a.revision),
    );
  }
  amendedBy(ids: readonly string[]) {
    return Promise.resolve(
      new Map(
        [...this.rows.values()].flatMap((r) =>
          r.amendsEvaluationId && ids.includes(r.amendsEvaluationId)
            ? [[r.amendsEvaluationId, r.id] as const]
            : [],
        ),
      ),
    );
  }
  updateDraft(id: string, expectedVersion: number, changes: EvaluationChanges) {
    const row = this.rows.get(id);
    if (row?.version !== expectedVersion || row.status !== 'DRAFT') return Promise.resolve(false);
    this.rows.set(id, { ...row, ...changes, version: row.version + 1 });
    return Promise.resolve(true);
  }
  touch(id: string) {
    const row = this.rows.get(id);
    if (row?.status === 'DRAFT') this.rows.set(id, { ...row, version: row.version + 1 });
    return Promise.resolve();
  }
  close(id: string, expectedVersion: number, closedAt: Date) {
    const row = this.rows.get(id);
    if (row?.version !== expectedVersion || row.status !== 'DRAFT') return Promise.resolve(false);
    this.rows.set(id, { ...row, status: 'CLOSED', closedAt, version: row.version + 1 });
    return Promise.resolve(true);
  }
  markAmended(id: string) {
    const row = this.rows.get(id);
    if (row?.status !== 'CLOSED') return Promise.resolve(false);
    this.rows.set(id, { ...row, status: 'AMENDED' });
    return Promise.resolve(true);
  }
  measurements(evaluationId: string) {
    return Promise.resolve(
      [...(this.measurementRows.get(evaluationId)?.values() ?? [])].map(
        ({ siteCode, attempts, side }) => ({
          siteCode,
          attempts,
          side,
        }),
      ),
    );
  }
  saveMeasurement(evaluationId: string, _org: OrganizationId, row: MeasurementRow) {
    if (this.rows.get(evaluationId)?.status !== 'DRAFT') {
      return Promise.reject(new Error('measurement_only_in_draft'));
    }
    const sites = this.measurementRows.get(evaluationId) ?? new Map<string, MeasurementRow>();
    sites.set(row.siteCode, clone(row));
    this.measurementRows.set(evaluationId, sites);
    return Promise.resolve();
  }
  deleteMeasurement(evaluationId: string, siteCode: string) {
    return Promise.resolve(this.measurementRows.get(evaluationId)?.delete(siteCode) ?? false);
  }
  biaReadings(evaluationId: string) {
    return Promise.resolve(this.bia.get(evaluationId) ?? []);
  }
  insertBiaReading(_org: OrganizationId, reading: BiaReadingRecord) {
    this.bia.set(reading.evaluationId, [
      ...(this.bia.get(reading.evaluationId) ?? []),
      clone(reading),
    ]);
    return Promise.resolve();
  }
  deleteBiaReading(evaluationId: string, readingId: string) {
    const readings = this.bia.get(evaluationId) ?? [];
    const kept = readings.filter((r) => r.id !== readingId);
    this.bia.set(evaluationId, kept);
    return Promise.resolve(kept.length < readings.length);
  }
  closedTimeline(patientId: string, before: TimelineCursor | null, limit: number) {
    return Promise.resolve(
      [...this.rows.values()]
        .filter((r) => r.patientId === patientId && r.closedAt)
        .filter((r) => !before || (r.closedAt?.getTime() ?? 0) < before.occurredAt.getTime())
        .sort((a, b) => (b.closedAt?.getTime() ?? 0) - (a.closedAt?.getTime() ?? 0))
        .slice(0, limit)
        .map((r) => ({
          kind: 'EVALUATION_CLOSED' as const,
          occurredAt: r.closedAt ?? new Date(0),
          refId: r.id,
          label: r.level ?? 'BIA',
          detail: r.amendReason,
        })),
    );
  }
}

export const FUNCTIONAL_CATALOG: FunctionalCatalog = {
  movementTests: [
    { code: 'PLANK', name: 'Plancha', kind: 'DYNAMIC', region: 'Tronco' },
    { code: 'PELVIS', name: 'Pelvis', kind: 'STATIC', region: 'Lumbopélvica' },
  ],
  physicalTests: [
    {
      code: 'PUSH_UPS',
      domain: 'MUSCULAR_ENDURANCE',
      name: 'Flexiones',
      protocol: 'Técnica',
      unit: 'repeticiones',
    },
    { code: 'WALK_6MIN', domain: 'AEROBIC', name: 'Caminata', protocol: 'Superficie', unit: 'm' },
  ],
};

/** La postura y las pruebas físicas viven en la misma tabla que las demás evaluaciones: las filas se comparten. */
export class MemoryFunctionalEvaluations implements FunctionalEvaluationStore {
  movementRows = new Map<string, MovementTestRow[]>();
  physicalRows = new Map<string, PhysicalResultRow[]>();

  constructor(private readonly evaluations: MemoryEvaluations) {}

  snapshot(): () => void {
    const saved = clone({ movement: this.movementRows, physical: this.physicalRows });
    return () => {
      this.movementRows = saved.movement;
      this.physicalRows = saved.physical;
    };
  }

  #all(): FunctionalEvaluationRecord[] {
    return [...this.evaluations.rows.values()] as unknown as FunctionalEvaluationRecord[];
  }

  catalog() {
    return Promise.resolve(FUNCTIONAL_CATALOG);
  }
  insert(evaluation: FunctionalEvaluationRecord) {
    return this.evaluations.insert(evaluation as unknown as EvaluationRecord);
  }
  find(id: string) {
    const row = this.#all().find((r) => r.id === id);
    return Promise.resolve(row && ['MOVEMENT', 'FITNESS'].includes(row.kind) ? clone(row) : null);
  }
  listByPatient(patientId: string, kind: 'MOVEMENT' | 'FITNESS') {
    return Promise.resolve(this.#all().filter((r) => r.patientId === patientId && r.kind === kind));
  }
  movementTests(evaluationId: string) {
    return Promise.resolve(clone(this.movementRows.get(evaluationId) ?? []));
  }
  physicalResults(evaluationId: string) {
    return Promise.resolve(clone(this.physicalRows.get(evaluationId) ?? []));
  }
  replaceMovementTest(evaluation: FunctionalEvaluationRecord, row: MovementTestRow) {
    const others = (this.movementRows.get(evaluation.id) ?? []).filter(
      (r) => r.testCode !== row.testCode,
    );
    this.movementRows.set(evaluation.id, [...others, clone(row)]);
    return Promise.resolve();
  }
  replacePhysicalResult(evaluation: FunctionalEvaluationRecord, row: PhysicalResultRow) {
    const others = (this.physicalRows.get(evaluation.id) ?? []).filter(
      (r) => r.testCode !== row.testCode,
    );
    this.physicalRows.set(evaluation.id, [...others, clone(row)]);
    return Promise.resolve();
  }
  removeMovementTest(evaluationId: string, testCode: string) {
    const rows = this.movementRows.get(evaluationId) ?? [];
    const others = rows.filter((r) => r.testCode !== testCode);
    this.movementRows.set(evaluationId, others);
    return Promise.resolve(others.length < rows.length);
  }
  removePhysicalResult(evaluationId: string, testCode: string) {
    const rows = this.physicalRows.get(evaluationId) ?? [];
    const others = rows.filter((r) => r.testCode !== testCode);
    this.physicalRows.set(evaluationId, others);
    return Promise.resolve(others.length < rows.length);
  }
  movementKeys(patientId: string) {
    const own = this.#all().filter((r) => r.patientId === patientId && r.kind === 'MOVEMENT');
    return Promise.resolve({
      evaluated: own.some((r) => r.status === 'CLOSED'),
      statuses: own.flatMap((r) => (this.movementRows.get(r.id) ?? []).map((row) => row.status)),
    });
  }
  closedPhysical(patientId: string) {
    return Promise.resolve(
      this.#all()
        .filter((r) => r.patientId === patientId && r.kind === 'FITNESS' && r.status === 'CLOSED')
        .map((r) => ({
          moment: r.moment ?? 'BASELINE',
          localDate: r.localDate,
          results: (this.physicalRows.get(r.id) ?? []).map(({ testCode, value }) => ({
            testCode,
            value,
          })),
        })),
    );
  }
}

/** FileRegistry falsa: lee el tipo del primer byte, guarda en memoria y anota lo descartado. */
export class FakeFiles {
  readonly stored = new Map<string, { content: Uint8Array; purpose: string | null }>();
  readonly discarded: string[] = [];
  failOnRegister = false;
  write(_org: OrganizationId, content: Uint8Array) {
    if (content[0] !== 0x89) return Promise.resolve(null);
    const id = uuidv7();
    this.stored.set(id, { content, purpose: null });
    return Promise.resolve({
      id,
      key: `org/${id}`,
      mimeType: 'image/png' as const,
      sha256: new Uint8Array(32),
    });
  }
  register(file: { id: string; purpose: string }) {
    if (this.failOnRegister) return Promise.reject(new Error('sin espacio'));
    const row = this.stored.get(file.id);
    if (row) row.purpose = file.purpose;
    return Promise.resolve();
  }
  discard(key: string) {
    this.discarded.push(key);
    return Promise.resolve();
  }
  read(id: string) {
    const row = this.stored.get(id);
    return Promise.resolve(
      row ? { content: Buffer.from(row.content), mimeType: 'image/png' } : null,
    );
  }
  asRegistry(): FileRegistry {
    return this as unknown as FileRegistry;
  }
}

export class MemoryTechnicalErrors implements TechnicalErrorStore {
  rows: TechnicalErrorRecord[] = [];
  snapshot(): () => void {
    const saved = [...this.rows];
    return () => {
      this.rows = saved;
    };
  }
  insert(rows: readonly TechnicalErrorRecord[]) {
    this.rows.push(...rows);
    return Promise.resolve();
  }
  current(memberId: string, onDate: string) {
    const latest = new Map<string, TechnicalErrorRecord>();
    for (const row of this.rows.filter((r) => r.memberId === memberId && r.validFrom <= onDate)) {
      const seen = latest.get(row.siteCode);
      if (
        !seen ||
        row.validFrom > seen.validFrom ||
        (row.validFrom === seen.validFrom && row.createdAt >= seen.createdAt)
      ) {
        latest.set(row.siteCode, row);
      }
    }
    return Promise.resolve(
      [...latest.values()].sort((a, b) => a.siteCode.localeCompare(b.siteCode)),
    );
  }
}

export class MemoryCalculations implements CalculationStore {
  rows: StoredResult[] = [];
  metrics: { resultId: string; metric: MetricRow }[] = [];
  preferences: (PreferenceRow & { patientId: string | null })[] = [];
  ranges: ReferenceRange[] = [];

  snapshot(): () => void {
    const saved = clone({ rows: this.rows, metrics: this.metrics, preferences: this.preferences });
    return () => {
      this.rows = saved.rows;
      this.metrics = saved.metrics;
      this.preferences = saved.preferences;
    };
  }
  results(evaluationIds: readonly string[]) {
    return Promise.resolve(this.rows.filter((r) => evaluationIds.includes(r.evaluationId)));
  }
  insertResult(_org: OrganizationId, result: StoredResult, metrics: readonly MetricRow[]) {
    if (
      this.rows.some(
        (r) =>
          r.evaluationId === result.evaluationId &&
          r.methodCode === result.methodCode &&
          r.methodVersion === result.methodVersion &&
          r.inputsHash === result.inputsHash,
      )
    ) {
      return Promise.reject(new Error('calculation_result_unique'));
    }
    this.rows.push(result);
    this.metrics.push(...metrics.map((metric) => ({ resultId: result.id, metric })));
    return Promise.resolve();
  }
  setStatus(id: string, status: StoredResult['status'], supersededBy: string | null) {
    this.rows = this.rows.map((r) => (r.id === id ? { ...r, status, supersededBy } : r));
    return Promise.resolve();
  }
  preferenceRows(patientId: string | null) {
    return Promise.resolve(
      this.preferences.filter((p) => p.patientId === null || p.patientId === patientId),
    );
  }
  savePreference(
    _org: OrganizationId,
    _id: string,
    target: { readonly patientId: string } | { readonly population: string },
    purpose: MethodPurpose,
    methodCode: string,
  ) {
    const patientId = 'patientId' in target ? target.patientId : null;
    const population = 'population' in target ? (target.population as Population) : null;
    this.preferences = [
      ...this.preferences.filter(
        (p) => !(p.patientId === patientId && p.population === population && p.purpose === purpose),
      ),
      { organizationLevel: patientId === null, patientId, population, purpose, methodCode },
    ];
    return Promise.resolve();
  }
  deletePreference(
    target: { readonly patientId: string } | { readonly population: string },
    purpose: MethodPurpose,
  ) {
    const before = this.preferences.length;
    this.preferences = this.preferences.filter((p) =>
      'patientId' in target
        ? !(p.patientId === target.patientId && p.purpose === purpose)
        : !(p.patientId === null && p.population === target.population && p.purpose === purpose),
    );
    return Promise.resolve(this.preferences.length < before);
  }
  referenceRanges() {
    return Promise.resolve(this.ranges);
  }
}

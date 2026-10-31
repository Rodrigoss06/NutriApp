import {
  asId,
  ok,
  err,
  domainError,
  type AuditEntry,
  type AuditPort,
  type Clock,
  type DomainError,
  type DomainEvent,
  type EncryptionPort,
  type IdGenerator,
  type OrganizationId,
  type Outbox,
  type Result,
  type SecurityContext,
  type UnitOfWork,
  type UserId,
} from '@nutricoach/shared-kernel';
import { v7 as uuidv7 } from 'uuid';
import type { FileRegistry } from '../../../platform/index.js';
import type { IamApi } from '../../iam/index.js';
import type { TenancyApi } from '../../tenancy/index.js';
import type { ConsentPurpose } from '../domain/clinical-rules.js';
import type {
  CareTeamRecord,
  ConsentDocumentRecord,
  ConsentRecord,
  ConsentStore,
  PatientChanges,
  PatientRecord,
  PatientSearch,
  PatientStore,
  InvitationPreviewRecord,
  ClinicalRecordStore,
  ConditionRecord,
  GoalRecord,
  HistoryRevisionRecord,
  NoteRecord,
  TimelineRecord,
} from './ports/clinical.ports.js';

/** Puertos falsos en memoria para los casos de uso de clinical (06 §6). Sin RLS: la prueban las de integración. */
export class FakeClock implements Clock {
  current = new Date('2026-10-09T15:00:00Z');
  now(): Date {
    return new Date(this.current);
  }
}

export const fakeIds: IdGenerator = { newId: <T extends string>() => asId<T>(uuidv7()) };

export class FakeUow implements UnitOfWork {
  readonly contexts: SecurityContext[] = [];
  run<T>(context: SecurityContext, work: () => Promise<T>): Promise<T> {
    this.contexts.push(context);
    return work();
  }
  query<T>(context: SecurityContext, work: () => Promise<T>): Promise<T> {
    return this.run(context, work);
  }
}

export class FakeOutbox implements Outbox {
  readonly events: DomainEvent[] = [];
  append(events: readonly DomainEvent[]): Promise<void> {
    this.events.push(...events);
    return Promise.resolve();
  }
  types(): string[] {
    return this.events.map((e) => e.type);
  }
}

export class FakeAudit implements AuditPort {
  readonly entries: AuditEntry[] = [];
  record(_context: SecurityContext, entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
}

/** Cifrado reversible y legible para las pruebas: nunca el número en claro en lo guardado. */
export const fakeEncryption: EncryptionPort = {
  encrypt: (plaintext, aad) =>
    new TextEncoder().encode(`${aad}|${Array.from(plaintext).reverse().join('')}`),
  decrypt: (ciphertext, aad) =>
    Array.from(new TextDecoder().decode(ciphertext).replace(`${aad}|`, ''))
      .reverse()
      .join(''),
  blindIndex: (org, kind, value) =>
    new TextEncoder().encode(`bidx:${org}:${kind}:${value.length}:${value.at(-1) ?? ''}`),
};

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
const hex = (bytes: Uint8Array | null) => (bytes ? Buffer.from(bytes).toString('hex') : null);

export class MemoryPatients implements PatientStore {
  readonly rows = new Map<string, Mutable<PatientRecord>>();
  readonly teams = new Map<string, CareTeamRecord[]>();
  counter = 0;

  nextPatientNumber() {
    this.counter += 1;
    return Promise.resolve(this.counter);
  }
  countActivePatients() {
    return Promise.resolve([...this.rows.values()].filter((p) => p.status === 'ACTIVE').length);
  }
  documentTaken(bidx: Uint8Array, except: string | null) {
    return Promise.resolve(
      [...this.rows.values()].some(
        (p) => p.id !== except && hex(p.documentNumberBidx) === hex(bidx),
      ),
    );
  }
  insert(patient: PatientRecord) {
    this.rows.set(patient.id, { ...patient });
    return Promise.resolve();
  }
  find(id: string) {
    return Promise.resolve(this.rows.get(id) ?? null);
  }
  update(id: string, version: number, changes: PatientChanges) {
    const row = this.rows.get(id);
    if (row?.version !== version) return Promise.resolve(false);
    Object.assign(row, changes, { version: version + 1 });
    return Promise.resolve(true);
  }
  setStatus(id: string, status: PatientRecord['status'], from: PatientRecord['status']) {
    const row = this.rows.get(id);
    if (row?.status !== from) return Promise.resolve(false);
    row.status = status;
    return Promise.resolve(true);
  }
  search(search: PatientSearch) {
    return Promise.resolve(
      [...this.rows.values()]
        .filter((p) => p.status === search.status)
        .filter(
          (p) =>
            !search.nameQuery ||
            `${p.firstName} ${p.lastName}`.toLowerCase().includes(search.nameQuery),
        )
        .filter(
          (p) =>
            !search.documentBidxes ||
            search.documentBidxes.some((bidx) => hex(bidx) === hex(p.documentNumberBidx)),
        )
        .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.id.localeCompare(b.id))
        .filter(
          (p) =>
            !search.after ||
            p.lastName > search.after.lastName ||
            (p.lastName === search.after.lastName && p.id > search.after.id),
        )
        .slice(0, search.limit),
    );
  }
  careTeam(id: string) {
    return Promise.resolve(this.teams.get(id) ?? []);
  }
  upsertCareTeamMember(patient: { id: string }, member: CareTeamRecord) {
    const team = (this.teams.get(patient.id) ?? []).filter((m) => m.memberId !== member.memberId);
    this.teams.set(patient.id, [...team, member]);
    return Promise.resolve();
  }
  removeCareTeamMember(patientId: string, memberId: string) {
    const team = this.teams.get(patientId) ?? [];
    this.teams.set(
      patientId,
      team.filter((m) => m.memberId !== memberId),
    );
    return Promise.resolve(team.some((m) => m.memberId === memberId));
  }
  /** La cuenta del contexto: las pruebas la fijan aquí. */
  accountUserId: string | null = null;
  readonly previews = new Map<string, InvitationPreviewRecord>();
  linkAccount(patientId: string, userId: UserId) {
    const row = this.rows.get(patientId);
    if (!row || row.userId || row.status !== 'ACTIVE') return Promise.resolve(false);
    row.userId = userId;
    return Promise.resolve(true);
  }
  previewInvitation(tokenHash: Uint8Array) {
    return Promise.resolve(this.previews.get(Buffer.from(tokenHash).toString('hex')) ?? null);
  }
  /** has_access como app.patient_of_account: activo y con APP_ACCESS y HEALTH_DATA vigentes (en consents). */
  consents: MemoryConsents | null = null;
  async patientOfAccount() {
    const row = [...this.rows.values()].find(
      (p) => p.userId !== null && p.userId === this.accountUserId,
    );
    if (!row) return null;
    const active = this.consents
      ? (await this.consents.list(row.id)).filter((c) => !c.revokedAt)
      : [];
    const has = (purpose: ConsentPurpose) => active.some((c) => c.purpose === purpose);
    return {
      patientId: row.id,
      organizationId: row.organizationId,
      hasAccess: row.status === 'ACTIVE' && has('APP_ACCESS') && has('HEALTH_DATA'),
    };
  }
  labels(ids: readonly string[]) {
    return Promise.resolve(
      ids.flatMap((id) => {
        const row = this.rows.get(id);
        return row ? [{ id, code: row.code }] : [];
      }),
    );
  }
}

export const DOCUMENTS: ConsentDocumentRecord[] = [
  { id: uuidv7(), purpose: 'HEALTH_DATA', version: '0.1-provisional', bodyMarkdown: 'Salud' },
  { id: uuidv7(), purpose: 'APP_ACCESS', version: '0.1-provisional', bodyMarkdown: 'App' },
];

export class MemoryConsents implements ConsentStore {
  readonly rows: Mutable<ConsentRecord>[] = [];
  currentDocuments() {
    return Promise.resolve(DOCUMENTS);
  }
  list(patientId: string) {
    return Promise.resolve(this.rows.filter((c) => c.patientId === patientId));
  }
  active(patientId: string, purpose: ConsentPurpose) {
    return Promise.resolve(
      this.rows.find((c) => c.patientId === patientId && c.purpose === purpose && !c.revokedAt) ??
        null,
    );
  }
  insert(consent: Parameters<ConsentStore['insert']>[0]) {
    const document = DOCUMENTS.find((d) => d.id === consent.consentDocumentId);
    this.rows.push({ ...consent, documentVersion: document?.version ?? '?', revokedAt: null });
    return Promise.resolve();
  }
  revoke(id: string, at: Date) {
    const row = this.rows.find((c) => c.id === id && !c.revokedAt);
    if (row) row.revokedAt = at;
    return Promise.resolve(Boolean(row));
  }
}

/** FileRegistry falsa: guarda en memoria y cuenta lo descartado. */
export class FakeFiles {
  readonly stored = new Map<
    string,
    { content: Uint8Array; mimeType: string; registered: boolean }
  >();
  discarded = 0;
  write(_org: OrganizationId, content: Uint8Array) {
    const mimeType = content[0] === 0x89 ? 'image/png' : null;
    if (!mimeType) return Promise.resolve(null);
    const id = uuidv7();
    this.stored.set(id, { content, mimeType, registered: false });
    return Promise.resolve({
      id,
      key: `org/${id}`,
      mimeType: 'image/png' as const,
      sha256: new Uint8Array(32),
    });
  }
  register(file: { id: string }) {
    const row = this.stored.get(file.id);
    if (row) row.registered = true;
    return Promise.resolve();
  }
  discard() {
    this.discarded += 1;
    return Promise.resolve();
  }
  read(id: string) {
    const row = this.stored.get(id);
    return Promise.resolve(
      row ? { content: Buffer.from(row.content), mimeType: row.mimeType } : null,
    );
  }
  asRegistry(): FileRegistry {
    return this as unknown as FileRegistry;
  }
}

export const QUOTA = domainError({ code: 'NC-TEN-007', rule: 'RN-A03', message: 'Sin cupo.' });

/** TenancyApi falsa: miembros activos en un conjunto y cupo fijo de pacientes. */
export function fakeTenancy(activeMembers: Set<string>, capacity: { max: number }): TenancyApi {
  return {
    isActiveMemberId: (_org: OrganizationId, memberId: string) =>
      Promise.resolve(activeMembers.has(memberId)),
    ensurePatientCapacity: async (_org: OrganizationId, count: () => Promise<number>) =>
      (await count()) < capacity.max ? ok(undefined) : err(QUOTA),
    organization: () => Promise.resolve({ timezone: 'America/Lima' }),
  } as unknown as TenancyApi;
}

export const ORG = '0192f0a0-0000-7000-8000-00000000000a' as OrganizationId;

export const staffContext = (
  role: 'OWNER' | 'ADMIN' | 'PROFESSIONAL',
  memberId: string,
  userId: string = uuidv7(),
): SecurityContext => ({
  organizationId: ORG,
  userId: userId as UserId,
  role,
  patientId: null,
  memberId: memberId as SecurityContext['memberId'],
});

/** Expediente en memoria. Sin RLS: AUTHOR_ONLY lo prueba la integración. */
export class MemoryRecords implements ClinicalRecordStore {
  readonly history: (Omit<HistoryRevisionRecord, 'profile'> & { patientId: string })[] = [];
  readonly profiles: Parameters<ClinicalRecordStore['insertPerformanceProfile']>[0][] = [];
  readonly conditionRows: Mutable<ConditionRecord>[] = [];
  readonly goalRows: Mutable<GoalRecord>[] = [];
  readonly noteRows: NoteRecord[] = [];
  locks = 0;
  lockPatient() {
    this.locks += 1;
    return Promise.resolve();
  }
  #withProfile(row: (typeof this.history)[number]): HistoryRevisionRecord {
    return { ...row, profile: this.profiles.find((p) => p.clinicalHistoryId === row.id) ?? null };
  }
  latestHistory(patientId: string) {
    const latest = this.history
      .filter((h) => h.patientId === patientId)
      .sort((a, b) => b.revision - a.revision)[0];
    return Promise.resolve(latest ? this.#withProfile(latest) : null);
  }
  historyRevision(patientId: string, revision: number) {
    const row = this.history.find((h) => h.patientId === patientId && h.revision === revision);
    return Promise.resolve(row ? this.#withProfile(row) : null);
  }
  historyRevisions(patientId: string) {
    return Promise.resolve(
      this.history
        .filter((h) => h.patientId === patientId)
        .sort((a, b) => b.revision - a.revision)
        .map(({ revision, formCode, recordedAt, recordedBy }) => ({
          revision,
          formCode,
          recordedAt,
          recordedBy,
        })),
    );
  }
  insertHistory(revision: Parameters<ClinicalRecordStore['insertHistory']>[0]) {
    this.history.push({ ...revision });
    return Promise.resolve();
  }
  insertPerformanceProfile(
    profile: Parameters<ClinicalRecordStore['insertPerformanceProfile']>[0],
  ) {
    this.profiles.push(profile);
    return Promise.resolve();
  }
  conditions(patientId: string) {
    return Promise.resolve(this.conditionRows.filter((c) => c.patientId === patientId));
  }
  insertCondition(condition: ConditionRecord) {
    this.conditionRows.push({ ...condition });
    return Promise.resolve();
  }
  updateCondition(patientId: string, id: string, changes: Partial<ConditionRecord>) {
    const row = this.conditionRows.find((c) => c.id === id && c.patientId === patientId);
    if (row) Object.assign(row, changes);
    return Promise.resolve(Boolean(row));
  }
  goals(patientId: string) {
    return Promise.resolve(this.goalRows.filter((g) => g.patientId === patientId));
  }
  insertGoal(goal: GoalRecord) {
    this.goalRows.push({ ...goal });
    return Promise.resolve();
  }
  updateGoal(patientId: string, id: string, changes: Partial<GoalRecord>) {
    const row = this.goalRows.find((g) => g.id === id && g.patientId === patientId);
    if (row) Object.assign(row, changes);
    return Promise.resolve(Boolean(row));
  }
  notes(patientId: string) {
    return Promise.resolve(this.noteRows.filter((n) => n.patientId === patientId));
  }
  findNote(patientId: string, id: string) {
    return Promise.resolve(
      this.noteRows.find((n) => n.id === id && n.patientId === patientId) ?? null,
    );
  }
  insertNote(note: NoteRecord) {
    this.noteRows.push(note);
    return Promise.resolve();
  }
  timeline(patientId: string, before: { occurredAt: Date; refId: string } | null, limit: number) {
    const items: TimelineRecord[] = [
      ...this.history
        .filter((h) => h.patientId === patientId)
        .map((h) => ({
          kind: 'HISTORY_REVISED' as const,
          occurredAt: h.recordedAt,
          refId: h.id,
          label: String(h.revision),
          detail: null,
        })),
      ...this.conditionRows
        .filter((c) => c.patientId === patientId)
        .map((c) => ({
          kind: 'CONDITION_RECORDED' as const,
          occurredAt: c.createdAt,
          refId: c.id,
          label: c.kind,
          detail: c.label,
        })),
      ...this.noteRows
        .filter((n) => n.patientId === patientId)
        .map((n) => ({
          kind: 'NOTE_WRITTEN' as const,
          occurredAt: n.createdAt,
          refId: n.id,
          label: n.visibility,
          detail: null,
        })),
    ]
      .sort(
        (a, b) => b.occurredAt.getTime() - a.occurredAt.getTime() || b.refId.localeCompare(a.refId),
      )
      .filter(
        (i) =>
          !before ||
          i.occurredAt.getTime() < before.occurredAt.getTime() ||
          (i.occurredAt.getTime() === before.occurredAt.getTime() && i.refId < before.refId),
      );
    return Promise.resolve(items.slice(0, limit));
  }
}

/** IamApi falsa para clinical: invitaciones de paciente en memoria. */
export class FakeIam {
  readonly invited: { patientId: string; email: string }[] = [];
  result: Result<{ id: string }, DomainError> | null = null;
  invitePatientWithin(
    _context: SecurityContext,
    _org: OrganizationId,
    patientId: string,
    email: string,
  ) {
    this.invited.push({ patientId, email });
    return Promise.resolve(this.result ?? ok({ id: uuidv7() }));
  }
  pendingPatientInvitation(patientId: string) {
    const last = [...this.invited].reverse().find((i) => i.patientId === patientId);
    return Promise.resolve(
      last ? { email: last.email, expiresAt: new Date('2026-10-16T15:00:00Z') } : null,
    );
  }
  asApi(): IamApi {
    return this as unknown as IamApi;
  }
}

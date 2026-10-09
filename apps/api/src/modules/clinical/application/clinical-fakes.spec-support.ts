import {
  asId,
  ok,
  err,
  domainError,
  type AuditEntry,
  type AuditPort,
  type Clock,
  type DomainEvent,
  type EncryptionPort,
  type IdGenerator,
  type OrganizationId,
  type Outbox,
  type SecurityContext,
  type UnitOfWork,
  type UserId,
} from '@nutricoach/shared-kernel';
import { v7 as uuidv7 } from 'uuid';
import type { FileRegistry } from '../../../platform/index.js';
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
          (p) => !search.documentBidx || hex(p.documentNumberBidx) === hex(search.documentBidx),
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

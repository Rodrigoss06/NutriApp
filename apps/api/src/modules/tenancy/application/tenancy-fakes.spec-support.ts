import {
  asId,
  type Clock,
  type DomainEvent,
  type EventMetadata,
  type IdGenerator,
  type OrganizationId,
  type Outbox,
  type SecurityContext,
  type UnitOfWork,
  type UserId,
} from '@nutricoach/shared-kernel';
import { v7 as uuidv7 } from 'uuid';
import type { MemberRole, MemberStatus, Profession } from '../domain/tenancy-rules.js';
import type {
  MemberRecord,
  MembershipRecord,
  OrganizationChanges,
  OrganizationRecord,
  OrganizationStatus,
  PlanRecord,
  SubscriptionRecord,
  SubscriptionStatus,
  TenancyStore,
} from './ports/tenancy.ports.js';

/** Puertos falsos en memoria para los casos de uso de tenancy (06 §6). */
export class FakeClock implements Clock {
  current = new Date('2026-10-07T12:00:00Z');
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
  readonly events: { event: DomainEvent; metadata: EventMetadata | undefined }[] = [];
  append(events: readonly DomainEvent[], metadata?: EventMetadata): Promise<void> {
    for (const event of events) this.events.push({ event, metadata });
    return Promise.resolve();
  }
  types(): string[] {
    return this.events.map((e) => e.event.type);
  }
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

export const newOrgId = (): OrganizationId => asId<'OrganizationId'>(uuidv7());
export const newUserId = (): UserId => asId<'UserId'>(uuidv7());

export class MemoryTenancyStore implements TenancyStore {
  readonly organizations = new Map<string, Mutable<OrganizationRecord>>();
  readonly members = new Map<string, Mutable<MemberRecord>>();
  readonly subscriptions = new Map<string, Mutable<SubscriptionRecord>>();
  readonly plans = new Map<string, PlanRecord>();
  readonly settings = new Map<string, number>();
  locks = 0;

  addPlan(plan: Partial<PlanRecord> & { code: string }): PlanRecord {
    const record: PlanRecord = {
      id: uuidv7(),
      name: plan.code,
      maxActivePatients: 5,
      maxProfessionals: 3,
      durationMonths: 12,
      priceCents: 0,
      currency: 'PEN',
      isActive: true,
      ...plan,
    };
    this.plans.set(record.code, record);
    return record;
  }

  addOrganization(overrides: Partial<OrganizationRecord> = {}): OrganizationId {
    const id = overrides.id ?? newOrgId();
    this.organizations.set(id, {
      id,
      name: 'Consultorio',
      slug: `org-${id}`,
      legalName: null,
      taxId: null,
      timezone: 'America/Lima',
      status: 'ACTIVE',
      patientVisibility: 'CARE_TEAM',
      patientLabel: 'Paciente',
      version: 0,
      ...overrides,
    });
    return id;
  }

  addMember(
    organizationId: OrganizationId,
    role: MemberRole,
    status: MemberStatus = 'ACTIVE',
    userId: UserId = newUserId(),
  ): MemberRecord {
    const member = { id: uuidv7(), organizationId, userId, role, status, profession: null };
    this.members.set(member.id, member);
    return member;
  }

  addSubscription(
    organizationId: OrganizationId,
    overrides: Partial<SubscriptionRecord> = {},
  ): SubscriptionRecord {
    const subscription: SubscriptionRecord = {
      id: uuidv7(),
      organizationId,
      planCode: 'TRAMO_5',
      planName: 'Tramo 5',
      status: 'ACTIVE',
      startsOn: '2026-01-01',
      endsOn: '2026-12-31',
      maxActivePatients: 5,
      maxProfessionals: 3,
      priceCents: 0,
      currency: 'PEN',
      ...overrides,
    };
    this.subscriptions.set(subscription.id, subscription);
    return subscription;
  }

  lockOrganization(): Promise<void> {
    this.locks += 1;
    return Promise.resolve();
  }
  findOrganization(organizationId: OrganizationId) {
    return Promise.resolve(this.organizations.get(organizationId) ?? null);
  }
  slugTaken(slug: string) {
    return Promise.resolve([...this.organizations.values()].some((o) => o.slug === slug));
  }
  createOrganization(organization: {
    id: OrganizationId;
    name: string;
    slug: string;
    timezone: string;
  }) {
    this.addOrganization(organization);
    return Promise.resolve();
  }
  updateOrganization(
    organizationId: OrganizationId,
    version: number,
    changes: OrganizationChanges,
  ) {
    const row = this.organizations.get(organizationId);
    if (row?.version !== version) return Promise.resolve(false);
    Object.assign(row, changes, { version: version + 1 });
    return Promise.resolve(true);
  }
  setOrganizationStatus(
    organizationId: OrganizationId,
    status: OrganizationStatus,
    onlyFrom?: OrganizationStatus,
  ) {
    const row = this.organizations.get(organizationId);
    if (!row || (onlyFrom && row.status !== onlyFrom)) return Promise.resolve(false);
    row.status = status;
    return Promise.resolve(true);
  }
  #membersOf(organizationId: OrganizationId) {
    return [...this.members.values()].filter((m) => m.organizationId === organizationId);
  }
  listMembers(organizationId: OrganizationId) {
    return Promise.resolve(this.#membersOf(organizationId));
  }
  findMember(organizationId: OrganizationId, memberId: string) {
    const row = this.members.get(memberId);
    return Promise.resolve(row?.organizationId === organizationId ? row : null);
  }
  findMemberByUser(organizationId: OrganizationId, userId: UserId) {
    return Promise.resolve(
      this.#membersOf(organizationId).find((m) => m.userId === userId) ?? null,
    );
  }
  countActiveMembers(organizationId: OrganizationId) {
    return Promise.resolve(
      this.#membersOf(organizationId).filter((m) => m.status === 'ACTIVE').length,
    );
  }
  countActiveOwners(organizationId: OrganizationId) {
    return Promise.resolve(
      this.#membersOf(organizationId).filter((m) => m.status === 'ACTIVE' && m.role === 'OWNER')
        .length,
    );
  }
  insertMember(member: MemberRecord) {
    this.members.set(member.id, { ...member });
    return Promise.resolve();
  }
  updateMember(
    memberId: string,
    changes: { role?: MemberRole; status?: MemberStatus; profession?: Profession | null },
  ) {
    const row = this.members.get(memberId);
    if (row) Object.assign(row, changes);
    return Promise.resolve();
  }
  activeSubscription(organizationId: OrganizationId) {
    return Promise.resolve(
      [...this.subscriptions.values()].find(
        (s) => s.organizationId === organizationId && s.status === 'ACTIVE',
      ) ?? null,
    );
  }
  insertSubscription(subscription: {
    id: string;
    organizationId: OrganizationId;
    plan: PlanRecord;
    startsOn: string;
    endsOn: string;
  }) {
    const { plan } = subscription;
    this.addSubscription(subscription.organizationId, {
      id: subscription.id,
      planCode: plan.code,
      planName: plan.name,
      startsOn: subscription.startsOn,
      endsOn: subscription.endsOn,
      maxActivePatients: plan.maxActivePatients,
      maxProfessionals: plan.maxProfessionals,
    });
    return Promise.resolve();
  }
  setSubscriptionStatus(
    subscriptionId: string,
    status: SubscriptionStatus,
    onlyFrom: SubscriptionStatus,
  ) {
    const row = this.subscriptions.get(subscriptionId);
    if (row?.status !== onlyFrom) return Promise.resolve(false);
    row.status = status;
    return Promise.resolve(true);
  }
  findPlanByCode(code: string) {
    return Promise.resolve(this.plans.get(code) ?? null);
  }
  listPlans() {
    return Promise.resolve([...this.plans.values()]);
  }
  getSetting(organizationId: OrganizationId, key: string) {
    return Promise.resolve(this.settings.get(`${organizationId}:${key}`));
  }
  setSetting(organizationId: OrganizationId, key: string, value: number) {
    this.settings.set(`${organizationId}:${key}`, value);
    return Promise.resolve();
  }
  #membership(member: MemberRecord): MembershipRecord {
    const organization = this.organizations.get(member.organizationId);
    return {
      organizationId: member.organizationId,
      organizationName: organization?.name ?? '',
      organizationStatus: organization?.status ?? 'ACTIVE',
      role: member.role,
      status: member.status,
    };
  }
  membership(organizationId: OrganizationId, userId: UserId) {
    const member = this.#membersOf(organizationId).find(
      (m) => m.userId === userId && m.status !== 'REMOVED',
    );
    return Promise.resolve(member ? this.#membership(member) : null);
  }
  membershipsOf(userId: UserId) {
    return Promise.resolve(
      [...this.members.values()]
        .filter((m) => m.userId === userId && m.status !== 'REMOVED')
        .map((m) => this.#membership(m)),
    );
  }
  listOrganizations() {
    return Promise.resolve(
      [...this.organizations.values()].map((o) => ({
        ...o,
        subscription:
          [...this.subscriptions.values()].find(
            (s) => s.organizationId === o.id && s.status === 'ACTIVE',
          ) ?? null,
      })),
    );
  }
}

export const contextFor = (
  organizationId: OrganizationId,
  role: MemberRole,
  userId: UserId = newUserId(),
): SecurityContext => ({
  organizationId,
  userId,
  role,
  patientId: null,
});

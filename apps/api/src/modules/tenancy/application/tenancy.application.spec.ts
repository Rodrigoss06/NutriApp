import { isErr, isOk, type OrganizationId, type UserId } from '@nutricoach/shared-kernel';
import { beforeEach, describe, expect, it } from 'vitest';
import { ExpireSubscriptionsHandler } from './commands/expire-subscriptions.handler.js';
import { OrganizationCommands } from './commands/organization.commands.js';
import { PlatformTenancy, subscriptionEndsOn } from './platform-tenancy.js';
import { DirectoryQueries, OrganizationQueries } from './queries/organization.queries.js';
import { TenancyApi } from './tenancy-api.js';
import {
  contextFor,
  FakeClock,
  fakeIds,
  FakeOutbox,
  FakeUow,
  MemoryTenancyStore,
  newUserId,
} from './tenancy-fakes.spec-support.js';

let clock: FakeClock;
let uow: FakeUow;
let outbox: FakeOutbox;
let store: MemoryTenancyStore;
let org: OrganizationId;

const commands = () => new OrganizationCommands(uow, clock, fakeIds, outbox, store);
const api = () => new TenancyApi(store, outbox, clock, fakeIds);
const platform = () => new PlatformTenancy(store, outbox, clock, fakeIds);
const metadata = { actorUserId: null, actorRole: 'SYSTEM' as const };

beforeEach(() => {
  clock = new FakeClock();
  uow = new FakeUow();
  outbox = new FakeOutbox();
  store = new MemoryTenancyStore();
  org = store.addOrganization();
  store.addSubscription(org, { maxProfessionals: 3, maxActivePatients: 2 });
});

describe('RF-02 · datos de la organización', () => {
  it('06 §5 · editar con la versión leída; con otra versión, conflicto', async () => {
    const owner = contextFor(org, 'OWNER');
    expect(isOk(await commands().update(owner, 0, { name: 'Nuevo nombre' }))).toBe(true);
    expect(store.organizations.get(org)?.name).toBe('Nuevo nombre');
    const stale = await commands().update(owner, 0, { name: 'Otro' });
    expect(isErr(stale) && stale.error.code).toBe('NC-TEN-022');
    expect(outbox.types()).toEqual(['tenancy.organization.updated']);
  });

  it('una organización sin contexto activo es un error de programación', () => {
    expect(() =>
      commands().update({ ...contextFor(org, 'OWNER'), organizationId: null }, 0, {}),
    ).toThrow();
  });
});

describe('RN-A04 · roles y miembros', () => {
  it('nadie deja a la organización sin dueño: quitarle el rol o suspender al último, 422', async () => {
    const owner = store.addMember(org, 'OWNER');
    const context = contextFor(org, 'OWNER', owner.userId);
    for (const change of [{ role: 'ADMIN' as const }, { status: 'SUSPENDED' as const }]) {
      const result = await commands().changeMember(context, owner.id, change);
      expect(isErr(result) && result.error.code).toBe('NC-TEN-005');
    }
    const removed = await commands().removeMember(context, owner.id);
    expect(isErr(removed) && removed.error.rule).toBe('RN-A04');
    expect(store.locks).toBe(3);
  });

  it('con dos dueños, uno puede pasar al otro a ADMIN; un ADMIN no toca dueños ni se sube a sí mismo', async () => {
    const owner = store.addMember(org, 'OWNER');
    const second = store.addMember(org, 'OWNER');
    const admin = store.addMember(org, 'ADMIN');
    expect(
      isOk(
        await commands().changeMember(contextFor(org, 'OWNER', owner.userId), second.id, {
          role: 'ADMIN',
        }),
      ),
    ).toBe(true);
    const adminContext = contextFor(org, 'ADMIN', admin.userId);
    const onOwner = await commands().changeMember(adminContext, owner.id, {
      profession: 'TRAINER',
    });
    expect(isErr(onOwner) && onOwner.error.code).toBe('NC-TEN-006');
    const self = await commands().changeMember(adminContext, admin.id, { role: 'OWNER' });
    expect(isErr(self)).toBe(true);
    expect(outbox.types()).toEqual(['tenancy.member.changed']);
  });

  it('un miembro inexistente, de otra organización o quitado responde como no encontrado', async () => {
    const owner = contextFor(org, 'OWNER');
    const other = store.addOrganization();
    const foreign = store.addMember(other, 'PROFESSIONAL');
    const removed = store.addMember(org, 'PROFESSIONAL', 'REMOVED');
    for (const id of [foreign.id, removed.id, 'no-existe']) {
      const change = await commands().changeMember(owner, id, { status: 'SUSPENDED' });
      expect(isErr(change) && change.error.code).toBe('NC-TEN-021');
      const remove = await commands().removeMember(owner, id);
      expect(isErr(remove) && remove.error.code).toBe('NC-TEN-021');
    }
  });

  it('quitar deja la fila como REMOVED; ADMIN no quita dueños', async () => {
    const owner = store.addMember(org, 'OWNER');
    const professional = store.addMember(org, 'PROFESSIONAL');
    expect(
      isOk(await commands().removeMember(contextFor(org, 'OWNER', owner.userId), professional.id)),
    ).toBe(true);
    expect(store.members.get(professional.id)?.status).toBe('REMOVED');
    const byAdmin = await commands().removeMember(contextFor(org, 'ADMIN'), owner.id);
    expect(isErr(byAdmin)).toBe(true);
  });

  it('RN-A03 · reactivar un miembro suspendido vuelve a verificar el cupo', async () => {
    store.addMember(org, 'OWNER');
    store.addMember(org, 'PROFESSIONAL');
    const suspended = store.addMember(org, 'PROFESSIONAL', 'SUSPENDED');
    const owner = contextFor(org, 'OWNER');
    expect(isOk(await commands().changeMember(owner, suspended.id, { status: 'ACTIVE' }))).toBe(
      true,
    );
    const another = store.addMember(org, 'PROFESSIONAL', 'SUSPENDED');
    const over = await commands().changeMember(owner, another.id, { status: 'ACTIVE' });
    expect(isErr(over) && over.error).toMatchObject({ code: 'NC-TEN-001', rule: 'RN-A03' });
  });

  it('RN-A02 · reactivar sin suscripción activa no se puede', async () => {
    const bare = store.addOrganization();
    const suspended = store.addMember(bare, 'PROFESSIONAL', 'SUSPENDED');
    const result = await commands().changeMember(contextFor(bare, 'OWNER'), suspended.id, {
      status: 'ACTIVE',
    });
    expect(isErr(result) && result.error.code).toBe('NC-TEN-002');
  });
});

describe('Ajustes registrados', () => {
  it('la organización edita invitation.ttl_days dentro de su rango; la gracia es solo de plataforma', async () => {
    const owner = contextFor(org, 'OWNER');
    expect(isOk(await commands().setSetting(owner, 'invitation.ttl_days', 14))).toBe(true);
    expect(await api().invitationTtlDays(org)).toBe(14);
    const out = await commands().setSetting(owner, 'invitation.ttl_days', 31);
    expect(isErr(out) && out.error.code).toBe('NC-TEN-030');
    const grace = await commands().setSetting(owner, 'subscription.grace_days', 3);
    expect(isErr(grace) && grace.error.code).toBe('NC-TEN-031');
    const unknown = await commands().setSetting(owner, 'otra.cosa', 3);
    expect(isErr(unknown) && unknown.error.code).toBe('NC-TEN-030');
  });
});

describe('RN-A03 · QuotaPolicy de la API pública', () => {
  it('pacientes: cuenta con la función que recibe bajo el candado y compara con el límite congelado', async () => {
    expect(isOk(await api().ensurePatientCapacity(org, () => Promise.resolve(1)))).toBe(true);
    const full = await api().ensurePatientCapacity(org, () => Promise.resolve(2));
    expect(isErr(full) && full.error).toMatchObject({ code: 'NC-TEN-007', rule: 'RN-A03' });
    expect(store.locks).toBe(2);
    const bare = await api().ensurePatientCapacity(store.addOrganization(), () =>
      Promise.resolve(0),
    );
    expect(isErr(bare) && bare.error.code).toBe('NC-TEN-002');
  });

  it('staff al invitar: miembros activos + invitaciones vigentes', async () => {
    store.addMember(org, 'OWNER');
    expect(isOk(await api().ensureStaffCapacity(org, 1))).toBe(true);
    const full = await api().ensureStaffCapacity(org, 2);
    expect(isErr(full) && full.error.code).toBe('NC-TEN-001');
    const bare = await api().ensureStaffCapacity(store.addOrganization(), 0);
    expect(isErr(bare) && bare.error.code).toBe('NC-TEN-002');
  });

  it('alta por invitación: cuenta solo los activos + 1, reactiva a un quitado y rechaza a un miembro vigente', async () => {
    store.addMember(org, 'OWNER');
    const returning = store.addMember(org, 'PROFESSIONAL', 'REMOVED');
    const input = (userId: UserId) => ({
      organizationId: org,
      userId,
      role: 'PROFESSIONAL' as const,
      profession: null,
    });
    expect(isOk(await api().addMemberFromInvitation(input(returning.userId), metadata))).toBe(true);
    expect(store.members.get(returning.id)?.status).toBe('ACTIVE');
    expect(await api().isMember(org, returning.userId)).toBe(true);
    const again = await api().addMemberFromInvitation(input(returning.userId), metadata);
    expect(isErr(again) && again.error.code).toBe('NC-TEN-020');
    expect(isOk(await api().addMemberFromInvitation(input(newUserId()), metadata))).toBe(true);
    const full = await api().addMemberFromInvitation(input(newUserId()), metadata);
    expect(isErr(full) && full.error.rule).toBe('RN-A03');
    expect(outbox.types()).toEqual(['tenancy.member.added', 'tenancy.member.added']);
    const bare = store.addOrganization();
    const none = await api().addMemberFromInvitation(
      { ...input(newUserId()), organizationId: bare },
      metadata,
    );
    expect(isErr(none) && none.error.code).toBe('NC-TEN-002');
    expect((await api().organization(org))?.id).toBe(org);
  });
});

describe('RF-39 · operaciones de plataforma', () => {
  it('ends_on es startsOn + duración − 1 día (vale hasta ends_on inclusive)', () => {
    expect(subscriptionEndsOn('2026-01-01', 12)).toBe('2026-12-31');
    expect(subscriptionEndsOn('2026-03-15', 1)).toBe('2026-04-14');
  });

  it('crear una organización: plan activo, identificador libre y primera suscripción con límites congelados', async () => {
    store.addPlan({ code: 'TRAMO_50', maxProfessionals: 10 });
    store.addPlan({ code: 'VIEJO', isActive: false });
    const actor = newUserId();
    const input = {
      id: org,
      name: 'Nueva',
      slug: 'nueva',
      timezone: 'America/Lima',
      startsOn: '2026-10-07',
      actor,
    };
    const id = fakeIds.newId<'OrganizationId'>() as OrganizationId;
    expect(
      isOk(await platform().createOrganization({ ...input, id, planCode: 'TRAMO_50' }, metadata)),
    ).toBe(true);
    expect((await store.activeSubscription(id))?.maxProfessionals).toBe(10);
    const taken = await platform().createOrganization(
      { ...input, id: fakeIds.newId<'OrganizationId'>(), planCode: 'TRAMO_50' },
      metadata,
    );
    expect(isErr(taken) && taken.error.code).toBe('NC-TEN-025');
    const inactive = await platform().createOrganization(
      { ...input, slug: 'otra', planCode: 'VIEJO' },
      metadata,
    );
    expect(isErr(inactive) && inactive.error.code).toBe('NC-TEN-024');
    expect((await platform().listPlans()).length).toBe(2);
    expect((await platform().listOrganizations()).some((o) => o.id === id)).toBe(true);
  });

  it('RN-A02 · renovar: la anterior pasa a REPLACED y una organización en solo lectura vuelve a ACTIVE', async () => {
    store.addPlan({ code: 'TRAMO_5' });
    const previous = await store.activeSubscription(org);
    await store.setOrganizationStatus(org, 'READ_ONLY');
    const result = await platform().changeSubscription(
      {
        organizationId: org,
        planCode: 'TRAMO_5',
        startsOn: '2027-01-01',
        reason: null,
        actor: newUserId(),
      },
      metadata,
    );
    expect(isOk(result)).toBe(true);
    expect(store.subscriptions.get(previous?.id ?? '')?.status).toBe('REPLACED');
    expect((await store.activeSubscription(org))?.endsOn).toBe('2027-12-31');
    expect(store.organizations.get(org)?.status).toBe('ACTIVE');
    const missing = await platform().changeSubscription(
      {
        organizationId: org,
        planCode: 'NO',
        startsOn: '2027-01-01',
        reason: null,
        actor: newUserId(),
      },
      metadata,
    );
    expect(isErr(missing)).toBe(true);
  });

  it('la gracia la fija la plataforma dentro de 0 a 30 días', async () => {
    expect(isOk(await platform().setGraceDays(org, 0, newUserId(), metadata))).toBe(true);
    const out = await platform().setGraceDays(org, 31, newUserId(), metadata);
    expect(isErr(out)).toBe(true);
  });
});

describe('RN-A02 · vencimiento por la fecha local de la organización', () => {
  const handler = () => new ExpireSubscriptionsHandler(uow, clock, fakeIds, outbox, store);

  it('vale hasta ends_on + gracia inclusive; al día siguiente local pasa a solo lectura, una sola vez', async () => {
    const subscription = await store.activeSubscription(org);
    if (!subscription) throw new Error('sin suscripción');
    // 2026-12-31 + 7 días de gracia → solo lectura desde el 2027-01-08 en Lima (UTC−5).
    clock.current = new Date('2027-01-08T04:59:00Z');
    expect(await handler().execute()).toBe(0);
    clock.current = new Date('2027-01-08T05:00:00Z');
    expect(await handler().execute()).toBe(1);
    expect(await handler().execute()).toBe(0);
    expect(store.subscriptions.get(subscription.id)?.status).toBe('EXPIRED');
    expect(store.organizations.get(org)?.status).toBe('READ_ONLY');
    expect(outbox.events[0]?.metadata).toEqual({ actorUserId: null, actorRole: 'SYSTEM' });
    expect(uow.contexts.every((c) => c.role === 'PLATFORM_ADMIN')).toBe(true);
  });
});

describe('RF-02 y RF-03 · consultas', () => {
  const profiles = {
    profiles: (ids: readonly UserId[]) =>
      Promise.resolve(
        new Map(
          ids.map((id) => [id as string, { displayName: 'Persona', email: `${id}@demo.test` }]),
        ),
      ),
  };
  const queries = () =>
    new OrganizationQueries(
      uow,
      store,
      profiles,
      { count: () => Promise.resolve(2) },
      { count: () => Promise.resolve(1) },
    );

  it('los correos solo para OWNER y ADMIN; los quitados no aparecen', async () => {
    store.addMember(org, 'OWNER');
    store.addMember(org, 'PROFESSIONAL', 'REMOVED');
    const asProfessional = await queries().members(contextFor(org, 'PROFESSIONAL'));
    expect(asProfessional).toHaveLength(1);
    expect(asProfessional[0]?.email).toBeNull();
    const asOwner = await queries().members(contextFor(org, 'OWNER'));
    expect(asOwner[0]?.email).toMatch(/@demo.test$/);
  });

  it('suscripción con uso del cupo y primer día de solo lectura; ajustes con sus valores por defecto', async () => {
    store.addMember(org, 'OWNER');
    const view = await queries().subscription(contextFor(org, 'OWNER'));
    expect(view).toMatchObject({
      graceDays: 7,
      readOnlyFrom: '2027-01-08',
      usage: { staff: 1, pendingInvitations: 2, activePatients: 1 },
    });
    const bare = await queries().subscription(contextFor(store.addOrganization(), 'OWNER'));
    expect(bare.readOnlyFrom).toBeNull();
    expect(await queries().settings(contextFor(org, 'OWNER'))).toEqual({
      'invitation.ttl_days': 7,
      'subscription.grace_days': 7,
    });
    expect((await queries().organization(contextFor(org, 'OWNER')))?.id).toBe(org);
    expect(() =>
      queries().settings({ ...contextFor(org, 'OWNER'), organizationId: null }),
    ).toThrow();
  });

  it('el directorio de membresías usa el contexto de la cuenta y no muestra las quitadas', async () => {
    const member = store.addMember(org, 'ADMIN');
    store.addMember(store.addOrganization(), 'PROFESSIONAL', 'REMOVED', member.userId);
    const directory = new DirectoryQueries(uow, store);
    expect(await directory.membership(org, member.userId)).toMatchObject({
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    expect(await directory.membershipsOf(member.userId)).toHaveLength(1);
    expect(uow.contexts.every((c) => c.role === 'ACCOUNT')).toBe(true);
  });
});

import {
  asId,
  domainError,
  err,
  isErr,
  isOk,
  ok,
  type OrganizationId,
  type SecurityContext,
  type UnitOfWork,
  type UserId,
} from '@nutricoach/shared-kernel';
import { v7 as uuidv7 } from 'uuid';
import { describe, expect, it } from 'vitest';
import type { IamApi } from '../../iam/index.js';
import type { PlatformTenancy } from '../../tenancy/index.js';
import { BackofficeCommands } from './backoffice.commands.js';

const ACTOR = asId<'UserId'>(uuidv7()) as UserId;
const ids = { newId: <T extends string>() => asId<T>(uuidv7()) };

/** Unidad de trabajo que registra contextos y si la transacción se confirmó o se revirtió. */
class RecordingUow implements UnitOfWork {
  readonly contexts: SecurityContext[] = [];
  rolledBack = 0;
  async run<T>(context: SecurityContext, work: () => Promise<T>): Promise<T> {
    this.contexts.push(context);
    try {
      return await work();
    } catch (error) {
      this.rolledBack += 1;
      throw error;
    }
  }
  query<T>(context: SecurityContext, work: () => Promise<T>): Promise<T> {
    this.contexts.push(context);
    return work();
  }
}

const organization = { id: asId<'OrganizationId'>(uuidv7()) as OrganizationId };

function setup(options: { inviteFails?: boolean } = {}) {
  const uow = new RecordingUow();
  const tenancy = {
    listPlans: () => Promise.resolve([]),
    listOrganizations: () => Promise.resolve([organization]),
    createOrganization: () => Promise.resolve(ok(undefined)),
    changeSubscription: () => Promise.resolve(ok(undefined)),
    setGraceDays: () => Promise.resolve(err(domainError({ code: 'NC-TEN-030', message: 'x' }))),
  } as unknown as PlatformTenancy;
  const iam = {
    inviteWithin: () =>
      Promise.resolve(
        options.inviteFails
          ? err(domainError({ code: 'NC-IAM-041', message: 'x' }))
          : ok({ id: 'i' }),
      ),
  } as unknown as IamApi;
  return { uow, commands: new BackofficeCommands(uow, ids, tenancy, iam) };
}

const input = {
  name: 'Consultorio',
  slug: 'consultorio',
  timezone: 'America/Lima',
  planCode: 'TRAMO_5',
  startsOn: '2026-10-07',
  ownerEmail: 'duena@demo.test',
};

describe('RF-39 · backoffice', () => {
  it('crea organización, suscripción e invitación al dueño en una transacción PLATFORM_ADMIN de esa organización', async () => {
    const { uow, commands } = setup();
    const result = await commands.createOrganization(ACTOR, input);
    expect(isOk(result)).toBe(true);
    expect(uow.contexts[0]).toMatchObject({
      role: 'PLATFORM_ADMIN',
      userId: ACTOR,
      organizationId: isOk(result) ? result.value.id : null,
    });
  });

  it('si la invitación al dueño falla, se revierte todo y vuelve el error', async () => {
    const { uow, commands } = setup({ inviteFails: true });
    const result = await commands.createOrganization(ACTOR, input);
    expect(isErr(result) && result.error.code).toBe('NC-IAM-041');
    expect(uow.rolledBack).toBe(1);
  });

  it('renovar, gracia, listas y existencia con el contexto de plataforma', async () => {
    const { uow, commands } = setup();
    expect(isOk(await commands.changeSubscription(ACTOR, organization.id, input))).toBe(true);
    expect(isErr(await commands.setGraceDays(ACTOR, organization.id, 99))).toBe(true);
    expect(await commands.listPlans(ACTOR)).toEqual([]);
    expect(await commands.exists(ACTOR, organization.id)).toBe(true);
    expect(await commands.exists(ACTOR, asId<'OrganizationId'>(uuidv7()) as OrganizationId)).toBe(
      false,
    );
    expect(uow.contexts.every((c) => c.role === 'PLATFORM_ADMIN')).toBe(true);
  });
});

import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import type { ContextualRequest } from '../http/request-context.js';
import { ACCESS_RULE, ALLOWED_WHEN_READ_ONLY, type AccessRule } from './access.js';
import { OriginGuard } from './origin.guard.js';
import { PolicyGuard } from './policy.guard.js';
import { SessionGuard } from './session.guard.js';
import type { SessionPrincipal } from './session-authenticator.port.js';
import { TenantGuard } from './tenant.guard.js';
import type { MembershipView, TenantDirectory } from './tenant-directory.port.js';

const ORG = '0192f0a0-0000-7000-8000-00000000000a';
const USER = '0192f0a0-0000-7000-8000-0000000000aa';

function contextFor(
  request: Partial<ContextualRequest>,
  rule?: AccessRule,
  readOnlyAllowed = false,
) {
  const handler = () => undefined;
  if (rule) Reflect.defineMetadata(ACCESS_RULE, rule, handler);
  if (readOnlyAllowed) Reflect.defineMetadata(ALLOWED_WHEN_READ_ONLY, true, handler);
  return {
    getType: () => 'http',
    getHandler: () => handler,
    getClass: () => Object,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

const staff = (activeOrganizationId: string | null = ORG): SessionPrincipal => ({
  sessionId: 's',
  userId: USER as never,
  kind: 'STAFF',
  activeOrganizationId: activeOrganizationId as never,
  patientId: null,
});

const directoryWith = (membership: Partial<MembershipView> | null): TenantDirectory => ({
  membership: () =>
    Promise.resolve(
      membership && {
        organizationId: ORG as never,
        organizationName: 'Org',
        organizationStatus: 'ACTIVE',
        role: 'PROFESSIONAL',
        status: 'ACTIVE',
        ...membership,
      },
    ),
  membershipsOf: () => Promise.resolve([]),
});

const status = async (run: () => unknown) => {
  try {
    await run();
    return 'ok';
  } catch (error) {
    return (error as { getStatus?: () => number }).getStatus?.();
  }
};

describe('P5 · CSRF: Origin igual a APP_URL en toda escritura', () => {
  const guard = new OriginGuard();
  it.each([
    ['GET', undefined, 'ok'],
    ['POST', 'http://localhost:3000', 'ok'],
    ['POST', undefined, 403],
    ['DELETE', 'https://otro.sitio', 403],
  ] as const)('%s con Origin %s → %s', async (method, origin, expected) => {
    expect(await status(() => guard.canActivate(contextFor({ method, headers: { origin } })))).toBe(
      expected,
    );
  });
});

describe('02 §10 · SessionGuard', () => {
  const authenticator = (principal: SessionPrincipal | null) => ({
    authenticate: () => Promise.resolve(principal),
  });
  const request = (cookie?: string) => ({ headers: cookie ? { cookie } : {} }) as ContextualRequest;

  it('una ruta sin regla se niega; una pública pasa sin sesión', async () => {
    const guard = new SessionGuard(new Reflector(), authenticator(null));
    expect(await status(() => guard.canActivate(contextFor(request())))).toBe(403);
    expect(await status(() => guard.canActivate(contextFor(request(), { kind: 'public' })))).toBe(
      'ok',
    );
  });

  it('sin cookie o con una sesión inválida, 401; con una válida fija la sesión y un contexto de cuenta', async () => {
    expect(
      await status(() =>
        new SessionGuard(new Reflector(), authenticator(staff())).canActivate(
          contextFor(request(), { kind: 'account' }),
        ),
      ),
    ).toBe(401);
    expect(
      await status(() =>
        new SessionGuard(new Reflector(), authenticator(null)).canActivate(
          contextFor(request('nc_session=x'), { kind: 'account' }),
        ),
      ),
    ).toBe(401);
    const ok = request('nc_session=x');
    await new SessionGuard(new Reflector(), authenticator(staff())).canActivate(
      contextFor(ok, { kind: 'account' }),
    );
    expect(ok.securityContext).toMatchObject({
      role: 'ACCOUNT',
      userId: USER,
      organizationId: null,
    });
  });

  it('las rutas de plataforma rechazan sesiones STAFF', async () => {
    const guard = new SessionGuard(new Reflector(), authenticator(staff()));
    expect(
      await status(() =>
        guard.canActivate(contextFor(request('nc_session=x'), { kind: 'platform' })),
      ),
    ).toBe(403);
  });
});

describe('02 §10 · TenantGuard y PolicyGuard', () => {
  const tenantRule: AccessRule = { kind: 'tenant', permission: 'members.manage' };
  const run = async (
    membership: Partial<MembershipView> | null,
    options: { session?: SessionPrincipal; method?: string; readOnlyAllowed?: boolean } = {},
  ) => {
    const request = {
      method: options.method ?? 'POST',
      session: options.session ?? staff(),
    } as ContextualRequest;
    const context = contextFor(request, tenantRule, options.readOnlyAllowed);
    const tenant = await status(() =>
      new TenantGuard(new Reflector(), directoryWith(membership)).canActivate(context),
    );
    if (tenant !== 'ok') return tenant;
    return status(() => new PolicyGuard(new Reflector()).canActivate(context));
  };

  it('las sesiones PLATFORM y las STAFF sin organización activa no entran', async () => {
    expect(await run({}, { session: { ...staff(), kind: 'PLATFORM' } })).toBe(403);
    expect(await run({}, { session: staff(null) })).toBe(403);
  });

  it('sin membresía activa (quitado o suspendido), 403 desde la petición siguiente', async () => {
    expect(await run(null)).toBe(403);
    expect(await run({ status: 'SUSPENDED' })).toBe(403);
  });

  it('RN-A02 · solo lectura: 422 en escrituras salvo las permitidas; leer sigue', async () => {
    expect(await run({ organizationStatus: 'READ_ONLY', role: 'OWNER' })).toBe(422);
    expect(await run({ organizationStatus: 'READ_ONLY', role: 'OWNER' }, { method: 'GET' })).toBe(
      'ok',
    );
    expect(
      await run({ organizationStatus: 'READ_ONLY', role: 'OWNER' }, { readOnlyAllowed: true }),
    ).toBe('ok');
    expect(await run({ organizationStatus: 'SUSPENDED', role: 'OWNER' }, { method: 'GET' })).toBe(
      403,
    );
  });

  it('RN-A04 · el rol necesita el permiso del caso de uso', async () => {
    expect(await run({ role: 'PROFESSIONAL' })).toBe(403);
    expect(await run({ role: 'ADMIN' })).toBe('ok');
  });
});

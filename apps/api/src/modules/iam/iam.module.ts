import { Global, Inject, Module, Optional, type OnModuleInit } from '@nestjs/common';
import type { UserId } from '@nutricoach/shared-kernel';
import {
  SESSION_AUTHENTICATOR,
  TENANT_DIRECTORY,
  type TenantDirectory,
} from '../../platform/index.js';
import { MEMBER_PROFILES, PENDING_STAFF_INVITATIONS } from '../tenancy/index.js';
import { ActiveOrganizationHandler } from './application/commands/active-organization.handler.js';
import { AuthenticateSessionHandler } from './application/commands/authenticate-session.handler.js';
import { EndSessionsHandler } from './application/commands/end-sessions.handler.js';
import { InvitationHandlers } from './application/commands/invitation.handlers.js';
import { LoginHandler } from './application/commands/login.handler.js';
import { PasswordHandlers } from './application/commands/password.handlers.js';
import { UpdateAccountHandler } from './application/commands/update-account.handler.js';
import {
  ACCOUNT_STORE,
  COMMON_PASSWORDS,
  INVITATION_STORE,
  MEMBERSHIP_DIRECTORY,
  PASSWORD_HASHER,
  PASSWORD_RESET_STORE,
  SECRET_TOKENS,
  SESSION_STORE,
  type MembershipDirectory,
} from './application/ports/iam.ports.js';
import { IamApi } from './application/iam-api.js';
import { AccountQueries } from './application/queries/account.queries.js';
import { IamMailConsumer } from './adapters/in/events/iam-mail.consumer.js';
import { AccountController } from './adapters/in/http/account.controller.js';
import { AuthController } from './adapters/in/http/auth.controller.js';
import {
  InvitationController,
  OrganizationInvitationController,
  SessionController,
} from './adapters/in/http/invitation.controller.js';
import { IamSessionAuthenticator } from './adapters/in/http/session-authenticator.adapter.js';
import {
  PrismaAccountStore,
  PrismaPasswordResetStore,
  PrismaSessionStore,
} from './adapters/out/persistence/prisma-iam.stores.js';
import { PrismaInvitationStore } from './adapters/out/persistence/prisma-invitation.store.js';
import {
  Argon2PasswordHasher,
  CommonPasswordList,
  RandomSecretTokens,
} from './adapters/out/security/security-adapters.js';
import { IamMemberProfiles, IamPendingStaffInvitations } from './adapters/out/tenancy-providers.js';

/** Membresías de tenancy (TENANT_DIRECTORY) vistas desde iam; sin tenancy, ninguna. */
function membershipDirectory(directory?: TenantDirectory): MembershipDirectory {
  return {
    membershipsOf: async (userId: UserId) =>
      directory
        ? (await directory.membershipsOf(userId)).map((m) => ({
            organizationId: m.organizationId,
            organizationName: m.organizationName,
            role: m.role,
            active:
              m.status === 'ACTIVE' &&
              m.organizationStatus !== 'SUSPENDED' &&
              m.organizationStatus !== 'CLOSED',
          }))
        : [],
  };
}

/**
 * iam (02 §2): cuentas, sesiones, contraseñas, su recuperación e invitaciones. Global para exportar
 * SESSION_AUTHENTICATOR a las guardias y MEMBER_PROFILES y PENDING_STAFF_INVITATIONS a tenancy.
 */
@Global()
@Module({
  controllers: [
    AuthController,
    AccountController,
    OrganizationInvitationController,
    InvitationController,
    SessionController,
  ],
  providers: [
    LoginHandler,
    AuthenticateSessionHandler,
    EndSessionsHandler,
    PasswordHandlers,
    UpdateAccountHandler,
    InvitationHandlers,
    ActiveOrganizationHandler,
    IamApi,
    AccountQueries,
    IamMailConsumer,
    { provide: ACCOUNT_STORE, useClass: PrismaAccountStore },
    { provide: SESSION_STORE, useClass: PrismaSessionStore },
    { provide: PASSWORD_RESET_STORE, useClass: PrismaPasswordResetStore },
    { provide: INVITATION_STORE, useClass: PrismaInvitationStore },
    { provide: MEMBER_PROFILES, useClass: IamMemberProfiles },
    { provide: PENDING_STAFF_INVITATIONS, useClass: IamPendingStaffInvitations },
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    { provide: COMMON_PASSWORDS, useFactory: () => new CommonPasswordList() },
    { provide: SECRET_TOKENS, useClass: RandomSecretTokens },
    {
      provide: MEMBERSHIP_DIRECTORY,
      useFactory: (directory?: TenantDirectory) => membershipDirectory(directory),
      inject: [{ token: TENANT_DIRECTORY, optional: true }],
    },
    { provide: SESSION_AUTHENTICATOR, useClass: IamSessionAuthenticator },
  ],
  exports: [SESSION_AUTHENTICATOR, MEMBER_PROFILES, PENDING_STAFF_INVITATIONS, IamApi],
})
export class IamModule implements OnModuleInit {
  constructor(
    @Optional() @Inject(PASSWORD_HASHER) private readonly hasher?: Argon2PasswordHasher,
  ) {}

  /** El hash señuelo se calcula al arrancar: el primer intento fallido no tarda distinto. */
  async onModuleInit(): Promise<void> {
    await this.hasher?.warmUp();
  }
}

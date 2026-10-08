import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { OriginGuard } from './origin.guard.js';
import { PolicyGuard } from './policy.guard.js';
import { SessionGuard } from './session.guard.js';
import { TenantGuard } from './tenant.guard.js';

/**
 * Cadena de guardias del proceso HTTP (02 §10), en este orden: Origin, sesión, organización y permiso. Los puertos
 * SESSION_AUTHENTICATOR (iam) y TENANT_DIRECTORY (tenancy) los proveen los módulos.
 */
@Module({
  providers: [
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_GUARD, useClass: PolicyGuard },
  ],
})
export class AuthModule {}

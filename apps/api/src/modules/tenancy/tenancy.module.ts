import { Global, Module } from '@nestjs/common';
import { TENANT_DIRECTORY } from '../../platform/index.js';
import { ExpireSubscriptionsHandler } from './application/commands/expire-subscriptions.handler.js';
import { OrganizationCommands } from './application/commands/organization.commands.js';
import { PlatformTenancy } from './application/platform-tenancy.js';
import { ACTIVE_PATIENT_COUNTER, TENANCY_STORE } from './application/ports/tenancy.ports.js';
import {
  DirectoryQueries,
  OrganizationQueries,
} from './application/queries/organization.queries.js';
import { TenancyApi } from './application/tenancy-api.js';
import { OrganizationController } from './adapters/in/http/organization.controller.js';
import { ExpireSubscriptionsJob } from './adapters/in/jobs/expire-subscriptions.job.js';
import { TenancyTenantDirectory } from './adapters/in/tenant-directory.adapter.js';
import { PrismaTenancyStore } from './adapters/out/persistence/prisma-tenancy.store.js';

/**
 * tenancy (02 §2): organizaciones, miembros, planes de membresía, suscripciones y ajustes. Global para exportar
 * TENANT_DIRECTORY a las guardias de la plataforma.
 */
@Global()
@Module({
  controllers: [OrganizationController],
  providers: [
    OrganizationCommands,
    OrganizationQueries,
    DirectoryQueries,
    ExpireSubscriptionsHandler,
    ExpireSubscriptionsJob,
    TenancyApi,
    PlatformTenancy,
    { provide: TENANCY_STORE, useClass: PrismaTenancyStore },
    { provide: TENANT_DIRECTORY, useClass: TenancyTenantDirectory },
    // clinical cuenta los pacientes activos desde P6; hasta entonces el uso del cupo de pacientes es cero.
    { provide: ACTIVE_PATIENT_COUNTER, useValue: { count: () => Promise.resolve(0) } },
  ],
  exports: [TenancyApi, PlatformTenancy, TENANT_DIRECTORY],
})
export class TenancyModule {}

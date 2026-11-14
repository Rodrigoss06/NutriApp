import { Global, Module } from '@nestjs/common';
import { TENANT_DIRECTORY } from '../../platform/index.js';
import { BrandingCommands } from './application/commands/branding.commands.js';
import { ExpireSubscriptionsHandler } from './application/commands/expire-subscriptions.handler.js';
import { OrganizationCommands } from './application/commands/organization.commands.js';
import { SupportGrantCommands } from './application/commands/support-grant.commands.js';
import { PlatformTenancy } from './application/platform-tenancy.js';
import { SUPPORT_GRANT_STORE } from './application/ports/support-grant.ports.js';
import { TENANCY_STORE } from './application/ports/tenancy.ports.js';
import { BrandingQueries } from './application/queries/branding.queries.js';
import {
  DirectoryQueries,
  OrganizationQueries,
} from './application/queries/organization.queries.js';
import { SupportGrantQueries } from './application/queries/support-grant.queries.js';
import { TenancyApi } from './application/tenancy-api.js';
import { BrandingController } from './adapters/in/http/branding.controller.js';
import { OrganizationController } from './adapters/in/http/organization.controller.js';
import { SupportAccessController } from './adapters/in/http/support-access.controller.js';
import { ExpireSubscriptionsJob } from './adapters/in/jobs/expire-subscriptions.job.js';
import { TenancyTenantDirectory } from './adapters/in/tenant-directory.adapter.js';
import { PrismaSupportGrantStore } from './adapters/out/persistence/prisma-support-grant.store.js';
import { PrismaTenancyStore } from './adapters/out/persistence/prisma-tenancy.store.js';

/**
 * tenancy (02 §2): organizaciones, miembros, planes de membresía, suscripciones, marca y ajustes. Global para exportar
 * TENANT_DIRECTORY a las guardias de la plataforma.
 */
@Global()
@Module({
  controllers: [OrganizationController, BrandingController, SupportAccessController],
  providers: [
    OrganizationCommands,
    OrganizationQueries,
    BrandingCommands,
    BrandingQueries,
    DirectoryQueries,
    ExpireSubscriptionsHandler,
    ExpireSubscriptionsJob,
    TenancyApi,
    PlatformTenancy,
    SupportGrantCommands,
    SupportGrantQueries,
    { provide: TENANCY_STORE, useClass: PrismaTenancyStore },
    { provide: SUPPORT_GRANT_STORE, useClass: PrismaSupportGrantStore },
    { provide: TENANT_DIRECTORY, useClass: TenancyTenantDirectory },
  ],
  exports: [TenancyApi, PlatformTenancy, SupportGrantQueries, TENANT_DIRECTORY],
})
export class TenancyModule {}

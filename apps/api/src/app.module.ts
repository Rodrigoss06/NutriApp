import { Module } from '@nestjs/common';
import { BackofficeModule } from './modules/backoffice/index.js';
import { ClinicalModule } from './modules/clinical/index.js';
import { IamModule } from './modules/iam/index.js';
import { TenancyModule } from './modules/tenancy/index.js';
import { AuthModule, HealthModule, IdempotencyModule, PlatformModule } from './platform/index.js';

/** Raíz del proceso HTTP. Cada contexto de src/modules se agrega aquí por su index.ts. */
@Module({
  imports: [
    PlatformModule,
    AuthModule,
    IdempotencyModule,
    HealthModule,
    TenancyModule,
    IamModule,
    ClinicalModule,
    BackofficeModule,
  ],
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { AssessmentModule } from './modules/assessment/index.js';
import { AuditLogModule } from './modules/audit/index.js';
import { ExerciseModule } from './modules/exercise/index.js';
import { FoodModule } from './modules/food/index.js';
import { NutritionModule } from './modules/nutrition/index.js';
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
    AssessmentModule,
    ExerciseModule,
    FoodModule,
    NutritionModule,
    AuditLogModule,
    BackofficeModule,
  ],
})
export class AppModule {}

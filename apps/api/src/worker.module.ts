import { Module } from '@nestjs/common';
import { AssessmentModule } from './modules/assessment/index.js';
import { ClinicalModule } from './modules/clinical/index.js';
import { DocumentsModule } from './modules/documents/index.js';
import { IamModule } from './modules/iam/index.js';
import { TenancyModule } from './modules/tenancy/index.js';
import { TrackingModule } from './modules/tracking/index.js';
import { PlatformModule, WorkerPlatformModule } from './platform/index.js';

/** Raíz del proceso worker: el mismo código que la API, sin HTTP (02 §1). */
@Module({
  imports: [
    PlatformModule,
    WorkerPlatformModule,
    TenancyModule,
    IamModule,
    ClinicalModule,
    AssessmentModule,
    TrackingModule,
    DocumentsModule,
  ],
})
export class WorkerModule {}

import { Module } from '@nestjs/common';
import { IamModule } from './modules/iam/index.js';
import { TenancyModule } from './modules/tenancy/index.js';
import { PlatformModule, WorkerPlatformModule } from './platform/index.js';

/** Raíz del proceso worker: el mismo código que la API, sin HTTP (02 §1). */
@Module({ imports: [PlatformModule, WorkerPlatformModule, TenancyModule, IamModule] })
export class WorkerModule {}

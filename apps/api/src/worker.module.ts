import { Module } from '@nestjs/common';
import { IamModule } from './modules/iam/index.js';
import { PlatformModule, WorkerPlatformModule } from './platform/index.js';

/** Raíz del proceso worker: el mismo código que la API, sin HTTP (02 §1). */
@Module({ imports: [PlatformModule, WorkerPlatformModule, IamModule] })
export class WorkerModule {}

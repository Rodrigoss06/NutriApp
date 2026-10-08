import { Module } from '@nestjs/common';
import { IamModule } from './modules/iam/index.js';
import { AuthModule, HealthModule, IdempotencyModule, PlatformModule } from './platform/index.js';

/** Raíz del proceso HTTP. Cada contexto de src/modules se agrega aquí por su index.ts. */
@Module({ imports: [PlatformModule, AuthModule, IdempotencyModule, HealthModule, IamModule] })
export class AppModule {}

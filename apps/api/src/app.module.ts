import { Module } from '@nestjs/common';
import { HealthModule, IdempotencyModule, PlatformModule } from './platform/index.js';

/** Raíz del proceso HTTP. Cada contexto de src/modules se agrega aquí por su index.ts. */
@Module({ imports: [PlatformModule, IdempotencyModule, HealthModule] })
export class AppModule {}

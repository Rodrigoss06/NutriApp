import { Module } from '@nestjs/common';
import { HealthModule, PlatformModule } from './platform/index.js';

/** Raíz del proceso HTTP. Cada contexto de src/modules se agrega aquí por su index.ts. */
@Module({ imports: [PlatformModule, HealthModule] })
export class AppModule {}

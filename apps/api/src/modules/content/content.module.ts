import { Module, type OnModuleInit } from '@nestjs/common';
import { ClinicalApi } from '../clinical/index.js';
import { CONTENT_EXPORT_TABLES } from './application/content-export-tables.js';
import {
  MeAppController,
  MotivationalMessagesController,
  PatientAppController,
} from './adapters/in/http/content.controllers.js';
import {
  MeResourcesController,
  PatientResourcesController,
  ResourcesController,
} from './adapters/in/http/resource.controllers.js';
import { PrismaContentStore } from './adapters/out/persistence/prisma-content.store.js';
import { PrismaResourceStore } from './adapters/out/persistence/prisma-resource.store.js';
import { ContentApi } from './application/content-api.js';
import { ContentCommands } from './application/content.commands.js';
import { ContentQueries } from './application/content.queries.js';
import { CONTENT_STORE } from './application/ports/content.ports.js';
import { RESOURCE_STORE } from './application/ports/resources.ports.js';
import { ResourceCommands } from './application/resource.commands.js';
import { ResourceQueries } from './application/resource.queries.js';

/**
 * content (02 §2): los ajustes de la app del paciente y los mensajes motivacionales (RF-27), y el material educativo: la biblioteca
 * de la organización, su asignación a pacientes y la vista en la app (RF-30, ADR-094).
 */
@Module({
  controllers: [
    PatientAppController,
    MotivationalMessagesController,
    MeAppController,
    ResourcesController,
    PatientResourcesController,
    MeResourcesController,
  ],
  providers: [
    ContentApi,
    ContentCommands,
    ContentQueries,
    ResourceCommands,
    ResourceQueries,
    { provide: CONTENT_STORE, useClass: PrismaContentStore },
    { provide: RESOURCE_STORE, useClass: PrismaResourceStore },
  ],
  exports: [ContentApi],
})
export class ContentModule implements OnModuleInit {
  constructor(private readonly clinical: ClinicalApi) {}

  /** El material asignado, los mensajes y el tema de la app van en la exportación del paciente (RN-B04). */
  onModuleInit(): void {
    this.clinical.registerExportSource({ context: 'content', tables: CONTENT_EXPORT_TABLES });
  }
}

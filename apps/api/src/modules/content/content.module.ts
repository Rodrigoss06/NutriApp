import { Module } from '@nestjs/common';
import {
  MeAppController,
  MotivationalMessagesController,
  PatientAppController,
} from './adapters/in/http/content.controllers.js';
import { PrismaContentStore } from './adapters/out/persistence/prisma-content.store.js';
import { ContentApi } from './application/content-api.js';
import { ContentCommands } from './application/content.commands.js';
import { ContentQueries } from './application/content.queries.js';
import { CONTENT_STORE } from './application/ports/content.ports.js';

/**
 * content (02 §2): los ajustes de la app del paciente y los mensajes motivacionales (RF-27). El material educativo (RF-30) llega
 * en P14.
 */
@Module({
  controllers: [PatientAppController, MotivationalMessagesController, MeAppController],
  providers: [
    ContentApi,
    ContentCommands,
    ContentQueries,
    { provide: CONTENT_STORE, useClass: PrismaContentStore },
  ],
  exports: [ContentApi],
})
export class ContentModule {}

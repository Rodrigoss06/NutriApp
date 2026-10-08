import { Module } from '@nestjs/common';
import { BackofficeCommands } from './application/backoffice.commands.js';
import { PlatformController } from './adapters/in/http/platform.controller.js';

/** backoffice (02 §2): panel interno de la plataforma sobre las API públicas de tenancy e iam. */
@Module({
  controllers: [PlatformController],
  providers: [BackofficeCommands],
})
export class BackofficeModule {}

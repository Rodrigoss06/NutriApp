import { Global, Module } from '@nestjs/common';
import { ClsPluginTransactional } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { UNIT_OF_WORK } from '@nutricoach/shared-kernel';
import type { Request } from 'express';
import { ClsModule } from 'nestjs-cls';
import { CLS_REQUEST } from '../http/request-meta.js';
import { PRISMA, PrismaModule } from './prisma.provider.js';
import { PrismaUnitOfWork } from './prisma-unit-of-work.js';

/** Base de datos de la API y el worker: cliente de Prisma como app_user y UnitOfWork (02 §6). */
@Global()
@Module({
  imports: [
    PrismaModule,
    ClsModule.forRoot({
      global: true,
      // En HTTP, la petición queda en CLS para la auditoría (RN-B03).
      middleware: {
        mount: true,
        setup: (cls, request: Request) => {
          cls.set(CLS_REQUEST, request);
        },
      },
      plugins: [
        new ClsPluginTransactional({
          imports: [PrismaModule],
          adapter: new TransactionalAdapterPrisma({ prismaInjectionToken: PRISMA }),
        }),
      ],
    }),
  ],
  providers: [{ provide: UNIT_OF_WORK, useClass: PrismaUnitOfWork }],
  exports: [PrismaModule, UNIT_OF_WORK],
})
export class DatabaseModule {}

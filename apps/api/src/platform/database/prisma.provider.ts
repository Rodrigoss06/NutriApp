import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import type { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { loadEnv } from '../config/env.js';
import { PrismaClient } from './generated/client.js';

/** Token del cliente de Prisma conectado como app_user (ADR-024). */
export const PRISMA = Symbol.for('nutricoach.Prisma');

/** Transacción en curso, compartida por repositorios, outbox y consultas dentro de la UnitOfWork. */
export type Db = TransactionHost<TransactionalAdapterPrisma<PrismaClient>>;

/** Conexiones por proceso: max_connections es 60 para API, worker y staging juntos (01 §4). */
const POOL_SIZE = 10;

export function createPrismaClient(connectionString = loadEnv().DATABASE_URL): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString, max: POOL_SIZE }) });
}

class PrismaLifecycle implements OnApplicationShutdown {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async onApplicationShutdown(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

/** El cliente no se conecta hasta la primera consulta: arrancar sin base solo falla en /health/ready. */
@Global()
@Module({
  providers: [{ provide: PRISMA, useFactory: () => createPrismaClient() }, PrismaLifecycle],
  exports: [PRISMA],
})
export class PrismaModule {}

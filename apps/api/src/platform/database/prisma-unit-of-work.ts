import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { SecurityContext, UnitOfWork } from '@nutricoach/shared-kernel';
import { ClsService } from 'nestjs-cls';
import type { Db } from './prisma.provider.js';

/**
 * UnitOfWork sobre Prisma y nestjs-cls (02 §6, ADR-024). Abre la transacción, fija el contexto de seguridad
 * con set_config(..., true) para que la RLS lo lea y lo comparte con los repositorios por AsyncLocalStorage:
 * dentro de `work`, `Db.tx` es esta transacción. El contexto muere con la transacción.
 */
@Injectable()
export class PrismaUnitOfWork implements UnitOfWork {
  constructor(
    private readonly cls: ClsService,
    @Inject(TransactionHost) private readonly txHost: Db,
  ) {}

  run<T>(context: SecurityContext, work: () => Promise<T>): Promise<T> {
    return this.#transaction(context, false, work);
  }

  query<T>(context: SecurityContext, work: () => Promise<T>): Promise<T> {
    return this.#transaction(context, true, work);
  }

  #transaction<T>(context: SecurityContext, readOnly: boolean, work: () => Promise<T>): Promise<T> {
    const open = (): Promise<T> => {
      // Un comando es una transacción: anidar mezclaría contextos de seguridad o escrituras de dos comandos.
      if (this.txHost.isTransactionActive()) {
        throw new Error('UnitOfWork anidada: cada comando o consulta abre una sola transacción.');
      }
      return this.txHost.withTransaction(async () => {
        const tx = this.txHost.tx;
        if (readOnly) await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
        await tx.$executeRaw`SELECT
          set_config('app.org_id', ${context.organizationId ?? ''}, true),
          set_config('app.user_id', ${context.userId ?? ''}, true),
          set_config('app.role', ${context.role}, true),
          set_config('app.patient_id', ${context.patientId ?? ''}, true)`;
        return work();
      });
    };
    return this.cls.isActive() ? open() : this.cls.run(open);
  }
}

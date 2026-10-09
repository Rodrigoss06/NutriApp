import {
  err,
  type DomainError,
  type Result,
  type SecurityContext,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';

/** Error que revierte la transacción y vuelve como Result. */
class Rollback extends Error {
  constructor(readonly error: DomainError) {
    super(error.code);
  }
}

/**
 * Una transacción que se revierte entera si el caso de uso devuelve un error de dominio: así nada de lo escrito antes
 * del error queda (un responsable cambiado con una versión vieja, un archivo registrado sin su consentimiento).
 */
export async function atomically<T>(
  uow: UnitOfWork,
  context: SecurityContext,
  work: () => Promise<Result<T, DomainError>>,
): Promise<Result<T, DomainError>> {
  try {
    return await uow.run(context, async () => {
      const result = await work();
      if (!result.ok) throw new Rollback(result.error);
      return result;
    });
  } catch (error) {
    if (error instanceof Rollback) return err(error.error);
    throw error;
  }
}

import pg from 'pg';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, inject } from 'vitest';

export type DbRole = 'owner' | 'user' | 'readonly';

/** Contexto de seguridad que fija la UnitOfWork (05 §3). */
export interface SecurityContext {
  readonly orgId?: string;
  readonly userId?: string;
  readonly role?:
    'OWNER' | 'ADMIN' | 'PROFESSIONAL' | 'PATIENT' | 'PLATFORM_ADMIN' | 'SYSTEM' | 'ACCOUNT';
  readonly patientId?: string;
  readonly memberId?: string;
}

const pools = new Map<DbRole, pg.Pool>();

/** Pool por rol de base. Las pruebas de la aplicación usan `user` (app_user, sujeto a RLS). */
export function pool(role: DbRole): pg.Pool {
  let existing = pools.get(role);
  if (!existing) {
    existing = new pg.Pool({ connectionString: inject('databaseUrls')[role], max: 4 });
    pools.set(role, existing);
  }
  return existing;
}

afterAll(async () => {
  await Promise.all([...pools.values()].map((p) => p.end()));
  pools.clear();
});

/**
 * Corre `fn` en una transacción con el contexto fijado con set_config(..., true), igual que la
 * UnitOfWork. Por defecto revierte al terminar, para que las pruebas no se ensucien entre sí.
 */
export async function withContext<T>(
  role: DbRole,
  context: SecurityContext,
  fn: (client: pg.PoolClient) => Promise<T>,
  { commit = false }: { commit?: boolean } = {},
): Promise<T> {
  const client = await pool(role).connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `SELECT set_config('app.org_id', $1, true), set_config('app.user_id', $2, true),
              set_config('app.role', $3, true), set_config('app.patient_id', $4, true),
              set_config('app.member_id', $5, true)`,
      [
        context.orgId ?? '',
        context.userId ?? '',
        context.role ?? '',
        context.patientId ?? '',
        context.memberId ?? '',
      ],
    );
    const result = await fn(client);
    await client.query(commit ? 'COMMIT' : 'ROLLBACK');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Ejecuta `sql` dentro de un SAVEPOINT y devuelve el código de error de PostgreSQL, o `undefined` si
 * no falló. Permite seguir usando la transacción después de un rechazo esperado.
 */
export async function errorCode(
  client: pg.PoolClient,
  sql: string,
  params: unknown[] = [],
): Promise<string | undefined> {
  await client.query('SAVEPOINT probe');
  try {
    await client.query(sql, params);
    await client.query('RELEASE SAVEPOINT probe');
    return undefined;
  } catch (error) {
    await client.query('ROLLBACK TO SAVEPOINT probe');
    return (error as { code?: string }).code;
  }
}

/** UUIDv7, como los genera el dominio (ADR-003). */
export const id = (): string => uuidv7();

/** Códigos de PostgreSQL que esperan las pruebas. */
export const PG = {
  insufficientPrivilege: '42501',
  integrityViolation: '23000',
  foreignKeyViolation: '23503',
  readOnlyTransaction: '25006',
} as const;

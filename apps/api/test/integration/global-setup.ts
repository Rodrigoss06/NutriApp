import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';

/** Contraseñas de esta base desechable: no son secretos. */
const PASSWORDS = {
  app_owner: 'owner_test',
  app_user: 'user_test',
  app_readonly: 'readonly_test',
} as const;

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrls: { owner: string; user: string; readonly: string };
  }
}

let container: StartedPostgreSqlContainer | undefined;

/**
 * PostgreSQL 18 con el mismo init que el compose local y producción (infra/db/init), y todas las
 * migraciones aplicadas por app_owner con `prisma migrate deploy`, como en CI y en el despliegue.
 */
export async function setup(project: TestProject): Promise<void> {
  const initDir = fileURLToPath(new URL('../../../../infra/db/init', import.meta.url));
  container = await new PostgreSqlContainer('postgres:18')
    .withCommand(['postgres', '-c', 'shared_preload_libraries=pg_stat_statements'])
    .withEnvironment({
      APP_OWNER_PASSWORD: PASSWORDS.app_owner,
      APP_USER_PASSWORD: PASSWORDS.app_user,
      APP_READONLY_PASSWORD: PASSWORDS.app_readonly,
    })
    .withCopyDirectoriesToContainer([{ source: initDir, target: '/docker-entrypoint-initdb.d' }])
    .start();

  const host = `${container.getHost()}:${String(container.getPort())}`;
  const url = (role: keyof typeof PASSWORDS): string =>
    `postgresql://${role}:${PASSWORDS[role]}@${host}/nutricoach`;

  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    env: { ...process.env, DATABASE_OWNER_URL: url('app_owner') },
    stdio: 'pipe',
  });

  project.provide('databaseUrls', {
    owner: url('app_owner'),
    user: url('app_user'),
    readonly: url('app_readonly'),
  });
}

export async function teardown(): Promise<void> {
  await container?.stop();
}

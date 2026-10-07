import 'server-only';
import { z } from 'zod';

/**
 * Entorno de la web (01 §2). NODE_ENV es production también en staging, así que lo que solo existe en local y
 * staging (el catálogo de componentes) se decide con APP_ENV. Si falta en un build de producción, se asume
 * production: falla cerrado.
 */
const envSchema = z.object({
  APP_ENV: z.enum(['local', 'staging', 'production']).optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type AppEnv = 'local' | 'staging' | 'production';

export function appEnv(source: Record<string, string | undefined> = process.env): AppEnv {
  const env = envSchema.parse(source);
  return env.APP_ENV ?? (env.NODE_ENV === 'production' ? 'production' : 'local');
}

/** El catálogo de componentes y otras herramientas internas: solo en local y staging. */
export function internalToolsEnabled(source?: Record<string, string | undefined>): boolean {
  return appEnv(source) !== 'production';
}

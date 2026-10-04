import { z } from 'zod';

/**
 * Variables de entorno validadas al arrancar (06 §4). La lista completa está en 01 §12 y en
 * .env.example; cada prompt agrega aquí las que empieza a usar (P2: bases de datos).
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type Env = z.infer<typeof envSchema>;
export type NodeEnv = Env['NODE_ENV'];

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  return envSchema.parse(source);
}

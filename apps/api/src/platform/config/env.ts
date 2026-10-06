import { z } from 'zod';

/** 32 bytes en base64: llaves de AES-256-GCM y de HMAC-SHA256. */
const KEY_32_BYTES = /^[A-Za-z0-9+/]{43}=$/;

/**
 * Variables de entorno validadas al arrancar (06 §4). La lista completa está en 01 §12 y en
 * .env.example; cada prompt agrega aquí las que empieza a usar. Los mensajes nunca repiten el valor.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /** app_user: la API y el worker, siempre sujetos a RLS. Las migraciones usan DATABASE_OWNER_URL. */
  DATABASE_URL: z.url({
    protocol: /^postgres(ql)?$/,
    error: 'DATABASE_URL debe ser postgresql://',
  }),
  /** `v1:BASE64,v2:BASE64`: cifra con la última versión y descifra con cualquiera (rotación, RN-B06). */
  ENCRYPTION_KEYS: z
    .string()
    .refine(
      (value) =>
        value
          .split(',')
          .every((entry) => /^v\d+:/.test(entry) && KEY_32_BYTES.test(entry.replace(/^v\d+:/, ''))),
      'ENCRYPTION_KEYS debe ser una lista vN:llave con llaves de 32 bytes en base64',
    ),
  /** HMAC del índice ciego para buscar sobre campos cifrados (RN-B06). */
  BLIND_INDEX_KEY: z
    .string()
    .regex(KEY_32_BYTES, 'BLIND_INDEX_KEY debe ser una llave de 32 bytes en base64'),
});

export type Env = z.infer<typeof envSchema>;
export type NodeEnv = Env['NODE_ENV'];

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  return envSchema.parse(source);
}

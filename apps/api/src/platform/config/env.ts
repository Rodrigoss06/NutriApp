import { z } from 'zod';

/** 32 bytes en base64: llaves de AES-256-GCM y de HMAC-SHA256. */
const KEY_32_BYTES = /^[A-Za-z0-9+/]{43}=$/;

/** Remitente por defecto con SMTP (Mailpit en local); con Resend, MAIL_FROM es obligatorio. */
export const LOCAL_MAIL_FROM = 'NutriCoach <no-responder@nutricoach.local>';

/**
 * Variables de entorno validadas al arrancar (06 §4). La lista completa está en 01 §12 y en
 * .env.example; cada prompt agrega aquí las que empieza a usar. Los mensajes nunca repiten el valor.
 */
const envSchema = z
  .object({
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
            .every(
              (entry) => /^v\d+:/.test(entry) && KEY_32_BYTES.test(entry.replace(/^v\d+:/, '')),
            ),
        'ENCRYPTION_KEYS debe ser una lista vN:llave con llaves de 32 bytes en base64',
      ),
    /** HMAC del índice ciego para buscar sobre campos cifrados (RN-B06). */
    BLIND_INDEX_KEY: z
      .string()
      .regex(KEY_32_BYTES, 'BLIND_INDEX_KEY debe ser una llave de 32 bytes en base64'),
    /** Origen público de la web: el Origin de toda escritura debe coincidir y los enlaces de correo se arman con él. */
    APP_URL: z
      .url({ protocol: /^https?$/, error: 'APP_URL debe ser una URL http(s)' })
      .transform((value) => new URL(value).origin),
    /** __Host-nc_session en staging y producción: Secure, Path=/ y sin Domain (comparten dominio padre). */
    SESSION_COOKIE_NAME: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/, 'SESSION_COOKIE_NAME solo admite letras, dígitos, - y _')
      .default('nc_session'),
    MAIL_DRIVER: z.enum(['smtp', 'resend']).default('smtp'),
    SMTP_URL: z
      .url({ protocol: /^smtps?$/, error: 'SMTP_URL debe ser smtp:// o smtps://' })
      .optional(),
    RESEND_API_KEY: z.string().min(1).optional(),
    MAIL_FROM: z.string().min(3).optional(),
    /** Multiplica los máximos del límite de intentos (E2E y k6). En producción, 1. */
    RATE_LIMIT_FACTOR: z.coerce.number().positive().max(1000).default(1),
  })
  .superRefine((env, ctx) => {
    if (env.MAIL_DRIVER === 'smtp' && !env.SMTP_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['SMTP_URL'],
        message: 'MAIL_DRIVER=smtp exige SMTP_URL',
      });
    }
    if (env.MAIL_DRIVER === 'resend' && (!env.RESEND_API_KEY || !env.MAIL_FROM)) {
      ctx.addIssue({
        code: 'custom',
        path: ['RESEND_API_KEY'],
        message: 'MAIL_DRIVER=resend exige RESEND_API_KEY y MAIL_FROM',
      });
    }
    if (env.NODE_ENV === 'production' && !env.SESSION_COOKIE_NAME.startsWith('__Host-')) {
      ctx.addIssue({
        code: 'custom',
        path: ['SESSION_COOKIE_NAME'],
        message: 'En producción la cookie de sesión lleva el prefijo __Host-',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;
export type NodeEnv = Env['NODE_ENV'];

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  return envSchema.parse(source);
}

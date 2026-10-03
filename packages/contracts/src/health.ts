import { z } from 'zod';

export const healthStatusSchema = z.enum(['ok', 'error']);

/**
 * Respuesta de /api/health/live y /api/health/ready (01 §8). `checks` detalla cada dependencia
 * revisada: base, migraciones, cola y partición del mes siguiente desde P2.
 */
export const healthResponseSchema = z.object({
  status: healthStatusSchema,
  checks: z.record(z.string(), healthStatusSchema).optional(),
});

export type HealthStatus = z.infer<typeof healthStatusSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;

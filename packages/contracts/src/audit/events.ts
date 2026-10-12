import { z } from 'zod';

const MAX_RANGE_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Consulta de auditoría para el dueño (RF-06): rango de fechas obligatorio de 90 días como máximo, para que la
 * consulta use las particiones mensuales de audit.audit_log.
 */
export const auditEventsQuerySchema = z
  .object({
    from: z.iso.datetime({ offset: true }),
    to: z.iso.datetime({ offset: true }),
    patientId: z.uuid().optional(),
    userId: z.uuid().optional(),
    action: z
      .enum([
        'READ',
        'CREATE',
        'UPDATE',
        'PUBLISH',
        'EXPORT',
        'LOGIN',
        'LOGIN_FAILED',
        'LOGOUT',
        'GRANT',
        'REVOKE',
      ])
      .optional(),
    cursor: z.string().max(200).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .refine((q) => Date.parse(q.from) <= Date.parse(q.to), {
    message: 'La fecha inicial debe ser anterior a la final.',
    path: ['from'],
  })
  .refine((q) => Date.parse(q.to) - Date.parse(q.from) <= MAX_RANGE_MS, {
    message: 'El rango es de 90 días como máximo.',
    path: ['to'],
  });
export type AuditEventsQuery = z.input<typeof auditEventsQuerySchema>;

export const auditEventSchema = z.object({
  id: z.uuid(),
  occurredAt: z.iso.datetime(),
  actorUserId: z.uuid().nullable(),
  /** Nombre de la cuenta que actuó; null si fue el sistema. */
  actorName: z.string().nullable(),
  actorRole: z.string().nullable(),
  action: z.string(),
  resourceType: z.string(),
  resourceId: z.uuid().nullable(),
  patientId: z.uuid().nullable(),
  /** Código legible del paciente (P-000123), si lo hay. */
  patientCode: z.string().nullable(),
  changedFields: z.array(z.string()),
  outcome: z.string(),
  requestId: z.string().nullable(),
});
export type AuditEvent = z.infer<typeof auditEventSchema>;
export const auditEventListResponseSchema = z.object({
  events: z.array(auditEventSchema),
  nextCursor: z.string().nullable(),
});
export type AuditEventListResponse = z.infer<typeof auditEventListResponseSchema>;

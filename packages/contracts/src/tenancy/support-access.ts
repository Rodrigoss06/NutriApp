import { z } from 'zod';

/**
 * El soporte con permiso del dueño (RN-A09; ADR-124, ADR-129). ACCOUNT deja ver el equipo, los ajustes y la marca, sin pacientes;
 * CLINICAL_READ, además, los pacientes y su expediente. Siempre en solo lectura y por un tiempo: de 1 a 7 días, 1 por defecto.
 */
export const SUPPORT_SCOPES = ['ACCOUNT', 'CLINICAL_READ'] as const;
export type SupportScope = (typeof SUPPORT_SCOPES)[number];

export const SUPPORT_SCOPE_LABELS = {
  ACCOUNT: 'Equipo y ajustes',
  CLINICAL_READ: 'Equipo, ajustes, pacientes y expedientes',
} as const satisfies Record<SupportScope, string>;

export const SUPPORT_GRANT_MAX_DAYS = 7;
export const SUPPORT_REASON_MAX = 300;

/** POST /api/v1/organization/support-grants: solo el dueño. */
export const createSupportGrantSchema = z.strictObject({
  supportUserId: z.uuid(),
  scope: z.enum(SUPPORT_SCOPES),
  reason: z.string().trim().min(3, 'Escribe el motivo.').max(SUPPORT_REASON_MAX),
  durationDays: z.number().int().min(1).max(SUPPORT_GRANT_MAX_DAYS).default(1),
});
export type CreateSupportGrant = z.input<typeof createSupportGrantSchema>;

export const SUPPORT_GRANT_STATUSES = ['ACTIVE', 'EXPIRED', 'REVOKED'] as const;

export const supportGrantSchema = z.object({
  id: z.uuid(),
  supportUserId: z.uuid(),
  /** null si esa persona ya no es del soporte de la plataforma. */
  supportName: z.string().nullable(),
  scope: z.enum(SUPPORT_SCOPES),
  reason: z.string(),
  grantedBy: z.uuid(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  revokedAt: z.iso.datetime().nullable(),
  status: z.enum(SUPPORT_GRANT_STATUSES),
});
export type SupportGrant = z.infer<typeof supportGrantSchema>;

/** GET /api/v1/organization/support-grants: los vigentes primero y después los de los últimos 90 días. */
export const supportGrantListResponseSchema = z.object({ grants: z.array(supportGrantSchema) });
export type SupportGrantListResponse = z.infer<typeof supportGrantListResponseSchema>;

/** GET /api/v1/organization/support-staff: a quién se le puede dar un permiso, solo con su nombre. */
export const supportStaffResponseSchema = z.object({
  staff: z.array(z.object({ userId: z.uuid(), displayName: z.string() })),
});
export type SupportStaffResponse = z.infer<typeof supportStaffResponseSchema>;

/** Un permiso vigente visto por el soporte, con su organización. */
export const platformSupportGrantSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  organizationName: z.string(),
  scope: z.enum(SUPPORT_SCOPES),
  reason: z.string(),
  expiresAt: z.iso.datetime(),
});
export type PlatformSupportGrant = z.infer<typeof platformSupportGrantSchema>;

/** GET /api/v1/platform/support/grants: los permisos vigentes de quien pregunta. */
export const platformSupportGrantListResponseSchema = z.object({
  grants: z.array(platformSupportGrantSchema),
});
export type PlatformSupportGrantListResponse = z.infer<
  typeof platformSupportGrantListResponseSchema
>;

/** POST /api/v1/platform/support/session: entrar a una organización en modo soporte, con un permiso vigente. */
export const enterSupportSessionSchema = z.strictObject({ organizationId: z.uuid() });
export type EnterSupportSession = z.infer<typeof enterSupportSessionSchema>;

/** El modo soporte de la sesión, en /account: la organización, el alcance y cuándo vence. */
export const supportSessionSchema = z.object({
  grantId: z.uuid(),
  organizationId: z.uuid(),
  organizationName: z.string(),
  scope: z.enum(SUPPORT_SCOPES),
  expiresAt: z.iso.datetime(),
});
export type SupportSession = z.infer<typeof supportSessionSchema>;

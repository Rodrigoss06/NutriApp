import { z } from 'zod';

/** Correo tal como lo escribe la persona: se recorta y se compara sin mayúsculas en la API (citext). */
export const emailSchema = z.string().trim().max(254).pipe(z.email('Escribe un correo válido.'));

/**
 * Contraseña escrita por la persona. El largo real (10 a 128 caracteres tras NFKC, RN-A07) lo valida la API;
 * aquí solo se corta lo absurdo para no hashear megabytes.
 */
export const passwordInputSchema = z.string().min(1, 'Escribe tu contraseña.').max(1024);

/** Token de invitación o recuperación: 32 bytes en base64url. Llega en el cuerpo, nunca en la URL. */
export const secretTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'El enlace no es válido.');

export const loginRequestSchema = z.object({ email: emailSchema, password: passwordInputSchema });
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const passwordResetRequestSchema = z.object({ email: emailSchema });
export type PasswordResetRequest = z.infer<typeof passwordResetRequestSchema>;

export const passwordResetConfirmSchema = z.object({
  token: secretTokenSchema,
  newPassword: passwordInputSchema,
});
export type PasswordResetConfirm = z.infer<typeof passwordResetConfirmSchema>;

export const changePasswordSchema = z.object({
  currentPassword: passwordInputSchema,
  newPassword: passwordInputSchema,
});
export type ChangePassword = z.infer<typeof changePasswordSchema>;

export const updateAccountSchema = z.object({
  displayName: z.string().trim().min(1, 'Escribe tu nombre.').max(120),
});
export type UpdateAccount = z.infer<typeof updateAccountSchema>;

export const SESSION_KINDS = ['STAFF', 'PATIENT', 'PLATFORM'] as const;
export const MEMBER_ROLES = ['OWNER', 'ADMIN', 'PROFESSIONAL'] as const;

export const membershipSchema = z.object({
  organizationId: z.uuid(),
  organizationName: z.string(),
  role: z.enum(MEMBER_ROLES),
});
export type Membership = z.infer<typeof membershipSchema>;

/** Lo que la web sabe de quien entró: GET /api/v1/account y la respuesta de entrar. */
export const accountResponseSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  displayName: z.string(),
  kind: z.enum(SESSION_KINDS),
  activeOrganizationId: z.uuid().nullable(),
  memberships: z.array(membershipSchema),
});
export type AccountResponse = z.infer<typeof accountResponseSchema>;

export const sessionSummarySchema = z.object({
  id: z.uuid(),
  current: z.boolean(),
  createdAt: z.iso.datetime(),
  lastSeenAt: z.iso.datetime(),
  userAgent: z.string().nullable(),
});
export type SessionSummary = z.infer<typeof sessionSummarySchema>;

export const sessionListResponseSchema = z.object({ sessions: z.array(sessionSummarySchema) });
export type SessionListResponse = z.infer<typeof sessionListResponseSchema>;

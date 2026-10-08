import type { SecurityContext, UserId } from '@nutricoach/shared-kernel';

/** Contexto de una cuenta sin organización activa: iam no tiene RLS; la auditoría registra al actor. */
export function accountContext(userId: UserId): SecurityContext {
  return { organizationId: null, userId, role: 'ACCOUNT', patientId: null };
}

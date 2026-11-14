import { domainError, err, ok, type DomainError, type Result } from '@nutricoach/shared-kernel';

/**
 * El permiso de soporte que da el dueño (RN-A09; ADR-124, ADR-129): a una persona del soporte de la plataforma, con un alcance, un
 * motivo y una caducidad de 1 a 7 días. Caduca solo; el dueño puede revocarlo antes. No se edita.
 */
export type SupportScope = 'ACCOUNT' | 'CLINICAL_READ';
export type SupportGrantStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED';

export const SUPPORT_GRANT_MAX_DAYS = 7;
const REASON_MIN = 3;
const REASON_MAX = 300;
const DAY_MS = 86_400_000;

export const SUPPORT_GRANT_INVALID = domainError({
  code: 'NC-TEN-050',
  rule: 'RN-A09',
  message: 'El permiso dura de 1 a 7 días y necesita un motivo de 3 a 300 caracteres.',
});
export const SUPPORT_GRANT_NOT_ACTIVE = domainError({
  code: 'NC-TEN-049',
  rule: 'RN-A09',
  message: 'Ese permiso ya venció o fue revocado.',
});

export interface SupportGrantRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly supportUserId: string;
  readonly scope: SupportScope;
  readonly reason: string;
  readonly grantedBy: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
}

export interface NewSupportGrant {
  readonly id: string;
  readonly organizationId: string;
  readonly supportUserId: string;
  readonly scope: SupportScope;
  readonly reason: string;
  readonly grantedBy: string;
  readonly durationDays: number;
}

/** Un permiso nuevo desde `now`: vence `durationDays` días después. */
export function newSupportGrant(
  input: NewSupportGrant,
  now: Date,
): Result<SupportGrantRecord, DomainError> {
  const reason = input.reason.trim();
  if (
    !Number.isInteger(input.durationDays) ||
    input.durationDays < 1 ||
    input.durationDays > SUPPORT_GRANT_MAX_DAYS ||
    reason.length < REASON_MIN ||
    reason.length > REASON_MAX
  ) {
    return err(SUPPORT_GRANT_INVALID);
  }
  return ok({
    id: input.id,
    organizationId: input.organizationId,
    supportUserId: input.supportUserId,
    scope: input.scope,
    reason,
    grantedBy: input.grantedBy,
    createdAt: now,
    expiresAt: new Date(now.getTime() + input.durationDays * DAY_MS),
    revokedAt: null,
  });
}

export function supportGrantStatus(grant: SupportGrantRecord, now: Date): SupportGrantStatus {
  if (grant.revokedAt) return 'REVOKED';
  return grant.expiresAt.getTime() > now.getTime() ? 'ACTIVE' : 'EXPIRED';
}

/** null si se puede revocar: solo uno vigente. */
export function canRevoke(grant: SupportGrantRecord, now: Date): DomainError | null {
  return supportGrantStatus(grant, now) === 'ACTIVE' ? null : SUPPORT_GRANT_NOT_ACTIVE;
}

import { domainError, type DomainError } from '@nutricoach/shared-kernel';

export type MemberRole = 'OWNER' | 'ADMIN' | 'PROFESSIONAL';
export type MemberStatus = 'ACTIVE' | 'SUSPENDED' | 'REMOVED';
export type Profession = 'NUTRITIONIST' | 'TRAINER' | 'BOTH' | 'OTHER';

const RANK: Readonly<Record<MemberRole, number>> = { PROFESSIONAL: 1, ADMIN: 2, OWNER: 3 };

export const ONLY_OWNER_GRANTS_OWNER = domainError({
  code: 'NC-TEN-003',
  rule: 'RN-A04',
  message: 'Solo un dueño puede dar o quitar el rol de dueño.',
});
export const NO_SELF_PROMOTION = domainError({
  code: 'NC-TEN-004',
  rule: 'RN-A04',
  message: 'Nadie puede subir su propio rol.',
});
export const LAST_OWNER = domainError({
  code: 'NC-TEN-005',
  rule: 'RN-A04',
  message: 'La organización necesita al menos un dueño activo.',
});
export const ADMIN_CANNOT_MANAGE_OWNER = domainError({
  code: 'NC-TEN-006',
  rule: 'RN-A04',
  message: 'Un administrador no gestiona a los dueños.',
});

/**
 * RN-A04: solo un OWNER da o quita el rol OWNER; nadie sube su propio rol; un ADMIN gestiona a todos menos a los
 * dueños. «Al menos un dueño» se verifica aparte, con el candado de la organización.
 */
export function checkRoleChange(change: {
  actorRole: MemberRole;
  isSelf: boolean;
  currentRole: MemberRole;
  newRole: MemberRole;
}): DomainError | null {
  const { actorRole, isSelf, currentRole, newRole } = change;
  if (isSelf && RANK[newRole] > RANK[currentRole]) return NO_SELF_PROMOTION;
  if ((currentRole === 'OWNER' || newRole === 'OWNER') && actorRole !== 'OWNER')
    return ONLY_OWNER_GRANTS_OWNER;
  return null;
}

/** Suspender, reactivar o quitar: un ADMIN no toca a los dueños. */
export function checkMemberManagement(
  actorRole: MemberRole,
  targetRole: MemberRole,
): DomainError | null {
  return targetRole === 'OWNER' && actorRole !== 'OWNER' ? ADMIN_CANNOT_MANAGE_OWNER : null;
}

/** Invitar: un ADMIN invita administradores y profesionales; a un dueño solo lo invita otro dueño. */
export function checkInvitationRole(
  actorRole: MemberRole,
  invitedRole: MemberRole,
): DomainError | null {
  return invitedRole === 'OWNER' && actorRole !== 'OWNER' ? ONLY_OWNER_GRANTS_OWNER : null;
}

export const QUOTA_EXCEEDED = (resource: 'STAFF' | 'PATIENTS', limit: number): DomainError =>
  domainError({
    code: resource === 'STAFF' ? 'NC-TEN-001' : 'NC-TEN-007',
    rule: 'RN-A03',
    message:
      resource === 'STAFF'
        ? `El plan permite ${String(limit)} profesionales y ya están todos los cupos ocupados.`
        : `El plan permite ${String(limit)} pacientes activos y ya están todos los cupos ocupados.`,
    details: { limit },
  });

export const NO_ACTIVE_SUBSCRIPTION = domainError({
  code: 'NC-TEN-002',
  rule: 'RN-A02',
  message: 'La organización no tiene una suscripción vigente.',
});

/** RN-A03: cabe uno más si lo ocupado más uno no pasa del límite congelado en la suscripción. */
export function checkCapacity(
  resource: 'STAFF' | 'PATIENTS',
  occupied: number,
  limit: number,
): DomainError | null {
  return occupied + 1 > limit ? QUOTA_EXCEEDED(resource, limit) : null;
}

/** Fecha local (YYYY-MM-DD) de un instante en la zona horaria de la organización (RN-J03). */
export function localDate(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Suma días a una fecha local YYYY-MM-DD, sin zonas horarias. */
export function addDays(date: string, days: number): string {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return utc.toISOString().slice(0, 10);
}

/**
 * RN-A02: la suscripción vale hasta ends_on inclusive; la gracia llega hasta ends_on + grace_days; la organización
 * pasa a solo lectura al día siguiente, con la fecha local de la organización.
 */
export function isPastGrace(endsOn: string, graceDays: number, today: string): boolean {
  return today > addDays(endsOn, graceDays);
}

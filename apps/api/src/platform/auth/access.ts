import { SetMetadata } from '@nestjs/common';
import type { MemberRole } from './tenant-directory.port.js';

/**
 * Permisos de los casos de uso de una organización (RN-A04) y los roles que los tienen. Las reglas finas (solo un
 * OWNER da o quita el rol OWNER, nadie sube su propio rol) las aplica el caso de uso.
 */
export const PERMISSIONS = {
  'organization.read': ['OWNER', 'ADMIN', 'PROFESSIONAL'],
  'organization.update': ['OWNER', 'ADMIN'],
  'members.read': ['OWNER', 'ADMIN', 'PROFESSIONAL'],
  'members.manage': ['OWNER', 'ADMIN'],
  'invitations.manage': ['OWNER', 'ADMIN'],
  'subscription.read': ['OWNER', 'ADMIN'],
} as const satisfies Record<string, readonly MemberRole[]>;

export type Permission = keyof typeof PERMISSIONS;

/**
 * Qué exige una ruta. Se niega por defecto: toda ruta declara una de estas reglas con su decorador, y una prueba
 * recorre los controladores y falla si alguna no lo hace.
 */
export type AccessRule =
  | { readonly kind: 'public' }
  | { readonly kind: 'account' }
  | { readonly kind: 'platform' }
  | { readonly kind: 'tenant'; readonly permission: Permission };

export const ACCESS_RULE = 'nutricoach:access-rule';
export const ALLOWED_WHEN_READ_ONLY = 'nutricoach:allowed-when-read-only';

/** Sin sesión: entrar, recuperar la contraseña, aceptar una invitación, la salud. */
export const Public = () => SetMetadata(ACCESS_RULE, { kind: 'public' } satisfies AccessRule);

/** Cualquier sesión válida, sin organización: la propia cuenta y sus sesiones. */
export const Authenticated = () =>
  SetMetadata(ACCESS_RULE, { kind: 'account' } satisfies AccessRule);

/** Solo sesiones PLATFORM (panel interno). Las de STAFF se rechazan. */
export const PlatformOnly = () =>
  SetMetadata(ACCESS_RULE, { kind: 'platform' } satisfies AccessRule);

/** Sesión STAFF con organización activa, membresía vigente y el permiso. */
export const RequirePermission = (permission: Permission) =>
  SetMetadata(ACCESS_RULE, { kind: 'tenant', permission } satisfies AccessRule);

/**
 * Escritura permitida aunque la organización esté en solo lectura (RN-A02): exportar, cerrar sesión, cambiar la
 * propia contraseña y cambiar de organización. Se decide por caso de uso, no por método HTTP.
 */
export const AllowedWhenReadOnly = () => SetMetadata(ALLOWED_WHEN_READ_ONLY, true);

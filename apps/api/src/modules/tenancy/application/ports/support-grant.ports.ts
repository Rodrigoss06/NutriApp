import type { OrganizationId } from '@nutricoach/shared-kernel';
import type { SupportGrantRecord, SupportScope } from '../../domain/support-grant.js';
import type { OrganizationStatus } from './tenancy.ports.js';

export interface SupportStaffMember {
  readonly userId: string;
  readonly displayName: string;
}

/** Un permiso vigente visto por el soporte, con su organización. */
export interface SupportGrantWithOrganization extends SupportGrantRecord {
  readonly organizationName: string;
  readonly organizationStatus: OrganizationStatus;
}

/** tenancy.support_access_grant (RN-A09, ADR-129). La RLS deja al dueño los de su organización y al soporte, los suyos. */
export interface SupportGrantStore {
  /** Las personas de soporte de la plataforma, solo con su nombre (app.platform_support_directory, solo para el dueño). */
  supportStaff(): Promise<readonly SupportStaffMember[]>;
  insert(grant: SupportGrantRecord): Promise<void>;
  find(grantId: string): Promise<SupportGrantRecord | null>;
  /** Los vigentes en `now` de esa persona y ese alcance, en la organización del contexto. */
  activeFor(
    supportUserId: string,
    scope: SupportScope,
    now: Date,
  ): Promise<readonly SupportGrantRecord[]>;
  /** false si ya estaba revocado. */
  revoke(grantId: string, at: Date): Promise<boolean>;
  /** Los de la organización del contexto vigentes en `now` o creados desde `since`, del más nuevo al más viejo. */
  list(since: Date, now: Date): Promise<readonly SupportGrantRecord[]>;
  /** Los vigentes en `now` de una persona de soporte, en una organización o en todas. */
  activeOfSupport(
    supportUserId: string,
    organizationId: OrganizationId | null,
    now: Date,
  ): Promise<readonly SupportGrantWithOrganization[]>;
}

export const SUPPORT_GRANT_STORE = Symbol.for('nutricoach.tenancy.SupportGrantStore');

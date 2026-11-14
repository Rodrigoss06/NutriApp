// API pública de tenancy (02 §2). Otros contextos solo importan esto.
export {
  checkInvitationRole,
  NO_ACTIVE_SUBSCRIPTION,
  QUOTA_EXCEEDED,
  type MemberRole,
  type Profession,
} from './domain/tenancy-rules.js';
export { PlatformTenancy } from './application/platform-tenancy.js';
export { SupportGrantQueries } from './application/queries/support-grant.queries.js';
export {
  ACTIVE_PATIENT_COUNTER,
  MEMBER_PROFILES,
  PENDING_STAFF_INVITATIONS,
  type ActivePatientCounter,
  type MemberProfiles,
  type PendingStaffInvitations,
} from './application/ports/tenancy.ports.js';
export {
  ALREADY_MEMBER,
  ORGANIZATION_NOT_FOUND,
  PLAN_CODE_TAKEN,
  PLAN_NOT_FOUND,
  PLAN_UNKNOWN,
  SLUG_TAKEN,
} from './application/tenancy-errors.js';
export { TenancyApi, type SheetBranding } from './application/tenancy-api.js';
export type {
  BrandingRecord,
  OrganizationUsage,
  PlanChanges,
  PlanRecord,
} from './application/ports/tenancy.ports.js';
export { TenancyModule } from './tenancy.module.js';

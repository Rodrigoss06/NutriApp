// API pública de tenancy (02 §2). Otros contextos solo importan esto.
export {
  checkInvitationRole,
  NO_ACTIVE_SUBSCRIPTION,
  QUOTA_EXCEEDED,
  type MemberRole,
  type Profession,
} from './domain/tenancy-rules.js';
export { PlatformTenancy } from './application/platform-tenancy.js';
export {
  MEMBER_PROFILES,
  PENDING_STAFF_INVITATIONS,
  type MemberProfiles,
  type PendingStaffInvitations,
} from './application/ports/tenancy.ports.js';
export {
  ALREADY_MEMBER,
  ORGANIZATION_NOT_FOUND,
  PLAN_NOT_FOUND,
  SLUG_TAKEN,
} from './application/tenancy-errors.js';
export { TenancyApi } from './application/tenancy-api.js';
export { TenancyModule } from './tenancy.module.js';

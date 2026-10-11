// API pública de iam (02 §2).
export {
  ACCOUNT_EXISTS_FOR_PATIENT,
  EMAIL_HAS_PENDING_INVITATION,
} from './application/commands/patient-invitation.handlers.js';
export { IamApi } from './application/iam-api.js';
export {
  PATIENT_ENROLLMENT,
  type ConsentText,
  type PatientAccessPurpose,
  type PatientEnrollment,
  type PatientInvitationPreview,
} from './application/ports/iam.ports.js';
export { IamModule } from './iam.module.js';

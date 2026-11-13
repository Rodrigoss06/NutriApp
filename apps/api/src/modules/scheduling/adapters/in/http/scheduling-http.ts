import type { DomainError, SecurityContext } from '@nutricoach/shared-kernel';
import {
  problemFromDomainError,
  ProblemException,
  type ContextualRequest,
} from '../../../../../platform/index.js';
import {
  PATIENT_ARCHIVED,
  PATIENT_NOT_FOUND,
  WRITE_ACCESS_REQUIRED,
} from '../../../../clinical/index.js';
import {
  AGENDA_MEMBER_NOT_FOUND,
  AGENDA_NOT_YOURS,
  APPOINTMENT_CLOSED,
  APPOINTMENT_NOT_FOUND,
  APPOINTMENT_OVERLAP,
  APPOINTMENT_TRANSITION_INVALID,
  APPOINTMENT_VERSION_CONFLICT,
  APPOINTMENT_WINDOW_INVALID,
  ATTENDANCE_TOO_EARLY,
} from '../../../domain/appointment.js';
import { AVAILABILITY_OVERLAP } from '../../../domain/availability.js';

const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  [PATIENT_NOT_FOUND.code]: 404,
  [PATIENT_ARCHIVED.code]: 409,
  [WRITE_ACCESS_REQUIRED.code]: 403,
  [APPOINTMENT_NOT_FOUND.code]: 404,
  [APPOINTMENT_OVERLAP.code]: 422,
  [APPOINTMENT_WINDOW_INVALID.code]: 422,
  [APPOINTMENT_TRANSITION_INVALID.code]: 409,
  [AGENDA_NOT_YOURS.code]: 403,
  [AGENDA_MEMBER_NOT_FOUND.code]: 422,
  [APPOINTMENT_CLOSED.code]: 409,
  [ATTENDANCE_TOO_EARLY.code]: 409,
  [APPOINTMENT_VERSION_CONFLICT.code]: 409,
  [AVAILABILITY_OVERLAP.code]: 422,
};

export const problem = (error: DomainError) =>
  problemFromDomainError(error, STATUS_BY_CODE[error.code] ?? 422);

/** El contexto de la organización activa que fijó TenantGuard, o el del paciente que fijó SessionGuard. */
export const contextOf = (request: ContextualRequest): SecurityContext => {
  if (!request.securityContext?.organizationId) {
    throw new ProblemException(403, {
      title: 'Elige con qué organización trabajas.',
      code: 'NC-TEN-011',
    });
  }
  return request.securityContext;
};

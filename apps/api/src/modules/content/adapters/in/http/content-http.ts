import type { AppSettings, MotivationalMessage } from '@nutricoach/contracts';
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
  MESSAGE_NOT_FOUND,
  type AppSettingsView,
  type MessageRecord,
} from '../../../domain/app-content.js';
import {
  RESOURCE_ARCHIVED,
  RESOURCE_FIELD_MISMATCH,
  RESOURCE_FILE_UNSUPPORTED,
  RESOURCE_NOT_FOUND,
} from '../../../domain/resources.js';

const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  [PATIENT_NOT_FOUND.code]: 404,
  [MESSAGE_NOT_FOUND.code]: 404,
  [PATIENT_ARCHIVED.code]: 409,
  [WRITE_ACCESS_REQUIRED.code]: 403,
  [RESOURCE_NOT_FOUND.code]: 404,
  [RESOURCE_ARCHIVED.code]: 409,
  [RESOURCE_FILE_UNSUPPORTED.code]: 415,
  [RESOURCE_FIELD_MISMATCH.code]: 422,
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

export const settingsOf = (view: AppSettingsView): AppSettings => ({
  themeColor: view.themeColor,
  welcomeMessage: view.welcomeMessage,
  enabledSections: [...view.enabledSections],
  allowWeightLog: view.allowWeightLog,
  updatedAt: view.updatedAt?.toISOString() ?? null,
});

export const messageOf = (message: MessageRecord): MotivationalMessage => ({
  id: message.id,
  patientId: message.patientId,
  body: message.body,
  activeFrom: message.activeFrom,
  activeTo: message.activeTo,
  createdAt: message.createdAt.toISOString(),
});

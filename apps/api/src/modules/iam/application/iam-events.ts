import {
  createDomainEvent,
  type DomainEvent,
  type DomainEventContext,
  type Id,
  type OrganizationId,
} from '@nutricoach/shared-kernel';

/** Pedido de recuperación: el worker busca el correo y lo envía (ADR-032). El token va cifrado. */
export interface ResetRequestedPayload {
  readonly resetId: string;
  readonly encryptedToken: string;
  /** Bienvenida de un administrador de plataforma nuevo: otro texto y 24 horas. */
  readonly welcome?: boolean;
}

export interface PasswordChangedPayload {
  readonly reason: 'CHANGED' | 'RESET';
}

/** Datos asociados del cifrado del token: atan el cifrado a su pedido. */
export const resetTokenAad = (resetId: string): string => `iam.reset:${resetId}`;

export function resetRequested(
  resetId: Id<'PasswordResetId'>,
  encryptedToken: string,
  context: DomainEventContext,
  welcome = false,
): DomainEvent<'iam.reset.requested', ResetRequestedPayload> {
  return createDomainEvent(
    {
      type: 'iam.reset.requested',
      version: 1,
      organizationId: null,
      aggregateId: resetId,
      payload: welcome ? { resetId, encryptedToken, welcome } : { resetId, encryptedToken },
    },
    context,
  );
}

export function passwordChanged(
  userId: string,
  reason: PasswordChangedPayload['reason'],
  context: DomainEventContext,
): DomainEvent<'iam.password.changed', PasswordChangedPayload> {
  return createDomainEvent(
    {
      type: 'iam.password.changed',
      version: 1,
      organizationId: null,
      aggregateId: userId,
      payload: { reason },
    },
    context,
  );
}

/** Invitación creada: el worker envía el enlace con el token cifrado (ADR-032). */
export interface InvitationCreatedPayload {
  readonly invitationId: string;
  readonly role: string;
  readonly encryptedToken: string;
}

export interface InvitationAcceptedPayload {
  readonly invitationId: string;
  readonly userId: string;
  readonly role: string;
}

export const invitationTokenAad = (invitationId: string): string =>
  `iam.invitation:${invitationId}`;

export function invitationCreated(
  organizationId: OrganizationId,
  payload: InvitationCreatedPayload,
  context: DomainEventContext,
): DomainEvent<'iam.invitation.created', InvitationCreatedPayload> {
  return createDomainEvent(
    {
      type: 'iam.invitation.created',
      version: 1,
      organizationId,
      aggregateId: payload.invitationId,
      payload,
    },
    context,
  );
}

export function invitationAccepted(
  organizationId: OrganizationId,
  payload: InvitationAcceptedPayload,
  context: DomainEventContext,
): DomainEvent<'iam.invitation.accepted', InvitationAcceptedPayload> {
  return createDomainEvent(
    {
      type: 'iam.invitation.accepted',
      version: 1,
      organizationId,
      aggregateId: payload.invitationId,
      payload,
    },
    context,
  );
}

export function invitationRevoked(
  organizationId: OrganizationId,
  invitationId: string,
  context: DomainEventContext,
): DomainEvent<'iam.invitation.revoked', Record<string, never>> {
  return createDomainEvent(
    {
      type: 'iam.invitation.revoked',
      version: 1,
      organizationId,
      aggregateId: invitationId,
      payload: {},
    },
    context,
  );
}

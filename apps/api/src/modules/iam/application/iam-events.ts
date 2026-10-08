import {
  createDomainEvent,
  type DomainEvent,
  type DomainEventContext,
  type Id,
} from '@nutricoach/shared-kernel';

/** Pedido de recuperación: el worker busca el correo y lo envía (ADR-032). El token va cifrado. */
export interface ResetRequestedPayload {
  readonly resetId: string;
  readonly encryptedToken: string;
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
): DomainEvent<'iam.reset.requested', ResetRequestedPayload> {
  return createDomainEvent(
    {
      type: 'iam.reset.requested',
      version: 1,
      organizationId: null,
      aggregateId: resetId,
      payload: { resetId, encryptedToken },
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

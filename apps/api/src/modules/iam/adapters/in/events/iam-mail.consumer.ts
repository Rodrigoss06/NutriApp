import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  CLOCK,
  ENCRYPTION_PORT,
  type Clock,
  type EncryptionPort,
  type UserId,
} from '@nutricoach/shared-kernel';
import {
  ConsumerRegistry,
  loadEnv,
  MAILER,
  type EventConsumer,
  type MailerPort,
  type OutboxEnvelope,
} from '../../../../../platform/index.js';
import { TenancyApi } from '../../../../tenancy/index.js';
import {
  invitationTokenAad,
  resetTokenAad,
  type InvitationCreatedPayload,
  type PasswordChangedPayload,
  type ResetRequestedPayload,
} from '../../../application/iam-events.js';
import {
  ACCOUNT_STORE,
  INVITATION_STORE,
  PASSWORD_RESET_STORE,
  type AccountStore,
  type InvitationStore,
  type PasswordResetStore,
} from '../../../application/ports/iam.ports.js';
import {
  invitationMail,
  passwordChangedMail,
  passwordResetMail,
  platformWelcomeMail,
} from './iam-mail.templates.js';

/**
 * Correos de iam desde el worker (01 §1, ADR-032). El evento trae el id y el token cifrado: el correo se busca aquí
 * y el token solo existe en claro dentro del mensaje. Si el pedido ya se usó o venció, no se envía nada. Si el
 * envío falla, la cola reintenta.
 */
@Injectable()
export class IamMailConsumer implements EventConsumer, OnModuleInit {
  readonly name = 'iam.mailer';
  readonly eventTypes = [
    'iam.reset.requested',
    'iam.password.changed',
    'iam.invitation.created',
  ] as const;
  readonly #appUrl = loadEnv().APP_URL;

  constructor(
    private readonly registry: ConsumerRegistry,
    @Inject(MAILER) private readonly mailer: MailerPort,
    @Inject(ENCRYPTION_PORT) private readonly encryption: EncryptionPort,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ACCOUNT_STORE) private readonly accounts: AccountStore,
    @Inject(PASSWORD_RESET_STORE) private readonly resets: PasswordResetStore,
    @Inject(INVITATION_STORE) private readonly invitations: InvitationStore,
    private readonly tenancy: TenancyApi,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async handle(event: OutboxEnvelope): Promise<void> {
    if (event.type === 'iam.invitation.created') {
      await this.#sendInvitation(event.payload as InvitationCreatedPayload);
      return;
    }
    if (event.type === 'iam.reset.requested') {
      const { resetId, encryptedToken, welcome } = event.payload as ResetRequestedPayload;
      const pending = await this.resets.findPendingById(resetId, this.clock.now());
      if (!pending) return;
      const account = await this.accounts.findById(pending.userId);
      if (account?.status !== 'ACTIVE') return;
      const token = this.encryption.decrypt(
        Buffer.from(encryptedToken, 'base64'),
        resetTokenAad(resetId),
      );
      const link = `${this.#appUrl}/recuperar/nueva#${token}`;
      await this.mailer.send(
        welcome
          ? platformWelcomeMail(account.email, account.displayName, link)
          : passwordResetMail(account.email, account.displayName, link),
      );
      return;
    }
    if (event.type === 'iam.password.changed') {
      const account = await this.accounts.findById(event.aggregateId as UserId);
      if (!account) return;
      const { reason } = event.payload as PasswordChangedPayload;
      await this.mailer.send(
        passwordChangedMail(
          account.email,
          account.displayName,
          reason,
          `${this.#appUrl}/recuperar`,
        ),
      );
    }
  }

  /** Con el contexto de la organización del evento: si la invitación ya no está pendiente, no se envía. */
  async #sendInvitation({ invitationId, encryptedToken }: InvitationCreatedPayload): Promise<void> {
    const invitation = await this.invitations.findById(invitationId);
    const now = this.clock.now();
    if (!invitation || invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt <= now)
      return;
    const organization = await this.tenancy.organization(invitation.organizationId);
    if (!organization) return;
    const token = this.encryption.decrypt(
      Buffer.from(encryptedToken, 'base64'),
      invitationTokenAad(invitationId),
    );
    await this.mailer.send(
      invitationMail(
        invitation.email,
        organization.name,
        invitation.role,
        `${this.#appUrl}/invitacion#${token}`,
        invitation.expiresAt,
      ),
    );
  }
}

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
import {
  resetTokenAad,
  type PasswordChangedPayload,
  type ResetRequestedPayload,
} from '../../../application/iam-events.js';
import {
  ACCOUNT_STORE,
  PASSWORD_RESET_STORE,
  type AccountStore,
  type PasswordResetStore,
} from '../../../application/ports/iam.ports.js';
import { passwordChangedMail, passwordResetMail } from './iam-mail.templates.js';

/**
 * Correos de iam desde el worker (01 §1, ADR-032). El evento trae el id y el token cifrado: el correo se busca aquí
 * y el token solo existe en claro dentro del mensaje. Si el pedido ya se usó o venció, no se envía nada. Si el
 * envío falla, la cola reintenta.
 */
@Injectable()
export class IamMailConsumer implements EventConsumer, OnModuleInit {
  readonly name = 'iam.mailer';
  readonly eventTypes = ['iam.reset.requested', 'iam.password.changed'] as const;
  readonly #appUrl = loadEnv().APP_URL;

  constructor(
    private readonly registry: ConsumerRegistry,
    @Inject(MAILER) private readonly mailer: MailerPort,
    @Inject(ENCRYPTION_PORT) private readonly encryption: EncryptionPort,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ACCOUNT_STORE) private readonly accounts: AccountStore,
    @Inject(PASSWORD_RESET_STORE) private readonly resets: PasswordResetStore,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async handle(event: OutboxEnvelope): Promise<void> {
    if (event.type === 'iam.reset.requested') {
      const { resetId, encryptedToken } = event.payload as ResetRequestedPayload;
      const pending = await this.resets.findPendingById(resetId, this.clock.now());
      if (!pending) return;
      const account = await this.accounts.findById(pending.userId);
      if (account?.status !== 'ACTIVE') return;
      const token = this.encryption.decrypt(
        Buffer.from(encryptedToken, 'base64'),
        resetTokenAad(resetId),
      );
      await this.mailer.send(
        passwordResetMail(
          account.email,
          account.displayName,
          `${this.#appUrl}/recuperar/nueva#${token}`,
        ),
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
}

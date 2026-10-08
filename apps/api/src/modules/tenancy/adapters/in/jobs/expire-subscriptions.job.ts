import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { JobRegistry } from '../../../../../platform/index.js';
import { ExpireSubscriptionsHandler } from '../../../application/commands/expire-subscriptions.handler.js';

/** RN-A02 cada hora: la fecha local de cada organización decide cuándo pasa a solo lectura. */
@Injectable()
export class ExpireSubscriptionsJob implements OnModuleInit {
  readonly #logger = new Logger(ExpireSubscriptionsJob.name);

  constructor(
    private readonly registry: JobRegistry,
    private readonly handler: ExpireSubscriptionsHandler,
  ) {}

  onModuleInit(): void {
    this.registry.register({
      queue: 'tenancy.expire-subscriptions',
      cron: '5 * * * *',
      run: async () => {
        const expired = await this.handler.execute();
        this.#logger.log(`Suscripciones vencidas: ${String(expired)}`);
      },
    });
  }
}

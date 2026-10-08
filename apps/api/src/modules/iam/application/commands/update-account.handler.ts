import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  UNIT_OF_WORK,
  type Clock,
  type UnitOfWork,
  type UserId,
} from '@nutricoach/shared-kernel';
import { accountContext } from '../iam-context.js';
import { ACCOUNT_STORE, type AccountStore } from '../ports/iam.ports.js';

/** El nombre visible de la propia cuenta. */
@Injectable()
export class UpdateAccountHandler {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ACCOUNT_STORE) private readonly accounts: AccountStore,
  ) {}

  execute(userId: UserId, displayName: string): Promise<void> {
    return this.uow.run(accountContext(userId), () =>
      this.accounts.setDisplayName(userId, displayName, this.clock.now()),
    );
  }
}

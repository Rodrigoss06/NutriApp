import { Inject, Injectable } from '@nestjs/common';
import {
  err,
  ID_GENERATOR,
  ok,
  UNIT_OF_WORK,
  type DomainError,
  type IdGenerator,
  type OrganizationId,
  type Result,
  type SecurityContext,
  type UnitOfWork,
  type UserId,
} from '@nutricoach/shared-kernel';
import { IamApi } from '../../iam/index.js';
import { PlatformTenancy } from '../../tenancy/index.js';

/** Error que revierte la transacción y vuelve como Result. */
class Rollback extends Error {
  constructor(readonly error: DomainError) {
    super(error.code);
  }
}

/** Contexto PLATFORM_ADMIN de una organización: la RLS de tenancy e iam.invitation lo admiten. */
const platformContext = (
  organizationId: OrganizationId | null,
  userId: UserId,
): SecurityContext => ({
  organizationId,
  userId,
  role: 'PLATFORM_ADMIN',
  patientId: null,
});

/**
 * Panel interno (02 §2, RF-39): orquesta las API públicas de tenancy e iam. Solo PLATFORM_ADMIN. Cada operación es
 * una transacción con el contexto de la organización afectada.
 */
@Injectable()
export class BackofficeCommands {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    private readonly tenancy: PlatformTenancy,
    private readonly iam: IamApi,
  ) {}

  listPlans(actor: UserId) {
    return this.uow.query(platformContext(null, actor), () => this.tenancy.listPlans());
  }

  listOrganizations(actor: UserId) {
    return this.uow.query(platformContext(null, actor), () => this.tenancy.listOrganizations());
  }

  /** Alta: organización, primera suscripción e invitación al dueño, todo o nada. */
  createOrganization(
    actor: UserId,
    input: {
      name: string;
      slug: string;
      timezone: string;
      planCode: string;
      startsOn: string;
      ownerEmail: string;
    },
  ): Promise<Result<{ id: OrganizationId }, DomainError>> {
    const id = this.ids.newId<'OrganizationId'>() as OrganizationId;
    const context = platformContext(id, actor);
    return this.#atomically(context, async () => {
      const created = await this.tenancy.createOrganization(
        { ...input, id, actor },
        this.#metadata(actor),
      );
      if (!created.ok) return created;
      const invited = await this.iam.inviteWithin(context, id, input.ownerEmail, 'OWNER');
      if (!invited.ok) return invited;
      return ok({ id });
    });
  }

  /** Renovar o cambiar de plan (RN-A02): la anterior pasa a REPLACED y la organización vuelve a ACTIVE. */
  changeSubscription(
    actor: UserId,
    organizationId: OrganizationId,
    input: { planCode: string; startsOn: string; reason?: string | null | undefined },
  ): Promise<Result<void, DomainError>> {
    return this.#atomically(platformContext(organizationId, actor), () =>
      this.tenancy.changeSubscription(
        {
          organizationId,
          planCode: input.planCode,
          startsOn: input.startsOn,
          reason: input.reason ?? null,
          actor,
        },
        this.#metadata(actor),
      ),
    );
  }

  setGraceDays(
    actor: UserId,
    organizationId: OrganizationId,
    value: number,
  ): Promise<Result<void, DomainError>> {
    return this.#atomically(platformContext(organizationId, actor), () =>
      this.tenancy.setGraceDays(organizationId, value, actor, this.#metadata(actor)),
    );
  }

  /** La organización tiene que existir y verse con el contexto: si no, 404. */
  async exists(actor: UserId, organizationId: OrganizationId): Promise<boolean> {
    const organizations = await this.listOrganizations(actor);
    return organizations.some((o) => o.id === organizationId);
  }

  async #atomically<T>(
    context: SecurityContext,
    work: () => Promise<Result<T, DomainError>>,
  ): Promise<Result<T, DomainError>> {
    try {
      return await this.uow.run(context, async () => {
        const result = await work();
        if (!result.ok) throw new Rollback(result.error);
        return result;
      });
    } catch (error) {
      if (error instanceof Rollback) return err(error.error);
      throw error;
    }
  }

  #metadata(actor: UserId) {
    return { actorUserId: actor, actorRole: 'PLATFORM_ADMIN' as const };
  }
}

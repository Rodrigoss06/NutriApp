import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  err,
  ID_GENERATOR,
  ok,
  OUTBOX,
  UNIT_OF_WORK,
  type Clock,
  type DomainError,
  type IdGenerator,
  type OrganizationId,
  type Outbox,
  type Result,
  type SecurityContext,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import { atomically, FileRegistry, inspectImage } from '../../../../platform/index.js';
import {
  changedBrandingFields,
  checkLogo,
  EMPTY_BRANDING,
  LOGO_RULES,
  LOGO_UNSUPPORTED,
  type BrandingText,
} from '../../domain/branding.js';
import { tenancyEvent } from '../tenancy-events.js';
import { TENANCY_STORE, type BrandingRow, type TenancyStore } from '../ports/tenancy.ports.js';

/**
 * La marca de las fichas de la organización (RN-H03, P11): el dueño y los administradores la editan; la propia de cada
 * profesional llega en P15. El texto y el logo se guardan por separado, así uno no pisa al otro. Cada escritura toma el
 * candado de la organización: dos primeras marcas a la vez no chocan con la única fila por organización.
 */
@Injectable()
export class BrandingCommands {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(OUTBOX) private readonly outbox: Outbox,
    @Inject(TENANCY_STORE) private readonly store: TenancyStore,
    @Inject(FileRegistry) private readonly files: FileRegistry,
  ) {}

  /** Nombre visible, colores, contacto y pie. Lo que no cambia no se escribe ni se audita. */
  update(context: SecurityContext, text: BrandingText): Promise<Result<void, DomainError>> {
    const organizationId = organizationOf(context);
    return this.uow.run(context, async () => {
      await this.store.lockOrganization(organizationId);
      const current = await this.store.findBranding(organizationId, null);
      const fields = changedBrandingFields(current, text);
      if (fields.length === 0) return ok(undefined);
      await this.#save(context, organizationId, current, { ...text }, fields);
      return ok(undefined);
    });
  }

  /**
   * Reemplaza el logo (ADR-066): la imagen se revisa entera antes de escribirla, y los bytes se escriben antes de la
   * transacción y se descartan si esta falla. El logo anterior queda guardado, sin uso.
   */
  async replaceLogo(
    context: SecurityContext,
    content: Uint8Array,
  ): Promise<Result<void, DomainError>> {
    const organizationId = organizationOf(context);
    const error = checkLogo(inspectImage(content, LOGO_RULES.maxSidePx), content.byteLength);
    if (error) return err(error);
    const file = await this.files.write(organizationId, content);
    if (file?.mimeType !== 'image/png' && file?.mimeType !== 'image/jpeg') {
      if (file) await this.files.discard(file.key);
      return err(LOGO_UNSUPPORTED);
    }
    try {
      const result = await atomically(this.uow, context, async () => {
        await this.store.lockOrganization(organizationId);
        const current = await this.store.findBranding(organizationId, null);
        await this.files.register({
          ...file,
          sizeBytes: content.byteLength,
          organizationId,
          purpose: 'BRANDING_LOGO',
          uploadedBy: context.userId,
        });
        await this.#save(context, organizationId, current, { logoFileId: file.id }, ['logo']);
        return ok(undefined);
      });
      if (!result.ok) await this.files.discard(file.key);
      return result;
    } catch (failure) {
      await this.files.discard(file.key);
      throw failure;
    }
  }

  /** Quita el logo: las fichas siguientes van solo con el nombre. Sin logo, no hay nada que hacer. */
  removeLogo(context: SecurityContext): Promise<Result<void, DomainError>> {
    const organizationId = organizationOf(context);
    return this.uow.run(context, async () => {
      await this.store.lockOrganization(organizationId);
      const current = await this.store.findBranding(organizationId, null);
      if (!current?.logoFileId) return ok(undefined);
      await this.#save(context, organizationId, current, { logoFileId: null }, ['logo']);
      return ok(undefined);
    });
  }

  /** Guarda la marca de la organización con los cambios y emite tenancy.branding.changed con los campos. */
  async #save(
    context: SecurityContext,
    organizationId: OrganizationId,
    current: BrandingRow | null,
    changes: Partial<Pick<BrandingRow, keyof BrandingText | 'logoFileId'>>,
    fields: readonly string[],
  ): Promise<void> {
    const branding: BrandingRow = {
      ...EMPTY_BRANDING,
      logoFileId: null,
      ...current,
      ...changes,
      id: current?.id ?? this.ids.newId<'BrandingId'>(),
      organizationId,
      memberId: null,
      updatedAt: this.clock.now(),
    };
    await this.store.saveBranding(branding);
    await this.outbox.append(
      [
        tenancyEvent(
          'tenancy.branding.changed',
          organizationId,
          branding.id,
          { memberId: null, fields },
          { clock: this.clock, ids: this.ids },
        ),
      ],
      { actorUserId: context.userId, actorRole: context.role },
    );
  }
}

function organizationOf(context: SecurityContext): OrganizationId {
  if (!context.organizationId)
    throw new Error('Caso de uso de organización sin organización activa.');
  return context.organizationId;
}

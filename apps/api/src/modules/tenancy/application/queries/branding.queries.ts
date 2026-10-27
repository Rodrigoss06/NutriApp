import { Inject, Injectable } from '@nestjs/common';
import {
  UNIT_OF_WORK,
  type OrganizationId,
  type SecurityContext,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import { FileRegistry } from '../../../../platform/index.js';
import { TENANCY_STORE, type BrandingRow, type TenancyStore } from '../ports/tenancy.ports.js';

/** La marca de las fichas de la organización activa, para su configuración (RN-H03). */
@Injectable()
export class BrandingQueries {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(TENANCY_STORE) private readonly store: TenancyStore,
    @Inject(FileRegistry) private readonly files: FileRegistry,
  ) {}

  /** null si nadie la fijó: las fichas van con el nombre de la organización y la paleta provisional. */
  organizationBranding(context: SecurityContext): Promise<BrandingRow | null> {
    return this.uow.query(context, () => this.store.findBranding(organizationOf(context), null));
  }

  /** El logo vigente, para verlo en la configuración. No es un dato personal: no se audita (ADR-066). */
  organizationLogo(
    context: SecurityContext,
  ): Promise<{ content: Buffer; mimeType: string } | null> {
    return this.uow.query(context, async () => {
      const branding = await this.store.findBranding(organizationOf(context), null);
      return branding?.logoFileId ? this.files.read(branding.logoFileId) : null;
    });
  }
}

function organizationOf(context: SecurityContext): OrganizationId {
  if (!context.organizationId) throw new Error('Consulta de organización sin organización activa.');
  return context.organizationId;
}

import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { OrganizationId } from '@nutricoach/shared-kernel';
import type { Db } from '../database/prisma.provider.js';

/** Lo que se importa de una cuenta del sistema anterior (RF-40). */
export type ImportedEntity = 'PATIENT' | 'EVALUATION' | 'PLAN';

/**
 * De dónde viene una fila importada: la cuenta del nutricionista (su miembro), el id de la fila en la plantilla y el lote que la
 * trae. Los casos de uso de importación de cada contexto la reciben y la guardan con lo que crean (RN-I05, ADR-135).
 */
export interface ImportOrigin {
  readonly accountMemberId: string;
  readonly externalId: string;
  readonly batchId: string;
}

/**
 * platform.import_record con la transacción de la UnitOfWork: lo que ya entró de cada cuenta, para que reimportar no duplique. Se
 * lee y se escribe en la misma transacción que crea la fila importada; solo se agrega.
 */
@Injectable()
export class ImportRecordStore {
  constructor(@Inject(TransactionHost) private readonly db: Db) {}

  /** El id creado con esa fila de la cuenta, si ya entró. */
  async find(
    organizationId: OrganizationId,
    entity: ImportedEntity,
    origin: Pick<ImportOrigin, 'accountMemberId' | 'externalId'>,
  ): Promise<string | null> {
    const row = await this.db.tx.importRecord.findUnique({
      where: {
        organizationId_accountMemberId_entity_externalId: {
          organizationId,
          accountMemberId: origin.accountMemberId,
          entity,
          externalId: origin.externalId,
        },
      },
      select: { entityId: true },
    });
    return row?.entityId ?? null;
  }

  async insert(
    organizationId: OrganizationId,
    entity: ImportedEntity,
    origin: ImportOrigin,
    entityId: string,
  ): Promise<void> {
    await this.db.tx.importRecord.createMany({
      data: [
        {
          organizationId,
          accountMemberId: origin.accountMemberId,
          entity,
          externalId: origin.externalId,
          entityId,
          batchId: origin.batchId,
        },
      ],
    });
  }

  /** Lo que ya entró de la cuenta, por tipo: id de origen → id creado. Para los conteos del informe. */
  async list(
    organizationId: OrganizationId,
    accountMemberId: string,
    entity: ImportedEntity,
  ): Promise<ReadonlyMap<string, string>> {
    const rows = await this.db.tx.importRecord.findMany({
      where: { organizationId, accountMemberId, entity },
      select: { externalId: true, entityId: true },
    });
    return new Map(rows.map((row) => [row.externalId, row.entityId]));
  }
}

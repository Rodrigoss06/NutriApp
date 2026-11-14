import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import {
  FEATURE_FLAG_DEFAULTS,
  FEATURE_FLAGS,
  type FeatureFlag,
  type Features,
} from '@nutricoach/contracts';
import type { Db } from '../database/prisma.provider.js';

export interface EffectiveFlag {
  readonly key: FeatureFlag;
  readonly enabled: boolean;
  /** ORGANIZATION si el panel interno la fijó para la organización; DEFAULT si vale la global o la de fábrica. */
  readonly source: 'ORGANIZATION' | 'DEFAULT';
}

/**
 * Banderas de funcionalidad por organización (RF-39, ADR-127), en la transacción de la UnitOfWork: la fila de la organización manda
 * sobre la global y la global sobre el valor de fábrica del catálogo. platform.feature_flag no tiene clave primaria (Prisma la
 * ignora): se lee y se escribe con SQL.
 */
@Injectable()
export class FeatureFlags {
  constructor(@Inject(TransactionHost) private readonly db: Db) {}

  async effective(organizationId: string): Promise<readonly EffectiveFlag[]> {
    const rows = await this.db.tx.$queryRaw<
      { key: string; organization_id: string | null; enabled: boolean }[]
    >`
      SELECT key, organization_id, enabled FROM platform.feature_flag
      WHERE key = ANY(${[...FEATURE_FLAGS]}::text[])
        AND (organization_id = ${organizationId}::uuid OR organization_id IS NULL)`;
    return FEATURE_FLAGS.map((key) => {
      const own = rows.find((row) => row.key === key && row.organization_id === organizationId);
      const global = rows.find((row) => row.key === key && row.organization_id === null);
      return {
        key,
        enabled: own?.enabled ?? global?.enabled ?? FEATURE_FLAG_DEFAULTS[key],
        source: own ? 'ORGANIZATION' : 'DEFAULT',
      };
    });
  }

  async features(organizationId: string): Promise<Features> {
    const flags = await this.effective(organizationId);
    return Object.fromEntries(flags.map((flag) => [flag.key, flag.enabled])) as Features;
  }

  async isEnabled(organizationId: string, key: FeatureFlag): Promise<boolean> {
    return (await this.features(organizationId))[key];
  }

  /** Solo el panel interno (PLATFORM_ADMIN) o SYSTEM: la RLS rechaza a cualquier otro rol. */
  async set(
    organizationId: string,
    key: FeatureFlag,
    enabled: boolean,
    updatedBy: string,
  ): Promise<void> {
    await this.db.tx.$executeRaw`
      INSERT INTO platform.feature_flag (key, organization_id, enabled, updated_by, updated_at)
      VALUES (${key}, ${organizationId}::uuid, ${enabled}, ${updatedBy}::uuid, now())
      ON CONFLICT (key, organization_id)
      DO UPDATE SET enabled = EXCLUDED.enabled, updated_by = EXCLUDED.updated_by, updated_at = now()`;
  }
}

import { Module } from '@nestjs/common';
import { ClinicalModule } from '../modules/clinical/index.js';
import { IamModule } from '../modules/iam/index.js';
import { MigrationModule } from '../modules/migration/index.js';
import { TenancyModule } from '../modules/tenancy/index.js';
import { PlatformModule } from '../platform/index.js';

/**
 * Raíz de la CLI de la migración de cuentas (RF-40, ADR-135): los contextos que importan (clinical, assessment y nutrition) con lo
 * que necesitan, sin HTTP ni colas. Los eventos quedan en el outbox y el worker los procesa: el cálculo de las evaluaciones, la
 * auditoría y la analítica.
 */
@Module({
  imports: [PlatformModule, TenancyModule, IamModule, ClinicalModule, MigrationModule],
})
export class AccountCliModule {}

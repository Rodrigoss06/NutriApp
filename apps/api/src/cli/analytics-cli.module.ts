import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../modules/analytics/index.js';
import { ClinicalModule } from '../modules/clinical/index.js';
import { IamModule } from '../modules/iam/index.js';
import { TenancyModule } from '../modules/tenancy/index.js';
import { PlatformModule } from '../platform/index.js';

/**
 * Raíz de la CLI de la analítica: los mismos contextos que el worker, sin sus colas. Reconstruir lee tracking, nutrition y clinical
 * y escribe los read models de analytics (05.3).
 */
@Module({
  imports: [PlatformModule, TenancyModule, IamModule, ClinicalModule, AnalyticsModule],
})
export class AnalyticsCliModule {}

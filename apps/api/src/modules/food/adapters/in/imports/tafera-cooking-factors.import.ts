import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ImportRegistry } from '../../../../../platform/index.js';
import { SaveCookingFactorsHandler } from '../../../application/commands/save-cooking-factors.handler.js';
import type { CatalogCookingFactor } from '../../../domain/catalog-measure.js';
import { parseTaferaFactorRow, TAFERA_FACTOR_COLUMNS } from '../../../domain/tafera.js';

/**
 * TAFERA_COOKING_FACTORS: seeds/food/tafera-2016-factores.csv, los factores de conversión de peso cocido a crudo de la
 * TAFERA 2016 enlazados con alimentos crudos de la TPCA 2017, que se carga antes (RF-38, ADR-053).
 */
@Injectable()
export class TaferaCookingFactorsImport implements OnModuleInit {
  constructor(
    private readonly registry: ImportRegistry,
    private readonly saveFactors: SaveCookingFactorsHandler,
  ) {}

  onModuleInit(): void {
    this.registry.register<CatalogCookingFactor>({
      kind: 'TAFERA_COOKING_FACTORS',
      columns: TAFERA_FACTOR_COLUMNS,
      parse: parseTaferaFactorRow,
      key: (factor) => factor.code,
      save: (factors) => this.saveFactors.execute('TAFERA_2016', 'TPCA_2017', factors),
    });
  }
}

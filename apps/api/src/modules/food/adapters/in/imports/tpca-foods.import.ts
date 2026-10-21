import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ImportRegistry } from '../../../../../platform/index.js';
import { SaveSourceFoodsHandler } from '../../../application/commands/save-source-foods.handler.js';
import type { CatalogFood } from '../../../domain/catalog-food.js';
import { parseTpcaRow, TPCA_COLUMNS } from '../../../domain/tpca-food.js';

/** TPCA_FOODS: seeds/food/tpca-2017.csv, los 928 alimentos de la TPCA 2017 sin el grupo S (RF-38, ADR-052). */
@Injectable()
export class TpcaFoodsImport implements OnModuleInit {
  constructor(
    private readonly registry: ImportRegistry,
    private readonly saveFoods: SaveSourceFoodsHandler,
  ) {}

  onModuleInit(): void {
    this.registry.register<CatalogFood>({
      kind: 'TPCA_FOODS',
      columns: TPCA_COLUMNS,
      parse: parseTpcaRow,
      key: (food) => food.code,
      save: (foods) => this.saveFoods.execute('TPCA_2017', foods),
    });
  }
}

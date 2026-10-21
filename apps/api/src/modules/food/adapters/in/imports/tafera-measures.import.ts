import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ImportRegistry } from '../../../../../platform/index.js';
import { SaveSourceMeasuresHandler } from '../../../application/commands/save-source-measures.handler.js';
import type { CatalogMeasure } from '../../../domain/catalog-measure.js';
import { parseTaferaMeasureRow, TAFERA_MEASURE_COLUMNS } from '../../../domain/tafera.js';

/**
 * TAFERA_MEASURES: seeds/food/tafera-2016-medidas.csv, las medidas caseras de la TAFERA 2016 enlazadas con alimentos de
 * la TPCA 2017, que se carga antes (RF-38, ADR-053).
 */
@Injectable()
export class TaferaMeasuresImport implements OnModuleInit {
  constructor(
    private readonly registry: ImportRegistry,
    private readonly saveMeasures: SaveSourceMeasuresHandler,
  ) {}

  onModuleInit(): void {
    this.registry.register<CatalogMeasure>({
      kind: 'TAFERA_MEASURES',
      columns: TAFERA_MEASURE_COLUMNS,
      parse: parseTaferaMeasureRow,
      key: (measure) => measure.code,
      save: (measures) => this.saveMeasures.execute('TAFERA_2016', 'TPCA_2017', measures),
    });
  }
}

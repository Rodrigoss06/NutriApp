import { Module } from '@nestjs/common';
import { TaferaCookingFactorsImport } from './adapters/in/imports/tafera-cooking-factors.import.js';
import { TaferaMeasuresImport } from './adapters/in/imports/tafera-measures.import.js';
import { TpcaFoodsImport } from './adapters/in/imports/tpca-foods.import.js';
import { PrismaFoodCatalogStore } from './adapters/out/persistence/prisma-food-catalog.store.js';
import { SaveCookingFactorsHandler } from './application/commands/save-cooking-factors.handler.js';
import { SaveSourceFoodsHandler } from './application/commands/save-source-foods.handler.js';
import { SaveSourceMeasuresHandler } from './application/commands/save-source-measures.handler.js';
import { FOOD_CATALOG_STORE } from './application/ports/food-catalog.port.js';

/**
 * food (02 §2): por ahora, la carga de la TPCA 2017 y de la TAFERA 2016; la búsqueda y los alimentos propios llegan en
 * el resto de P8.
 */
@Module({
  providers: [
    SaveSourceFoodsHandler,
    SaveSourceMeasuresHandler,
    SaveCookingFactorsHandler,
    TpcaFoodsImport,
    TaferaMeasuresImport,
    TaferaCookingFactorsImport,
    { provide: FOOD_CATALOG_STORE, useClass: PrismaFoodCatalogStore },
  ],
})
export class FoodModule {}

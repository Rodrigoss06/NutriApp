import { Module } from '@nestjs/common';
import { TpcaFoodsImport } from './adapters/in/imports/tpca-foods.import.js';
import { PrismaFoodCatalogStore } from './adapters/out/persistence/prisma-food-catalog.store.js';
import { SaveSourceFoodsHandler } from './application/commands/save-source-foods.handler.js';
import { FOOD_CATALOG_STORE } from './application/ports/food-catalog.port.js';

/** food (02 §2): por ahora, la carga de la TPCA 2017; la búsqueda y los alimentos propios llegan en el resto de P8. */
@Module({
  providers: [
    SaveSourceFoodsHandler,
    TpcaFoodsImport,
    { provide: FOOD_CATALOG_STORE, useClass: PrismaFoodCatalogStore },
  ],
})
export class FoodModule {}

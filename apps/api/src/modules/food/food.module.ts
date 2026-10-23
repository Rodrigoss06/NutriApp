import { Module } from '@nestjs/common';
import { ExchangeListController } from './adapters/in/http/exchange-list.controller.js';
import { FoodController } from './adapters/in/http/food.controller.js';
import { RecipeController } from './adapters/in/http/recipe.controller.js';
import { TaferaCookingFactorsImport } from './adapters/in/imports/tafera-cooking-factors.import.js';
import { TaferaMeasuresImport } from './adapters/in/imports/tafera-measures.import.js';
import { TpcaFoodsImport } from './adapters/in/imports/tpca-foods.import.js';
import { PrismaFoodCatalogStore } from './adapters/out/persistence/prisma-food-catalog.store.js';
import { PrismaFoodStore } from './adapters/out/persistence/prisma-food.store.js';
import { PrismaRecipeStore } from './adapters/out/persistence/prisma-recipe.store.js';
import { OwnFoodCommands } from './application/commands/own-food.commands.js';
import { RecipeCommands } from './application/commands/recipe.commands.js';
import { SaveCookingFactorsHandler } from './application/commands/save-cooking-factors.handler.js';
import { SaveSourceFoodsHandler } from './application/commands/save-source-foods.handler.js';
import { SaveSourceMeasuresHandler } from './application/commands/save-source-measures.handler.js';
import { FoodApi } from './application/food-api.js';
import { FOOD_CATALOG_STORE } from './application/ports/food-catalog.port.js';
import { FOOD_STORE } from './application/ports/food.port.js';
import { RECIPE_STORE } from './application/ports/recipe.port.js';
import { FoodQueries } from './application/queries/food.queries.js';
import { RecipeQueries } from './application/queries/recipe.queries.js';
import { RecipeCalculator } from './application/recipe-calculator.js';

/**
 * food (02 §2): catálogos de alimentos con su carga (TPCA 2017 y TAFERA 2016), búsqueda, alimentos propios de cada
 * organización, composición de un plato, listas de intercambio y recetario (RF-38, RF-20, RF-21, RN-I01, RN-E11).
 */
@Module({
  controllers: [FoodController, ExchangeListController, RecipeController],
  providers: [
    FoodApi,
    FoodQueries,
    OwnFoodCommands,
    { provide: FOOD_STORE, useClass: PrismaFoodStore },
    RecipeCalculator,
    RecipeCommands,
    RecipeQueries,
    { provide: RECIPE_STORE, useClass: PrismaRecipeStore },
    SaveSourceFoodsHandler,
    SaveSourceMeasuresHandler,
    SaveCookingFactorsHandler,
    TpcaFoodsImport,
    TaferaMeasuresImport,
    TaferaCookingFactorsImport,
    { provide: FOOD_CATALOG_STORE, useClass: PrismaFoodCatalogStore },
  ],
  exports: [FoodApi],
})
export class FoodModule {}

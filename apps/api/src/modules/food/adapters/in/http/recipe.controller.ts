import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import {
  recipeRequestSchema,
  recipeSearchQuerySchema,
  type RecipeCalculation,
  type RecipeDetail,
  type RecipeIngredient,
  type RecipeListResponse,
  type RecipePreviewResponse,
} from '@nutricoach/contracts';
import { isErr, type DomainError, type SecurityContext } from '@nutricoach/shared-kernel';
import {
  AllowedWhenReadOnly,
  parseBody,
  problemFromDomainError,
  ProblemException,
  RequirePermission,
  type ContextualRequest,
} from '../../../../../platform/index.js';
import { RecipeCommands } from '../../../application/commands/recipe.commands.js';
import { RecipeQueries, type RecipeView } from '../../../application/queries/recipe.queries.js';
import {
  FOOD_NOT_FOUND,
  RECIPE_NOT_FOUND,
  RECIPE_VERSION_CONFLICT,
} from '../../../domain/food-errors.js';

const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  [RECIPE_NOT_FOUND.code]: 404,
  [RECIPE_VERSION_CONFLICT.code]: 409,
  // Un ingrediente que la organización no ve: el cuerpo pide algo que no existe para ella.
  [FOOD_NOT_FOUND.code]: 422,
};

const problem = (error: DomainError) =>
  problemFromDomainError(error, STATUS_BY_CODE[error.code] ?? 422);

const contextOf = (request: ContextualRequest): SecurityContext => {
  if (!request.securityContext?.organizationId) {
    throw new ProblemException(403, {
      title: 'Elige con qué organización trabajas.',
      code: 'NC-TEN-011',
    });
  }
  return request.securityContext;
};

const versionOf = (ifMatch: string | undefined): number => {
  const version = Number(ifMatch?.replaceAll('"', ''));
  if (!ifMatch || !Number.isInteger(version)) {
    throw new ProblemException(428, { title: 'Falta la versión en If-Match.', code: 'NC-PLT-428' });
  }
  return version;
};

/** Los ingredientes con su alimento, en su orden: el estado dice si los gramos son crudos o cocidos (RN-E12). */
const ingredientsOf = ({ recipe, foods }: RecipeView): RecipeIngredient[] =>
  recipe.ingredients.map((ingredient) => {
    const food = foods.find((f) => f.id === ingredient.foodId);
    if (!food) throw new Error(`Falta el alimento ${ingredient.foodId} de la receta.`);
    return {
      position: ingredient.position,
      foodId: food.id,
      name: food.name,
      sourceCode: food.sourceCode,
      state: food.state,
      own: food.own,
      grams: ingredient.grams,
      householdText: ingredient.householdText,
    };
  });

/** Los nutrientes por porción en el orden del catálogo; «sin dato» viaja como null (RN-I03). */
const calculationOf = ({ nutrients, catalog }: RecipeView): RecipeCalculation => ({
  methodCode: nutrients.methodCode,
  methodVersion: nutrients.methodVersion,
  engineVersion: nutrients.engineVersion,
  inputsHash: nutrients.inputsHash,
  ingredientCount: nutrients.ingredientCount,
  rawWeightG: nutrients.rawWeightG,
  yieldFactor: nutrients.yieldFactor,
  nutrients: catalog.map(({ code, name, unit, core }) => ({
    code,
    name,
    unit,
    core,
    perServing: nutrients.perServing[code]?.value ?? null,
    knownPerServing: nutrients.perServing[code]?.known ?? 0,
    missingIngredients: nutrients.perServing[code]?.missing ?? nutrients.ingredientCount,
    per100gCooked: nutrients.per100gCooked?.[code] ?? null,
  })),
  issues: nutrients.warnings.map((issue) => ({ ...issue })),
});

/**
 * /api/v1/recipes: el recetario de la organización (RF-21). Los nutrientes por porción los calcula el motor y se
 * guardan como caché que se recalcula al cambiar la receta (RN-E12).
 */
@Controller('recipes')
export class RecipeController {
  constructor(
    private readonly queries: RecipeQueries,
    private readonly commands: RecipeCommands,
  ) {}

  /** GET /api/v1/recipes?q=arroz&status=ACTIVE&limit=20 */
  @Get()
  @RequirePermission('catalog.read')
  async search(
    @Req() request: ContextualRequest,
    @Query() query: unknown,
  ): Promise<RecipeListResponse> {
    const { q, status, limit } = parseBody(recipeSearchQuerySchema, query);
    const recipes = await this.queries.search(contextOf(request), q ?? null, status, limit);
    return {
      recipes: recipes.map((recipe) => ({
        id: recipe.id,
        name: recipe.name,
        servings: recipe.servings,
        status: recipe.status,
        tags: [...recipe.tags],
        ingredientCount: recipe.ingredientCount,
        energyKcalPerServing: recipe.energyKcalPerServing,
      })),
    };
  }

  /** POST /api/v1/recipes/preview: lo que daría la receta, sin guardarla. Solo calcula: vale en solo lectura. */
  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('catalog.read')
  @AllowedWhenReadOnly()
  async preview(
    @Req() request: ContextualRequest,
    @Body() body: unknown,
  ): Promise<RecipePreviewResponse> {
    const result = await this.queries.preview(
      contextOf(request),
      parseBody(recipeRequestSchema, body),
    );
    if (isErr(result)) throw problem(result.error);
    return { ingredients: ingredientsOf(result.value), calculation: calculationOf(result.value) };
  }

  /** GET /api/v1/recipes/:recipeId */
  @Get(':recipeId')
  @RequirePermission('catalog.read')
  async get(
    @Req() request: ContextualRequest,
    @Param('recipeId', ParseUUIDPipe) recipeId: string,
  ): Promise<RecipeDetail> {
    const result = await this.queries.detail(contextOf(request), recipeId);
    if (isErr(result)) throw problem(result.error);
    const view = result.value;
    return {
      id: recipeId,
      name: view.recipe.name,
      servings: view.recipe.servings,
      cookedWeightG: view.recipe.cookedWeightG,
      instructions: view.recipe.instructions,
      tags: [...view.recipe.tags],
      status: view.status,
      ingredients: ingredientsOf(view),
      calculation: calculationOf(view),
      version: view.version,
    };
  }

  /** POST /api/v1/recipes */
  @Post()
  @RequirePermission('catalog.write')
  async create(@Req() request: ContextualRequest, @Body() body: unknown): Promise<RecipeDetail> {
    const result = await this.commands.create(
      contextOf(request),
      parseBody(recipeRequestSchema, body),
    );
    if (isErr(result)) throw problem(result.error);
    return this.get(request, result.value.id);
  }

  /** PUT /api/v1/recipes/:recipeId con If-Match: reemplaza la receta y sus ingredientes. */
  @Put(':recipeId')
  @RequirePermission('catalog.write')
  async update(
    @Req() request: ContextualRequest,
    @Param('recipeId', ParseUUIDPipe) recipeId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: unknown,
  ): Promise<RecipeDetail> {
    const version = versionOf(ifMatch);
    const result = await this.commands.update(
      contextOf(request),
      recipeId,
      version,
      parseBody(recipeRequestSchema, body),
    );
    if (isErr(result)) throw problem(result.error);
    return this.get(request, recipeId);
  }

  /** POST /api/v1/recipes/:recipeId/archive con If-Match: deja de ofrecerse al prescribir. */
  @Post(':recipeId/archive')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('catalog.write')
  async archive(
    @Req() request: ContextualRequest,
    @Param('recipeId', ParseUUIDPipe) recipeId: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<RecipeDetail> {
    const version = versionOf(ifMatch);
    const result = await this.commands.archive(contextOf(request), recipeId, version);
    if (isErr(result)) throw problem(result.error);
    return this.get(request, recipeId);
  }

  /** POST /api/v1/recipes/:recipeId/restore con If-Match: vuelve a ofrecerse. */
  @Post(':recipeId/restore')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('catalog.write')
  async restore(
    @Req() request: ContextualRequest,
    @Param('recipeId', ParseUUIDPipe) recipeId: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<RecipeDetail> {
    const version = versionOf(ifMatch);
    const result = await this.commands.restore(contextOf(request), recipeId, version);
    if (isErr(result)) throw problem(result.error);
    return this.get(request, recipeId);
  }
}

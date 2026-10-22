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
  foodSearchQuerySchema,
  ownFoodRequestSchema,
  plateCompositionRequestSchema,
  type FoodDetail,
  type FoodListResponse,
  type PlateCompositionResponse,
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
import { OwnFoodCommands } from '../../../application/commands/own-food.commands.js';
import type { FoodRecord } from '../../../application/ports/food.port.js';
import { FoodQueries } from '../../../application/queries/food.queries.js';
import {
  FOOD_NOT_FOUND,
  FOOD_VERSION_CONFLICT,
  GLOBAL_FOOD_READ_ONLY,
} from '../../../domain/food-errors.js';

const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  [FOOD_NOT_FOUND.code]: 404,
  [GLOBAL_FOOD_READ_ONLY.code]: 403,
  [FOOD_VERSION_CONFLICT.code]: 409,
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

/** El alimento con sus nutrientes en el orden del catálogo; «sin dato» viaja como null (RN-I03). */
const detailOf = (food: FoodRecord): FoodDetail => ({
  id: food.id,
  name: food.name,
  sourceCode: food.sourceCode,
  sourceFoodCode: food.sourceFoodCode,
  groupName: food.groupName,
  state: food.state,
  own: food.own,
  energyKcalPer100g: food.energyKcalPer100g,
  ediblePortionPct: food.ediblePortionPct,
  tags: [...food.tags],
  source: { ...food.source },
  nutrients: food.nutrients.map((n) => ({
    code: n.nutrientCode,
    name: n.name,
    unit: n.unit,
    valuePer100g: n.valuePer100g,
    flag: n.flag,
    core: n.core,
  })),
  measures: food.measures.map((m) => ({ ...m })),
  cookingFactors: food.cookingFactors.map((c) => ({ ...c })),
  version: food.version,
});

/**
 * /api/v1/foods: el catálogo de alimentos (RF-38, RF-20). Los globales son de solo lectura y cada organización edita
 * los suyos (RN-I01).
 */
@Controller('foods')
export class FoodController {
  constructor(
    private readonly queries: FoodQueries,
    private readonly commands: OwnFoodCommands,
  ) {}

  /** GET /api/v1/foods?q=platano&state=COOKED&limit=20 */
  @Get()
  @RequirePermission('catalog.read')
  async search(
    @Req() request: ContextualRequest,
    @Query() query: unknown,
  ): Promise<FoodListResponse> {
    const { q, state, limit } = parseBody(foodSearchQuerySchema, query);
    const foods = await this.queries.search(contextOf(request), q ?? null, state ?? null, limit);
    return {
      foods: foods.map((food) => ({
        id: food.id,
        name: food.name,
        sourceCode: food.sourceCode,
        sourceFoodCode: food.sourceFoodCode,
        groupName: food.groupName,
        state: food.state,
        own: food.own,
        energyKcalPer100g: food.energyKcalPer100g,
      })),
    };
  }

  /** POST /api/v1/foods/composition: lo que aporta un plato (RN-E16). Solo calcula: vale en solo lectura. */
  @Post('composition')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('catalog.read')
  @AllowedWhenReadOnly()
  async compose(
    @Req() request: ContextualRequest,
    @Body() body: unknown,
  ): Promise<PlateCompositionResponse> {
    const { items } = parseBody(plateCompositionRequestSchema, body);
    const result = await this.queries.compose(contextOf(request), items);
    if (isErr(result)) throw problem(result.error);
    const plate = result.value;
    return {
      ...plate,
      items: plate.items.map((item) => ({ ...item })),
      totals: plate.totals.map((total) => ({ ...total })),
      issues: plate.issues.map((issue) => ({ ...issue })),
    };
  }

  /** GET /api/v1/foods/:foodId */
  @Get(':foodId')
  @RequirePermission('catalog.read')
  async get(
    @Req() request: ContextualRequest,
    @Param('foodId', ParseUUIDPipe) foodId: string,
  ): Promise<FoodDetail> {
    const result = await this.queries.detail(contextOf(request), foodId);
    if (isErr(result)) throw problem(result.error);
    return detailOf(result.value);
  }

  /** POST /api/v1/foods: alimento propio de la organización. */
  @Post()
  @RequirePermission('catalog.write')
  async create(@Req() request: ContextualRequest, @Body() body: unknown): Promise<FoodDetail> {
    const result = await this.commands.create(
      contextOf(request),
      parseBody(ownFoodRequestSchema, body),
    );
    if (isErr(result)) throw problem(result.error);
    return this.get(request, result.value.id);
  }

  /** PUT /api/v1/foods/:foodId con If-Match: reemplaza el alimento propio y sus medidas. */
  @Put(':foodId')
  @RequirePermission('catalog.write')
  async update(
    @Req() request: ContextualRequest,
    @Param('foodId', ParseUUIDPipe) foodId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: unknown,
  ): Promise<FoodDetail> {
    const version = Number(ifMatch?.replaceAll('"', ''));
    if (!ifMatch || !Number.isInteger(version)) {
      throw new ProblemException(428, {
        title: 'Falta la versión en If-Match.',
        code: 'NC-PLT-428',
      });
    }
    const result = await this.commands.update(
      contextOf(request),
      foodId,
      version,
      parseBody(ownFoodRequestSchema, body),
    );
    if (isErr(result)) throw problem(result.error);
    return this.get(request, foodId);
  }
}

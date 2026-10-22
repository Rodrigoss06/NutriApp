import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import {
  createNutritionPlanSchema,
  updateNutritionPlanSchema,
  type NutritionPlan,
  type NutritionPlanListResponse,
  type NutritionPlanPreview,
} from '@nutricoach/contracts';
import { isErr, type DomainError, type SecurityContext } from '@nutricoach/shared-kernel';
import {
  parseBody,
  problemFromDomainError,
  ProblemException,
  RequirePermission,
  type ContextualRequest,
} from '../../../../../platform/index.js';
import {
  PATIENT_ARCHIVED,
  PATIENT_NOT_FOUND,
  WRITE_ACCESS_REQUIRED,
} from '../../../../clinical/index.js';
import { NutritionPlanCommands } from '../../../application/commands/nutrition-plan.commands.js';
import type { PlanDocument } from '../../../application/plan-document.js';
import {
  NutritionPlanQueries,
  type NutritionPlanView,
} from '../../../application/queries/nutrition-plan.queries.js';
import { PRESCRIPTION_NOT_FOUND } from '../../../domain/energy-rules.js';
import {
  DRAFT_EXISTS,
  PLAN_NOT_DRAFT,
  PLAN_NOT_FOUND,
  PLAN_VERSION_CONFLICT,
} from '../../../domain/nutrition-plan.js';

const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  [PLAN_NOT_FOUND.code]: 404,
  [DRAFT_EXISTS]: 409,
  [PRESCRIPTION_NOT_FOUND.code]: 404,
  [PATIENT_NOT_FOUND.code]: 404,
  [PATIENT_ARCHIVED.code]: 409,
  [WRITE_ACCESS_REQUIRED.code]: 403,
  [PLAN_NOT_DRAFT.code]: 409,
  [PLAN_VERSION_CONFLICT.code]: 409,
};

const problem = (error: DomainError) =>
  problemFromDomainError(error, STATUS_BY_CODE[error.code] ?? 422);
const notFound = (code: string) => new ProblemException(404, { title: 'No encontrado.', code });

/** La versión leída, en If-Match (02 §5); sin ella, 428. */
const versionOf = (ifMatch: string | undefined): number => {
  const version = Number(ifMatch?.replaceAll('"', ''));
  if (!ifMatch || !Number.isInteger(version)) {
    throw new ProblemException(428, { title: 'Falta la versión en If-Match.', code: 'NC-PLT-428' });
  }
  return version;
};

const contextOf = (request: ContextualRequest): SecurityContext => {
  if (!request.securityContext?.organizationId) {
    throw new ProblemException(403, {
      title: 'Elige con qué organización trabajas.',
      code: 'NC-TEN-011',
    });
  }
  return request.securityContext;
};

/** Lo que calcula el motor, sin redondear (RN-D09), y cada cálculo con su método (RN-D01, RN-D02). */
function calculationOf(
  document: PlanDocument,
  publishProblems: readonly string[],
): Omit<NutritionPlanPreview, 'meals'> {
  return {
    targets: { ...document.targets },
    exchanges: document.exchanges.map((e) => ({ ...e })),
    manualSplit: [...document.manualSplit],
    totals: { ...document.totals },
    adequacy: {
      rangePct: [document.adequacy.rangePct[0], document.adequacy.rangePct[1]],
      kcal: { ...document.adequacy.kcal },
      cho: { ...document.adequacy.cho },
      protein: { ...document.adequacy.protein },
      fat: { ...document.adequacy.fat },
    },
    methods: document.methods.map((m) => ({
      ...m,
      warnings: m.warnings.map((w) => ({ ...w })),
    })),
    publishProblems: [...publishProblems],
  };
}

/** El plan con lo que calcula el motor. Lo publicado sale tal cual de su snapshot. */
function planOf(view: NutritionPlanView): NutritionPlan {
  const { record, document } = view;
  return {
    ...calculationOf(document, view.publishProblems),
    id: record.id,
    patientId: record.patientId,
    lineageId: record.lineageId,
    versionNo: record.versionNo,
    status: record.status,
    energyPrescriptionId: record.energyPrescriptionId,
    exchangeList: {
      ...document.exchangeList,
      groups: document.exchangeList.groups.map((g) => ({ ...g })),
    },
    meals: document.meals.map((meal) => ({
      id: meal.id,
      slotCode: meal.slotCode,
      name: meal.name,
      timeOfDay: meal.timeOfDay,
      sharePct: meal.sharePct,
      servings: { ...meal.servings },
      allowedFoods: meal.allowedFoods.map((food) => ({
        groupCode: food.groupCode,
        foodId: food.foodId,
        foodName: food.foodName,
        grams: food.grams,
        householdText: food.householdText,
        nutrientsPer100g: { ...food.nutrientsPer100g },
      })),
    })),
    hydrationTargetMl: document.hydrationTargetMl,
    instructions: document.instructions,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    publishedAt: record.publishedAt?.toISOString() ?? null,
    validFrom: record.validFrom,
    version: record.version,
  };
}

/** Planes nutricionales de un paciente (RF-19, RF-23): crear un borrador desde una prescripción y el historial. */
@Controller('patients/:patientId')
export class PatientNutritionPlanController {
  constructor(
    private readonly commands: NutritionPlanCommands,
    private readonly queries: NutritionPlanQueries,
  ) {}

  @Post('nutrition-plans')
  @RequirePermission('patients.write')
  async create(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() body: unknown,
  ): Promise<NutritionPlan> {
    const context = contextOf(request);
    const result = await this.commands.create(
      context,
      patientId,
      parseBody(createNutritionPlanSchema, body),
    );
    if (isErr(result)) throw problem(result.error);
    const view = await this.queries.detail(context, result.value.id);
    if (!view) throw notFound(PLAN_NOT_FOUND.code);
    return planOf(view);
  }

  @Get('nutrition-plans')
  @RequirePermission('patients.read')
  @Header('Cache-Control', 'no-store')
  async list(
    @Req() request: ContextualRequest,
    @Param('patientId', ParseUUIDPipe) patientId: string,
  ): Promise<NutritionPlanListResponse> {
    const plans = await this.queries.list(contextOf(request), patientId);
    if (!plans) throw notFound(PATIENT_NOT_FOUND.code);
    return {
      plans: plans.map((plan) => ({
        id: plan.id,
        lineageId: plan.lineageId,
        versionNo: plan.versionNo,
        status: plan.status,
        exchangeListCode: plan.exchangeListCode,
        exchangeListVersion: plan.exchangeListVersion,
        targetKcal: plan.targetKcal,
        createdAt: plan.createdAt.toISOString(),
        publishedAt: plan.publishedAt?.toISOString() ?? null,
        validFrom: plan.validFrom,
      })),
    };
  }
}

/** Un plan: leerlo y editar su borrador entero con If-Match (02 §5). Publicado no se edita (RN-E15). */
@Controller('nutrition-plans')
export class NutritionPlanController {
  constructor(
    private readonly commands: NutritionPlanCommands,
    private readonly queries: NutritionPlanQueries,
  ) {}

  @Get(':planId')
  @RequirePermission('patients.read')
  @Header('Cache-Control', 'no-store')
  async get(
    @Req() request: ContextualRequest,
    @Param('planId', ParseUUIDPipe) planId: string,
  ): Promise<NutritionPlan> {
    const view = await this.queries.detail(contextOf(request), planId);
    if (!view) throw notFound(PLAN_NOT_FOUND.code);
    return planOf(view);
  }

  /** POST /api/v1/nutrition-plans/:id/preview: el borrador calculado sin guardarlo, para el editor (RN-E10). */
  @Post(':planId/preview')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('patients.read')
  async preview(
    @Req() request: ContextualRequest,
    @Param('planId', ParseUUIDPipe) planId: string,
    @Body() body: unknown,
  ): Promise<NutritionPlanPreview> {
    const input = parseBody(updateNutritionPlanSchema, body);
    const result = await this.queries.preview(contextOf(request), planId, input);
    if (!result) throw notFound(PLAN_NOT_FOUND.code);
    if (isErr(result)) throw problem(result.error);
    const { document, publishProblems } = result.value;
    return {
      ...calculationOf(document, publishProblems),
      meals: document.meals.map((meal) => ({ servings: { ...meal.servings } })),
    };
  }

  /** POST /api/v1/nutrition-plans/:id/publish con If-Match (RF-23, RN-E14, RN-E15). */
  @Post(':planId/publish')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('patients.write')
  async publish(
    @Req() request: ContextualRequest,
    @Param('planId', ParseUUIDPipe) planId: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<NutritionPlan> {
    const result = await this.commands.publish(contextOf(request), planId, versionOf(ifMatch));
    if (isErr(result)) throw problem(result.error);
    return this.get(request, planId);
  }

  /** POST /api/v1/nutrition-plans/:id/revisions: un borrador nuevo con lo mismo que esta versión (02 §7). */
  @Post(':planId/revisions')
  @RequirePermission('patients.write')
  async revise(
    @Req() request: ContextualRequest,
    @Param('planId', ParseUUIDPipe) planId: string,
  ): Promise<NutritionPlan> {
    const result = await this.commands.revise(contextOf(request), planId);
    if (isErr(result)) throw problem(result.error);
    return this.get(request, result.value.id);
  }

  @Put(':planId')
  @RequirePermission('patients.write')
  async update(
    @Req() request: ContextualRequest,
    @Param('planId', ParseUUIDPipe) planId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: unknown,
  ): Promise<NutritionPlan> {
    const context = contextOf(request);
    const result = await this.commands.update(
      context,
      planId,
      versionOf(ifMatch),
      parseBody(updateNutritionPlanSchema, body),
    );
    if (isErr(result)) throw problem(result.error);
    return this.get(request, planId);
  }
}

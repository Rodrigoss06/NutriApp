import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  err,
  ID_GENERATOR,
  ok,
  OUTBOX,
  UNIT_OF_WORK,
  type Clock,
  type DomainError,
  type IdGenerator,
  type OrganizationId,
  type Outbox,
  type Result,
  type SecurityContext,
  type UnitOfWork,
} from '@nutricoach/shared-kernel';
import { atomically } from '../../../../platform/index.js';
import {
  FOOD_NOT_FOUND,
  FOOD_VERSION_CONFLICT,
  GLOBAL_FOOD_READ_ONLY,
} from '../../domain/food-errors.js';
import { ownFood, type OwnFood, type OwnFoodInput } from '../../domain/own-food.js';
import { foodEvent, type FoodEventType } from '../food-events.js';
import { FOOD_STORE, type FoodRecord, type FoodStore } from '../ports/food.port.js';
import { RecipeCalculator } from '../recipe-calculator.js';

/** Los campos que cambian, para la auditoría: nombres, nunca valores (02 §10). */
function changedFields(before: FoodRecord, after: OwnFood): string[] {
  const fields: string[] = [];
  if (before.name !== after.name) fields.push('name_es');
  if (before.state !== after.state) fields.push('state');
  if (before.ediblePortionPct !== after.ediblePortionPct) fields.push('edible_portion_pct');
  const value = (code: string) =>
    before.nutrients.find((n) => n.nutrientCode === code)?.valuePer100g;
  if (after.nutrients.some((n) => value(n.nutrientCode) !== n.valuePer100g))
    fields.push('nutrients');
  const measures = (list: readonly { name: string; grams: number }[]) =>
    JSON.stringify(list.map(({ name, grams }) => [name, grams]));
  if (measures(before.measures) !== measures(after.measures)) fields.push('household_measures');
  return fields;
}

/**
 * Alimentos propios de la organización (RN-I01): se crean y se editan con If-Match; los globales no se tocan. Editar
 * uno recalcula la caché de las recetas que lo usan, en la misma transacción (RN-E12). Cada escritura deja su evento
 * para la auditoría (RN-B03).
 */
@Injectable()
export class OwnFoodCommands {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(OUTBOX) private readonly outbox: Outbox,
    @Inject(FOOD_STORE) private readonly foods: FoodStore,
    @Inject(RecipeCalculator) private readonly recipes: RecipeCalculator,
  ) {}

  create(
    context: SecurityContext,
    input: OwnFoodInput,
  ): Promise<Result<{ id: string }, DomainError>> {
    return atomically(this.uow, context, async () => {
      const food = ownFood(input, await this.foods.nutrients());
      if (!food.ok) return food;
      const organizationId = this.#organization(context);
      const id = this.ids.newId<'FoodId'>();
      await this.foods.insertOwn({
        ...food.value,
        id,
        organizationId,
        code: await this.foods.nextOwnCode(organizationId),
        createdBy: context.userId ?? '',
      });
      await this.#event(context, 'food.food.created', id, []);
      return ok({ id });
    });
  }

  update(
    context: SecurityContext,
    id: string,
    version: number,
    input: OwnFoodInput,
  ): Promise<Result<{ id: string; version: number }, DomainError>> {
    return atomically(this.uow, context, async () => {
      const [existing] = await this.foods.byIds([id]);
      if (!existing) return err(FOOD_NOT_FOUND);
      if (!existing.own) return err(GLOBAL_FOOD_READ_ONLY);
      const food = ownFood(input, await this.foods.nutrients());
      if (!food.ok) return food;
      if (!(await this.foods.updateOwn(id, version, food.value))) return err(FOOD_VERSION_CONFLICT);
      await this.recipes.refreshUsing(id);
      await this.#event(context, 'food.food.updated', id, changedFields(existing, food.value));
      return ok({ id, version: version + 1 });
    });
  }

  #organization(context: SecurityContext): OrganizationId {
    if (!context.organizationId)
      throw new Error('Un alimento propio necesita la organización activa.');
    return context.organizationId;
  }

  async #event(
    context: SecurityContext,
    type: FoodEventType,
    id: string,
    fields: readonly string[],
  ): Promise<void> {
    await this.outbox.append(
      [
        foodEvent(type, this.#organization(context), id, fields.length > 0 ? { fields } : {}, {
          clock: this.clock,
          ids: this.ids,
        }),
      ],
      { actorUserId: context.userId, actorRole: context.role },
    );
  }
}

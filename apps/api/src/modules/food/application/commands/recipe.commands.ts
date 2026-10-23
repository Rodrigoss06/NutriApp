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
import { RECIPE_NOT_FOUND, RECIPE_VERSION_CONFLICT } from '../../domain/food-errors.js';
import {
  recipe,
  recipeChangedFields,
  type RecipeInput,
  type RecipeStatus,
} from '../../domain/recipe.js';
import { foodEvent, type FoodEventType } from '../food-events.js';
import { RECIPE_STORE, type RecipeStore } from '../ports/recipe.port.js';
import { RecipeCalculator } from '../recipe-calculator.js';

/**
 * Recetas de la organización (RF-21): se crean, se editan con If-Match y se archivan en vez de borrarse. Cada vez que
 * cambian sus ingredientes, sus porciones o su peso cocido, la caché de nutrientes por porción se recalcula en la misma
 * transacción (RN-E12). Cada escritura deja su evento para la auditoría (RN-B03).
 */
@Injectable()
export class RecipeCommands {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(OUTBOX) private readonly outbox: Outbox,
    @Inject(RECIPE_STORE) private readonly recipes: RecipeStore,
    @Inject(RecipeCalculator) private readonly calculator: RecipeCalculator,
  ) {}

  create(
    context: SecurityContext,
    input: RecipeInput,
  ): Promise<Result<{ id: string }, DomainError>> {
    return atomically(this.uow, context, async () => {
      const valid = recipe(input);
      if (!valid.ok) return valid;
      const calculation = await this.calculator.calculate(valid.value);
      if (!calculation.ok) return calculation;
      const id = this.ids.newId<'RecipeId'>();
      await this.recipes.insert({
        ...valid.value,
        id,
        organizationId: this.#organization(context),
        createdBy: context.userId ?? '',
        nutrients: calculation.value.nutrients,
      });
      await this.#event(context, 'food.recipe.created', id, []);
      return ok({ id });
    });
  }

  update(
    context: SecurityContext,
    id: string,
    version: number,
    input: RecipeInput,
  ): Promise<Result<{ id: string; version: number }, DomainError>> {
    return atomically(this.uow, context, async () => {
      const [existing] = await this.recipes.byIds([id]);
      if (!existing) return err(RECIPE_NOT_FOUND);
      const valid = recipe(input);
      if (!valid.ok) return valid;
      const calculation = await this.calculator.calculate(valid.value);
      if (!calculation.ok) return calculation;
      if (!(await this.recipes.update(id, version, valid.value, calculation.value.nutrients))) {
        return err(RECIPE_VERSION_CONFLICT);
      }
      await this.#event(
        context,
        'food.recipe.updated',
        id,
        recipeChangedFields(existing, valid.value),
      );
      return ok({ id, version: version + 1 });
    });
  }

  /** Archivada, deja de ofrecerse al prescribir; los planes que ya la usan la conservan en su snapshot. */
  archive(
    context: SecurityContext,
    id: string,
    version: number,
  ): Promise<Result<{ id: string; version: number }, DomainError>> {
    return this.#setStatus(context, id, version, 'ARCHIVED');
  }

  restore(
    context: SecurityContext,
    id: string,
    version: number,
  ): Promise<Result<{ id: string; version: number }, DomainError>> {
    return this.#setStatus(context, id, version, 'ACTIVE');
  }

  #setStatus(
    context: SecurityContext,
    id: string,
    version: number,
    status: RecipeStatus,
  ): Promise<Result<{ id: string; version: number }, DomainError>> {
    return atomically(this.uow, context, async () => {
      const [existing] = await this.recipes.byIds([id]);
      if (!existing) return err(RECIPE_NOT_FOUND);
      if (existing.version !== version) return err(RECIPE_VERSION_CONFLICT);
      if (existing.status === status) return ok({ id, version });
      if (!(await this.recipes.setStatus(id, version, status))) {
        return err(RECIPE_VERSION_CONFLICT);
      }
      await this.#event(
        context,
        status === 'ARCHIVED' ? 'food.recipe.archived' : 'food.recipe.restored',
        id,
        [],
      );
      return ok({ id, version: version + 1 });
    });
  }

  #organization(context: SecurityContext): OrganizationId {
    if (!context.organizationId) throw new Error('Una receta necesita la organización activa.');
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

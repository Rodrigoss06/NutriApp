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
  EXERCISE_NOT_FOUND,
  EXERCISE_VERSION_CONFLICT,
  GLOBAL_EXERCISE_READ_ONLY,
} from '../../domain/exercise-errors.js';
import {
  ownExerciseProblems,
  type ExerciseStatus,
  type OwnExerciseInput,
} from '../../domain/exercise-library.js';
import { exerciseEvent, type ExerciseEventType } from '../exercise-events.js';
import { EXERCISE_STORE, type ExerciseRecord, type ExerciseStore } from '../ports/exercise.port.js';

/** Los campos que cambian, para la auditoría: nombres, nunca valores (02 §10). */
function changedFields(before: ExerciseRecord, after: OwnExerciseInput): string[] {
  const codes = (muscles: readonly { code: string }[]) => muscles.map(({ code }) => code);
  // Las listas se guardan en el orden del catálogo: importa qué llevan, no cómo vinieron.
  const same = (a: readonly string[], b: readonly string[]) =>
    [...a].sort().join() === [...b].sort().join();
  const comparisons: readonly (readonly [string, boolean])[] = [
    ['name_es', before.name === after.name],
    ['aliases', same(before.aliases, after.aliases)],
    ['movement_pattern', before.pattern === after.pattern],
    ['level', before.level === after.level],
    ['modality', before.modality === after.modality],
    ['equipment_code', before.equipmentCode === after.equipmentCode],
    ['is_unilateral', before.isUnilateral === after.isUnilateral],
    [
      'muscles',
      same(codes(before.primaryMuscles), after.primaryMuscles) &&
        same(codes(before.secondaryMuscles), after.secondaryMuscles),
    ],
    ['caution_es', before.caution === after.caution],
    ['alternative_id', (before.alternative?.id ?? null) === after.alternativeId],
    ['easier_variant_id', (before.easierVariant?.id ?? null) === after.easierVariantId],
    ['harder_variant_id', (before.harderVariant?.id ?? null) === after.harderVariantId],
    [
      'base_values',
      before.baseSets === after.baseSets &&
        before.baseRepsMin === after.baseRepsMin &&
        before.baseRepsMax === after.baseRepsMax &&
        before.baseMeasure === after.baseMeasure &&
        before.baseRestSeconds === after.baseRestSeconds,
    ],
    ['media_url', before.mediaUrl === after.mediaUrl],
    ['instructions', before.instructions === after.instructions],
  ];
  return comparisons.filter(([, unchanged]) => !unchanged).map(([field]) => field);
}

/**
 * Ejercicios propios de la organización (RF-25, RN-I01): se crean y se editan con If-Match, y se archivan en vez de
 * borrarse; los globales no se tocan. Un programa publicado no cambia: lleva los músculos en su snapshot (RN-F12). Cada
 * escritura deja su evento para la auditoría (RN-B03).
 */
@Injectable()
export class OwnExerciseCommands {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(OUTBOX) private readonly outbox: Outbox,
    @Inject(EXERCISE_STORE) private readonly exercises: ExerciseStore,
  ) {}

  create(
    context: SecurityContext,
    input: OwnExerciseInput,
  ): Promise<Result<{ id: string }, DomainError>> {
    return atomically(this.uow, context, async () => {
      const valid = await this.#validate(input, null);
      if (!valid.ok) return valid;
      const id = this.ids.newId<'ExerciseId'>();
      await this.exercises.insertOwn({
        id,
        organizationId: this.#organization(context),
        createdBy: context.userId ?? '',
        exercise: valid.value,
      });
      await this.#event(context, 'exercise.exercise.created', id, []);
      return ok({ id });
    });
  }

  update(
    context: SecurityContext,
    id: string,
    version: number,
    input: OwnExerciseInput,
  ): Promise<Result<{ id: string; version: number }, DomainError>> {
    return atomically(this.uow, context, async () => {
      const [existing] = await this.exercises.byIds([id]);
      if (!existing) return err(EXERCISE_NOT_FOUND);
      if (!existing.own) return err(GLOBAL_EXERCISE_READ_ONLY);
      const valid = await this.#validate(input, id);
      if (!valid.ok) return valid;
      if (!(await this.exercises.updateOwn(id, version, valid.value))) {
        return err(EXERCISE_VERSION_CONFLICT);
      }
      await this.#event(
        context,
        'exercise.exercise.updated',
        id,
        changedFields(existing, valid.value),
      );
      return ok({ id, version: version + 1 });
    });
  }

  /** Archivado, deja de ofrecerse al prescribir; los programas que ya lo usan lo conservan. */
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
    status: ExerciseStatus,
  ): Promise<Result<{ id: string; version: number }, DomainError>> {
    return atomically(this.uow, context, async () => {
      const [existing] = await this.exercises.byIds([id]);
      if (!existing) return err(EXERCISE_NOT_FOUND);
      if (!existing.own) return err(GLOBAL_EXERCISE_READ_ONLY);
      if (existing.version !== version) return err(EXERCISE_VERSION_CONFLICT);
      if (existing.status === status) return ok({ id, version });
      if (!(await this.exercises.setStatus(id, version, status))) {
        return err(EXERCISE_VERSION_CONFLICT);
      }
      await this.#event(
        context,
        status === 'ARCHIVED' ? 'exercise.exercise.archived' : 'exercise.exercise.restored',
        id,
        [],
      );
      return ok({ id, version: version + 1 });
    });
  }

  async #validate(
    input: OwnExerciseInput,
    selfId: string | null,
  ): Promise<Result<OwnExerciseInput, DomainError>> {
    const catalog = await this.exercises.catalog();
    const variantIds = [input.alternativeId, input.easierVariantId, input.harderVariantId].filter(
      (id): id is string => id !== null,
    );
    const visible = await this.exercises.byIds(variantIds);
    return ownExerciseProblems(input, {
      muscleCodes: new Set(catalog.muscles.map(({ code }) => code)),
      equipmentCodes: new Set(catalog.equipment.map(({ code }) => code)),
      visibleExerciseIds: new Set(visible.map(({ id }) => id)),
      selfId,
    });
  }

  #organization(context: SecurityContext): OrganizationId {
    if (!context.organizationId) {
      throw new Error('Un ejercicio propio necesita la organización activa.');
    }
    return context.organizationId;
  }

  async #event(
    context: SecurityContext,
    type: ExerciseEventType,
    id: string,
    fields: readonly string[],
  ): Promise<void> {
    await this.outbox.append(
      [
        exerciseEvent(type, this.#organization(context), id, fields.length > 0 ? { fields } : {}, {
          clock: this.clock,
          ids: this.ids,
        }),
      ],
      { actorUserId: context.userId, actorRole: context.role },
    );
  }
}

import { Inject, Injectable } from '@nestjs/common';
import type { MovementPattern, TrainingLevel } from '@nutricoach/engine';
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
import { CHOICE_EXERCISE_INVALID } from '../../domain/exercise-errors.js';
import { exerciseEvent } from '../exercise-events.js';
import { EXERCISE_STORE, type ExerciseStore } from '../ports/exercise.port.js';

/**
 * El ejercicio sugerido por patrón y nivel es un dato configurable por organización (07 §5): cada una reemplaza la fila
 * que quiera y puede volver a la de la V3. Solo cuenta para las propuestas siguientes (RN-F14).
 */
@Injectable()
export class PatternChoiceCommands {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(OUTBOX) private readonly outbox: Outbox,
    @Inject(EXERCISE_STORE) private readonly exercises: ExerciseStore,
  ) {}

  set(
    context: SecurityContext,
    pattern: MovementPattern,
    level: TrainingLevel,
    exerciseId: string,
  ): Promise<Result<{ exerciseId: string }, DomainError>> {
    return atomically(this.uow, context, async () => {
      const [exercise] = await this.exercises.byIds([exerciseId]);
      if (exercise?.pattern !== pattern || exercise.status !== 'ACTIVE') {
        return err(CHOICE_EXERCISE_INVALID);
      }
      const organizationId = this.#organization(context);
      await this.exercises.setPatternChoice({
        id: this.ids.newId<'PatternChoiceId'>(),
        organizationId,
        pattern,
        level,
        exerciseId,
      });
      await this.#changed(context, pattern, level);
      return ok({ exerciseId });
    });
  }

  clear(
    context: SecurityContext,
    pattern: MovementPattern,
    level: TrainingLevel,
  ): Promise<Result<{ cleared: boolean }, DomainError>> {
    return atomically(this.uow, context, async () => {
      const cleared = await this.exercises.clearPatternChoice(
        this.#organization(context),
        pattern,
        level,
      );
      if (cleared) await this.#changed(context, pattern, level);
      return ok({ cleared });
    });
  }

  #organization(context: SecurityContext): OrganizationId {
    if (!context.organizationId) {
      throw new Error('La tabla patrón × nivel necesita la organización activa.');
    }
    return context.organizationId;
  }

  async #changed(
    context: SecurityContext,
    pattern: MovementPattern,
    level: TrainingLevel,
  ): Promise<void> {
    await this.outbox.append(
      [
        exerciseEvent(
          'exercise.choice.changed',
          this.#organization(context),
          this.#organization(context),
          { pattern, level },
          { clock: this.clock, ids: this.ids },
        ),
      ],
      { actorUserId: context.userId, actorRole: context.role },
    );
  }
}

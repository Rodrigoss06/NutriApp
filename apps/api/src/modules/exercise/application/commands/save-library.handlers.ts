import { Inject, Injectable } from '@nestjs/common';
import {
  FULL_GYM,
  libraryProblems,
  type LibraryExercise,
  type PatternChoiceRow,
} from '../../domain/exercise-library.js';
import { EXERCISE_STORE, type ExerciseStore } from '../ports/exercise.port.js';

/**
 * Guarda los ejercicios base en la transacción del lote (RN-I01, RN-I04). Lo que no se puede ver en una sola fila
 * (variantes, músculos y equipos que existen) se revisa aquí: un archivo con problemas falla entero.
 */
@Injectable()
export class SaveLibraryHandler {
  constructor(@Inject(EXERCISE_STORE) private readonly exercises: ExerciseStore) {}

  async execute(rows: readonly LibraryExercise[]): Promise<void> {
    const catalog = await this.exercises.catalog();
    const muscles = new Set(catalog.muscles.map(({ code }) => code));
    const equipment = new Set(catalog.equipment.map(({ code }) => code));
    const problems = [...libraryProblems(rows)];
    for (const row of rows) {
      for (const muscle of [...row.primaryMuscles, ...row.secondaryMuscles]) {
        if (!muscles.has(muscle)) problems.push(`${row.code}: ${muscle} no es un grupo muscular`);
      }
      const code = row.equipmentCode;
      if (code !== null && (!equipment.has(code) || code === FULL_GYM)) {
        problems.push(`${row.code}: ${code} no es un equipo de un ejercicio`);
      }
    }
    if (problems.length > 0) throw new Error(problems.join('; '));
    await this.exercises.upsertLibrary(rows);
  }
}

/** Guarda la tabla patrón × nivel de la V3 (07 §5): cada fila apunta a un ejercicio global de su patrón. */
@Injectable()
export class SavePatternChoicesHandler {
  constructor(@Inject(EXERCISE_STORE) private readonly exercises: ExerciseStore) {}

  async execute(rows: readonly PatternChoiceRow[]): Promise<void> {
    const exercises = new Map(
      (await this.exercises.globalExercises()).map((exercise) => [exercise.code, exercise]),
    );
    const problems = rows.flatMap((row) => {
      const exercise = exercises.get(row.exerciseCode);
      if (!exercise) return [`${row.exerciseCode}: no está en la biblioteca`];
      if (exercise.name !== row.exerciseName) {
        return [`${row.exerciseCode}: se llama «${exercise.name}», no «${row.exerciseName}»`];
      }
      return exercise.pattern === row.pattern
        ? []
        : [`${row.exerciseCode}: es de ${exercise.pattern}, no de ${row.pattern}`];
    });
    if (problems.length > 0) throw new Error(problems.join('; '));
    await this.exercises.upsertGlobalChoices(rows);
  }
}

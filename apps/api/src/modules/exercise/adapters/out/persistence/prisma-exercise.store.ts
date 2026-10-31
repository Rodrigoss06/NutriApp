import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { MovementPattern, TrainingLevel } from '@nutricoach/engine';
import { CLOCK, ID_GENERATOR, type Clock, type IdGenerator } from '@nutricoach/shared-kernel';
import type { Db } from '../../../../../platform/index.js';
import type {
  ExerciseCatalog,
  ExerciseRecord,
  ExerciseSearch,
  ExerciseStore,
  ExerciseSummaryRecord,
  GlobalExerciseRef,
  PatternChoiceRecord,
} from '../../../application/ports/exercise.port.js';
import type {
  BaseMeasure,
  ExerciseModality,
  ExerciseStatus,
  LibraryExercise,
  OwnExerciseInput,
  PatternChoiceRow,
} from '../../../domain/exercise-library.js';

interface SummaryRow {
  id: string;
  name_es: string;
  aliases: string[];
  movement_pattern: MovementPattern;
  level: TrainingLevel;
  modality: ExerciseModality;
  equipment_name: string | null;
  primary_muscles: string[];
  own: boolean;
  provisional: boolean;
  status: ExerciseStatus;
}

const DETAIL = {
  equipment: true,
  exerciseMuscles: { include: { muscleGroup: true } },
  alternative: { select: { id: true, nameEs: true } },
  easierVariant: { select: { id: true, nameEs: true } },
  harderVariant: { select: { id: true, nameEs: true } },
} as const;

const refOf = (row: { id: string; nameEs: string } | null) =>
  row ? { id: row.id, name: row.nameEs } : null;

/** Lo que un ejercicio propio guarda en su fila; los músculos van aparte. */
const ownColumns = (exercise: OwnExerciseInput) => ({
  nameEs: exercise.name,
  aliases: [...exercise.aliases],
  modality: exercise.modality,
  movementPattern: exercise.pattern,
  equipmentCode: exercise.equipmentCode,
  isUnilateral: exercise.isUnilateral,
  level: exercise.level,
  cautionEs: exercise.caution,
  alternativeId: exercise.alternativeId,
  easierVariantId: exercise.easierVariantId,
  harderVariantId: exercise.harderVariantId,
  baseSets: exercise.baseSets,
  baseRepsMin: exercise.baseRepsMin,
  baseRepsMax: exercise.baseRepsMax,
  baseMeasure: exercise.baseMeasure,
  baseRestSeconds: exercise.baseRestSeconds,
  mediaUrl: exercise.mediaUrl,
  instructions: exercise.instructions,
});

const muscleRows = (
  exerciseId: string,
  organizationId: string | null,
  exercise: Pick<OwnExerciseInput, 'primaryMuscles' | 'secondaryMuscles'>,
) => [
  ...exercise.primaryMuscles.map((muscleCode) => ({
    exerciseId,
    muscleCode,
    organizationId,
    role: 'PRIMARY',
  })),
  ...exercise.secondaryMuscles.map((muscleCode) => ({
    exerciseId,
    muscleCode,
    organizationId,
    role: 'SECONDARY',
  })),
];

/**
 * exercise.exercise y sus catálogos con la transacción de la UnitOfWork. La RLS deja ver lo global y lo de la
 * organización activa, y escribir solo lo propio (RN-I01); lo global lo escribe el importador como SYSTEM.
 */
@Injectable()
export class PrismaExerciseStore implements ExerciseStore {
  constructor(
    @Inject(TransactionHost) private readonly db: Db,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async catalog(): Promise<ExerciseCatalog> {
    const [patterns, muscles, equipment] = [
      await this.db.tx.movementPattern.findMany({ orderBy: { displayOrder: 'asc' } }),
      await this.db.tx.muscleGroup.findMany({ orderBy: { displayOrder: 'asc' } }),
      await this.db.tx.equipment.findMany({ orderBy: { nameEs: 'asc' } }),
    ];
    return {
      patterns: patterns.map(({ code, nameEs }) => ({
        code: code as MovementPattern,
        name: nameEs,
      })),
      muscles: muscles.map(({ code, nameEs, region }) => ({ code, name: nameEs, region })),
      equipment: equipment.map(({ code, nameEs }) => ({ code, name: nameEs })),
    };
  }

  /**
   * Sin tildes ni mayúsculas, en el nombre y en los alias. Entra el ejercicio que tiene todas las palabras del término o
   * se le parece palabra por palabra (pg_trgm). Primero los que empiezan con el término y los que lo contienen entero;
   * sin término, por patrón y nombre. El catálogo es de unos cientos de filas: no necesita un índice sobre los alias.
   */
  async search(search: ExerciseSearch): Promise<readonly ExerciseSummaryRecord[]> {
    const { text, pattern, level, equipmentCode, muscleCode, status, limit } = search;
    const rows = await this.db.tx.$queryRaw<SummaryRow[]>`
      WITH q AS (SELECT app.unaccent_immutable(lower(${text}::text)) AS t),
           e AS (SELECT x.*, x.search_text || ' ' ||
                        app.unaccent_immutable(lower(array_to_string(x.aliases, ' '))) AS haystack
                 FROM exercise.exercise x)
      SELECT e.id, e.name_es, e.aliases, e.movement_pattern, e.level, e.modality, eq.name_es AS equipment_name,
             e.organization_id IS NOT NULL AS own, e.provisional, e.status,
             coalesce((SELECT array_agg(g.name_es ORDER BY g.display_order)
                       FROM exercise.exercise_muscle m JOIN exercise.muscle_group g ON g.code = m.muscle_code
                       WHERE m.exercise_id = e.id AND m.role = 'PRIMARY'), '{}') AS primary_muscles
      FROM e CROSS JOIN q
      JOIN exercise.movement_pattern p ON p.code = e.movement_pattern
      LEFT JOIN exercise.equipment eq ON eq.code = e.equipment_code
      WHERE e.status = ${status}
        AND (${pattern}::text IS NULL OR e.movement_pattern = ${pattern})
        AND (${level}::text IS NULL OR e.level = ${level})
        AND (${equipmentCode}::text IS NULL OR e.equipment_code = ${equipmentCode})
        AND (${muscleCode}::text IS NULL OR EXISTS (
              SELECT 1 FROM exercise.exercise_muscle m
              WHERE m.exercise_id = e.id AND m.muscle_code = ${muscleCode}))
        AND (q.t IS NULL
             OR NOT EXISTS (SELECT 1 FROM unnest(string_to_array(q.t, ' ')) AS word
                            WHERE word <> '' AND e.haystack NOT LIKE '%' || word || '%')
             OR q.t <% e.haystack)
      ORDER BY coalesce(e.haystack LIKE q.t || '%', false) DESC,
               coalesce(e.haystack LIKE '%' || q.t || '%', false) DESC,
               coalesce(word_similarity(q.t, e.haystack), 0) DESC,
               p.display_order, e.name_es
      LIMIT ${limit}`;
    return rows.map((row) => ({
      id: row.id,
      name: row.name_es,
      aliases: row.aliases,
      pattern: row.movement_pattern,
      level: row.level,
      modality: row.modality,
      equipmentName: row.equipment_name,
      primaryMuscles: row.primary_muscles,
      own: row.own,
      provisional: row.provisional,
      status: row.status,
    }));
  }

  async byIds(ids: readonly string[]): Promise<readonly ExerciseRecord[]> {
    if (ids.length === 0) return [];
    const rows = await this.db.tx.exercise.findMany({
      where: { id: { in: [...ids] } },
      include: DETAIL,
    });
    return rows.map((row) => {
      const muscles = (role: 'PRIMARY' | 'SECONDARY') =>
        row.exerciseMuscles
          .filter((muscle) => muscle.role === role)
          .sort((a, b) => a.muscleGroup.displayOrder - b.muscleGroup.displayOrder)
          .map((muscle) => ({ code: muscle.muscleCode, name: muscle.muscleGroup.nameEs }));
      return {
        id: row.id,
        name: row.nameEs,
        aliases: row.aliases,
        code: row.code,
        pattern: row.movementPattern as MovementPattern,
        level: row.level as TrainingLevel,
        modality: row.modality as ExerciseModality,
        equipmentCode: row.equipmentCode,
        equipmentName: row.equipment?.nameEs ?? null,
        isUnilateral: row.isUnilateral,
        primaryMuscles: muscles('PRIMARY'),
        secondaryMuscles: muscles('SECONDARY'),
        caution: row.cautionEs,
        alternative: refOf(row.alternative),
        easierVariant: refOf(row.easierVariant),
        harderVariant: refOf(row.harderVariant),
        baseSets: row.baseSets,
        baseRepsMin: row.baseRepsMin,
        baseRepsMax: row.baseRepsMax,
        baseMeasure: row.baseMeasure as BaseMeasure,
        baseRestSeconds: row.baseRestSeconds,
        mediaUrl: row.mediaUrl,
        instructions: row.instructions,
        own: row.organizationId !== null,
        provisional: row.provisional,
        status: row.status as ExerciseStatus,
        version: row.version,
      };
    });
  }

  async insertOwn(row: {
    id: string;
    organizationId: string;
    createdBy: string;
    exercise: OwnExerciseInput;
  }): Promise<void> {
    await this.db.tx.exercise.create({
      data: {
        ...ownColumns(row.exercise),
        id: row.id,
        organizationId: row.organizationId,
        createdBy: row.createdBy,
      },
    });
    await this.db.tx.exerciseMuscle.createMany({
      data: muscleRows(row.id, row.organizationId, row.exercise),
    });
  }

  async updateOwn(id: string, version: number, exercise: OwnExerciseInput): Promise<boolean> {
    const { count } = await this.db.tx.exercise.updateMany({
      where: { id, version, organizationId: { not: null } },
      data: {
        ...ownColumns(exercise),
        updatedAt: this.clock.now(),
        version: { increment: 1 },
      },
    });
    if (count === 0) return false;
    const own = await this.db.tx.exercise.findFirstOrThrow({
      where: { id },
      select: { organizationId: true },
    });
    await this.db.tx.exerciseMuscle.deleteMany({ where: { exerciseId: id } });
    await this.db.tx.exerciseMuscle.createMany({
      data: muscleRows(id, own.organizationId, exercise),
    });
    return true;
  }

  async setStatus(id: string, version: number, status: ExerciseStatus): Promise<boolean> {
    const { count } = await this.db.tx.exercise.updateMany({
      where: { id, version, organizationId: { not: null } },
      data: { status, updatedAt: this.clock.now(), version: { increment: 1 } },
    });
    return count === 1;
  }

  /**
   * Por cada patrón y nivel, la fila de la organización si puso una; la RLS ya deja fuera las de otras. Una fila cuyo
   * ejercicio se archivó o cambió de patrón no cuenta: queda la de la V3 hasta que vuelva a servir (RN-F14).
   */
  async patternChoices(): Promise<readonly PatternChoiceRecord[]> {
    const rows = await this.db.tx.$queryRaw<
      {
        movement_pattern: MovementPattern;
        level: TrainingLevel;
        exercise_id: string;
        name_es: string;
        own: boolean;
        provisional: boolean;
      }[]
    >`
      SELECT DISTINCT ON (c.movement_pattern, c.level)
             c.movement_pattern, c.level, c.exercise_id, e.name_es,
             c.organization_id IS NOT NULL AS own, e.provisional
      FROM exercise.pattern_choice c
      JOIN exercise.exercise e ON e.id = c.exercise_id
      WHERE e.status = 'ACTIVE' AND e.movement_pattern = c.movement_pattern
      ORDER BY c.movement_pattern, c.level, c.organization_id NULLS LAST`;
    return rows.map((row) => ({
      pattern: row.movement_pattern,
      level: row.level,
      exercise: { id: row.exercise_id, name: row.name_es },
      own: row.own,
      provisional: row.provisional,
    }));
  }

  async setPatternChoice(row: {
    id: string;
    organizationId: string;
    pattern: MovementPattern;
    level: TrainingLevel;
    exerciseId: string;
  }): Promise<void> {
    await this.db.tx.$executeRaw`
      INSERT INTO exercise.pattern_choice AS c (id, organization_id, movement_pattern, level, exercise_id)
      VALUES (${row.id}::uuid, ${row.organizationId}::uuid, ${row.pattern}, ${row.level}, ${row.exerciseId}::uuid)
      ON CONFLICT (organization_id, movement_pattern, level)
      DO UPDATE SET exercise_id = EXCLUDED.exercise_id`;
  }

  async clearPatternChoice(
    organizationId: string,
    pattern: MovementPattern,
    level: TrainingLevel,
  ): Promise<boolean> {
    const { count } = await this.db.tx.patternChoice.deleteMany({
      where: { organizationId, movementPattern: pattern, level },
    });
    return count > 0;
  }

  /** Fila por fila: unos cientos, una sola vez por archivo. Un ejercicio sin cambios no se toca (RN-I04). */
  async upsertLibrary(rows: readonly LibraryExercise[]): Promise<void> {
    for (const row of rows) {
      await this.db.tx.$executeRaw`
        INSERT INTO exercise.exercise AS e
          (id, organization_id, code, name_es, aliases, modality, movement_pattern, equipment_code, is_unilateral,
           level, caution_es, base_sets, base_reps_min, base_reps_max, base_measure, base_rest_seconds, provisional)
        VALUES (${this.ids.newId<'ExerciseId'>()}::uuid, NULL, ${row.code}, ${row.name}, ${[...row.aliases]}::text[],
                ${row.modality}, ${row.pattern}, ${row.equipmentCode}, ${row.isUnilateral}, ${row.level}, ${row.caution},
                ${row.baseSets}::smallint, ${row.baseRepsMin}::smallint, ${row.baseRepsMax}::smallint,
                ${row.baseMeasure}, ${row.baseRestSeconds}::smallint, ${row.provisional})
        ON CONFLICT (organization_id, code) WHERE code IS NOT NULL DO UPDATE SET
          name_es = EXCLUDED.name_es, aliases = EXCLUDED.aliases, modality = EXCLUDED.modality,
          movement_pattern = EXCLUDED.movement_pattern, equipment_code = EXCLUDED.equipment_code,
          is_unilateral = EXCLUDED.is_unilateral, level = EXCLUDED.level, caution_es = EXCLUDED.caution_es,
          base_sets = EXCLUDED.base_sets, base_reps_min = EXCLUDED.base_reps_min,
          base_reps_max = EXCLUDED.base_reps_max, base_measure = EXCLUDED.base_measure,
          base_rest_seconds = EXCLUDED.base_rest_seconds, provisional = EXCLUDED.provisional,
          updated_at = now(), version = e.version + 1
        WHERE (e.name_es, e.aliases, e.modality, e.movement_pattern, e.equipment_code, e.is_unilateral, e.level,
               e.caution_es, e.base_sets, e.base_reps_min, e.base_reps_max, e.base_measure, e.base_rest_seconds,
               e.provisional)
          IS DISTINCT FROM
              (EXCLUDED.name_es, EXCLUDED.aliases, EXCLUDED.modality, EXCLUDED.movement_pattern,
               EXCLUDED.equipment_code, EXCLUDED.is_unilateral, EXCLUDED.level, EXCLUDED.caution_es,
               EXCLUDED.base_sets, EXCLUDED.base_reps_min, EXCLUDED.base_reps_max, EXCLUDED.base_measure,
               EXCLUDED.base_rest_seconds, EXCLUDED.provisional)`;
    }
    await this.#linkVariants(rows);
    await this.#replaceGlobalMuscles(rows);
  }

  /** Las variantes van por código: se enlazan cuando ya existen todos los ejercicios del archivo. */
  async #linkVariants(rows: readonly LibraryExercise[]): Promise<void> {
    await this.db.tx.$executeRaw`
      UPDATE exercise.exercise e
      SET alternative_id = a.id, easier_variant_id = b.id, harder_variant_id = c.id
      FROM unnest(${rows.map((r) => r.code)}::text[], ${rows.map((r) => r.alternativeCode)}::text[],
                  ${rows.map((r) => r.easierCode)}::text[], ${rows.map((r) => r.harderCode)}::text[])
             AS n(code, alternative, easier, harder)
      LEFT JOIN exercise.exercise a ON a.organization_id IS NULL AND a.code = n.alternative
      LEFT JOIN exercise.exercise b ON b.organization_id IS NULL AND b.code = n.easier
      LEFT JOIN exercise.exercise c ON c.organization_id IS NULL AND c.code = n.harder
      WHERE e.organization_id IS NULL AND e.code = n.code
        AND (e.alternative_id, e.easier_variant_id, e.harder_variant_id) IS DISTINCT FROM (a.id, b.id, c.id)`;
  }

  async #replaceGlobalMuscles(rows: readonly LibraryExercise[]): Promise<void> {
    const codes = rows.map((row) => row.code);
    const saved = await this.db.tx.exercise.findMany({
      where: { organizationId: null, code: { in: codes } },
      select: { id: true, code: true },
    });
    const idOf = new Map(saved.map(({ id, code }) => [code, id]));
    await this.db.tx.exerciseMuscle.deleteMany({
      where: { exerciseId: { in: saved.map(({ id }) => id) } },
    });
    await this.db.tx.exerciseMuscle.createMany({
      data: rows.flatMap((row) => muscleRows(idOf.get(row.code) ?? '', null, row)),
    });
  }

  async globalExercises(): Promise<readonly GlobalExerciseRef[]> {
    const rows = await this.db.tx.exercise.findMany({
      where: { organizationId: null, code: { not: null } },
      select: { id: true, code: true, nameEs: true, movementPattern: true },
    });
    return rows.map((row) => ({
      id: row.id,
      code: row.code ?? '',
      name: row.nameEs,
      pattern: row.movementPattern as MovementPattern,
    }));
  }

  async upsertGlobalChoices(rows: readonly PatternChoiceRow[]): Promise<void> {
    for (const row of rows) {
      await this.db.tx.$executeRaw`
        INSERT INTO exercise.pattern_choice AS c (id, organization_id, movement_pattern, level, exercise_id)
        SELECT ${this.ids.newId<'PatternChoiceId'>()}::uuid, NULL, ${row.pattern}, ${row.level}, e.id
        FROM exercise.exercise e WHERE e.organization_id IS NULL AND e.code = ${row.exerciseCode}
        ON CONFLICT (organization_id, movement_pattern, level)
        DO UPDATE SET exercise_id = EXCLUDED.exercise_id WHERE c.exercise_id <> EXCLUDED.exercise_id`;
    }
  }
}

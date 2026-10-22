import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { Db } from '../../../../../platform/index.js';
import type {
  PhysicalActivityRecord,
  PhysicalActivityStore,
} from '../../../application/exercise-api.js';
import type { CompendiumActivity } from '../../../domain/compendium-activity.js';

interface Row {
  code: string;
  major_heading: string;
  description_es: string;
  met: string;
  source_version: string;
}

const toRecord = (row: Row): PhysicalActivityRecord => ({
  code: row.code,
  majorHeading: row.major_heading,
  descriptionEs: row.description_es,
  met: Number(row.met),
  sourceVersion: row.source_version,
});

/** exercise.physical_activity con la transacción de la UnitOfWork. */
@Injectable()
export class PrismaPhysicalActivityStore implements PhysicalActivityStore {
  constructor(@Inject(TransactionHost) private readonly db: Db) {}

  /**
   * Sin tildes ni mayúsculas. Entra la actividad que tiene todas las palabras del término o se le parece palabra por
   * palabra (pg_trgm); primero las que contienen el término entero, después las más parecidas.
   */
  async search(text: string | null): Promise<readonly PhysicalActivityRecord[]> {
    const rows = await this.db.tx.$queryRaw<Row[]>`
      WITH q AS (SELECT app.unaccent_immutable(lower(${text}::text)) AS t),
           a AS (SELECT *, app.unaccent_immutable(lower(description_es)) AS search_text
                 FROM exercise.physical_activity)
      SELECT a.code, a.major_heading, a.description_es, a.met::text AS met, a.source_version
      FROM a CROSS JOIN q
      WHERE q.t IS NULL
         OR NOT EXISTS (SELECT 1 FROM unnest(string_to_array(q.t, ' ')) AS word
                        WHERE word <> '' AND a.search_text NOT LIKE '%' || word || '%')
         OR q.t <% a.search_text
      ORDER BY coalesce(a.search_text LIKE '%' || q.t || '%', false) DESC,
               coalesce(word_similarity(q.t, a.search_text), 0) DESC, a.description_es
      LIMIT 50`;
    return rows.map(toRecord);
  }

  async byCodes(codes: readonly string[]): Promise<readonly PhysicalActivityRecord[]> {
    if (codes.length === 0) return [];
    const rows = await this.db.tx.$queryRaw<Row[]>`
      SELECT code, major_heading, description_es, met::text AS met, source_version
      FROM exercise.physical_activity WHERE code = ANY(${[...codes]}::text[])`;
    return rows.map(toRecord);
  }

  /** Una sentencia con unnest para todo el lote; una actividad sin cambios no se toca. */
  async upsert(activities: readonly CompendiumActivity[], sourceVersion: string): Promise<void> {
    if (activities.length === 0) return;
    await this.db.tx.$executeRaw`
      INSERT INTO exercise.physical_activity AS a
        (code, major_heading, description_es, description_en, met, source_version)
      SELECT n.code, n.major_heading, n.description_es, n.description_en, n.met, ${sourceVersion}
      FROM unnest(${activities.map((a) => a.code)}::text[], ${activities.map((a) => a.majorHeading)}::text[],
                  ${activities.map((a) => a.descriptionEs)}::text[], ${activities.map((a) => a.descriptionEn)}::text[],
                  ${activities.map((a) => a.met)}::numeric[])
        AS n(code, major_heading, description_es, description_en, met)
      ON CONFLICT (code) DO UPDATE
        SET major_heading = excluded.major_heading, description_es = excluded.description_es,
            description_en = excluded.description_en, met = excluded.met, source_version = excluded.source_version
        WHERE (a.major_heading, a.description_es, a.description_en, a.met, a.source_version)
              IS DISTINCT FROM (excluded.major_heading, excluded.description_es, excluded.description_en,
                                excluded.met, excluded.source_version)`;
  }
}

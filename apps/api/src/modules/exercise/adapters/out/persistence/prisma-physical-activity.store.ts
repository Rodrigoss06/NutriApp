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

  async search(text: string | null): Promise<readonly PhysicalActivityRecord[]> {
    const rows = await this.db.tx.$queryRaw<Row[]>`
      SELECT code, major_heading, description_es, met::text AS met, source_version
      FROM exercise.physical_activity
      WHERE ${text}::text IS NULL
         OR app.unaccent_immutable(lower(description_es))
            LIKE '%' || app.unaccent_immutable(lower(${text}::text)) || '%'
      ORDER BY description_es
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

import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { Db } from '../../../../../platform/index.js';
import type {
  PhysicalActivityRecord,
  PhysicalActivityStore,
} from '../../../application/exercise-api.js';

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
}

import { readFile } from 'node:fs/promises';
import type { UserId } from '@nutricoach/shared-kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CatalogImporter } from '../../src/platform/index.js';
import { ApiHarness, type StaffOrganization } from './support/api-harness.js';
import { errorCode, id, PG, pool, withContext } from './support/database.js';

/**
 * P12 (PR 2) · biblioteca de ejercicios por HTTP contra PostgreSQL como app_user: el CSV de 150 o más ejercicios y la
 * tabla patrón × nivel de la V3 (RF-25, RF-38, RN-F14), búsqueda sin tildes y por alias, ejercicios propios de cada
 * organización (RN-I01) y la tabla configurable por organización (07 §5).
 */

const SEEDS = new URL('../../../../seeds/', import.meta.url);
const harness = new ApiHarness();
let org: StaffOrganization;
let other: StaffOrganization;
let cookie: string;

interface Summary {
  id: string;
  name: string;
  aliases: string[];
  pattern: string;
  level: string;
  equipmentName: string | null;
  primaryMuscles: string[];
  own: boolean;
  provisional: boolean;
  status: string;
}
interface Ref {
  id: string;
  name: string;
}
interface Detail extends Omit<Summary, 'primaryMuscles'> {
  code: string | null;
  version: number;
  primaryMuscles: { code: string; name: string }[];
  secondaryMuscles: { code: string; name: string }[];
  caution: string | null;
  alternative: Ref | null;
  easierVariant: Ref | null;
  harderVariant: Ref | null;
  baseSets: number | null;
  baseRepsMin: number | null;
  baseMeasure: string;
  baseRestSeconds: number | null;
}
interface Choice {
  pattern: string;
  level: string;
  exercise: Ref;
  own: boolean;
}

const owner = async <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  (await pool('owner').query(sql, params)).rows as T[];

const search = async (query: string, as = cookie) =>
  ((await harness.get(`/exercises?${query}`, as)).body as { exercises: Summary[] }).exercises;

const detail = async (exerciseId: string, as = cookie) =>
  (await harness.get(`/exercises/${exerciseId}`, as)).body as Detail;

const byCode = async (code: string): Promise<string> => {
  const [row] = await owner<{ id: string }>(
    `SELECT id FROM exercise.exercise WHERE organization_id IS NULL AND code = $1`,
    [code],
  );
  return row?.id ?? '';
};

const choices = async (as = cookie) =>
  ((await harness.get('/exercise-pattern-choices', as)).body as { choices: Choice[] }).choices;

const choice = (rows: readonly Choice[], pattern: string, level: string) =>
  rows.find((row) => row.pattern === pattern && row.level === level);

beforeAll(async () => {
  await harness.start();
  org = await harness.createStaffOrganization();
  other = await harness.createStaffOrganization();
  cookie = org.staff.responsible.cookie;
  // Con una línea en blanco al final: otro hash, así este lote se aplica y la prueba de catálogos sigue siendo la primera
  // en aplicar cada archivo.
  const importer = harness.app.get(CatalogImporter);
  for (const [kind, file] of [
    ['EXERCISE_LIBRARY', 'exercise/ejercicios-base.csv'],
    ['EXERCISE_PATTERN_CHOICES', 'exercise/pattern-choice-v3.csv'],
  ] as const) {
    const report = await importer.run({
      kind,
      fileName: file,
      content: Buffer.concat([await readFile(new URL(file, SEEDS)), Buffer.from('\n')]),
      organizationId: null,
      startedBy: id() as UserId,
    });
    expect(['COMPLETED', 'DUPLICATE']).toContain(report.status);
  }
});

afterAll(async () => {
  await harness.app.close();
});

describe('RF-25 · RF-38 · la biblioteca base', () => {
  it('tiene 150 o más ejercicios, y solo los 23 de la V3 no son provisionales (ADR-071)', async () => {
    const [counts] = await owner<{ total: number; firm: number }>(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE NOT provisional)::int AS firm
       FROM exercise.exercise WHERE organization_id IS NULL`,
    );

    expect(counts?.total).toBeGreaterThanOrEqual(150);
    expect(counts?.firm).toBe(23);
  });

  it('RN-F11 y P-13: la ficha trae músculos, precaución, alternativa, regresión, progresión y valores base', async () => {
    const goblet = await detail(await byCode('SQ01'));

    expect(goblet).toMatchObject({
      code: 'SQ01',
      name: 'Sentadilla goblet',
      pattern: 'SQUAT',
      level: 'BEGINNER',
      equipmentName: 'Mancuernas',
      own: false,
      provisional: false,
      caution: 'Dolor de rodilla o lumbar',
      primaryMuscles: [{ code: 'QUADRICEPS', name: 'Cuádriceps' }],
      secondaryMuscles: [{ code: 'GLUTES', name: 'Glúteo' }],
      alternative: { name: 'Sentarse y levantarse' },
      easierVariant: { name: 'Sentadilla a caja' },
      harderVariant: { name: 'Prensa de piernas' },
      baseSets: 3,
      baseRepsMin: 10,
      baseMeasure: 'REPS',
      baseRestSeconds: 90,
    });
  });

  it('el catálogo: los 15 patrones en orden, los grupos musculares y los equipos', async () => {
    const catalog = (await harness.get('/exercises/catalog', cookie)).body as {
      patterns: { code: string; name: string }[];
      muscles: { code: string; region: string }[];
      equipment: { code: string; name: string }[];
    };

    expect(catalog.patterns).toHaveLength(15);
    expect(catalog.patterns[0]).toEqual({ code: 'SQUAT', name: 'Sentadilla' });
    expect(catalog.muscles.map((m) => m.code)).toContain('HAMSTRINGS');
    expect(catalog.equipment.map((e) => e.code)).toContain('FULL_GYM');
  });

  it('volver a importar el mismo código no duplica ni cambia los identificadores (RN-I04)', async () => {
    const before = await byCode('SQ01');
    const content = await readFile(new URL('exercise/ejercicios-base.csv', SEEDS));
    const report = await harness.app.get(CatalogImporter).run({
      kind: 'EXERCISE_LIBRARY',
      fileName: 'ejercicios-base.csv',
      content: Buffer.concat([content, Buffer.from('\n\n')]),
      organizationId: null,
      startedBy: id() as UserId,
    });
    const [counts] = await owner<{ total: number; dup: number }>(
      `SELECT count(*)::int AS total, count(DISTINCT code)::int AS dup
       FROM exercise.exercise WHERE organization_id IS NULL`,
    );

    expect(['COMPLETED', 'DUPLICATE']).toContain(report.status);
    expect(await byCode('SQ01')).toBe(before);
    expect(counts?.total).toBe(counts?.dup);
  });

  it('un archivo con una variante que no existe falla entero y no guarda nada (RN-I04)', async () => {
    const header = (await readFile(new URL('exercise/ejercicios-base.csv', SEEDS), 'utf8')).split(
      '\n',
    )[0];
    const report = await harness.app.get(CatalogImporter).run({
      kind: 'EXERCISE_LIBRARY',
      fileName: 'malo.csv',
      content: Buffer.from(
        `${header ?? ''}\nZZ01,SQUAT,Ejercicio de prueba,,STRENGTH,BEGINNER,,no,QUADRICEPS,,,ZZ99,,,3,10,10,REPS,60,si\n`,
      ),
      organizationId: null,
      startedBy: id() as UserId,
    });

    expect(report.status).toBe('FAILED');
    expect(report.failure).toContain('ZZ01: alternativa ZZ99 no existe');
    expect(await byCode('ZZ01')).toBe('');
  });
});

describe('RF-25 · búsqueda', () => {
  it('sin tildes ni mayúsculas', async () => {
    const found = await search('q=jalon%20al%20pecho');

    expect(found[0]?.name).toBe('Jalón al pecho');
    expect(found[0]?.primaryMuscles).toEqual(['Dorsal']);
  });

  it('por alias: «RDL con mancuernas» lleva al nombre de la tabla (P-11)', async () => {
    const found = await search('q=rdl%20con%20mancuernas');

    expect(found[0]?.name).toBe('Peso muerto rumano con mancuernas');
  });

  it('por patrón, nivel, equipo y músculo', async () => {
    const found = await search('pattern=HINGE&level=ADVANCED&equipment=BARBELL&muscle=GLUTES');

    expect(found.map((e) => e.name)).toContain('Peso muerto sumo');
    for (const exercise of found) {
      expect(exercise).toMatchObject({
        pattern: 'HINGE',
        level: 'ADVANCED',
        equipmentName: 'Barra',
      });
    }
  });

  it('valida los filtros: 400 con un patrón que no existe', async () => {
    expect((await harness.get('/exercises?pattern=PUSH', cookie)).status).toBe(400);
  });

  it('06 §5 · devuelve 100 como máximo', async () => {
    expect((await harness.get('/exercises?limit=100', cookie)).status).toBe(200);
    expect((await harness.get('/exercises?limit=101', cookie)).status).toBe(400);
  });
});

describe('RN-I01 · ejercicios propios de la organización', () => {
  const OWN = {
    name: 'Sentadilla en bosu (prueba)',
    aliases: ['Bosu squat'],
    pattern: 'SQUAT',
    level: 'INTERMEDIATE',
    modality: 'STRENGTH',
    equipmentCode: 'DUMBBELL',
    primaryMuscles: ['QUADRICEPS'],
    secondaryMuscles: ['GLUTES', 'ABS'],
    caution: 'Inestabilidad',
    baseSets: 3,
    baseRepsMin: 8,
    baseRepsMax: 12,
    baseRestSeconds: 90,
    mediaUrl: 'https://videos.example.com/bosu',
    instructions: 'Controla la bajada.',
  };

  it('se crea, se ve en su organización y en ninguna otra', async () => {
    const created = await harness.post('/exercises', OWN, cookie);
    expect(created.status).toBe(201);
    const exercise = created.body as Detail;

    expect(exercise).toMatchObject({ own: true, provisional: false, code: null, version: 0 });
    expect((await search('q=bosu')).map((e) => e.id)).toContain(exercise.id);
    const theirs = other.staff.responsible.cookie;
    expect((await search('q=bosu', theirs)).map((e) => e.id)).not.toContain(exercise.id);
    expect((await harness.get(`/exercises/${exercise.id}`, theirs)).status).toBe(404);
  });

  it('se edita con If-Match y reemplaza sus músculos; una versión vieja responde 409', async () => {
    const exercise = (await harness.post('/exercises', OWN, cookie)).body as Detail;

    const updated = await harness
      .put(
        `/exercises/${exercise.id}`,
        { ...OWN, name: 'Sentadilla en bosu con barra (prueba)', secondaryMuscles: ['ABS'] },
        cookie,
      )
      .set('If-Match', '"0"');
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({
      name: 'Sentadilla en bosu con barra (prueba)',
      version: 1,
      secondaryMuscles: [{ code: 'ABS', name: 'Abdomen' }],
    });

    const stale = await harness
      .put(`/exercises/${exercise.id}`, OWN, cookie)
      .set('If-Match', '"0"');
    expect(stale.status).toBe(409);
    expect((stale.body as { code: string }).code).toBe('NC-EXE-004');
    expect((await harness.put(`/exercises/${exercise.id}`, OWN, cookie)).status).toBe(428);
  });

  it('los de referencia no se editan ni se archivan: 403 con RN-I01', async () => {
    const goblet = await byCode('SQ01');

    const edited = await harness.put(`/exercises/${goblet}`, OWN, cookie).set('If-Match', '"0"');
    expect(edited.status).toBe(403);
    expect(edited.body).toMatchObject({ code: 'NC-EXE-003', rule: 'RN-I01' });
    const archived = await harness
      .post(`/exercises/${goblet}/archive`, undefined, cookie)
      .set('If-Match', '"0"');
    expect(archived.status).toBe(403);
  });

  it('valida la ficha: músculos en una sola lista, repeticiones en orden y variantes que existen', async () => {
    const response = await harness.post(
      '/exercises',
      {
        ...OWN,
        secondaryMuscles: ['QUADRICEPS', 'ALAS'],
        baseRepsMin: 12,
        baseRepsMax: 8,
        alternativeId: id(),
      },
      cookie,
    );

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ code: 'NC-EXE-001', rule: 'RN-F11' });
    expect((response.body as { details: { problems: string[] } }).details.problems).toEqual([
      'QUADRICEPS está dos veces: va en una sola lista.',
      'ALAS no es un grupo muscular.',
      'Las repeticiones mínimas son más que las máximas.',
      'La alternativa no existe.',
    ]);
  });

  it('el enlace del video solo con https (RF-25)', async () => {
    const response = await harness.post(
      '/exercises',
      { ...OWN, mediaUrl: 'javascript:alert(1)' },
      cookie,
    );

    expect(response.status).toBe(400);
  });

  it('una variante de otra organización no existe para esta', async () => {
    const theirs = (
      (await harness.post('/exercises', OWN, other.staff.responsible.cookie)).body as Detail
    ).id;

    const response = await harness.post('/exercises', { ...OWN, easierVariantId: theirs }, cookie);

    expect(response.status).toBe(422);
    expect((response.body as { details: { problems: string[] } }).details.problems).toEqual([
      'La regresión no existe.',
    ]);
  });

  it('se archiva y se restaura: archivado deja de aparecer, pero se puede abrir por su id', async () => {
    const exercise = (
      await harness.post('/exercises', { ...OWN, name: 'Ejercicio para archivar (prueba)' }, cookie)
    ).body as Detail;

    const archived = await harness
      .post(`/exercises/${exercise.id}/archive`, undefined, cookie)
      .set('If-Match', '"0"');
    expect(archived.body).toMatchObject({ status: 'ARCHIVED', version: 1 });
    expect((await search('q=para%20archivar')).map((e) => e.id)).not.toContain(exercise.id);
    expect((await search('q=para%20archivar&status=ARCHIVED')).map((e) => e.id)).toContain(
      exercise.id,
    );
    expect((await detail(exercise.id)).status).toBe('ARCHIVED');

    const restored = await harness
      .post(`/exercises/${exercise.id}/restore`, undefined, cookie)
      .set('If-Match', '"1"');
    expect(restored.body).toMatchObject({ status: 'ACTIVE', version: 2 });
  });

  it('cada escritura queda en la auditoría con los nombres de los campos, nunca los valores (RN-B03)', async () => {
    const exercise = (
      await harness.post('/exercises', { ...OWN, name: 'Ejercicio auditado (prueba)' }, cookie)
    ).body as Detail;
    await harness
      .put(
        `/exercises/${exercise.id}`,
        { ...OWN, name: 'Ejercicio auditado (prueba)', caution: 'Otra precaución' },
        cookie,
      )
      .set('If-Match', '"0"');
    await harness.deliver('audit.events');

    const rows = await owner<{ action: string; fields: string[] | null }>(
      `SELECT action, changed_fields AS fields FROM audit.audit_log
       WHERE resource_type = 'exercise.exercise' AND resource_id = $1 ORDER BY occurred_at`,
      [exercise.id],
    );

    expect(rows.map((r) => r.action)).toEqual(['CREATE', 'UPDATE']);
    expect(rows[1]?.fields).toEqual(['caution_es']);
  });
});

describe('RN-F14 · 07 §5 · la tabla patrón × nivel', () => {
  /** La tabla es de toda la organización: la cambian el dueño y el administrador. */
  const manager = () => org.staff.owner.cookie;

  it('G-32: la de la V3, con 45 filas, en cada organización', async () => {
    const rows = await choices();

    expect(rows).toHaveLength(45);
    expect(choice(rows, 'SQUAT', 'BEGINNER')?.exercise.name).toBe('Sentadilla goblet');
    expect(choice(rows, 'SQUAT', 'INTERMEDIATE')?.exercise.name).toBe('Prensa de piernas');
    expect(choice(rows, 'SQUAT', 'ADVANCED')?.exercise.name).toBe('Sentadilla trasera');
    expect(rows.every((row) => !row.own)).toBe(true);
  });

  it('una organización reemplaza una fila, sin tocar a las demás, y vuelve a la de la V3', async () => {
    const box = await byCode('SQ05');

    const set = await harness.put(
      '/exercise-pattern-choices/SQUAT/BEGINNER',
      { exerciseId: box },
      manager(),
    );
    expect(set.status).toBe(200);
    expect(choice(await choices(), 'SQUAT', 'BEGINNER')).toMatchObject({
      own: true,
      exercise: { name: 'Sentadilla a caja' },
    });
    expect(
      choice(await choices(other.staff.responsible.cookie), 'SQUAT', 'BEGINNER'),
    ).toMatchObject({ own: false, exercise: { name: 'Sentadilla goblet' } });

    const cleared = await harness.delete('/exercise-pattern-choices/SQUAT/BEGINNER', manager());
    expect(cleared.status).toBe(200);
    expect(choice(await choices(), 'SQUAT', 'BEGINNER')).toMatchObject({
      own: false,
      exercise: { name: 'Sentadilla goblet' },
    });
  });

  it('la cambian el dueño y el administrador; un profesional la lee y recibe 403', async () => {
    const path = '/exercise-pattern-choices/SQUAT/ADVANCED';
    const body = { exerciseId: await byCode('SQ01') };
    const professional = org.staff.responsible.cookie;

    expect((await harness.get('/exercise-pattern-choices', professional)).status).toBe(200);
    expect((await harness.put(path, body, professional)).status).toBe(403);
    expect((await harness.delete(path, professional)).status).toBe(403);

    expect((await harness.put(path, body, org.staff.admin.cookie)).status).toBe(200);
    expect((await harness.delete(path, org.staff.admin.cookie)).status).toBe(200);
  });

  it('solo admite un ejercicio de ese patrón: 422 con RN-F14', async () => {
    const response = await harness.put(
      '/exercise-pattern-choices/SQUAT/BEGINNER',
      { exerciseId: await byCode('HG01') },
      manager(),
    );

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ code: 'NC-EXE-005', rule: 'RN-F14' });
  });

  it('un ejercicio propio puede ser la sugerencia de su organización', async () => {
    const own = (
      await harness.post(
        '/exercises',
        {
          name: 'Remo en anillas (prueba)',
          pattern: 'HORIZONTAL_PULL',
          level: 'ADVANCED',
          modality: 'STRENGTH',
          primaryMuscles: ['LATS'],
        },
        cookie,
      )
    ).body as Detail;

    await harness.put(
      '/exercise-pattern-choices/HORIZONTAL_PULL/ADVANCED',
      { exerciseId: own.id },
      manager(),
    );

    expect(choice(await choices(), 'HORIZONTAL_PULL', 'ADVANCED')?.exercise.id).toBe(own.id);
  });

  it('si su ejercicio propio se archiva o cambia de patrón, la fila vuelve sola a la de la V3', async () => {
    const OWN = {
      name: 'Jalón en anillas (prueba)',
      pattern: 'VERTICAL_PULL',
      level: 'ADVANCED',
      modality: 'STRENGTH',
      primaryMuscles: ['LATS'],
    };
    const own = (await harness.post('/exercises', OWN, cookie)).body as Detail;
    const current = async () => choice(await choices(), 'VERTICAL_PULL', 'ADVANCED');
    const v3 = await current();
    expect(v3?.own).toBe(false);
    await harness.put(
      '/exercise-pattern-choices/VERTICAL_PULL/ADVANCED',
      { exerciseId: own.id },
      manager(),
    );
    expect((await current())?.exercise.id).toBe(own.id);

    await harness.post(`/exercises/${own.id}/archive`, undefined, cookie).set('If-Match', '"0"');
    expect(await current()).toEqual(v3);

    // Su fila sigue guardada: al restaurar el ejercicio, vuelve a ser la sugerencia.
    await harness.post(`/exercises/${own.id}/restore`, undefined, cookie).set('If-Match', '"1"');
    expect((await current())?.exercise.id).toBe(own.id);

    await harness
      .put(`/exercises/${own.id}`, { ...OWN, pattern: 'HORIZONTAL_PULL' }, cookie)
      .set('If-Match', '"2"');
    expect(await current()).toEqual(v3);
  });

  it('cambiarla queda en la auditoría con el nombre del campo, nunca el valor (RN-B03)', async () => {
    const fresh = await harness.createStaffOrganization();
    const path = '/exercise-pattern-choices/SQUAT/BEGINNER';
    await harness.put(path, { exerciseId: await byCode('SQ05') }, fresh.staff.owner.cookie);
    await harness.delete(path, fresh.staff.owner.cookie);
    // Ya no hay fila que quitar: nada cambió y no se audita.
    await harness.delete(path, fresh.staff.owner.cookie);
    await harness.deliver('audit.events');

    const rows = await owner<{ action: string; fields: string[] | null }>(
      `SELECT action, changed_fields AS fields FROM audit.audit_log
       WHERE organization_id = $1 AND resource_type = 'exercise.pattern_choice'`,
      [fresh.organizationId],
    );

    expect(rows).toEqual([
      { action: 'UPDATE', fields: ['exercise_id'] },
      { action: 'UPDATE', fields: ['exercise_id'] },
    ]);
  });

  it('una ruta con un patrón o un nivel que no existe responde 400', async () => {
    const response = await harness.put(
      '/exercise-pattern-choices/PUSH/BEGINNER',
      { exerciseId: await byCode('SQ01') },
      manager(),
    );

    expect(response.status).toBe(400);
  });
});

describe('RN-A01 · RN-I01 · la RLS de la biblioteca como app_user', () => {
  const staff = () => ({ orgId: org.organizationId, userId: id(), role: 'OWNER' as const });

  it('una organización no escribe lo global: ni ejercicios, ni músculos, ni la tabla de la V3', async () => {
    const goblet = await byCode('SQ01');

    await withContext('user', staff(), async (client) => {
      expect(
        await errorCode(
          client,
          `INSERT INTO exercise.exercise (id, organization_id, name_es, modality)
           VALUES ($1, NULL, 'Global a mano', 'STRENGTH')`,
          [id()],
        ),
      ).toBe(PG.insufficientPrivilege);
      const updated = await client.query(
        `UPDATE exercise.exercise SET name_es = 'Otro' WHERE id = $1`,
        [goblet],
      );
      expect(updated.rowCount).toBe(0);
      const muscles = await client.query(
        `DELETE FROM exercise.exercise_muscle WHERE exercise_id = $1`,
        [goblet],
      );
      expect(muscles.rowCount).toBe(0);
      const table = await client.query(
        `DELETE FROM exercise.pattern_choice WHERE organization_id IS NULL`,
      );
      expect(table.rowCount).toBe(0);
    });
  });

  it('los catálogos sin organización solo los escribe SYSTEM', async () => {
    await withContext('user', staff(), async (client) => {
      for (const sql of [
        `INSERT INTO exercise.movement_pattern VALUES ('NUEVO', 'Nuevo', 99)`,
        `INSERT INTO exercise.muscle_group VALUES ('NUEVO', 'Nuevo', 'Torso', 99)`,
        `INSERT INTO exercise.equipment VALUES ('NUEVO', 'Nuevo')`,
      ]) {
        expect(await errorCode(client, sql)).toBe(PG.insufficientPrivilege);
      }
    });
  });

  it('el paciente no ve la tabla patrón × nivel, pero sí la biblioteca (RN-F11)', async () => {
    await withContext('user', { ...staff(), role: 'PATIENT', patientId: id() }, async (client) => {
      const table = await client.query(`SELECT 1 FROM exercise.pattern_choice`);
      const library = await client.query(
        `SELECT 1 FROM exercise.exercise WHERE organization_id IS NULL LIMIT 1`,
      );

      expect(table.rowCount).toBe(0);
      expect(library.rowCount).toBe(1);
    });
  });
});

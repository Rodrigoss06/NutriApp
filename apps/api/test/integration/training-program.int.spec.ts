import { readFile } from 'node:fs/promises';
import { programDetailSchema, programListResponseSchema } from '@nutricoach/contracts';
import { ROUTINE_TEMPLATE_VERSION } from '@nutricoach/engine';
import type { UserId } from '@nutricoach/shared-kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CatalogImporter } from '../../src/platform/index.js';
import phasesSeed from '../../../../seeds/training/periodization-v3.json' with { type: 'json' };
import { ApiHarness, type StaffOrganization } from './support/api-harness.js';
import { errorCode, id as uuid, PG, pool, withContext } from './support/database.js';
import { patientWithConsent } from './support/luis.js';

/**
 * RF-26 · RN-F01 a RN-F04 · RN-F12 a RN-F15: el programa de entrenamiento por HTTP contra PostgreSQL como app_user (07 §5 a §8,
 * ADR-070, ADR-077). A mano o como propuesta del método de JV Fitness, publicado con su snapshot, y lo que recibe tracking.
 */

const SEEDS = new URL('../../../../seeds/', import.meta.url);
const harness = new ApiHarness();
let org: StaffOrganization;
let cookie: string;

interface DocumentExercise {
  id: string;
  exerciseId: string;
  name: string;
  position: number;
  movementPattern: string | null;
  suggestedExerciseId: string | null;
  substitutionNote: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  primaryMuscles: { code: string; name: string }[];
  secondaryMuscles: { code: string; name: string }[];
  sets: {
    setNo: number;
    repsMin: number | null;
    repsMax: number | null;
    loadKind: string | null;
    loadValue: number | null;
    restSeconds: number | null;
    tempo: string | null;
  }[];
}
interface DocumentSession {
  id: string;
  position: number;
  name: string;
  setsByMuscle: Record<string, number>;
  exercises: DocumentExercise[];
}
interface DocumentWeek {
  id: string;
  weekNo: number;
  isDeload: boolean;
  phaseEs: string | null;
  phaseGoalEs: string | null;
  volumeFactor: number | null;
  intensity: string | null;
  targetRir: number | null;
  reviewKind: string | null;
  sessions: DocumentSession[];
}
interface Program {
  id: string;
  lineageId: string;
  versionNo: number;
  name: string;
  status: string;
  origin: string;
  startDate: string | null;
  endDate: string | null;
  oneRmFormula: string;
  objective: string | null;
  level: string | null;
  daysPerWeek: number | null;
  split: string | null;
  macrocycleWeeks: number | null;
  periodizationValidFrom: string | null;
  templateVersion: string | null;
  version: number;
  publishProblems: string[];
  document: {
    totalWeeks: number;
    setsMethod: { code: string; version: string };
    mesocycles: { id: string; position: number; name: string; weeks: DocumentWeek[] }[];
  };
}
interface Problem {
  code: string;
  rule?: string;
  details?: { problems?: string[]; status?: string; draftId?: string };
}

const PROFILE = {
  objective: 'HYPERTROPHY',
  level: 'BEGINNER',
  daysPerWeek: 4,
  equipmentCodes: ['FULL_GYM'],
  medicalClearance: 'CLEARED',
  expectedRevision: 0,
};
const NO_ANSWERS = {
  S01: false,
  S02: false,
  S03: false,
  S04: false,
  S05: false,
  S06: false,
  S07: false,
  S08: false,
};
const SET = { repsMin: 8, repsMax: 12, loadKind: 'RIR', loadValue: 2, restSeconds: 90 };
/** La plantilla de sesiones de la hoja PRESCRIPCION (07 §6), escrita aparte de la del motor para compararlas. */
const TEMPLATE_V3 = [
  [
    'SQUAT',
    'HORIZONTAL_PUSH',
    'HORIZONTAL_PULL',
    'HINGE',
    'SHOULDER',
    'CORE_ANTI_EXTENSION',
    'BICEPS',
    'TRICEPS',
  ],
  [
    'HINGE',
    'VERTICAL_PULL',
    'VERTICAL_PUSH',
    'UNILATERAL',
    'HIP_EXTENSION',
    'CORE_ANTI_ROTATION',
    'CALF',
    'CONDITIONING',
  ],
  [
    'SQUAT',
    'HORIZONTAL_PUSH',
    'HORIZONTAL_PULL',
    'HINGE',
    'VERTICAL_PULL',
    'SHOULDER',
    'BICEPS',
    'TRICEPS',
  ],
  [
    'HINGE',
    'UNILATERAL',
    'HIP_EXTENSION',
    'VERTICAL_PUSH',
    'VERTICAL_PULL',
    'CORE_ANTI_EXTENSION',
    'CALF',
    'CONDITIONING',
  ],
] as const;

/** El ejercicio de cada patrón para un principiante, de la tabla de la V3 (07 §5). */
const beginnerExercises = async (): Promise<ReadonlyMap<string, string>> => {
  const csv = await readFile(new URL('exercise/pattern-choice-v3.csv', SEEDS), 'utf8');
  return new Map(
    csv
      .trim()
      .split('\n')
      .slice(1)
      .map((line) => line.split(','))
      .filter(([, level]) => level === 'BEGINNER')
      .map(([pattern = '', , , name = '']) => [pattern, name.trim()]),
  );
};

const owner = async <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  (await pool('owner').query(sql, params)).rows as T[];

const exerciseByCode = async (code: string): Promise<string> => {
  const [row] = await owner<{ id: string }>(
    `SELECT id FROM exercise.exercise WHERE organization_id IS NULL AND code = $1`,
    [code],
  );
  return row?.id ?? '';
};

const newPatient = () =>
  patientWithConsent(harness, org, {
    firstName: 'Paciente',
    lastName: 'Sintético',
    sex: 'F',
    birthDate: '1995-03-02',
  });

/** Con el contrato: lo que responde la API es lo que dice que responde. */
const read = async (id: string, as = cookie): Promise<Program> => {
  const response = await harness.get(`/training-programs/${id}`, as);
  programDetailSchema.parse(response.body);
  return response.body as Program;
};

const weeksOf = (program: Program): DocumentWeek[] =>
  program.document.mesocycles.flatMap((mesocycle) => mesocycle.weeks);

const manual = async (patientId: string, body: object = {}): Promise<Program> => {
  const created = await harness.post(
    `/patients/${patientId}/training-programs`,
    { name: 'Rutina a mano', ...body },
    cookie,
  );
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  return read((created.body as { id: string }).id);
};

const addMesocycle = async (program: Program, weeks = 4): Promise<Program> => {
  const added = await harness
    .post(`/training-programs/${program.id}/mesocycles`, { name: 'Base', weeks }, cookie)
    .set('If-Match', String(program.version));
  expect(added.status, JSON.stringify(added.body)).toBe(201);
  return added.body as Program;
};

const sessionOf = (name: string, exerciseId: string, set: object = SET) => ({
  name,
  exercises: [{ exerciseId, sets: [set, set, set] }],
});

const saveWeek = (program: Program, weekId: string, body: object) =>
  harness
    .put(`/training-programs/${program.id}/weeks/${weekId}`, body, cookie)
    .set('If-Match', String(program.version));

const duplicate = (program: Program, weekId: string, targetWeekIds: string[]) =>
  harness
    .post(`/training-programs/${program.id}/weeks/${weekId}/duplicate`, { targetWeekIds }, cookie)
    .set('If-Match', String(program.version));

const publish = (program: Program) =>
  harness
    .post(`/training-programs/${program.id}/publish`, undefined, cookie)
    .set('If-Match', String(program.version));

const approve = (program: Program, body: object) =>
  harness
    .post(`/training-programs/${program.id}/blocks/approve`, body, cookie)
    .set('If-Match', String(program.version));

/** Un programa de 1 mesociclo de 4 semanas con 3 sesiones en la semana 1, duplicada en las demás (criterio de P12). */
const readyManual = async (patientId: string, body: object = {}): Promise<Program> => {
  const squat = await exerciseByCode('SQ01');
  let program = await addMesocycle(await manual(patientId, body));
  const [first, ...others] = weeksOf(program);
  const saved = await saveWeek(program, first?.id ?? '', {
    sessions: [
      sessionOf('Sesión 1', squat),
      sessionOf('Sesión 2', squat),
      sessionOf('Sesión 3', squat),
    ],
  });
  expect(saved.status, JSON.stringify(saved.body)).toBe(200);
  program = saved.body as Program;
  const copied = await duplicate(
    program,
    first?.id ?? '',
    others.map((week) => week.id),
  );
  expect(copied.status, JSON.stringify(copied.body)).toBe(200);
  return copied.body as Program;
};

/** Las llaves abiertas: perfil con alta y cribado en verde. */
const withOpenKeys = async (patientId: string, profile: object = {}): Promise<void> => {
  const saved = await harness.put(
    `/patients/${patientId}/athlete-profile`,
    { ...PROFILE, ...profile },
    cookie,
  );
  expect(saved.status, JSON.stringify(saved.body)).toBe(200);
  const answered = await harness.post(
    `/patients/${patientId}/screenings`,
    { answers: NO_ANSWERS },
    cookie,
  );
  expect(answered.status).toBe(201);
};

const propose = (patientId: string, body: object = {}) =>
  harness.post(`/patients/${patientId}/training-programs/proposal`, body, cookie);

const proposal = async (patientId: string): Promise<Program> => {
  const created = await propose(patientId);
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  return read((created.body as { id: string }).id);
};

const approveAll = async (program: Program): Promise<Program> => {
  let current = program;
  for (const session of weeksOf(program)[0]?.sessions ?? []) {
    for (const exercise of session.exercises) {
      const approved = await approve(current, { day: session.position, order: exercise.position });
      expect(approved.status, JSON.stringify(approved.body)).toBe(200);
      current = approved.body as Program;
    }
  }
  return current;
};

beforeAll(async () => {
  await harness.start();
  org = await harness.createStaffOrganization();
  cookie = org.staff.responsible.cookie;
  // Con dos líneas en blanco al final: otro hash, así este lote se aplica aunque otra prueba ya cargó el archivo.
  const importer = harness.app.get(CatalogImporter);
  for (const [kind, file] of [
    ['EXERCISE_LIBRARY', 'exercise/ejercicios-base.csv'],
    ['EXERCISE_PATTERN_CHOICES', 'exercise/pattern-choice-v3.csv'],
  ] as const) {
    const report = await importer.run({
      kind,
      fileName: file,
      content: Buffer.concat([await readFile(new URL(file, SEEDS)), Buffer.from('\n\n')]),
      organizationId: null,
      startedBy: uuid() as UserId,
    });
    expect(['COMPLETED', 'DUPLICATE']).toContain(report.status);
  }
});

afterAll(async () => {
  await harness.stop();
});

describe('RF-26 · el programa a mano', () => {
  it('criterio de P12: un mesociclo de 4 semanas con 3 sesiones se arma, se duplica la semana 1 y se publica', async () => {
    const patientId = await newPatient();

    const program = await readyManual(patientId);

    expect(program.document.totalWeeks).toBe(4);
    expect(weeksOf(program).map((week) => week.weekNo)).toEqual([1, 2, 3, 4]);
    expect(weeksOf(program).map((week) => week.sessions.length)).toEqual([3, 3, 3, 3]);
    expect(program.publishProblems).toEqual([]);

    const published = await publish(program);
    expect(published.status, JSON.stringify(published.body)).toBe(200);
    expect(published.body).toMatchObject({ status: 'PUBLISHED', origin: 'MANUAL' });
  });

  it('RN-F12: una semana vacía no se publica, y dice cuál', async () => {
    const patientId = await newPatient();
    const squat = await exerciseByCode('SQ01');
    const program = await addMesocycle(await manual(patientId), 2);
    const [first] = weeksOf(program);
    const saved = await saveWeek(program, first?.id ?? '', {
      sessions: [sessionOf('Sesión 1', squat)],
    });

    const blocked = await publish(saved.body as Program);

    expect(blocked.status).toBe(422);
    expect(blocked.body as Problem).toMatchObject({
      code: 'NC-TRA-008',
      rule: 'RN-F12',
      details: { problems: ['La semana 2 no tiene sesiones.'] },
    });
  });

  it('sin mesociclos no se publica; duplicar sin sesiones o hacia sí misma se rechaza', async () => {
    const patientId = await newPatient();
    const empty = await manual(patientId);
    expect((await publish(empty)).status).toBe(422);

    const program = await addMesocycle(empty, 2);
    const [first, second] = weeksOf(program);
    const noSessions = await duplicate(program, first?.id ?? '', [second?.id ?? '']);
    expect(noSessions.status).toBe(422);
    expect((noSessions.body as Problem).code).toBe('NC-TRA-009');

    const squat = await exerciseByCode('SQ01');
    const saved = await saveWeek(program, first?.id ?? '', {
      sessions: [sessionOf('Sesión 1', squat)],
    });
    const itself = await duplicate(saved.body as Program, first?.id ?? '', [first?.id ?? '']);
    expect(itself.status).toBe(404);
    expect((itself.body as Problem).code).toBe('NC-TRA-010');
  });

  it('02 §7: los mesociclos son contiguos, también al quitar uno', async () => {
    const patientId = await newPatient();
    let program = await addMesocycle(await manual(patientId), 2);
    program = await addMesocycle(program, 3);
    expect(weeksOf(program).map((week) => week.weekNo)).toEqual([1, 2, 3, 4, 5]);

    const removed = await harness
      .delete(
        `/training-programs/${program.id}/mesocycles/${program.document.mesocycles[0]?.id ?? ''}`,
        cookie,
      )
      .set('If-Match', String(program.version));
    expect(removed.status, JSON.stringify(removed.body)).toBe(200);
    const after = removed.body as Program;

    expect(after.document.mesocycles.map((m) => m.position)).toEqual([1]);
    expect(weeksOf(after).map((week) => week.weekNo)).toEqual([1, 2, 3]);
  });

  it('02 §7: valida las series, los ejercicios y la versión leída', async () => {
    const patientId = await newPatient();
    const squat = await exerciseByCode('SQ01');
    const program = await addMesocycle(await manual(patientId), 1);
    const weekId = weeksOf(program)[0]?.id ?? '';

    const reversed = await saveWeek(program, weekId, {
      sessions: [sessionOf('Sesión 1', squat, { repsMin: 12, repsMax: 8 })],
    });
    expect(reversed.status).toBe(422);
    expect(reversed.body as Problem).toMatchObject({
      code: 'NC-TRA-009',
      details: {
        problems: expect.arrayContaining([
          'Sesión 1, ejercicio 1, serie 1: las repeticiones mínimas son mayores que las máximas.',
        ]) as string[],
      },
    });

    const unknown = await saveWeek(program, weekId, {
      sessions: [sessionOf('Sesión 1', uuid())],
    });
    expect(unknown.status).toBe(422);
    expect((unknown.body as Problem).code).toBe('NC-TRA-017');

    const otherWeek = await saveWeek(program, uuid(), { sessions: [] });
    expect(otherWeek.status).toBe(404);

    expect((await saveWeek(program, weekId, { sessions: [] })).status).toBe(200);
    const stale = await saveWeek(program, weekId, { sessions: [] });
    expect(stale.status).toBe(409);
    expect((stale.body as Problem).code).toBe('NC-TRA-005');

    const noVersion = await harness.put(
      `/training-programs/${program.id}/weeks/${weekId}`,
      { sessions: [] },
      cookie,
    );
    expect(noVersion.status).toBe(428);
  });

  it('RN-F10: el cardio va en duración con sus MET; carga en kg, % de 1RM, RPE y peso corporal', async () => {
    const patientId = await newPatient();
    const squat = await exerciseByCode('SQ01');
    const program = await addMesocycle(await manual(patientId), 1);

    const saved = await saveWeek(program, weeksOf(program)[0]?.id ?? '', {
      phaseEs: 'Base',
      isDeload: true,
      sessions: [
        {
          name: 'Mixta',
          dayOfWeek: 3,
          exercises: [
            {
              exerciseId: squat,
              sets: [
                { repsMin: 5, repsMax: 5, loadKind: 'KG', loadValue: 62.5, tempo: '3-1-1' },
                { repsMin: 5, repsMax: 5, loadKind: 'PCT_1RM', loadValue: 80 },
                { repsMin: 5, repsMax: 5, loadKind: 'RPE', loadValue: 8 },
                { repsMin: 10, repsMax: 10, loadKind: 'BODYWEIGHT' },
                { durationSeconds: 1_200, met: 7.5 },
              ],
            },
          ],
        },
      ],
    });

    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    const week = weeksOf(saved.body as Program)[0];
    expect(week).toMatchObject({ phaseEs: 'Base', isDeload: true });
    expect(week?.sessions[0]).toMatchObject({ name: 'Mixta', dayOfWeek: 3 });
    expect(week?.sessions[0]?.exercises[0]?.sets).toMatchObject([
      { setNo: 1, loadKind: 'KG', loadValue: 62.5, tempo: '3-1-1' },
      { setNo: 2, loadKind: 'PCT_1RM', loadValue: 80 },
      { setNo: 3, loadKind: 'RPE', loadValue: 8 },
      { setNo: 4, loadKind: 'BODYWEIGHT', loadValue: null },
      { setNo: 5, durationSeconds: 1_200, met: 7.5, repsMin: null },
    ]);
  });

  it('RN-F06: cada sesión da sus series por músculo, con su método; el calentamiento no cuenta', async () => {
    const patientId = await newPatient();
    const squat = await exerciseByCode('SQ01');
    const program = await addMesocycle(await manual(patientId), 1);

    const saved = await saveWeek(program, weeksOf(program)[0]?.id ?? '', {
      sessions: [
        {
          name: 'Piernas',
          exercises: [
            {
              exerciseId: squat,
              sets: [{ setType: 'WARMUP', repsMin: 10, repsMax: 10 }, SET, SET],
            },
          ],
        },
      ],
    });

    const detail = saved.body as Program;
    const exercise = weeksOf(detail)[0]?.sessions[0]?.exercises[0];
    const primary = exercise?.primaryMuscles[0]?.code ?? '';
    expect(primary).not.toBe('');
    expect(weeksOf(detail)[0]?.sessions[0]?.setsByMuscle[primary]).toBe(2);
    expect(detail.document.setsMethod).toMatchObject({ code: 'FRACTIONAL_SETS' });
  });
});

describe('RN-F04 · la fórmula de 1RM del paciente', () => {
  it('Epley por defecto, y siempre la misma: el segundo programa la hereda y no se cambia', async () => {
    const patientId = await newPatient();
    const first = await manual(patientId);
    expect(first.oneRmFormula).toBe('ONERM_EPLEY1985');

    const second = await manual(patientId);
    expect(second.oneRmFormula).toBe('ONERM_EPLEY1985');

    const other = await harness.post(
      `/patients/${patientId}/training-programs`,
      { name: 'Otra', oneRmFormula: 'ONERM_BRZYCKI1993' },
      cookie,
    );
    expect(other.status).toBe(422);
    expect(other.body as Problem).toMatchObject({ code: 'NC-TRA-016', rule: 'RN-F04' });

    const changed = await harness
      .patch(`/training-programs/${second.id}`, { oneRmFormula: 'ONERM_BRZYCKI1993' }, cookie)
      .set('If-Match', String(second.version));
    expect(changed.status).toBe(422);
  });

  it('Brzycki si se elige en el primero; se puede cambiar mientras sea el único', async () => {
    const patientId = await newPatient();
    const program = await manual(patientId, { oneRmFormula: 'ONERM_BRZYCKI1993' });
    expect(program.oneRmFormula).toBe('ONERM_BRZYCKI1993');
    expect((await manual(patientId)).oneRmFormula).toBe('ONERM_BRZYCKI1993');

    const alone = await manual(await newPatient());
    const changed = await harness
      .patch(
        `/training-programs/${alone.id}`,
        { oneRmFormula: 'ONERM_BRZYCKI1993', name: 'Renombrada', goal: 'Volver a correr' },
        cookie,
      )
      .set('If-Match', String(alone.version));
    expect(changed.status, JSON.stringify(changed.body)).toBe(200);
    expect(changed.body).toMatchObject({
      oneRmFormula: 'ONERM_BRZYCKI1993',
      name: 'Renombrada',
      goal: 'Volver a correr',
    });
  });
});

describe('RN-F15 · RN-F14 · la propuesta', () => {
  it('sin perfil no hay propuesta; con una llave cerrada, tampoco, y dice cuál', async () => {
    const patientId = await newPatient();
    const noProfile = await propose(patientId);
    expect(noProfile.status).toBe(422);
    expect(noProfile.body as Problem).toMatchObject({ code: 'NC-TRA-007', rule: 'RN-F14' });

    const pending = await harness.put(
      `/patients/${patientId}/athlete-profile`,
      { ...PROFILE, medicalClearance: 'PENDING' },
      cookie,
    );
    expect(pending.status).toBe(200);
    const clearance = await propose(patientId);
    expect(clearance.status).toBe(422);
    expect(clearance.body as Problem).toMatchObject({
      code: 'NC-TRA-006',
      rule: 'RN-F15',
      details: { status: 'BLOCKED_CLEARANCE' },
    });

    await harness.put(
      `/patients/${patientId}/athlete-profile`,
      { ...PROFILE, expectedRevision: 1 },
      cookie,
    );
    const screening = await propose(patientId);
    expect((screening.body as Problem).details?.status).toBe('BLOCKED_SCREENING');

    const red = await harness.post(
      `/patients/${patientId}/screenings`,
      { answers: { ...NO_ANSWERS, S01: true } },
      cookie,
    );
    const unreviewed = await propose(patientId);
    expect((unreviewed.body as Problem).details?.status).toBe('BLOCKED_SCREENING');

    await harness.post(
      `/patients/${patientId}/screenings/${(red.body as { id: string }).id}/review`,
      { decision: 'REFER', note: 'A su médico.' },
      cookie,
    );
    const referred = await propose(patientId);
    expect((referred.body as Problem).details?.status).toBe('BLOCKED_REFERRED');
  });

  it('una prueba postural con dolor tampoco deja proponer', async () => {
    const patientId = await newPatient();
    await withOpenKeys(patientId);
    const created = await harness.post(
      `/patients/${patientId}/functional-evaluations`,
      { kind: 'MOVEMENT', measuredAt: '2026-10-20T14:00:00.000Z' },
      cookie,
    );
    const evaluationId = (created.body as { id: string }).id;
    const pain = await harness
      .put(`/functional-evaluations/${evaluationId}/movement/PLANK`, { pain: true }, cookie)
      .set('If-Match', '0');
    expect(pain.status).toBe(200);

    const blocked = await propose(patientId);

    expect((blocked.body as Problem).details?.status).toBe('BLOCKED_PAIN');
  });

  it('criterio de P12: 4 días de un principiante de hipertrofia, como la hoja PRESCRIPCION y la tabla de fases', async () => {
    const patientId = await newPatient();
    await withOpenKeys(patientId);

    const program = await proposal(patientId);

    expect(program).toMatchObject({
      status: 'DRAFT',
      origin: 'PROPOSAL',
      name: 'Macrociclo de hipertrofia',
      objective: 'HYPERTROPHY',
      level: 'BEGINNER',
      daysPerWeek: 4,
      split: 'UPPER_LOWER',
      macrocycleWeeks: 12,
      periodizationValidFrom: phasesSeed.validFrom,
      templateVersion: ROUTINE_TEMPLATE_VERSION,
    });
    // La semana 3 tiene factor 1: los valores base de la plantilla, con el RIR de su semana (ADR-070).
    const week3 = weeksOf(program)[2];
    expect(week3?.sessions.map((session) => session.name)).toEqual([
      'Superior',
      'Inferior',
      'Superior',
      'Inferior',
    ]);
    // Los 32 bloques: el patrón de la plantilla, el ejercicio de la tabla y nada aprobado (07 §5 y §6).
    const exercises = await beginnerExercises();
    expect(
      week3?.sessions.map((session) => session.exercises.map((e) => e.movementPattern)),
    ).toEqual(TEMPLATE_V3);
    expect(week3?.sessions.map((session) => session.exercises.map((e) => e.name))).toEqual(
      TEMPLATE_V3.map((day) => day.map((pattern) => exercises.get(pattern))),
    );
    expect(week3?.sessions.flatMap((session) => session.exercises)).toHaveLength(32);
    expect(
      week3?.sessions.flatMap((session) => session.exercises.map((e) => e.approvedAt)),
    ).toEqual(Array.from({ length: 32 }, () => null));
    expect(week3?.sessions[0]?.exercises[0]?.name).toBe('Sentadilla goblet');
    // Cada bloque con sus valores base, no solo el primero.
    for (const exercise of week3?.sessions.flatMap((session) => session.exercises) ?? []) {
      expect(exercise.sets).toHaveLength(3);
      expect(exercise.sets[0]).toMatchObject({ repsMin: 8, repsMax: 12, restSeconds: 90 });
    }
    expect(week3?.sessions[0]?.exercises[0]?.sets).toHaveLength(3);
    expect(week3?.sessions[0]?.exercises[0]?.sets[0]).toMatchObject({
      repsMin: 8,
      repsMax: 12,
      loadKind: 'RIR',
      loadValue: 2,
      restSeconds: 90,
      tempo: '2-1-2',
    });
    expect(weeksOf(program)[3]).toMatchObject({
      weekNo: 4,
      phaseEs: 'Hipertrofia',
      phaseGoalEs: 'Sobrecarga',
      volumeFactor: 1.1,
      intensity: 'MODERATE_HIGH',
      targetRir: 1,
      reviewKind: 'CONTROL',
    });
    expect(weeksOf(program)[3]?.sessions[0]?.exercises[0]?.sets[0]?.loadValue).toBe(1);
  });

  it('RN-F13: el macrociclo corta la tabla en sus semanas, con mesociclos que terminan en descarga', async () => {
    const patientId = await newPatient();
    await withOpenKeys(patientId, { objective: 'STRENGTH', macrocycleWeeks: 10, daysPerWeek: 3 });

    const program = await proposal(patientId);

    expect(program.document.totalWeeks).toBe(10);
    expect(program.split).toBe('FULL_BODY_ABC');
    expect(weeksOf(program).at(-1)).toMatchObject({
      weekNo: 10,
      phaseEs: 'Puesta a punto',
      volumeFactor: 0.65,
      targetRir: 1,
    });
    expect(program.document.mesocycles.map((m) => m.weeks.map((w) => w.weekNo))).toEqual([
      [1, 2, 3, 4, 5],
      [6, 7, 8, 9],
      [10],
    ]);
    expect(weeksOf(program)[4]).toMatchObject({ isDeload: true, phaseEs: 'Descarga' });
    // P-06: series de la semana = series base × factor, redondeado, con mínimo 1 (0.70 × 3 = 2.1).
    expect(weeksOf(program)[0]?.sessions[0]?.exercises[0]?.sets).toHaveLength(2);
    expect(weeksOf(program)[0]?.sessions[0]?.exercises[0]?.sets[0]?.loadValue).toBe(4);
  });

  it('criterio de P12: se publica solo aprobada; el coach aprueba o sustituye cada bloque, en todas las semanas', async () => {
    const patientId = await newPatient();
    await withOpenKeys(patientId, { daysPerWeek: 2, macrocycleWeeks: 8 });
    const program = await proposal(patientId);
    expect(program.publishProblems).toEqual(['Faltan 16 ejercicios por aprobar.']);

    const notApproved = await publish(program);
    expect(notApproved.status).toBe(422);
    expect(notApproved.body as Problem).toMatchObject({
      code: 'NC-TRA-008',
      details: { problems: ['Faltan 16 ejercicios por aprobar.'] },
    });

    const press = await exerciseByCode('SQ01');
    const substituted = await approve(program, {
      day: 1,
      order: 2,
      exerciseId: press,
      note: 'Molestia en el hombro con el press.',
    });
    expect(substituted.status, JSON.stringify(substituted.body)).toBe(200);
    const after = substituted.body as Program;
    for (const week of weeksOf(after)) {
      const block = week.sessions[0]?.exercises[1];
      expect(block).toMatchObject({
        exerciseId: press,
        movementPattern: 'HORIZONTAL_PUSH',
        substitutionNote: 'Molestia en el hombro con el press.',
        approvedBy: org.staff.responsible.memberId,
      });
      expect(block?.suggestedExerciseId).not.toBe(press);
      expect(block?.sets.length).toBeGreaterThan(0);
    }
    expect(after.publishProblems).toEqual(['Faltan 15 ejercicios por aprobar.']);

    const missing = await approve(after, { day: 9, order: 1 });
    expect(missing.status).toBe(404);
    expect((missing.body as Problem).code).toBe('NC-TRA-015');
    const unknown = await approve(after, { day: 1, order: 1, exerciseId: uuid() });
    expect((unknown.body as Problem).code).toBe('NC-TRA-017');

    const ready = await approveAll(after);
    expect(ready.publishProblems).toEqual([]);
    const published = await publish(ready);
    expect(published.status, JSON.stringify(published.body)).toBe(200);
  });

  it('RN-F14: editar un bloque aprobado con otro ejercicio pide aprobarlo de nuevo', async () => {
    const patientId = await newPatient();
    await withOpenKeys(patientId, { daysPerWeek: 2, macrocycleWeeks: 8 });
    const approved = await approveAll(await proposal(patientId));
    const week = weeksOf(approved)[0];
    const [first, ...rest] = week?.sessions[0]?.exercises ?? [];
    const rowsOf = (exercises: DocumentExercise[]) =>
      exercises.map((exercise) => ({
        id: exercise.id,
        exerciseId: exercise.exerciseId,
        sets: exercise.sets.map((set) => ({ repsMin: set.repsMin, repsMax: set.repsMax })),
      }));
    const sessions = (week?.sessions ?? []).map((session, index) => ({
      name: session.name,
      exercises:
        index === 0
          ? [
              { ...rowsOf(first ? [first] : [])[0], exerciseId: rest[0]?.exerciseId },
              ...rowsOf(rest),
            ]
          : rowsOf(session.exercises),
    }));

    const saved = await saveWeek(approved, week?.id ?? '', { sessions });

    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    const after = saved.body as Program;
    expect(weeksOf(after)[0]?.sessions[0]?.exercises[0]).toMatchObject({
      id: first?.id,
      approvedAt: null,
      movementPattern: first?.movementPattern,
    });
    expect(weeksOf(after)[0]?.sessions[0]?.exercises[1]?.approvedAt).not.toBeNull();
    expect(after.publishProblems).toEqual(['Falta 1 ejercicio por aprobar.']);
  });

  it('RN-F15: si una llave se cierra después, la propuesta no se publica; a mano sí, y queda dicho', async () => {
    const patientId = await newPatient();
    await withOpenKeys(patientId, { daysPerWeek: 2, macrocycleWeeks: 8 });
    const ready = await approveAll(await proposal(patientId));
    await harness.put(
      `/patients/${patientId}/athlete-profile`,
      {
        ...PROFILE,
        daysPerWeek: 2,
        macrocycleWeeks: 8,
        medicalClearance: 'PENDING',
        expectedRevision: 1,
      },
      cookie,
    );

    const blocked = await publish(ready);
    expect(blocked.status).toBe(422);
    expect(blocked.body as Problem).toMatchObject({
      code: 'NC-TRA-006',
      details: { status: 'BLOCKED_CLEARANCE' },
    });
    expect((await read(ready.id)).publishProblems[0]).toContain('llave de seguridad');

    const byHand = await readyManual(patientId);
    const published = await publish(byHand);
    expect(published.status, JSON.stringify(published.body)).toBe(200);
    await harness.deliver('audit.events');
    const [event] = await owner<{ payload: { closedKey: boolean } }>(
      `SELECT payload FROM platform.outbox_event WHERE aggregate_id = $1 AND event_type = 'training.program.published'`,
      [byHand.id],
    );
    expect(event?.payload.closedKey).toBe(true);
  });

  it('la estructura de una propuesta no se toca a mano; aprobar es solo de la propuesta', async () => {
    const patientId = await newPatient();
    await withOpenKeys(patientId, { daysPerWeek: 2, macrocycleWeeks: 8 });
    const program = await proposal(patientId);

    const added = await harness
      .post(`/training-programs/${program.id}/mesocycles`, { name: 'Otro', weeks: 1 }, cookie)
      .set('If-Match', String(program.version));
    expect(added.status).toBe(409);
    expect((added.body as Problem).code).toBe('NC-TRA-013');

    const removed = await harness
      .delete(
        `/training-programs/${program.id}/mesocycles/${program.document.mesocycles[0]?.id ?? ''}`,
        cookie,
      )
      .set('If-Match', String(program.version));
    expect(removed.status).toBe(409);

    const byHand = await manual(patientId);
    const approval = await approve(byHand, { day: 1, order: 1 });
    expect(approval.status).toBe(409);
    expect((approval.body as Problem).code).toBe('NC-TRA-014');
  });
});

describe('RN-F13 · la tabla de fases', () => {
  it('la de la migración es la de la semilla', async () => {
    const rows = await owner<{
      objective: string;
      week_no: number;
      phase_es: string;
      phase_goal_es: string;
      volume_factor: string;
      intensity: string;
      target_rir: number;
      is_deload: boolean;
      review_kind: string;
    }>(
      `SELECT objective, week_no, phase_es, phase_goal_es, volume_factor, intensity, target_rir, is_deload, review_kind
       FROM training.periodization_phase WHERE organization_id IS NULL AND valid_from = $1`,
      [phasesSeed.validFrom],
    );
    const sortKey = (objective: string, week: number) =>
      `${objective}:${String(week).padStart(2, '0')}`;
    const fromDb = rows
      .map((row) => ({
        objective: row.objective,
        weekNo: row.week_no,
        phaseEs: row.phase_es,
        phaseGoalEs: row.phase_goal_es,
        volumeFactor: Number(row.volume_factor),
        intensity: row.intensity,
        targetRir: row.target_rir,
        isDeload: row.is_deload,
        reviewKind: row.review_kind,
      }))
      .sort((a, b) => sortKey(a.objective, a.weekNo).localeCompare(sortKey(b.objective, b.weekNo)));
    const fromSeed = [...phasesSeed.phases].sort((a, b) =>
      sortKey(a.objective, a.weekNo).localeCompare(sortKey(b.objective, b.weekNo)),
    );

    expect(fromDb).toHaveLength(48);
    expect(fromDb).toEqual(fromSeed);
  });

  it('criterio de P12: un programa guarda la versión que usó; publicar una tabla nueva no lo cambia, y la siguiente propuesta la usa', async () => {
    const patientId = await newPatient();
    await withOpenKeys(patientId, { daysPerWeek: 2, macrocycleWeeks: 8 });
    const before = await proposal(patientId);
    expect(before.periodizationValidFrom).toBe(phasesSeed.validFrom);

    // Una versión nueva de la tabla, solo para esta organización, para no cambiar las demás pruebas.
    const validFrom = '2026-10-20';
    await pool('owner').query(
      `INSERT INTO training.periodization_phase
         (id, organization_id, objective, valid_from, week_no, phase_es, phase_goal_es, volume_factor, intensity,
          target_rir, is_deload, review_kind)
       SELECT gen_random_uuid(), $1, objective, $2::date, week_no, phase_es || ' nueva', phase_goal_es, volume_factor,
              intensity, target_rir, is_deload, review_kind
       FROM training.periodization_phase
       WHERE organization_id IS NULL AND objective = 'HYPERTROPHY'`,
      [org.organizationId, validFrom],
    );

    expect(await read(before.id)).toMatchObject({ periodizationValidFrom: phasesSeed.validFrom });
    expect(weeksOf(await read(before.id))[0]?.phaseEs).toBe('Adaptación');

    const after = await proposal(patientId);
    expect(after.periodizationValidFrom).toBe(validFrom);
    expect(weeksOf(after)[0]?.phaseEs).toBe('Adaptación nueva');
    await pool('owner').query(
      `DELETE FROM training.periodization_phase WHERE organization_id = $1`,
      [org.organizationId],
    );
  });
});

describe('RN-F12 · publicar', () => {
  it('congela el snapshot con su hash, con fechas y músculos, aunque después se edite la biblioteca', async () => {
    const patientId = await newPatient();
    const created = await harness.post(
      '/exercises',
      {
        name: 'Ejercicio propio para congelar',
        pattern: 'SQUAT',
        level: 'BEGINNER',
        modality: 'STRENGTH',
        primaryMuscles: ['QUADRICEPS'],
        secondaryMuscles: ['GLUTES'],
      },
      cookie,
    );
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const own = created.body as { id: string; version: number };
    let program = await addMesocycle(await manual(patientId, { startDate: '2026-11-02' }), 1);
    const saved = await saveWeek(program, weeksOf(program)[0]?.id ?? '', {
      sessions: [sessionOf('Sesión 1', own.id)],
    });
    program = saved.body as Program;

    const published = await publish(program);
    expect(published.status, JSON.stringify(published.body)).toBe(200);
    expect(published.body).toMatchObject({
      status: 'PUBLISHED',
      startDate: '2026-11-02',
      endDate: '2026-11-08',
    });
    const [row] = await owner<{
      snapshot_schema_version: number;
      hash: string;
      snapshot: { engineVersion: string; programId: string };
    }>(
      `SELECT snapshot_schema_version, encode(snapshot_hash, 'hex') AS hash, snapshot
       FROM training.program WHERE id = $1`,
      [program.id],
    );
    expect(row?.snapshot_schema_version).toBe(1);
    expect(row?.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row?.snapshot.programId).toBe(program.id);
    expect(row?.snapshot.engineVersion).toEqual(expect.any(String));

    const edited = await harness
      .put(
        `/exercises/${own.id}`,
        {
          name: 'Nombre cambiado',
          pattern: 'SQUAT',
          level: 'BEGINNER',
          modality: 'STRENGTH',
          primaryMuscles: ['HAMSTRINGS'],
          secondaryMuscles: [],
        },
        cookie,
      )
      .set('If-Match', String(own.version));
    expect(edited.status, JSON.stringify(edited.body)).toBe(200);

    const after = await read(program.id);
    const frozen = weeksOf(after)[0]?.sessions[0]?.exercises[0];
    expect(frozen?.name).toBe('Ejercicio propio para congelar');
    expect(frozen?.primaryMuscles.map((muscle) => muscle.code)).toEqual(['QUADRICEPS']);
    expect(frozen?.secondaryMuscles.map((muscle) => muscle.code)).toEqual(['GLUTES']);
  });

  it('publicado no cambia por la API ni por la base; una versión nueva parte de él, una sola a la vez', async () => {
    const patientId = await newPatient();
    const squat = await exerciseByCode('SQ01');
    const program = await readyManual(patientId);
    const published = (await publish(program)).body as Program;
    const weekId = weeksOf(published)[0]?.id ?? '';

    const edited = await saveWeek(published, weekId, { sessions: [] });
    expect(edited.status).toBe(409);
    expect(edited.body as Problem).toMatchObject({ code: 'NC-TRA-004', rule: 'RN-F12' });

    const context = {
      orgId: org.organizationId,
      userId: org.staff.responsible.userId,
      role: 'PROFESSIONAL' as const,
      memberId: org.staff.responsible.memberId,
    };
    await withContext('user', context, async (client) => {
      expect(
        await errorCode(client, `UPDATE training.program SET name = 'x' WHERE id = $1`, [
          program.id,
        ]),
      ).toBe(PG.integrityViolation);
      expect(
        await errorCode(client, `DELETE FROM training.session WHERE week_id = $1`, [weekId]),
      ).toBe(PG.integrityViolation);
      expect(
        await errorCode(
          client,
          `UPDATE training.prescribed_set SET rest_seconds = 1
           WHERE prescribed_exercise_id IN (SELECT e.id FROM training.prescribed_exercise e
             JOIN training.session s ON s.id = e.session_id WHERE s.week_id = $1)`,
          [weekId],
        ),
      ).toBe(PG.integrityViolation);
    });

    const revised = await harness.post(
      `/training-programs/${program.id}/revise`,
      undefined,
      cookie,
    );
    expect(revised.status, JSON.stringify(revised.body)).toBe(201);
    const draft = await read((revised.body as { id: string }).id);
    expect(draft).toMatchObject({
      status: 'DRAFT',
      versionNo: 2,
      lineageId: program.lineageId,
      version: 0,
    });
    expect(weeksOf(draft).map((week) => week.sessions.length)).toEqual([3, 3, 3, 3]);
    expect(weeksOf(draft)[0]?.id).not.toBe(weekId);

    const twice = await harness.post(`/training-programs/${program.id}/revise`, undefined, cookie);
    expect(twice.status).toBe(409);
    expect(twice.body as Problem).toMatchObject({
      code: 'NC-TRA-012',
      details: { draftId: draft.id },
    });

    // Editar la versión nueva no toca la publicada.
    const changed = await saveWeek(draft, weeksOf(draft)[0]?.id ?? '', {
      sessions: [sessionOf('Sólo una', squat)],
    });
    expect(changed.status).toBe(200);
    expect(weeksOf(await read(program.id))[0]?.sessions).toHaveLength(3);

    const next = await publish(changed.body as Program);
    expect(next.status, JSON.stringify(next.body)).toBe(200);
    expect(await read(program.id)).toMatchObject({ status: 'SUPERSEDED' });
    expect(await read(draft.id)).toMatchObject({ status: 'PUBLISHED', versionNo: 2 });

    const list = await harness.get(`/patients/${patientId}/training-programs`, cookie);
    programListResponseSchema.parse(list.body);
    expect((list.body as { programs: Program[] }).programs.map((p) => p.status)).toEqual([
      'PUBLISHED',
      'SUPERSEDED',
    ]);
  });

  it('un paciente tiene un solo programa publicado, también de otra rutina', async () => {
    const patientId = await newPatient();
    const first = await readyManual(patientId);
    await publish(first);
    const second = await readyManual(patientId);
    expect((await publish(second)).status).toBe(200);

    expect(await read(first.id)).toMatchObject({ status: 'SUPERSEDED' });
    expect(await read(second.id)).toMatchObject({ status: 'PUBLISHED' });
  });
});

describe('RN-G03 · lo que recibe tracking', () => {
  it('la copia del programa y la meta de entrenamiento del día; reentregar no cambia nada', async () => {
    const patientId = await newPatient();
    // La fecha local del paciente (RN-G04): en Lima, a veces todavía es ayer en UTC.
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
    const program = await readyManual(patientId, { startDate: today });
    expect((await publish(program)).status).toBe(200);

    await harness.deliver('tracking.programs');
    await harness.deliver('tracking.programs');

    const [view] = await owner<{
      training_program_id: string;
      effective_from: Date;
      name: string;
      muscles: unknown;
    }>(
      `SELECT training_program_id, effective_from, training_snapshot->>'name' AS name,
              training_snapshot#>'{mesocycles,0,weeks,0,sessions,0,exercises,0,primaryMuscles}' AS muscles
       FROM tracking.active_plan_view WHERE patient_id = $1`,
      [patientId],
    );
    expect(view?.training_program_id).toBe(program.id);
    expect(view?.name).toBe('Rutina a mano');
    expect(view?.muscles).toEqual([
      expect.objectContaining({ code: expect.any(String) as string }),
    ]);

    const targets = await owner<{
      local_date: Date;
      planned_sessions: number;
      planned_sets: Record<string, number>;
      kcal: string | null;
    }>(
      `SELECT local_date, planned_sessions, planned_sets, kcal FROM tracking.daily_target WHERE patient_id = $1`,
      [patientId],
    );
    expect(targets).toHaveLength(1);
    expect(targets[0]?.planned_sessions).toBe(1);
    expect(Object.values(targets[0]?.planned_sets ?? {}).length).toBeGreaterThan(0);
    expect(targets[0]?.kcal).toBeNull();
  });
});

describe('RN-A05 · RN-B03 · quién y qué queda', () => {
  it('con acceso de lectura se lee y no se escribe; fuera del equipo, ni se ve', async () => {
    const patientId = await newPatient();
    const program = await readyManual(patientId);
    const { team, outsider } = org.staff;
    await harness.put(
      `/patients/${patientId}/care-team/${team.memberId}`,
      { role: 'COLLABORATOR', access: 'READ' },
      cookie,
    );

    expect((await harness.get(`/training-programs/${program.id}`, team.cookie)).status).toBe(200);
    const writes = [
      await harness.post(`/patients/${patientId}/training-programs`, { name: 'x' }, team.cookie),
      await harness
        .post(`/training-programs/${program.id}/publish`, undefined, team.cookie)
        .set('If-Match', String(program.version)),
    ];
    expect(writes.map((response) => (response.body as Problem).code)).toEqual([
      'NC-CLI-013',
      'NC-CLI-013',
    ]);
    expect(writes.map((response) => response.status)).toEqual([403, 403]);

    expect((await harness.get(`/training-programs/${program.id}`, outsider.cookie)).status).toBe(
      404,
    );
    expect(
      (await harness.get(`/patients/${patientId}/training-programs`, outsider.cookie)).status,
    ).toBe(404);
  });

  it('RN-B01: sin HEALTH_DATA no se crea un programa', async () => {
    const registered = await harness.post(
      '/patients',
      { firstName: 'Sin', lastName: 'Consentimiento', sex: 'M', birthDate: '1990-01-01' },
      cookie,
    );
    const created = await harness.post(
      `/patients/${(registered.body as { id: string }).id}/training-programs`,
      { name: 'x' },
      cookie,
    );

    expect((created.body as Problem).rule).toBe('RN-B01');
  });

  it('RN-B03: las lecturas y escrituras se auditan, sin datos de salud en el evento', async () => {
    const patientId = await newPatient();
    const program = await readyManual(patientId);
    await publish(program);
    await harness.get(`/patients/${patientId}/training-programs`, cookie);
    await harness.deliver('audit.events');

    const rows = await owner<{ action: string; fields: string[] | null }>(
      `SELECT action, changed_fields AS fields FROM audit.audit_log
       WHERE resource_type = 'training.program' AND patient_id = $1`,
      [patientId],
    );
    const actions = rows.map((row) => row.action);
    expect(actions).toContain('CREATE');
    expect(actions).toContain('PUBLISH');
    expect(actions).toContain('READ');
    // Sin orden fijo entre las filas: cada escritura deja el nombre de lo que cambió, nunca su contenido.
    const updated = rows
      .filter((row) => row.action === 'UPDATE')
      .flatMap((row) => row.fields ?? []);
    expect(new Set(updated)).toEqual(new Set(['mesocycles', 'sessions']));

    const events = await owner<{ payload: object }>(
      `SELECT payload FROM platform.outbox_event WHERE aggregate_id = $1`,
      [program.id],
    );
    expect(JSON.stringify(events)).not.toContain('Sentadilla');
  });

  it('RF-10: publicar sale en la línea de tiempo con su versión', async () => {
    const patientId = await newPatient();
    const program = await readyManual(patientId);
    await publish(program);

    const timeline = await harness.get(`/patients/${patientId}/timeline`, cookie);
    const { items } = timeline.body as { items: { kind: string; label: string; refId: string }[] };

    expect(items.find((item) => item.refId === program.id)).toMatchObject({
      kind: 'TRAINING_PROGRAM_PUBLISHED',
      label: '1',
    });
  });

  it('la tabla de fases la ve todo el equipo; el paciente no, y nadie la cambia', async () => {
    const context = {
      orgId: org.organizationId,
      userId: org.staff.responsible.userId,
      role: 'PROFESSIONAL' as const,
      memberId: org.staff.responsible.memberId,
    };
    await withContext('user', context, async (client) => {
      const { rowCount } = await client.query(
        `SELECT 1 FROM training.periodization_phase WHERE organization_id IS NULL`,
      );
      expect(rowCount).toBe(48);
      expect(
        await errorCode(
          client,
          `UPDATE training.periodization_phase SET volume_factor = 1 WHERE organization_id IS NULL`,
        ),
      ).toBeUndefined();
      const { rows } = await client.query(
        `SELECT count(*)::int AS n FROM training.periodization_phase
         WHERE organization_id IS NULL AND volume_factor = 1 AND phase_es = 'Adaptación'`,
      );
      expect(rows).toEqual([{ n: 0 }]);
    });
    await withContext(
      'user',
      { orgId: org.organizationId, userId: uuid(), role: 'PATIENT', patientId: uuid() },
      async (client) => {
        const { rowCount } = await client.query(`SELECT 1 FROM training.periodization_phase`);
        expect(rowCount).toBe(0);
      },
    );
  });
});

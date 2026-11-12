import { readFile } from 'node:fs/promises';
import {
  checkinSchema,
  meConsentsSchema,
  meScreeningSchema,
  meTrainingSchema,
  workoutLogSchema,
} from '@nutricoach/contracts';
import type { UserId } from '@nutricoach/shared-kernel';
import type request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CatalogImporter } from '../../src/platform/index.js';
import { ApiHarness, type StaffOrganization } from './support/api-harness.js';
import { id as uuid, pool, withContext } from './support/database.js';
import { patientWithConsent } from './support/luis.js';

/**
 * P13 (PR 4) · el entreno y el registro diario por /me, contra PostgreSQL como app_user: Ana, con un programa publicado que empieza
 * hoy, ve su sesión (RF-29), la registra con sus series (RN-F03, RN-F06) y hace su registro diario, que responde con la indicación
 * del día (RN-G11, RN-G14, RN-G15). Registrarlo otra vez lo corrige (RN-G12). Los síntomas del ciclo exigen MENSTRUAL_TRACKING
 * (RN-G17), que ella autoriza y retira desde la app; también responde su cribado (07 §3.2). Datos sintéticos.
 */

const SEEDS = new URL('../../../../seeds/', import.meta.url);
const PASSWORD = 'un-cielo-gris-sobre-lima';
/** El umbral global de 07 §11 (migración 202611020000). */
const GLOBAL_THRESHOLD = '019a2000-0000-7000-8000-000000000001';
const harness = new ApiHarness();
let org: StaffOrganization;
let cookie: string;
let patientId: string;
let patientCookie: string;
let programId: string;
let sessionId: string;
let squatId: string;

interface Program {
  id: string;
  version: number;
  document: {
    mesocycles: {
      weeks: { id: string; sessions: { id: string; position: number }[] }[];
    }[];
  };
}

interface Problem {
  code: string;
  rule?: string;
}

/** 60 kg × 8 repeticiones fijas: el tonelaje prescrito de la sesión se puede calcular (P-09). */
const KG_SET = { repsMin: 8, repsMax: 8, loadKind: 'KG', loadValue: 60, restSeconds: 90 };
const BASELINE = { baselineRestingHrBpm: 55, baselineHrvMs: 60, sleepTargetHours: 8 };
const PROFILE = {
  objective: 'HYPERTROPHY',
  level: 'BEGINNER',
  daysPerWeek: 3,
  equipmentCodes: ['FULL_GYM'],
  medicalClearance: 'CLEARED',
  ...BASELINE,
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

const owner = async <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  (await pool('owner').query(sql, params)).rows as T[];

/** Una fecha a días de hoy en la zona horaria del paciente, America/Lima por defecto (RN-G04). */
const day = (offset = 0): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() + offset * 86_400_000));

const sessionCookie = (response: request.Response): string => {
  const raw = response.headers['set-cookie'] as unknown as string[] | undefined;
  return raw?.find((c) => c.startsWith('nc_session='))?.split(';')[0] ?? '';
};

const exerciseByCode = async (code: string): Promise<string> => {
  const [row] = await owner<{ id: string }>(
    `SELECT id FROM exercise.exercise WHERE organization_id IS NULL AND code = $1`,
    [code],
  );
  return row?.id ?? '';
};

/** Un programa de una semana que empieza hoy: la sesión 1 cae hoy (07 §8). */
async function publishedProgram(): Promise<Program> {
  const created = await harness.post(
    `/patients/${patientId}/training-programs`,
    { name: 'Fuerza base', startDate: day() },
    cookie,
  );
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const draft = (
    await harness.get(`/training-programs/${(created.body as { id: string }).id}`, cookie)
  ).body as Program;
  const added = await harness
    .post(`/training-programs/${draft.id}/mesocycles`, { name: 'Base', weeks: 1 }, cookie)
    .set('If-Match', String(draft.version));
  expect(added.status, JSON.stringify(added.body)).toBe(201);
  let program = added.body as Program;
  const session = (name: string) => ({
    name,
    exercises: [{ exerciseId: squatId, sets: [KG_SET, KG_SET, KG_SET] }],
  });
  const weekId = program.document.mesocycles[0]?.weeks[0]?.id ?? '';
  const saved = await harness
    .put(
      `/training-programs/${program.id}/weeks/${weekId}`,
      { sessions: [session('Sesión 1'), session('Sesión 2'), session('Sesión 3')] },
      cookie,
    )
    .set('If-Match', String(program.version));
  expect(saved.status, JSON.stringify(saved.body)).toBe(200);
  program = saved.body as Program;
  const published = await harness
    .post(`/training-programs/${program.id}/publish`, undefined, cookie)
    .set('If-Match', String(program.version));
  expect(published.status, JSON.stringify(published.body)).toBe(200);
  await harness.deliver('tracking.programs');
  return program;
}

/** El acceso a la app (RN-A06): invitación por correo, cada finalidad que falta y la sesión PATIENT. */
async function appSession(): Promise<string> {
  const email = `ana-${uuid()}@demo.test`;
  const invited = await harness.post(`/patients/${patientId}/invitation`, { email }, cookie);
  expect(invited.status, JSON.stringify(invited.body)).toBeLessThan(300);
  const token = await harness.invitationTokenFor(email);
  const inspected = await harness.post('/invitations/inspect', { token });
  const consents = (inspected.body as { consents: { id: string }[] }).consents.map((c) => c.id);
  const accepted = await harness.post('/invitations/accept', {
    token,
    password: PASSWORD,
    acceptedConsentDocumentIds: consents,
  });
  expect(accepted.status, JSON.stringify(accepted.body)).toBe(200);
  return sessionCookie(accepted);
}

const checkin = (body: object, who = patientCookie) =>
  harness.post('/me/checkins', { clientId: uuid(), localDate: day(), ...body }, who);

const workout = (body: object, who = patientCookie) =>
  harness.post(
    '/me/workouts',
    { clientId: uuid(), localDate: day(), outcome: 'COMPLETED', ...body },
    who,
  );

/** Un día bueno: sueño y FC y HRV como su línea base, y respuestas buenas: 100, 100, 100 y 80 (07 §9). */
const GOOD_DAY = {
  sessionMinutes: 50,
  sessionRpe: 7,
  sleepHours: 8,
  fatigue: 2,
  soreness: 2,
  stress: 2,
  motivation: 4,
  restingHrBpm: 55,
  hrvMs: 60,
};

const profileRevision = async (): Promise<number> =>
  (
    (await harness.get(`/patients/${patientId}/athlete-profile`, cookie)).body as {
      current: { revision: number };
    }
  ).current.revision;

const grantMenstrual = () =>
  harness.post('/me/consents', { purpose: 'MENSTRUAL_TRACKING' }, patientCookie);
const revokeMenstrual = () =>
  harness.post('/me/consents/MENSTRUAL_TRACKING/revoke', undefined, patientCookie);

beforeAll(async () => {
  await harness.start();
  org = await harness.createStaffOrganization();
  cookie = org.staff.responsible.cookie;
  // Con tres líneas en blanco al final: otro hash, así este lote se aplica aunque otra prueba ya cargó el archivo.
  const importer = harness.app.get(CatalogImporter);
  const report = await importer.run({
    kind: 'EXERCISE_LIBRARY',
    fileName: 'exercise/ejercicios-base.csv',
    content: Buffer.concat([
      await readFile(new URL('exercise/ejercicios-base.csv', SEEDS)),
      Buffer.from('\n\n\n'),
    ]),
    organizationId: null,
    startedBy: uuid() as UserId,
  });
  expect(['COMPLETED', 'DUPLICATE']).toContain(report.status);
  squatId = await exerciseByCode('SQ01');
  patientId = await patientWithConsent(harness, org, {
    firstName: 'Ana',
    lastName: 'Sintética',
    sex: 'F',
    birthDate: '1996-04-12',
  });
  const profile = await harness.put(
    `/patients/${patientId}/athlete-profile`,
    { ...PROFILE, expectedRevision: 0 },
    cookie,
  );
  expect(profile.status, JSON.stringify(profile.body)).toBe(200);
  const program = await publishedProgram();
  programId = program.id;
  sessionId =
    program.document.mesocycles[0]?.weeks[0]?.sessions.find((s) => s.position === 1)?.id ?? '';
  patientCookie = await appSession();
});

afterAll(async () => {
  await harness.stop();
});

describe('RF-29 · el entreno de hoy', () => {
  it('la sesión 1 del programa, con sus ejercicios, sus series y el tonelaje prescrito (P-09)', async () => {
    const response = await harness.get('/me/training', patientCookie);

    expect(response.status).toBe(200);
    const training = meTrainingSchema.parse(response.body);
    expect(training.program).toMatchObject({ programId, name: 'Fuerza base', weekNo: 1 });
    expect(training.sessions).toHaveLength(1);
    expect(training.sessions[0]).toMatchObject({
      id: sessionId,
      name: 'Sesión 1',
      plannedTonnageKg: 1_440,
      exercises: [{ exerciseId: squatId, sets: [{ repsMin: 8, loadValue: 60 }, {}, {}] }],
    });
    expect(training.workouts).toEqual([]);
    expect(training.checkin).toBeNull();
  });
});

describe('RF-29 · RN-F03 · RN-F06 · registrar la sesión con sus series', () => {
  it('el tonelaje sin el calentamiento y los músculos congelados en cada serie; un reintento no duplica (RN-G08)', async () => {
    const body = {
      clientId: uuid(),
      sessionId,
      durationMinutes: 50,
      sessionRpe: 7,
      sets: [
        { exerciseId: squatId, setNo: 1, isWarmup: true, reps: 10, loadKg: 20 },
        { exerciseId: squatId, setNo: 2, reps: 8, loadKg: 60, rir: 2 },
        { exerciseId: squatId, setNo: 3, reps: 8, loadKg: 60, rir: 2 },
        { exerciseId: squatId, setNo: 4, reps: 8, loadKg: 60, rir: 1 },
      ],
    };

    const first = await workout(body);
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    const logged = workoutLogSchema.parse(first.body);
    expect(logged).toMatchObject({
      sessionId,
      outcome: 'COMPLETED',
      durationMinutes: 50,
      tonnageKg: 1_440,
      setCount: 4,
      status: 'ACTIVE',
    });

    const again = await workout(body);
    expect(again.status).toBe(200);
    expect((again.body as { id: string }).id).toBe(logged.id);

    const sets = await owner<{ exercise_name: string; muscle_contributions: unknown }>(
      `SELECT exercise_name, muscle_contributions FROM tracking.set_log WHERE workout_log_id = $1`,
      [logged.id],
    );
    expect(sets).toHaveLength(4);
    expect(sets[0]?.exercise_name).toBeTruthy();
    expect(sets[0]?.muscle_contributions).toEqual(
      expect.arrayContaining([{ muscle: expect.any(String) as string, weight: 1 }]),
    );
  });

  it('un ejercicio fuera de la sesión o una sesión que no es del programa: 422', async () => {
    const otherExercise = await exerciseByCode('HG01');
    const outside = await workout({
      sessionId,
      sets: [{ exerciseId: otherExercise, setNo: 1, reps: 10 }],
    });
    expect(outside.status).toBe(422);
    expect((outside.body as Problem).code).toBe('NC-TRK-011');

    const unknown = await workout({ sessionId: uuid(), sets: [] });
    expect(unknown.status).toBe(422);
    expect((unknown.body as Problem).code).toBe('NC-TRK-011');
  });
});

describe('RN-G11 · RN-G14 · RN-G15 · el registro diario y la indicación del día', () => {
  it('responde con la recuperación, la carga sRPE, el rendimiento de la sesión registrada y el verde; Hoy lo muestra', async () => {
    const response = await checkin(GOOD_DAY);

    expect(response.status, JSON.stringify(response.body)).toBe(201);
    const logged = checkinSchema.parse(response.body);
    expect(logged.readiness).toMatchObject({
      indication: 'GREEN',
      readinessScore: 95,
      components: { sleep: 100, heartRate: 100, hrv: 100, subjective: 80 },
      neutralComponents: [],
      srpeLoad: 350,
      performancePct: 100,
      methodCode: 'READINESS_JV',
      methodVersion: '3.0.0',
    });

    const today = await harness.get('/me/today', patientCookie);
    expect(today.body).toMatchObject({ readiness: { indication: 'GREEN', readinessScore: 95 } });

    const [stored] = await owner<{
      threshold_id: string;
      hash_bytes: number;
      program_id: string;
      week_no: number;
      session_id: string;
    }>(
      `SELECT r.threshold_id, octet_length(r.inputs_hash) AS hash_bytes, c.program_id, c.week_no, c.session_id
       FROM tracking.daily_readiness r JOIN tracking.daily_checkin c ON c.id = r.checkin_id AND c.local_date = r.local_date
       WHERE r.checkin_id = $1`,
      [logged.id],
    );
    expect(stored).toEqual({
      threshold_id: GLOBAL_THRESHOLD,
      hash_bytes: 32,
      program_id: programId,
      week_no: 1,
      session_id: sessionId,
    });
  });

  it('RN-G12: otro registro el mismo día corrige el anterior, que queda anulado con su recuperación reemplazada', async () => {
    const before = await harness.get(`/me/days/${day()}`, patientCookie);
    const previous = (before.body as { checkin: { id: string } }).checkin.id;

    const corrected = await checkin({
      sleepHours: 5,
      fatigue: 4,
      soreness: 4,
      stress: 4,
      motivation: 2,
      restingHrBpm: 60,
      hrvMs: 42,
    });

    expect(corrected.status, JSON.stringify(corrected.body)).toBe(201);
    expect(checkinSchema.parse(corrected.body).readiness).toMatchObject({
      indication: 'YELLOW',
      readinessScore: 60.63,
    });
    const rows = await owner<{ id: string; status: string; readiness: string }>(
      `SELECT c.id, c.status, r.status AS readiness FROM tracking.daily_checkin c
       JOIN tracking.daily_readiness r ON r.checkin_id = c.id AND r.local_date = c.local_date
       WHERE c.patient_id = $1 AND c.local_date = $2 ORDER BY c.created_at`,
      [patientId, day()],
    );
    expect(rows).toEqual([
      { id: previous, status: 'VOIDED', readiness: 'SUPERSEDED' },
      { id: (corrected.body as { id: string }).id, status: 'ACTIVE', readiness: 'CURRENT' },
    ]);
  });

  it('anularlo deja Hoy sin indicación', async () => {
    const current = (await harness.get(`/me/days/${day()}`, patientCookie)).body as {
      checkin: { id: string };
    };

    const voided = await harness.post(
      `/me/checkins/${current.checkin.id}/void`,
      undefined,
      patientCookie,
    );

    expect(voided.status).toBe(200);
    expect(voided.body).toMatchObject({ status: 'VOIDED', readiness: { indication: 'YELLOW' } });
    expect((await harness.get('/me/today', patientCookie)).body).toMatchObject({ readiness: null });
  });

  it('con solo la sesión no hay recuperación ni indicación: «sin datos» (07 §9)', async () => {
    const response = await checkin({ localDate: day(-1), sessionMinutes: 40, sessionRpe: 6 });

    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(checkinSchema.parse(response.body).readiness).toMatchObject({
      indication: 'NO_DATA',
      readinessScore: null,
      srpeLoad: 240,
    });
  });

  it('app.readiness_basis solo responde a la sesión del paciente', async () => {
    const rows = await withContext(
      'user',
      { orgId: org.organizationId, role: 'OWNER', userId: org.staff.responsible.userId },
      async (client) =>
        (
          await client.query<Record<string, unknown>>(
            `SELECT * FROM app.readiness_basis($1::date)`,
            [day()],
          )
        ).rows,
    );
    expect(rows).toEqual([]);
  });
});

describe('RN-G17 · el ciclo menstrual, solo con MENSTRUAL_TRACKING', () => {
  it('criterio 6 de P13: sin el consentimiento vigente, la API rechaza los síntomas del ciclo', async () => {
    const response = await checkin({ localDate: day(-2), ...GOOD_DAY, menstrualSymptoms: 1 });

    expect(response.status).toBe(422);
    expect(response.body as Problem).toMatchObject({ code: 'NC-CLI-032', rule: 'RN-G17' });
    expect(
      await owner(
        `SELECT 1 FROM tracking.daily_checkin WHERE patient_id = $1 AND local_date = $2`,
        [patientId, day(-2)],
      ),
    ).toEqual([]);
  });

  it('lo autoriza desde la app con el texto vigente; sus síntomas en 3 dan rojo; al retirarlo vuelve a rechazarse', async () => {
    const before = meConsentsSchema.parse((await harness.get('/me/consents', patientCookie)).body);
    expect(before.consents).toEqual([
      expect.objectContaining({ purpose: 'MENSTRUAL_TRACKING', active: false }),
    ]);
    expect(before.consents[0]?.document?.version).toBe('0.1-provisional');

    expect((await grantMenstrual()).status).toBe(201);
    const granted = meConsentsSchema.parse((await harness.get('/me/consents', patientCookie)).body);
    expect(granted.consents[0]).toMatchObject({ active: true });

    const red = await checkin({ localDate: day(-2), ...GOOD_DAY, menstrualSymptoms: 3 });
    expect(red.status, JSON.stringify(red.body)).toBe(201);
    expect(checkinSchema.parse(red.body)).toMatchObject({
      menstrualSymptoms: 3,
      readiness: { indication: 'RED' },
    });

    expect((await revokeMenstrual()).status).toBe(204);
    const again = await checkin({ localDate: day(-3), ...GOOD_DAY, menstrualSymptoms: 1 });
    expect(again.status).toBe(422);
    expect((again.body as Problem).code).toBe('NC-CLI-032');
  });

  it('la anticoncepción hormonal del perfil la registra el coach y solo con el consentimiento vigente (ADR-080)', async () => {
    const save = async () =>
      harness.put(
        `/patients/${patientId}/athlete-profile`,
        { ...PROFILE, hormonalContraception: true, expectedRevision: await profileRevision() },
        cookie,
      );

    const denied = await save();
    expect(denied.status, JSON.stringify(denied.body)).toBe(422);
    expect((denied.body as Problem).code).toBe('NC-CLI-032');

    expect((await grantMenstrual()).status).toBe(201);
    const saved = await save();
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    const read = await harness.get(`/patients/${patientId}/athlete-profile`, cookie);
    expect(read.body).toMatchObject({ current: { hormonalContraception: true, ...BASELINE } });
    expect((await revokeMenstrual()).status).toBe(204);
  });
});

describe('P-35 · el chat de WhatsApp del alumno, sin integrar mensajería', () => {
  it('solo con el seguimiento activado en el perfil y el teléfono con su código de país; cada pedido queda en la auditoría', async () => {
    const link = () => harness.get(`/patients/${patientId}/athlete-profile/whatsapp`, cookie);
    const codeOf = (response: request.Response) => (response.body as Problem).code;
    const setPhone = async (phone: string) => {
      const patient = await harness.get(`/patients/${patientId}`, cookie);
      const version = (patient.body as { version: number }).version;
      const changed = await harness
        .patch(`/patients/${patientId}`, { phone }, cookie)
        .set('If-Match', String(version));
      expect(changed.status, JSON.stringify(changed.body)).toBe(200);
    };

    const off = await link();
    expect(off.status).toBe(409);
    expect(codeOf(off)).toBe('NC-TRA-026');

    const saved = await harness.put(
      `/patients/${patientId}/athlete-profile`,
      { ...PROFILE, whatsappFollowUp: true, expectedRevision: await profileRevision() },
      cookie,
    );
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    const read = await harness.get(`/patients/${patientId}/athlete-profile`, cookie);
    expect(read.body).toMatchObject({ current: { whatsappFollowUp: true } });

    // Sin el código de país no se supone +51: se pide agregarlo (Rodrigo, 2026-11-11).
    await setPhone('987 654 321');
    const local = await link();
    expect(local.status).toBe(409);
    expect(codeOf(local)).toBe('NC-TRA-028');

    await setPhone('+51 987 654 321');
    const ok = await link();
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body).toEqual({ url: 'https://wa.me/51987654321' });

    const [audited] = await owner<{ n: number }>(
      `SELECT count(*)::int AS n FROM audit.audit_log
       WHERE action = 'READ' AND resource_type = 'clinical.patient.phone' AND patient_id = $1`,
      [patientId],
    );
    expect(audited?.n).toBe(3);
  });
});

describe('07 §3.2 · el cribado desde la app', () => {
  it('lo responde ella; en verde no espera revisión, y el equipo lo ve', async () => {
    const answered = await harness.post('/me/screening', { answers: NO_ANSWERS }, patientCookie);
    expect(answered.status, JSON.stringify(answered.body)).toBe(201);

    const mine = meScreeningSchema.parse((await harness.get('/me/screening', patientCookie)).body);
    expect(mine.latest).toMatchObject({ awaitingReview: false });

    const staff = await harness.get(`/patients/${patientId}/screenings`, cookie);
    expect((staff.body as { screenings: { id: string }[] }).screenings[0]?.id).toBe(
      (answered.body as { id: string }).id,
    );
  });

  it('con una respuesta en sí, espera la revisión del coach (RN-F15)', async () => {
    const answered = await harness.post(
      '/me/screening',
      { answers: { ...NO_ANSWERS, S01: true } },
      patientCookie,
    );
    expect(answered.status).toBe(201);
    const mine = meScreeningSchema.parse((await harness.get('/me/screening', patientCookie)).body);
    expect(mine.latest).toMatchObject({ awaitingReview: true });
  });
});

describe('RN-G01 · solo el paciente registra sobre sí mismo', () => {
  it('el profesional no hace el registro diario, ni registra un entreno, ni autoriza por el paciente: 403', async () => {
    expect((await checkin(GOOD_DAY, cookie)).status).toBe(403);
    expect((await workout({ sessionId, sets: [] }, cookie)).status).toBe(403);
    expect(
      (await harness.post('/me/consents', { purpose: 'MENSTRUAL_TRACKING' }, cookie)).status,
    ).toBe(403);
  });
});

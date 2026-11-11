import { readFile } from 'node:fs/promises';
import {
  readinessThresholdsResponseSchema,
  trainingAnalyticsSchema,
  weeklyReviewsResponseSchema,
  type WeeklyReviewsResponse,
} from '@nutricoach/contracts';
import type { UserId } from '@nutricoach/shared-kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CatalogImporter } from '../../src/platform/index.js';
import { ApiHarness, type StaffOrganization } from './support/api-harness.js';
import { id as uuid, pool } from './support/database.js';
import { patientWithConsent } from './support/luis.js';

/**
 * P14 (PR 3) · el control semanal del macrociclo, contra PostgreSQL como app_user (RF-42, RN-G16, RN-F17): G-39 por HTTP con los
 * registros diarios de dos semanas cerradas, la decisión del coach con autor, fecha y nota, la versión nueva en borrador que cambia la
 * semana solo al publicarse (criterio 5 de P14), el registro tardío que reemplaza el control y los umbrales editables (07 §11).
 * Datos sintéticos.
 */

const SEEDS = new URL('../../../../seeds/', import.meta.url);
const GLOBAL_THRESHOLD = '019a2000-0000-7000-8000-000000000001';
const harness = new ApiHarness();
let org: StaffOrganization;
let cookie: string;
let patientId: string;
let otherPatientId: string;
let programId: string;

interface Program {
  id: string;
  version: number;
  document: {
    mesocycles: { weeks: { id: string; weekNo: number; volumeFactor: number | null }[] }[];
  };
}

const owner = async <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  (await pool('owner').query(sql, params)).rows as T[];

const DAY_MS = 86_400_000;
const today = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
const addDays = (date: string, days: number): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/** El programa empezó hace 14 días: las semanas 1 y 2 ya cerraron y la 3 es la de hoy. */
const START = () => addDays(today(), -14);

const reviews = async (as = cookie): Promise<WeeklyReviewsResponse> => {
  const response = await harness.get(`/patients/${patientId}/weekly-reviews`, as);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return weeklyReviewsResponseSchema.parse(response.body);
};

const compute = async (id = patientId) =>
  harness.post(`/patients/${id}/weekly-reviews/compute`, undefined, cookie);

/** Un registro diario con su recuperación, escrito directo: los días cerrados no se registran por /me (RN-G10). */
async function seedCheckin(
  date: string,
  values: { fatigue?: number; performancePct?: number | null; sleepHours?: number },
): Promise<void> {
  const checkinId = uuid();
  await owner(
    `INSERT INTO tracking.daily_checkin (id, local_date, organization_id, patient_id, client_id, session_minutes, session_rpe,
       sleep_hours, fatigue, soreness, nutrition_compliance_pct)
     VALUES ($1, $2, $3, $4, $5, 60, 7, $6, $7, 2, 90)`,
    [
      checkinId,
      date,
      org.organizationId,
      patientId,
      uuid(),
      values.sleepHours ?? 7.5,
      values.fatigue ?? 2,
    ],
  );
  await owner(
    `INSERT INTO tracking.daily_readiness (id, local_date, organization_id, patient_id, checkin_id, method_code, method_version,
       engine_version, threshold_id, inputs, inputs_hash, srpe_load, performance_pct, readiness_score, components, indication,
       computed_at)
     VALUES ($1, $2, $3, $4, $5, 'READINESS_JV', '3.0.0', '1.6.0', $6, '{}', '\\x00', 420, $7, 80, '{}', 'GREEN', now())`,
    [
      uuid(),
      date,
      org.organizationId,
      patientId,
      checkinId,
      GLOBAL_THRESHOLD,
      values.performancePct ?? null,
    ],
  );
}

/** Tres semanas a mano con una sesión de sentadilla goblet; la 1 con factor 1.1 y las demás con 1.0. */
async function publishedProgram(squatId: string): Promise<string> {
  const created = await harness.post(
    `/patients/${patientId}/training-programs`,
    { name: 'Macrociclo de prueba', startDate: START() },
    cookie,
  );
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const draft = (
    await harness.get(`/training-programs/${(created.body as { id: string }).id}`, cookie)
  ).body as Program;
  const added = await harness
    .post(`/training-programs/${draft.id}/mesocycles`, { name: 'Base', weeks: 3 }, cookie)
    .set('If-Match', String(draft.version));
  let program = added.body as Program;
  const set = { repsMin: 8, repsMax: 8, loadKind: 'KG', loadValue: 60, restSeconds: 90 };
  for (const [index, week] of (program.document.mesocycles[0]?.weeks ?? []).entries()) {
    const saved = await harness
      .put(
        `/training-programs/${program.id}/weeks/${week.id}`,
        {
          volumeFactor: index === 0 ? 1.1 : 1,
          sessions: [{ name: 'Sesión 1', exercises: [{ exerciseId: squatId, sets: [set, set] }] }],
        },
        cookie,
      )
      .set('If-Match', String(program.version));
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    program = saved.body as Program;
  }
  const published = await harness
    .post(`/training-programs/${program.id}/publish`, undefined, cookie)
    .set('If-Match', String(program.version));
  expect(published.status, JSON.stringify(published.body)).toBe(200);
  await harness.deliver('tracking.programs');
  return program.id;
}

beforeAll(async () => {
  await harness.start();
  org = await harness.createStaffOrganization();
  cookie = org.staff.responsible.cookie;
  const report = await harness.app.get(CatalogImporter).run({
    kind: 'EXERCISE_LIBRARY',
    fileName: 'exercise/ejercicios-base.csv',
    content: Buffer.concat([
      await readFile(new URL('exercise/ejercicios-base.csv', SEEDS)),
      Buffer.from('\n\n\n\n\n\n'),
    ]),
    organizationId: null,
    startedBy: uuid() as UserId,
  });
  expect(['COMPLETED', 'DUPLICATE']).toContain(report.status);
  const [squat] = await owner<{ id: string }>(
    `SELECT id FROM exercise.exercise WHERE organization_id IS NULL AND code = 'SQ01'`,
  );
  patientId = await patientWithConsent(harness, org, {
    firstName: 'Inés',
    lastName: 'Sintética',
    sex: 'F',
    birthDate: '1993-07-21',
  });
  otherPatientId = await patientWithConsent(harness, org, {
    firstName: 'Ana',
    lastName: 'Sintética',
    sex: 'F',
    birthDate: '1990-02-11',
  });
  programId = await publishedProgram(squat?.id ?? '');
  // Semana 1: rendimiento promedio 88 % con factor 1.1. Semana 2: fatiga promedio 4.2 con factor 1.0 (G-39).
  await seedCheckin(addDays(START(), 0), { performancePct: 86 });
  await seedCheckin(addDays(START(), 2), { performancePct: 90 });
  await seedCheckin(addDays(START(), 4), { performancePct: 88 });
  for (const [i, fatigue] of [4, 4, 5, 4, 4].entries()) {
    await seedCheckin(addDays(START(), 7 + i), { fatigue, performancePct: 100 });
  }
});

afterAll(async () => {
  await harness.stop();
});

describe('Criterio 5 de P14 · G-39 · RN-G16 · el control de las semanas cerradas', () => {
  it('al abrirlo se calculan las semanas cerradas, con su método; la de hoy todavía no', async () => {
    const computed = await compute();
    expect(computed.status, JSON.stringify(computed.body)).toBe(200);
    expect(computed.body).toEqual({ written: 2 });

    const { program, reviews: list } = await reviews();
    expect(program).toMatchObject({ programId, totalWeeks: 3 });
    expect(list.map((r) => r.weekNo)).toEqual([1, 2]);
    expect(list[0]?.method).toEqual({ code: 'WEEKLY_REVIEW_JV', version: '3.1.0' });
  });

  it('rendimiento promedio 88 % y factor 1.1: ROJO, 0.825, descarga; fatiga 4.2 y factor 1.0: ÁMBAR, 0.90, ajustar', async () => {
    const [first, second] = (await reviews()).reviews;

    expect(first).toMatchObject({
      weekStart: START(),
      light: 'RED',
      reasons: ['PERFORMANCE'],
      plannedVolumeFactor: 1.1,
      suggestedVolumeFactor: 0.825,
      suggestedAction: 'DELOAD',
      decision: null,
    });
    expect(first?.aggregates).toMatchObject({ sessions: 3, avgPerformancePct: 88, srpeLoad: 1260 });
    expect(second).toMatchObject({
      light: 'AMBER',
      reasons: ['FATIGUE'],
      plannedVolumeFactor: 1,
      suggestedVolumeFactor: 0.9,
      suggestedAction: 'ADJUST',
    });
    expect(second?.aggregates?.avgFatigue).toBeCloseTo(4.2, 10);
  });

  it('calcular otra vez sin registros nuevos no cambia nada', async () => {
    const again = await compute();
    expect(again.body).toEqual({ written: 0 });
  });
});

describe('Criterio 5 de P14 · RN-F17 · RN-F12 · la decisión del coach', () => {
  it('ajustar deja la versión siguiente en borrador con el factor en la semana 3; la semana cambia solo al publicarla', async () => {
    const second = (await reviews()).reviews[1];
    const decided = await harness.post(
      `/patients/${patientId}/weekly-reviews/${second?.id ?? ''}/decision`,
      {
        decision: 'ADJUST',
        volumeFactor: 0.9,
        note: 'La fatiga viene alta: bajamos un 10 % la semana 3.',
      },
      cookie,
    );
    expect(decided.status, JSON.stringify(decided.body)).toBe(200);
    const { draftProgramId } = decided.body as { draftProgramId: string };
    expect(draftProgramId).toBeTruthy();

    const review = (await reviews()).reviews[1];
    expect(review?.decision).toMatchObject({
      decision: 'ADJUST',
      volumeFactor: 0.9,
      note: 'La fatiga viene alta: bajamos un 10 % la semana 3.',
      decidedBy: org.staff.responsible.memberId,
    });
    expect(review?.resultingProgram).toEqual({ programId: draftProgramId, status: 'DRAFT' });

    const draft = (await harness.get(`/training-programs/${draftProgramId}`, cookie))
      .body as Program;
    const draftWeeks = draft.document.mesocycles[0]?.weeks ?? [];
    expect(draftWeeks.map((w) => w.volumeFactor)).toEqual([1.1, 1, 0.9]);

    // Mientras sea un borrador, lo vigente no cambia.
    const before = trainingAnalyticsSchema.parse(
      (await harness.get(`/patients/${patientId}/analytics/training`, cookie)).body,
    );
    expect(before.weeks[2]?.volumeFactor).toBe(1);

    const published = await harness
      .post(`/training-programs/${draftProgramId}/publish`, undefined, cookie)
      .set('If-Match', String(draft.version));
    expect(published.status, JSON.stringify(published.body)).toBe(200);
    await harness.deliver('tracking.programs');

    const after = trainingAnalyticsSchema.parse(
      (await harness.get(`/patients/${patientId}/analytics/training`, cookie)).body,
    );
    expect(after.weeks[2]?.volumeFactor).toBe(0.9);
    expect((await reviews()).reviews[1]?.resultingProgram?.status).toBe('PUBLISHED');
  });

  it('se decide una sola vez; ajustar sin factor no pasa; mantener no crea versión', async () => {
    const [first, second] = (await reviews()).reviews;
    const repeated = await harness.post(
      `/patients/${patientId}/weekly-reviews/${second?.id ?? ''}/decision`,
      { decision: 'KEEP', note: 'Otra vez.' },
      cookie,
    );
    expect([repeated.status, (repeated.body as { code: string }).code]).toEqual([
      409,
      'NC-TRA-022',
    ]);

    const withoutFactor = await harness.post(
      `/patients/${patientId}/weekly-reviews/${first?.id ?? ''}/decision`,
      { decision: 'DELOAD', note: 'Descarga.' },
      cookie,
    );
    expect(withoutFactor.status).toBe(400);

    const kept = await harness.post(
      `/patients/${patientId}/weekly-reviews/${first?.id ?? ''}/decision`,
      { decision: 'KEEP', note: 'Fue una semana de exámenes: mantenemos el plan.' },
      cookie,
    );
    expect(kept.status, JSON.stringify(kept.body)).toBe(200);
    expect(kept.body).toMatchObject({ draftProgramId: null });
  });

  it('RN-B03 · la decisión queda en la auditoría con sus campos', async () => {
    await harness.deliver('audit.events');
    const rows = await owner<{ changed_fields: string[] }>(
      `SELECT changed_fields FROM audit.audit_log
       WHERE resource_type = 'training.weekly_review' AND action = 'UPDATE' AND patient_id = $1`,
      [patientId],
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]?.changed_fields).toEqual([
      'coach_decision',
      'decided_volume_factor',
      'decision_note',
    ]);
  });
});

describe('RN-G16 · un registro tardío crea un control nuevo', () => {
  it('el anterior queda reemplazado con su decisión, y el nuevo espera la del coach', async () => {
    await seedCheckin(addDays(START(), 5), { performancePct: 95 });
    const computed = await compute();
    expect(computed.body).toEqual({ written: 1 });

    const first = (await reviews()).reviews[0];
    expect(first?.decision).toBeNull();
    expect(first?.supersededCount).toBe(1);
    expect(first?.aggregates?.sessions).toBe(4);
    const [old] = await owner<{ status: string; coach_decision: string }>(
      `SELECT status, coach_decision FROM training.weekly_review
       WHERE patient_id = $1 AND week_no = 1 AND status = 'SUPERSEDED'`,
      [patientId],
    );
    expect(old).toEqual({ status: 'SUPERSEDED', coach_decision: 'KEEP' });
  });
});

describe('RN-A05 · quién ve y decide el control', () => {
  it('fuera del equipo, 404; sin programa publicado, 404 al calcular; la lectura se audita', async () => {
    expect(
      (await harness.get(`/patients/${patientId}/weekly-reviews`, org.staff.outsider.cookie))
        .status,
    ).toBe(404);
    const none = await compute(otherPatientId);
    expect([none.status, (none.body as { code: string }).code]).toEqual([404, 'NC-TRA-024']);
    const [read] = await owner<{ n: number }>(
      `SELECT count(*)::int AS n FROM audit.audit_log
       WHERE action = 'READ' AND resource_type = 'training.weekly_review' AND patient_id = $1`,
      [patientId],
    );
    expect(read?.n).toBeGreaterThan(0);
  });
});

describe('07 §11 · RN-G15 · los umbrales de la organización', () => {
  const values = {
    neutralScore: 75,
    readinessGreenMin: 75,
    readinessRedBelow: 60,
    performanceMinPct: 85,
    weeklySleepMinHours: 6.5,
    fatigueSorenessAmberAbove: 4,
    nutritionMinPct: 80,
  };

  it('sin cambios rigen los de la V3; el dueño crea la versión de hoy y un segundo cambio la corrige', async () => {
    const ownerCookie = org.staff.owner.cookie;
    const initial = readinessThresholdsResponseSchema.parse(
      (await harness.get('/organization/readiness-thresholds', ownerCookie)).body,
    );
    expect(initial.own).toBe(false);
    expect(initial.current.performanceMinPct).toBe(90);

    const saved = await harness.put('/organization/readiness-thresholds', values, ownerCookie);
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    const first = readinessThresholdsResponseSchema.parse(saved.body);
    expect(first).toMatchObject({
      own: true,
      current: { performanceMinPct: 85, validFrom: today() },
    });
    expect(first.base.performanceMinPct).toBe(90);

    const corrected = readinessThresholdsResponseSchema.parse(
      (
        await harness.put(
          '/organization/readiness-thresholds',
          { ...values, performanceMinPct: 88 },
          ownerCookie,
        )
      ).body,
    );
    expect(corrected.current).toMatchObject({ id: first.current.id, performanceMinPct: 88 });
  });

  it('un umbral nuevo no reescribe los controles ya calculados', async () => {
    expect((await compute()).body).toEqual({ written: 0 });
  });

  it('un profesional no los cambia; la roja sobre la verde no pasa', async () => {
    expect((await harness.put('/organization/readiness-thresholds', values, cookie)).status).toBe(
      403,
    );
    const invalid = await harness.put(
      '/organization/readiness-thresholds',
      { ...values, readinessRedBelow: 80 },
      org.staff.owner.cookie,
    );
    expect(invalid.status).toBe(400);
  });
});

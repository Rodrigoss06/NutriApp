import { readFile } from 'node:fs/promises';
import type { UserId } from '@nutricoach/shared-kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedDemo2, type DemoApi } from '../../scripts/demo-2.js';
import { lastWeek, seedDemo3, type Demo3Options, type Demo3Report } from '../../scripts/demo-3.js';
import { AnalyticsRebuild } from '../../src/modules/analytics/index.js';
import { CatalogImporter } from '../../src/platform/index.js';
import { ApiHarness, type StaffOrganization } from './support/api-harness.js';
import { id, pool } from './support/database.js';
import { luisWithPrescription } from './support/luis.js';

/**
 * P14 (PR 7b) · la semilla de la Demo 3 (scripts/demo-3.ts, ADR-097) por HTTP contra PostgreSQL como app_user, sobre la de la
 * Demo 2. Luis queda con «Fuerza base» y su semana G-20 registrada; Mateo Prueba, el alumno ficticio de la hoja piloto de Jeremy,
 * con su mes de octubre, y el control de sus cuatro semanas da lo que da la hoja. Correrla otra vez no duplica nada.
 */

const SEEDS = new URL('../../../../seeds/', import.meta.url);
const harness = new ApiHarness();
const mateoId = id();
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
let org: StaffOrganization;
let luisId: string;
let api: DemoApi;
let options: Demo3Options;
let report: Demo3Report;

const get = async <T>(path: string): Promise<T> => {
  const response = await harness.get(path, org.staff.responsible.cookie);
  expect(response.status).toBe(200);
  return response.body as T;
};

const count = async (table: string, patientId: string): Promise<number> => {
  const { rows } = await pool('owner').query<{ count: string }>(
    `SELECT count(*) FROM ${table} WHERE patient_id = $1`,
    [patientId],
  );
  return Number(rows[0]?.count);
};

beforeAll(async () => {
  await harness.start();
  org = await harness.createStaffOrganization();
  // Con una línea en blanco al final, como foods.int.spec.ts: la prueba de catálogos sigue siendo la primera en aplicar cada
  // archivo tal cual.
  for (const [kind, file] of [
    ['TPCA_FOODS', 'food/tpca-2017.csv'],
    ['TAFERA_MEASURES', 'food/tafera-2016-medidas.csv'],
    ['EXERCISE_LIBRARY', 'exercise/ejercicios-base.csv'],
    ['EXERCISE_PATTERN_CHOICES', 'exercise/pattern-choice-v3.csv'],
  ] as const) {
    const imported = await harness.app.get(CatalogImporter).run({
      kind,
      fileName: file,
      content: Buffer.concat([await readFile(new URL(file, SEEDS)), Buffer.from('\n')]),
      organizationId: null,
      startedBy: id() as UserId,
    });
    expect(['COMPLETED', 'DUPLICATE']).toContain(imported.status);
  }
  ({ patientId: luisId } = await luisWithPrescription(harness, org));
  const { cookie } = org.staff.responsible;
  api = {
    call: async (method, path, call = {}) => {
      const request =
        method === 'GET'
          ? harness.get(path, cookie)
          : method === 'POST'
            ? harness.post(path, call.body ?? undefined, cookie)
            : harness.put(path, call.body ?? {}, cookie);
      const response = await (call.ifMatch === undefined
        ? request
        : request.set('If-Match', `"${String(call.ifMatch)}"`));
      return { status: response.status, body: response.body as unknown };
    },
  };
  await seedDemo2(api, luisId, () => Promise.resolve());
  const rebuild = harness.app.get(AnalyticsRebuild);
  options = {
    luisId,
    mateoId,
    today,
    rebuild: async (patientId) => {
      await rebuild.patient(patientId);
    },
  };
  report = await seedDemo3(api, pool('owner'), options);
  // Lo que hace el worker con la API corriendo: los resultados de las evaluaciones de Mateo al leer su cierre, y el programa
  // vigente de cada uno y su volumen semanal al leer la publicación.
  await harness.deliver('assessment.calculation');
  await harness.deliver('tracking.programs');
  await harness.deliver('analytics.training-weeks');
});

afterAll(async () => {
  await harness.stop();
});

describe('Demo 3 · Luis', () => {
  it('G-20 · RN-G09 · su semana registrada: 1910 kcal de promedio, 104.1 % de adecuación y 4 de 7 días en rango', async () => {
    const week = lastWeek(today);
    expect(report.luis).toMatchObject({ program: 'CREATED', week });
    const diet = await get<{
      weeks: {
        weekStart: string;
        daysLogged: number;
        daysInRange: number;
        kcal: { consumed: number; adequacyPct: number };
      }[];
    }>(`/patients/${luisId}/analytics/diet?from=${week.from}&to=${week.to}`);
    const [logged] = diet.weeks;
    expect(logged?.weekStart).toBe(week.from);
    expect(logged?.daysLogged).toBe(7);
    expect(logged?.daysInRange).toBe(4);
    expect(logged?.kcal.consumed).toBeCloseTo(1910, 0);
    expect(logged?.kcal.adequacyPct).toBeCloseTo(104.1, 1);
  });

  it('RN-G16 · el control de su semana: fatiga promedio sobre el umbral, ámbar y ajustar 5–15 %', () => {
    expect(report.luis.light).toBe('AMBER');
  });

  it('RN-G14 · cada registro diario importado tiene su recuperación, con método y hash (RN-D01)', async () => {
    expect(await count('tracking.daily_checkin', luisId)).toBe(7);
    expect(await count('tracking.daily_readiness', luisId)).toBe(7);
  });
});

describe('Demo 3 · Mateo, el alumno ficticio de la hoja de Jeremy', () => {
  it('07 §10 · RN-G16 · sus cuatro semanas dan lo que da la hoja: descarga, descarga, continuar y continuar', async () => {
    expect(report.mateo).toMatchObject({ patient: 'CREATED', program: 'CREATED' });
    expect(report.mateo.reviews.filter((review) => review.weekNo <= 4)).toEqual([
      { weekNo: 1, light: 'RED', reasons: ['PERFORMANCE', 'SLEEP'], suggestedAction: 'DELOAD' },
      { weekNo: 2, light: 'RED', reasons: ['PERFORMANCE'], suggestedAction: 'DELOAD' },
      { weekNo: 3, light: 'GREEN', reasons: [], suggestedAction: 'CONTINUE' },
      { weekNo: 4, light: 'GREEN', reasons: [], suggestedAction: 'CONTINUE' },
    ]);
    // Las semanas cerradas después del mes no tienen registros: falta registro, como en la hoja.
    for (const review of report.mateo.reviews.filter(({ weekNo }) => weekNo > 4)) {
      expect(review).toMatchObject({ light: 'NO_DATA', suggestedAction: 'MISSING_LOG' });
    }
    const { reviews } = await get<{
      reviews: {
        weekNo: number;
        aggregates: {
          sessions: number;
          avgSleepHours: number;
          avgPerformancePct: number;
          avgNutritionCompliancePct: number;
        } | null;
      }[];
    }>(`/patients/${mateoId}/weekly-reviews`);
    const month = reviews
      .filter(({ weekNo }) => weekNo <= 4)
      .sort((a, b) => a.weekNo - b.weekNo)
      .map(({ aggregates }) => aggregates);
    // La evolución semanal de la hoja: sueño, rendimiento y alimentación, y 11 de 12 sesiones. Los promedios llegan sin
    // redondear (RN-D09): se redondean aquí, al comparar.
    const shown = (value: number | undefined) =>
      value === undefined ? null : Math.round(value * 10) / 10;
    expect(month.map((week) => shown(week?.avgSleepHours))).toEqual([6.4, 6.8, 7.1, 7.4]);
    expect(month.map((week) => shown(week?.avgPerformancePct))).toEqual([80, 80, 100, 100]);
    expect(month.map((week) => shown(week?.avgNutritionCompliancePct))).toEqual([78, 82, 88, 92]);
    expect(month.map((week) => week?.sessions)).toEqual([3, 3, 2, 3]);
  });

  it('RF-33 · RN-F04 · el 1RM de Epley y el tonelaje de la hoja', async () => {
    const training = await get<{
      weeks: {
        weekNo: number;
        phase: string | null;
        sessionsDone: number | null;
        tonnageKg: number | null;
      }[];
      oneRm: {
        exerciseName: string;
        formula: string;
        points: { localDate: string; estimated1rmKg: number }[];
      }[];
    }>(`/patients/${mateoId}/analytics/training`);
    const month = training.weeks.filter(({ weekNo }) => weekNo <= 4);
    expect(month.map(({ phase }) => phase)).toEqual([
      'Adaptación',
      'Base',
      'Acumulación',
      'Acumulación',
    ]);
    expect(month.map(({ sessionsDone }) => sessionsDone)).toEqual([3, 3, 2, 3]);
    // El volumen de la hoja (series × repeticiones × kg); la semana 3 sin la sentadilla del 22/10, que fue ausencia.
    expect(month.map(({ tonnageKg }) => tonnageKg)).toEqual([5220, 5490, 3420, 3750]);
    const bench = training.oneRm.find(({ exerciseName }) => exerciseName === 'Press banca');
    expect(bench?.formula).toBe('ONERM_EPLEY1985');
    // 12 × 40 kg → 56.0 kg, como el registro de cargas de la hoja.
    expect(bench?.points.map(({ estimated1rmKg }) => Math.round(estimated1rmKg * 10) / 10)).toEqual(
      [56, 59.5, 63, 46.7],
    );
  });

  it('RF-35 · peso, cintura, cadera y grasa de la comparativa física de la hoja', async () => {
    const evolution = await get<{
      sites: { siteCode: string; points: { value: number }[] }[];
      bia: { metric: string; points: { value: number }[] }[];
    }>(`/patients/${mateoId}/evolution`);
    const site = (code: string) =>
      evolution.sites.find(({ siteCode }) => siteCode === code)?.points.map(({ value }) => value);
    expect(site('BASIC_WEIGHT')).toEqual([80, 79]);
    expect(site('GIRTH_WAIST')).toEqual([88, 85]);
    expect(site('GIRTH_HIP')).toEqual([100, 99]);
    expect(
      evolution.bia.find(({ metric }) => metric === 'FAT_PCT')?.points.map(({ value }) => value),
    ).toEqual([22, 20.8]);
  });

  it('07 §2 · P-20 · su plan con Entrenamiento (2,510 kcal) y Descanso (2,230) con sus porciones, y la meta de cada día de octubre según su perfil', async () => {
    expect(report.mateo.plan).toBe('CREATED');
    const plans = await get<{ plans: { id: string; status: string }[] }>(
      `/patients/${mateoId}/nutrition-plans`,
    );
    const published = plans.plans.find(({ status }) => status === 'PUBLISHED');
    const plan = await get<{
      targets: { kcal: number; choG: number; proteinG: number; fatG: number };
      dayProfiles: {
        code: string;
        name: string;
        kcal: number;
        portions: {
          totals: { nutrients: Record<string, { value: number | null }> };
          adequacy: { cho: { pct: number } };
        } | null;
      }[];
    }>(`/nutrition-plans/${published?.id ?? ''}`);
    // Mandan los gramos (P-20.2): 160/310/70 g son 2,510 kcal y 160/240/70 g, 2,230.
    expect(Math.round(plan.targets.kcal)).toBe(2510);
    expect(Math.round(plan.targets.proteinG)).toBe(160);
    expect(Math.round(plan.targets.fatG)).toBe(70);
    expect(Math.round(plan.targets.choG)).toBe(310);
    expect(plan.dayProfiles).toMatchObject([{ code: 'REST', name: 'Descanso', kcal: 2230 }]);
    // P-20.5: Descanso es el mismo plan con menos pan en la media tarde y menos papa en la cena: unos 240 g de carbohidratos.
    const rest = plan.dayProfiles[0]?.portions;
    expect(Math.round(rest?.totals.nutrients.CHOCDF?.value ?? 0)).toBe(240);
    expect(rest?.adequacy.cho.pct).toBeGreaterThan(98);

    const { rows } = await pool('owner').query<{
      day: string;
      kcal: number;
      kind: string;
      profile: string;
    }>(
      `SELECT to_char(local_date, 'YYYY-MM-DD') AS day, round(kcal)::int AS kcal, day_kind AS kind,
              day_profile_code AS profile
       FROM tracking.daily_target WHERE patient_id = $1 AND local_date IN ('2026-10-06', '2026-10-07', '2026-10-22')
       ORDER BY local_date`,
      [mateoId],
    );
    expect(rows).toEqual([
      // Martes con «Full Body A»: Entrenamiento.
      { day: '2026-10-06', kcal: 2510, kind: 'TRAINING', profile: 'TRAINING' },
      // Miércoles sin sesión: Descanso.
      { day: '2026-10-07', kcal: 2230, kind: 'REST', profile: 'REST' },
      // La ausencia del 22/10 no cambia la meta: nadie reprogramó la sesión (P-20.3).
      { day: '2026-10-22', kcal: 2510, kind: 'TRAINING', profile: 'TRAINING' },
    ]);
  });

  it('RN-G14 · un registro diario por día, con su recuperación; la ausencia queda como sesión no hecha', async () => {
    expect(await count('tracking.daily_checkin', mateoId)).toBe(28);
    expect(await count('tracking.daily_readiness', mateoId)).toBe(28);
    const { rows } = await pool('owner').query<{ outcome: string; count: string }>(
      `SELECT outcome, count(*) FROM tracking.workout_log WHERE patient_id = $1 GROUP BY outcome ORDER BY outcome`,
      [mateoId],
    );
    expect(rows).toEqual([
      { outcome: 'COMPLETED', count: '11' },
      { outcome: 'SKIPPED', count: '1' },
    ]);
  });
});

describe('Demo 3 · otra vez', () => {
  it('correrla otra vez no duplica nada', async () => {
    expect(await seedDemo3(api, pool('owner'), options)).toEqual({
      luis: { program: 'EXISTING', week: null, light: null },
      mateo: { patient: 'EXISTING', plan: 'EXISTING', program: 'EXISTING', reviews: [] },
    });
    expect(await count('tracking.daily_checkin', luisId)).toBe(7);
    expect(await count('tracking.daily_checkin', mateoId)).toBe(28);
    const { rows } = await pool('owner').query<{ count: string }>(
      `SELECT count(*) FROM clinical.patient WHERE id = $1`,
      [mateoId],
    );
    expect(rows[0]?.count).toBe('1');
  });
});

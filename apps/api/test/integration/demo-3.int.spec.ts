import { readFile } from 'node:fs/promises';
import {
  mesocycleReportSchema,
  mesocycleReportsResponseSchema,
  patientMesocycleReportsResponseSchema,
} from '@nutricoach/contracts';
import type { UserId } from '@nutricoach/shared-kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedDemo2, type DemoApi } from '../../scripts/demo-2.js';
import { lastWeek, seedDemo3, type Demo3Options, type Demo3Report } from '../../scripts/demo-3.js';
import { AnalyticsRebuild } from '../../src/modules/analytics/index.js';
import { CatalogImporter } from '../../src/platform/index.js';
import { ApiHarness, PASSWORD, type StaffOrganization } from './support/api-harness.js';
import { errorCode, id, PG, pool, withContext } from './support/database.js';
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
        avgStress: number | null;
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
    // La evolución semanal de la hoja: sueño, rendimiento y alimentación, y las 12 sesiones (el 22/10 asistió, P-33). Los
    // promedios llegan sin redondear (RN-D09): se redondean aquí, al comparar.
    const shown = (value: number | undefined) =>
      value === undefined ? null : Math.round(value * 10) / 10;
    expect(month.map((week) => shown(week?.avgSleepHours))).toEqual([6.4, 6.8, 7.1, 7.4]);
    expect(month.map((week) => shown(week?.avgPerformancePct))).toEqual([80, 80, 100, 100]);
    // La alimentación sale del check-in de cada domingo, no del registro diario (P-21, P-22; ADR-109).
    expect(month.map((week) => shown(week?.avgNutritionCompliancePct))).toEqual([78, 82, 88, 92]);
    expect(await count('tracking.weekly_checkin', mateoId)).toBe(4);
    expect(month.map((week) => week?.sessions)).toEqual([3, 3, 3, 3]);
    // El estrés de la hoja, en el resumen del control: solo informa (P-25; P14.5, PR 6a; ADR-107).
    expect(
      reviews
        .filter(({ weekNo }) => weekNo <= 4)
        .sort((a, b) => a.weekNo - b.weekNo)
        .map(({ avgStress }) => avgStress),
    ).toEqual([3, 4, 3, 2]);
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
    expect(month.map(({ sessionsDone }) => sessionsDone)).toEqual([3, 3, 3, 3]);
    // El volumen de la hoja (series × repeticiones × kg), con la sentadilla del 22/10 en la semana 3 (P-33).
    expect(month.map(({ tonnageKg }) => tonnageKg)).toEqual([5220, 5490, 5760, 3750]);
    const bench = training.oneRm.find(({ exerciseName }) => exerciseName === 'Press banca');
    expect(bench?.formula).toBe('ONERM_EPLEY1985');
    // 12 × 40 kg → 56.0 kg, como el registro de cargas de la hoja.
    expect(bench?.points.map(({ estimated1rmKg }) => Math.round(estimated1rmKg * 10) / 10)).toEqual(
      [56, 59.5, 63, 46.7],
    );
  });

  it('P14.5 · RN-G16 · P-23 y P-24 · el panel de fatiga reproduce las semanas de la hoja: ámbar, rojo, ámbar y verde', async () => {
    const training = await get<{
      methods: { fatiguePanel: { code: string; version: string } };
      weeks: {
        weekNo: number;
        fatigue: {
          adjustedVolumeKg: number | null;
          baseVolumeKg: number | null;
          loadChangePct: number | null;
          load: string;
          recovery: string;
          perceivedFatigue: string;
          overall: string;
        } | null;
      }[];
    }>(`/patients/${mateoId}/analytics/training`);
    expect(training.methods.fatiguePanel).toEqual({ code: 'FATIGUE_PANEL_JV', version: '1.0.0' });
    // Las semanas 1 a 5: la 5 ya cerró y no tiene registros.
    const panel = training.weeks.filter(({ weekNo }) => weekNo <= 5).map(({ fatigue }) => fatigue);
    expect(panel.map((week) => week?.adjustedVolumeKg)).toEqual([5220, 5490, 6336, 3375, null]);
    expect(panel.map((week) => week?.baseVolumeKg)).toEqual([null, 5220, 5355, 5682, 5067]);
    expect(panel.map((week) => week?.load)).toEqual([
      'NO_BASE',
      'GREEN',
      'AMBER',
      'GREEN',
      'NO_DATA',
    ]);
    expect(panel.map((week) => week?.recovery)).toEqual([
      'AMBER',
      'RED',
      'AMBER',
      'GREEN',
      'NO_DATA',
    ]);
    expect(panel.map((week) => week?.overall)).toEqual([
      'AMBER',
      'RED',
      'AMBER',
      'GREEN',
      'NO_DATA',
    ]);
    expect(panel[2]?.loadChangePct).toBeCloseTo(18.3, 1);
  });

  it('P14.5 · RN-G16 · P-27 · la fatiga por grupo muscular de la semana 5 compara con las semanas 2 a 4', async () => {
    const training = await get<{
      methods: { muscleFatigue: { code: string; version: string } };
      weeks: {
        weekNo: number;
        muscleFatigue: {
          baseWeeks: number;
          muscles: {
            muscleCode: string;
            trainingFatigueKg: number | null;
            baseVolumeKg: number | null;
            state: string;
            recoveryHours: number | null;
            coefficients: Record<string, number> | null;
          }[];
        } | null;
      }[];
    }>(`/patients/${mateoId}/analytics/training`);
    expect(training.methods.muscleFatigue).toEqual({ code: 'MUSCLE_FATIGUE_JV', version: '1.1.0' });
    const fatigueOf = (weekNo: number) =>
      training.weeks.find((week) => week.weekNo === weekNo)?.muscleFatigue;
    const muscle = (weekNo: number, code: string) =>
      fatigueOf(weekNo)?.muscles.find(({ muscleCode }) => muscleCode === code);
    // 1.0 para el principal y 0.5 para el secundario (Rodrigo, 2026-11-11): el press banca de las semanas 2 a 4 da 1,419 al pecho
    // y 709.5 al tríceps y al deltoides anterior, no los 1,461.6 y 312.2 de la hoja.
    expect(fatigueOf(5)?.baseWeeks).toBe(3);
    expect(muscle(5, 'CHEST')).toEqual({
      muscleCode: 'CHEST',
      trainingFatigueKg: null,
      baseVolumeKg: 1419,
      changePct: null,
      state: 'NO_DATA',
      recoveryHours: null,
      coefficients: null,
    });
    expect(muscle(5, 'TRICEPS')?.baseVolumeKg).toBe(709.5);
    expect(muscle(5, 'FRONT_DELTOID')?.baseVolumeKg).toBe(709.5);
    // El jalón va a Dorsal y la sentadilla a Cuádriceps (P-27, punto 2): la base no queda vacía.
    expect(muscle(5, 'LATS')?.baseVolumeKg).toBe(1590);
    expect(muscle(5, 'QUADRICEPS')?.baseVolumeKg).toBe(2058);
    // La semana 3, ámbar como la carga del panel: el pecho sube de 1,485 a 1,782 (+20 %), 60 h.
    expect(muscle(3, 'CHEST')).toMatchObject({
      trainingFatigueKg: 1782,
      baseVolumeKg: 1485,
      state: 'AMBER',
      recoveryHours: 60,
    });
    expect(muscle(1, 'CHEST')?.state).toBe('NO_BASE');
  });

  it('P14.5 · RN-G16 · P-27.1 · P-27.2 · los coeficientes de cada grupo, por la familia de sus ejercicios', async () => {
    const training = await get<{
      weeks: {
        weekNo: number;
        muscleFatigue: {
          muscles: {
            muscleCode: string;
            state: string;
            coefficients: Record<string, number> | null;
          }[];
        } | null;
      }[];
    }>(`/patients/${mateoId}/analytics/training`);
    const coefficientsOf = (weekNo: number, code: string) => {
      const row = training.weeks
        .find((week) => week.weekNo === weekNo)
        ?.muscleFatigue?.muscles.find(({ muscleCode }) => muscleCode === code);
      return row?.coefficients
        ? [
            row.coefficients.muscularFatigue,
            row.coefficients.neuralFatigue,
            row.coefficients.axialLoad,
            row.coefficients.technicalDemand,
          ].map((value) => Math.round((value ?? Number.NaN) * 1e9) / 1e9)
        : null;
    };
    // Semana 3: el press banca (empuje horizontal con barra) es «torso libre»; la sentadilla trasera, «pierna y cadera»; el jalón
    // al pecho (tracción vertical en polea), «guiados y poleas». Cada grupo recibe una sola familia: sus coeficientes son los de ella.
    expect(coefficientsOf(3, 'CHEST')).toEqual([1.1, 1.1, 1.0, 1.1]);
    expect(coefficientsOf(3, 'TRICEPS')).toEqual([1.1, 1.1, 1.0, 1.1]);
    expect(coefficientsOf(3, 'QUADRICEPS')).toEqual([1.2, 1.3, 1.3, 1.2]);
    expect(coefficientsOf(3, 'LATS')).toEqual([1.0, 1.0, 0.8, 0.9]);
    // Solo informan: el pecho sigue en ámbar como antes (P-27.1, punto 2). La semana 5 no se entrenó: sin coeficientes.
    expect(
      training.weeks
        .find((week) => week.weekNo === 3)
        ?.muscleFatigue?.muscles.find(({ muscleCode }) => muscleCode === 'CHEST')?.state,
    ).toBe('AMBER');
    expect(coefficientsOf(5, 'CHEST')).toBeNull();
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
      // El 22/10 tiene su sesión: Entrenamiento (P-20.4, P-33).
      { day: '2026-10-22', kcal: 2510, kind: 'TRAINING', profile: 'TRAINING' },
    ]);
  });

  it('RN-G14 · un registro diario por día, con su recuperación, y las 12 sesiones hechas (el 22/10 asistió, P-33)', async () => {
    expect(await count('tracking.daily_checkin', mateoId)).toBe(28);
    expect(await count('tracking.daily_readiness', mateoId)).toBe(28);
    const { rows } = await pool('owner').query<{ outcome: string; count: string }>(
      `SELECT outcome, count(*) FROM tracking.workout_log WHERE patient_id = $1 GROUP BY outcome ORDER BY outcome`,
      [mateoId],
    );
    expect(rows).toEqual([{ outcome: 'COMPLETED', count: '12' }]);
  });
});

describe('P14.5 · RN-G19 · P-28 y P-29 · el informe del primer mesociclo de Mateo', () => {
  const MESOCYCLE_2_END = '2026-11-30';
  let reportId: string;
  let programId: string;
  let patientCookie: string;

  const staff = () => org.staff.responsible.cookie;
  const report = async (path = `/mesocycle-reports/${reportId}`, cookie = staff()) => {
    const response = await harness.get(path, cookie);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    return mesocycleReportSchema.parse(response.body);
  };
  const owner = async (sql: string, params: unknown[]) => pool('owner').query(sql, params);

  it('sus dos mesociclos: el primero, del 06/10 al 02/11, ya cerró; ninguno tiene informe', async () => {
    const list = mesocycleReportsResponseSchema.parse(
      await get(`/patients/${mateoId}/mesocycle-reports`),
    );
    programId = list.program?.programId ?? '';
    expect(list.program?.name).toBe('Full Body');
    expect(
      list.mesocycles.map(({ position, name, startDate, endDate, closed, report: r }) => [
        position,
        name,
        startDate,
        endDate,
        closed,
        r,
      ]),
    ).toEqual([
      [1, 'Mesociclo 1', '2026-10-06', '2026-11-02', true, null],
      [2, 'Mesociclo 2', '2026-11-03', MESOCYCLE_2_END, today > MESOCYCLE_2_END, null],
    ]);
  });

  it('el borrador: uno por mesociclo; otra vez, 409', async () => {
    const created = await harness.post(
      `/patients/${mateoId}/mesocycle-reports`,
      { programId, mesocyclePosition: 1 },
      staff(),
    );
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    reportId = (created.body as { id: string }).id;
    expect(created.body).toEqual({ id: reportId, version: 0 });
    const again = await harness.post(
      `/patients/${mateoId}/mesocycle-reports`,
      { programId, mesocyclePosition: 1 },
      staff(),
    );
    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({ code: 'NC-TRA-030', rule: 'RN-G19' });
  });

  it('G-44 con la demo · 9 de 9 series cada semana, récords en las semanas 2 y 3 y los promedios de la hoja', async () => {
    const { status, closed, body } = await report();
    expect({ status, closed }).toEqual({ status: 'DRAFT', closed: true });
    expect(body?.program.oneRmMethod).toEqual({ code: 'ONERM_EPLEY1985', version: '1.0.0' });
    const numbers = body?.numbers;
    expect(numbers?.method).toEqual({ code: 'MESOCYCLE_REPORT_JV', version: '1.0.0' });
    expect(
      numbers?.weeks.map(({ plannedSets, doneSets, volumePct, sessionsDone, records }) => [
        plannedSets,
        doneSets,
        volumePct,
        sessionsDone,
        records,
      ]),
    ).toEqual([
      [9, 9, 100, 3, 0],
      [9, 9, 100, 3, 3],
      [9, 9, 100, 3, 3],
      [9, 9, 100, 3, 0],
    ]);
    expect(numbers?.total).toEqual({
      plannedSets: 36,
      doneSets: 36,
      volumePct: 100,
      sessionsPlanned: 12,
      sessionsDone: 12,
      records: 6,
    });
    expect(numbers?.averages.sleepHours).toBeCloseTo(6.925, 9);
    expect(numbers?.averages).toMatchObject({
      stress: 3,
      fatigue: 3,
      performancePct: 90,
      nutritionPct: 85,
    });
    expect(
      numbers?.records
        .filter(({ weekNo }) => weekNo === 2)
        .map(({ exerciseName, estimated1rmKg, previousBestKg }) => [
          exerciseName,
          estimated1rmKg,
          previousBestKg,
        ]),
    ).toEqual([
      ['Press banca', 59.5, 56],
      ['Sentadilla trasera', 87.5, 84],
      ['Jalón al pecho', 66.5, 63],
    ]);
    expect(body?.reviews.map(({ light }) => light)).toEqual(['RED', 'RED', 'GREEN', 'GREEN']);
    const weight = body?.evolution?.sites.find(({ siteCode }) => siteCode === 'BASIC_WEIGHT');
    expect(weight?.points.map(({ value }) => value)).toEqual([80, 79]);
    expect(body?.evolution?.skinfoldSum6).toBeNull();
  });

  it('los textos con If-Match; se envía con los cuatro, y enviado queda congelado', async () => {
    const draft = {
      achievement: 'Cumplió 12 de 12 sesiones.',
      limitation: null,
      adjustment: null,
      priority: null,
    };
    const saved = await harness
      .put(`/mesocycle-reports/${reportId}`, draft, staff())
      .set('If-Match', '0');
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.body).toEqual({ id: reportId, version: 1 });
    const stale = await harness
      .put(`/mesocycle-reports/${reportId}`, draft, staff())
      .set('If-Match', '0');
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ code: 'NC-TRA-035' });

    const incomplete = await harness
      .post(`/mesocycle-reports/${reportId}/send`, undefined, staff())
      .set('If-Match', '1');
    expect(incomplete.status).toBe(422);
    expect(incomplete.body).toMatchObject({ code: 'NC-TRA-034', rule: 'RN-G19' });

    const complete = await harness
      .put(
        `/mesocycle-reports/${reportId}`,
        {
          achievement: 'Cumplió 12 de 12 sesiones.',
          limitation: 'Sueño y estrés elevados durante la semana 2.',
          adjustment: 'Mantener tres sesiones.',
          priority: 'Consolidar hábitos de sueño.',
        },
        staff(),
      )
      .set('If-Match', '1');
    expect(complete.status, JSON.stringify(complete.body)).toBe(200);
    const sent = await harness
      .post(`/mesocycle-reports/${reportId}/send`, undefined, staff())
      .set('If-Match', '2');
    expect(sent.status, JSON.stringify(sent.body)).toBe(200);
    expect(sent.body).toEqual({ id: reportId, version: 3 });

    const frozen = await report();
    expect(frozen).toMatchObject({
      status: 'SENT',
      version: 3,
      priority: 'Consolidar hábitos de sueño.',
    });
    expect(frozen.body?.numbers?.total.records).toBe(6);
    const edit = await harness
      .put(`/mesocycle-reports/${reportId}`, { ...draft, achievement: 'Otro' }, staff())
      .set('If-Match', '3');
    expect(edit.status).toBe(409);
    expect(edit.body).toMatchObject({ code: 'NC-TRA-033' });
    // La base lo impide aunque se salte la API (RN-D08).
    await expect(
      owner(`UPDATE training.mesocycle_report SET achievement = 'Otro' WHERE id = $1`, [reportId]),
    ).rejects.toThrow(/ya se envió/);
  });

  it('el segundo mesociclo todavía no cierra: su borrador no se envía', async () => {
    const created = await harness.post(
      `/patients/${mateoId}/mesocycle-reports`,
      { programId, mesocyclePosition: 2 },
      staff(),
    );
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const second = (created.body as { id: string }).id;
    const texts = { achievement: 'a', limitation: 'b', adjustment: 'c', priority: 'd' };
    expect(
      (await harness.put(`/mesocycle-reports/${second}`, texts, staff()).set('If-Match', '0'))
        .status,
    ).toBe(200);
    const send = await harness
      .post(`/mesocycle-reports/${second}/send`, undefined, staff())
      .set('If-Match', '1');
    if (today > MESOCYCLE_2_END) {
      expect(send.status).toBe(200);
    } else {
      expect(send.status).toBe(409);
      expect(send.body).toMatchObject({ code: 'NC-TRA-032', rule: 'RN-G19' });
    }
  });

  it('el alumno ve solo lo enviado en su app y escribe su comentario; el coach lo lee', async () => {
    const email = `mateo-${id()}@demo.test`;
    const invited = await harness.post(`/patients/${mateoId}/invitation`, { email }, staff());
    expect(invited.status, JSON.stringify(invited.body)).toBeLessThan(300);
    const token = await harness.invitationTokenFor(email);
    const inspected = await harness.post('/invitations/inspect', { token });
    const accepted = await harness.post('/invitations/accept', {
      token,
      password: PASSWORD,
      acceptedConsentDocumentIds: (inspected.body as { consents: { id: string }[] }).consents.map(
        (consent) => consent.id,
      ),
    });
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(200);
    const raw = accepted.headers['set-cookie'] as unknown as string[] | undefined;
    patientCookie = raw?.find((c) => c.startsWith('nc_session='))?.split(';')[0] ?? '';

    const mine = await harness.get('/me/mesocycle-reports', patientCookie);
    expect(mine.status, JSON.stringify(mine.body)).toBe(200);
    const { reports } = patientMesocycleReportsResponseSchema.parse(mine.body);
    expect(reports.map(({ id: reportOf, mesocycleName }) => [reportOf, mesocycleName])).toEqual(
      today > MESOCYCLE_2_END
        ? expect.arrayContaining([[reportId, 'Mesociclo 1']])
        : [[reportId, 'Mesociclo 1']],
    );
    const seen = await report(`/me/mesocycle-reports/${reportId}`, patientCookie);
    expect(seen.body?.numbers?.total.volumePct).toBe(100);

    const comment = await harness
      .put(
        `/me/mesocycle-reports/${reportId}/comment`,
        { comment: '  Me siento con más energía y mejor control de la rutina.  ' },
        patientCookie,
      )
      .set('Idempotency-Key', `test:${id()}`);
    expect(comment.status, JSON.stringify(comment.body)).toBe(200);
    expect(comment.body).toMatchObject({
      studentComment: 'Me siento con más energía y mejor control de la rutina.',
    });
    expect((await report()).studentComment).toBe(
      'Me siento con más energía y mejor control de la rutina.',
    );
  });

  it('RLS · el alumno no ve borradores ni cambia lo del coach; el coach no escribe el comentario', async () => {
    const [draft] = (
      await owner(
        `INSERT INTO training.mesocycle_report (id, organization_id, patient_id, program_lineage_id, mesocycle_position, created_by)
         SELECT $1, organization_id, patient_id, program_lineage_id, 9, created_by FROM training.mesocycle_report WHERE id = $2
         RETURNING id`,
        [id(), reportId],
      )
    ).rows as { id: string }[];
    const asPatient = { orgId: org.organizationId, role: 'PATIENT' as const, patientId: mateoId };
    await withContext('user', asPatient, async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `SELECT id FROM training.mesocycle_report WHERE patient_id = $1`,
        [mateoId],
      );
      expect(rows.map((row) => row.id)).not.toContain(draft?.id);
      expect(rows.map((row) => row.id)).toContain(reportId);
      expect(
        await errorCode(
          client,
          `UPDATE training.mesocycle_report SET achievement = 'x' WHERE id = $1`,
          [reportId],
        ),
      ).toBe('23514');
      expect(
        await errorCode(
          client,
          `INSERT INTO training.mesocycle_report (id, organization_id, patient_id, program_lineage_id, mesocycle_position, created_by)
           VALUES ($1, $2, $3, $4, 10, $3)`,
          [id(), org.organizationId, mateoId, id()],
        ),
      ).toBe(PG.insufficientPrivilege);
    });
    const { responsible } = org.staff;
    await withContext(
      'user',
      {
        orgId: org.organizationId,
        role: 'PROFESSIONAL',
        userId: responsible.userId,
        memberId: responsible.memberId,
      },
      async (client) => {
        expect(
          await errorCode(
            client,
            `UPDATE training.mesocycle_report SET student_comment = 'x', student_commented_at = now() WHERE id = $1`,
            [reportId],
          ),
        ).toBe(PG.insufficientPrivilege);
      },
    );
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

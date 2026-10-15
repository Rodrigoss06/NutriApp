import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { seriousViolations } from './support/axe';
import {
  apiAs,
  createOrganization,
  grantInPersonByApi,
  loginInPage,
  registerPatientByApi,
} from './support/stack';

/**
 * Demo 1 de punta a punta (docs/demos/demo-1.md, criterio de P7): los siete pasos del guion en una organización propia,
 * con Luis creado aquí (alta, consentimiento, historia, evaluaciones ISAK 2, cierre, resultados y energía) y Ana para la
 * captura en vivo. Las cifras coinciden con los casos dorados G-01 a G-17 (página 03). Escritorio y celular, con axe
 * en cada pantalla nueva. Datos sintéticos: los de seeds/luis y seeds/ana.
 */

interface SiteSeed {
  readonly code: string;
  readonly nameEs: string;
}
interface EvaluationSeed {
  readonly conditions: { fasting: boolean; intenseActivityLast24h: boolean; hydration: string };
  readonly measurements: Readonly<Record<string, readonly number[]>>;
}
interface BiaSeed {
  readonly deviceBrand: string;
  readonly deviceModel: string;
  readonly readings: readonly {
    metric: string;
    value: number;
    unit: string;
    deviceLabel: string;
  }[];
}
interface LuisSeed {
  readonly clinicalHistory: { answers: Readonly<Record<string, string>> };
  readonly technicalErrorStudy: { sites: readonly { siteCode: string; pairs: number[][] }[] };
  readonly evaluations: {
    previous: EvaluationSeed & { daysBeforeCurrentEvaluation: number };
    current: EvaluationSeed & { biaReading: BiaSeed };
  };
}
interface AnaSeed {
  readonly liveCapture: {
    measurements: Readonly<Record<string, readonly number[]>>;
    extraSite: { siteCode: string; steps: { attempts: number[] }[] };
    amendment: { reason: string; measurements: Readonly<Record<string, readonly number[]>> };
  };
}

const seed = (path: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../../seeds/${path}`, import.meta.url), 'utf8'));
const luis = seed('luis/luis.json') as LuisSeed;
const ana = seed('ana/ana.json') as AnaSeed;
const catalog = seed('assessment/measurement-sites.json') as { sites: SiteSeed[] };
const siteName = (code: string): string => {
  const site = catalog.sites.find((s) => s.code === code);
  if (!site) throw new Error(`Sitio ${code} fuera del catálogo`);
  return site.nameEs;
};

/** Fecha de hoy en Lima y la de nacimiento que da esa edad hoy. */
const todayInLima = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
const bornYearsAgo = (years: number) => {
  const [year = '', month = '', day = ''] = todayInLima().split('-');
  return `${String(Number(year) - years)}-${month}-${day}`;
};

async function choose(page: Page, label: string, option: string | RegExp): Promise<void> {
  await page.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option }).first().click();
}

async function recordTab(page: Page, name: string): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Secciones del expediente' })
    .getByRole('link', { name, exact: true })
    .click();
}

/** Las tomas de un sitio en la captura, como las escribe la persona: Enter guarda y avanza. */
async function typeAttempts(page: Page, code: string, attempts: readonly number[]): Promise<void> {
  const name = siteName(code);
  for (const [index, value] of attempts.entries()) {
    const input = page.getByLabel(`${name}, toma ${String(index + 1)}`, { exact: true });
    await input.fill(value.toFixed(1));
    if (index === attempts.length - 1) await input.press('Enter');
  }
}

const siteRow = (page: Page, code: string): Locator =>
  page.getByRole('listitem').filter({ has: page.getByText(siteName(code), { exact: true }) });

/** Una tarjeta de la sección «Índices»: «IMC», «Índice cintura/talla»… */
const indexCard = (page: Page, label: string): Locator =>
  page
    .getByRole('region', { name: 'Índices' })
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: label, exact: true }) });

const metric = (page: Page, method: string, code: string): Locator =>
  page.getByRole('article', { name: method, exact: true }).locator(`[data-metric="${code}"]`);

async function closeEvaluation(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Cerrar evaluación' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cerrar evaluación' }).click();
}

test.describe('Demo 1 · base y evaluación (P7)', () => {
  test('los siete pasos del guion con Luis y Ana dan G-01 a G-17', async ({ page }) => {
    test.setTimeout(10 * 60_000);
    const organization = await createOrganization('Consultorio Demo E2E');
    const owner = organization.ownerEmail;

    await test.step('1 · entrar como dueña: organización, cupo y coeficiente de Lee (RF-01 a RF-03, RN-D11)', async () => {
      await loginInPage(page, owner);
      await page.goto('/panel/organizacion');
      await expect(
        page.getByRole('heading', { level: 2, name: 'Suscripción y cupo' }),
      ).toBeVisible();
      await page.goto('/panel/ajustes');
      await expect(page.getByRole('heading', { level: 1, name: 'Ajustes' })).toBeVisible();
      await expect(
        page.getByText('Sin coeficiente: la masa muscular de Lee no se calcula'),
      ).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);
      await choose(page, 'Coeficiente de grupo de referencia de Lee (2000)', '0');
      await expect(page.getByText('Vigente:')).toContainText('0');
      // Los métodos por población de la organización (RF-16, RN-D05): para un adulto, Durnin & Womersley + Siri.
      const adults = page.getByRole('region', { name: 'Adulto', exact: true });
      await expect(adults).toContainText('Durnin & Womersley (1974) + Siri');
      await expect(adults).toContainText('Masa ósea (Rocha)');
    });

    let luisId = '';
    await test.step('2 · Luis: alta, consentimiento, historia y expediente (RF-05, RF-08 a RF-10)', async () => {
      await page.goto('/panel/pacientes/nuevo');
      await page.getByLabel('Nombres').fill('Luis');
      await page.getByLabel('Apellidos').fill('Ejemplo Sintético');
      await choose(page, 'Sexo', 'Masculino');
      await page.getByLabel('Fecha de nacimiento').fill(bornYearsAgo(28));
      await page.getByRole('button', { name: 'Registrar paciente' }).click();
      await page.waitForURL(/\/panel\/pacientes\/[0-9a-f-]{36}$/);
      luisId = new URL(page.url()).pathname.split('/').at(-1) ?? '';
      await expect(
        page.getByRole('heading', { level: 1, name: 'Luis Ejemplo Sintético' }),
      ).toBeVisible();

      await recordTab(page, 'Consentimientos');
      await choose(page, 'Consentimiento', 'Datos de salud');
      await page.getByRole('button', { name: 'Registrar consentimiento' }).click();
      await expect(page.getByRole('listitem').filter({ hasText: 'Datos de salud' })).toContainText(
        'Vigente',
      );

      await recordTab(page, 'Historia clínica');
      const answers = luis.clinicalHistory.answers;
      await page.getByLabel('Hábitos de alimentación').fill(answers['dietHabits'] ?? '');
      await page.getByLabel('Actividad física').fill(answers['physicalActivity'] ?? '');
      await page.getByLabel('Sueño').fill(answers['sleep'] ?? '');
      await page.getByLabel('Objetivos que cuenta').fill(answers['goals'] ?? '');
      await page.getByRole('button', { name: 'Guardar historia clínica' }).click();
      await expect(page.getByText('Revisión 1 guardada')).toBeVisible();
    });

    await test.step('3 · captura en vivo con Ana: tercera toma, cierre y enmienda (RF-11, RF-14, G-01 a G-03)', async () => {
      const anaPatient = await registerPatientByApi(owner, {
        firstName: 'Ana',
        lastName: 'Ejemplo Sintético',
        birthDate: bornYearsAgo(34),
      });
      await grantInPersonByApi(owner, anaPatient.id, 'HEALTH_DATA');
      await page.goto(`/panel/pacientes/${anaPatient.id}`);
      await recordTab(page, 'Evaluaciones');
      expect(await seriousViolations(page)).toEqual([]);
      await page.getByRole('link', { name: 'Nueva evaluación' }).click();
      await expect(page.getByRole('heading', { level: 2, name: 'Nueva evaluación' })).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);
      await choose(page, 'Nivel', /^Nivel básico/);
      await page.getByLabel('En ayunas').check();
      await page.getByLabel('Hidratación').fill('Normal');
      await page.getByRole('button', { name: 'Crear evaluación' }).click();
      await page.waitForURL(/\/evaluaciones\/[0-9a-f-]{36}$/);
      await expect(page.getByRole('heading', { level: 2, name: 'Nivel básico' })).toBeVisible();

      for (const [code, attempts] of Object.entries(ana.liveCapture.measurements)) {
        await typeAttempts(page, code, attempts);
      }
      await expect(siteRow(page, 'BASIC_HEIGHT')).toContainText('Consolidado 160.1 cm');
      await expect(siteRow(page, 'GIRTH_WAIST')).toContainText('Consolidado 72.6 cm');
      await expect(page.getByText('4 de 4 sitios del nivel listos')).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);

      // Tríceps como sitio extra: G-01, G-02 (pide la 3.ª toma y bloquea el cierre) y G-03.
      const extra = ana.liveCapture.extraSite;
      await choose(page, 'Sitio extra', siteName(extra.siteCode));
      await page.getByRole('button', { name: 'Agregar sitio' }).click();
      const triceps = siteRow(page, extra.siteCode);
      const [g01, g02, g03] = extra.steps;
      await typeAttempts(page, extra.siteCode, g01?.attempts ?? []);
      await expect(triceps).toContainText('Diferencia 3.3 %');
      await expect(triceps).toContainText('Consolidado 12.2 mm');
      await expect(triceps.getByText('Guardado')).toBeVisible();
      await typeAttempts(page, extra.siteCode, g02?.attempts ?? []);
      await expect(triceps).toContainText('Diferencia 8.3 %');
      await expect(triceps).toContainText('Falta la 3.ª toma');
      await expect(page.getByRole('button', { name: 'Cerrar evaluación' })).toBeDisabled();
      await expect(
        page.getByText(/Falta la 3\.ª toma en pliegue del tríceps/).first(),
      ).toBeVisible();
      await typeAttempts(page, extra.siteCode, g03?.attempts ?? []);
      await expect(triceps).toContainText('Consolidado 12.6 mm');
      await expect(triceps).toContainText('la del medio de 3 tomas');

      await closeEvaluation(page);
      await expect(indexCard(page, 'IMC')).toContainText('22.8', { timeout: 30_000 });
      await expect(indexCard(page, 'IMC')).toContainText('Normal');
      await expect(indexCard(page, 'IMC')).toContainText('Fuente: OMS');
      await expect(indexCard(page, 'Índice cintura/talla')).toContainText('0.45');
      await expect(indexCard(page, 'Índice cintura/talla')).toContainText('Sin riesgo aumentado');
      await expect(indexCard(page, 'Índice cintura/talla')).toContainText('NICE');
      await expect(indexCard(page, 'Índice cintura/cadera')).toContainText('0.76');
      await expect(indexCard(page, 'Índice cintura/cadera')).toContainText(
        'Sin obesidad abdominal',
      );
      await expect(indexCard(page, 'Perímetro de la cintura')).toContainText('72.6');
      expect(await seriousViolations(page)).toEqual([]);

      // Enmienda con motivo (RN-C07): se abre la revisión 2 con las mismas tomas.
      await page.getByRole('button', { name: 'Enmendar' }).click();
      await page.getByLabel('Motivo de la enmienda').fill(ana.liveCapture.amendment.reason);
      await page.getByRole('button', { name: 'Crear la revisión' }).click();
      await expect(page.getByText('Revisión 2', { exact: true })).toBeVisible();
      await expect(page.getByText(ana.liveCapture.amendment.reason)).toBeVisible();
      for (const [code, attempts] of Object.entries(ana.liveCapture.amendment.measurements)) {
        await typeAttempts(page, code, attempts);
      }
      await expect(siteRow(page, 'BASIC_WEIGHT')).toContainText('Consolidado 59.4 kg');
      await closeEvaluation(page);
      await expect(indexCard(page, 'IMC')).toContainText('23.2', { timeout: 30_000 });
      await recordTab(page, 'Evaluaciones');
      await expect(page.getByRole('row').filter({ hasText: 'Enmendada' })).toHaveCount(1);
      await expect(page.getByRole('row').filter({ hasText: 'revisión 2' })).toContainText(
        'Cerrada',
      );
    });

    await test.step('4 · ETM de la evaluadora y las evaluaciones ISAK 2 de Luis (RF-12, RF-13, RF-15, RF-16)', async () => {
      // ETM calculado con pares (RF-12, G-04).
      await page.goto('/panel/cuenta');
      await page.getByRole('button', { name: 'Registrar ETM' }).click();
      await page.getByRole('button', { name: 'Agregar los 6 pliegues de la suma' }).click();
      for (const study of luis.technicalErrorStudy.sites) {
        await page
          .getByLabel(`Pares de ${siteName(study.siteCode).toLowerCase()}`)
          .fill(study.pairs.map((pair) => pair.map((v) => v.toFixed(1)).join(' ')).join('\n'));
      }
      await page.getByRole('button', { name: 'Guardar ETM' }).click();
      const pooled = page.getByText(/Pliegues \(6 sitios con estudio\)/);
      await expect(pooled).toContainText('0.37 mm (2.35 %)');
      await expect(pooled).toContainText('CMD95 1.04 mm');
      expect(await seriousViolations(page)).toEqual([]);

      // La evaluación de hace 4 semanas se prepara por la API, a la misma hora del día que la de hoy.
      const previous = luis.evaluations.previous;
      const api = await apiAs(owner);
      const created = await api.post(`/api/v1/patients/${luisId}/evaluations`, {
        data: {
          kind: 'ANTHROPOMETRY',
          level: 'ISAK2',
          measuredAt: new Date(
            Date.now() - previous.daysBeforeCurrentEvaluation * 24 * 3_600_000,
          ).toISOString(),
          conditions: { schemaVersion: 1, ...previous.conditions },
        },
      });
      expect(created.status(), 'crear la evaluación anterior').toBe(201);
      let evaluation = (await created.json()) as { id: string; version: number };
      for (const [code, attempts] of Object.entries(previous.measurements)) {
        const put = await api.put(`/api/v1/evaluations/${evaluation.id}/measurements/${code}`, {
          data: { attempts },
          headers: { 'If-Match': `"${String(evaluation.version)}"` },
        });
        expect(put.status(), `tomas de ${code}`).toBe(200);
        evaluation = (await put.json()) as typeof evaluation;
      }
      const closed = await api.post(`/api/v1/evaluations/${evaluation.id}/close`, {
        headers: { 'If-Match': `"${String(evaluation.version)}"` },
      });
      expect(closed.status(), 'cerrar la evaluación anterior').toBe(200);
      await api.dispose();

      // La de hoy, por la interfaz: ISAK 2 con bioimpedancia, 42 sitios.
      const current = luis.evaluations.current;
      await page.goto(`/panel/pacientes/${luisId}/evaluaciones`);
      await page.getByRole('link', { name: 'Nueva evaluación' }).click();
      await choose(page, 'Tipo', 'Antropometría y bioimpedancia');
      await page.getByLabel('En ayunas').check();
      await page.getByLabel('Hidratación').fill(current.conditions.hydration);
      await page.getByRole('button', { name: 'Crear evaluación' }).click();
      await page.waitForURL(/\/evaluaciones\/[0-9a-f-]{36}$/);
      await expect(page.getByRole('heading', { level: 2, name: /^ISAK 2/ })).toBeVisible();
      for (const [code, attempts] of Object.entries(current.measurements)) {
        await typeAttempts(page, code, attempts);
      }
      await expect(page.getByText('42 de 42 sitios del nivel listos')).toBeVisible();
      await expect(page.getByText('Falta la lectura de bioimpedancia.')).toBeVisible();

      const bia = current.biaReading;
      await page.getByLabel('Marca del equipo').fill(bia.deviceBrand);
      await page.getByLabel('Modelo', { exact: true }).fill(bia.deviceModel);
      const fields: Readonly<Record<string, string>> = {
        FAT_PCT: 'Grasa corporal',
        FAT_MASS: 'Masa grasa',
        FAT_FREE_MASS: 'Masa libre de grasa',
        MUSCLE_MASS: 'Masa muscular',
        TOTAL_BODY_WATER: 'Agua corporal total',
        VISCERAL_FAT: 'Grasa visceral',
        PHASE_ANGLE: 'Ángulo de fase',
      };
      for (const reading of bia.readings) {
        const label = fields[reading.metric] ?? reading.metric;
        await page.getByLabel(label, { exact: true }).fill(String(reading.value));
        if (reading.metric === 'TOTAL_BODY_WATER') {
          await choose(page, 'Unidad de agua corporal total', 'L');
        }
      }
      await page.getByRole('button', { name: 'Guardar lectura' }).click();
      await expect(
        page.getByRole('article', { name: 'Lectura de Marca Demo BIA-200' }),
      ).toContainText('47.8 L');
      expect(await seriousViolations(page)).toEqual([]);
      await closeEvaluation(page);

      // Resultados de hoy: cada número con su método e interpretación con fuente (G-05 a G-12).
      await expect(indexCard(page, 'IMC')).toContainText('26.1', { timeout: 30_000 });
      await expect(indexCard(page, 'IMC')).toContainText('Sobrepeso');
      await expect(indexCard(page, 'Índice cintura/talla')).toContainText('0.49');
      await expect(indexCard(page, 'Índice cintura/talla')).toContainText('Sin riesgo aumentado');
      await expect(indexCard(page, 'Índice cintura/cadera')).toContainText('0.88');
      const dw = 'Durnin & Womersley (1974) + Siri';
      await expect(metric(page, dw, 'SKINFOLD_SUM_MM')).toContainText('56.0');
      await expect(metric(page, dw, 'BODY_DENSITY')).toContainText('1.05261');
      await expect(metric(page, dw, 'FAT_PCT')).toContainText('20.3');
      await expect(metric(page, dw, 'FAT_PCT')).toContainText('Promedio');
      await expect(metric(page, dw, 'FAT_MASS_KG')).toContainText('16.2');
      await expect(metric(page, dw, 'FAT_FREE_MASS_KG')).toContainText('63.8');
      await expect(page.getByRole('article', { name: dw })).toContainText('Principal: % de grasa');
      await expect(metric(page, 'Faulkner (1968)', 'FAT_PCT')).toContainText('16.0');
      await expect(metric(page, 'Yuhasz (versión de Carter, 6 pliegues)', 'FAT_PCT')).toContainText(
        '12.6',
      );
      const comp4 = '4 componentes (De Rose y Guimarães)';
      await expect(metric(page, comp4, 'BONE_MASS_KG')).toContainText('12.0');
      await expect(metric(page, comp4, 'BONE_MASS_KG')).toContainText('Masa ósea (Rocha)');
      await expect(metric(page, comp4, 'RESIDUAL_MASS_KG')).toContainText('19.3');
      await expect(metric(page, comp4, 'MUSCLE_MASS_KG')).toContainText('32.5');
      const lee = 'Masa muscular esquelética (Lee, 2000)';
      await expect(metric(page, lee, 'CORRECTED_ARM_GIRTH_CM')).toContainText('29.2');
      await expect(metric(page, lee, 'SKELETAL_MUSCLE_MASS_KG')).toContainText('32.6');
      const kerr = '5 componentes (Kerr, 1988)';
      await expect(metric(page, kerr, 'BODY_SURFACE_AREA_M2')).toContainText('1.86');
      await expect(metric(page, kerr, 'SKIN_MASS_KG')).toContainText('4.0');
      await expect(metric(page, kerr, 'ADIPOSE_MASS_KG')).toContainText('23.4');
      await expect(metric(page, kerr, 'ADIPOSE_MASS_KG')).toContainText('Z -0.69');
      await expect(metric(page, kerr, 'MUSCLE_MASS_KG')).toContainText('35.9');
      await expect(metric(page, kerr, 'MUSCLE_MASS_KG')).toContainText('Z 1.58');
      await expect(metric(page, kerr, 'RESIDUAL_MASS_KG')).toContainText('Z 2.44');
      await expect(metric(page, kerr, 'STRUCTURED_MASS_KG')).toContainText('81.6');
      const proportionality = page.getByRole('region', { name: 'Proporcionalidad' });
      await expect(proportionality.locator('[data-metric="CORMIC_INDEX"]')).toContainText('52.0');
      await expect(proportionality.locator('[data-metric="MANOUVRIER_INDEX"]')).toContainText(
        '92.3',
      );
      await expect(proportionality.locator('[data-metric="ACROMIOILIAC_INDEX"]')).toContainText(
        '71.3',
      );
      await expect(page.getByText('Jackson & Pollock, 7 pliegues:')).toBeVisible();
      await expect(
        page.getByRole('article', { name: 'Lectura de Marca Demo BIA-200' }),
      ).toContainText('18.4 %');
      await expect(page.getByText(/ETM de Dueña E2E en 6 pliegues/)).toContainText(
        '0.37 mm (2.35 %)',
      );

      // Criterio de P7: ninguna cifra en pantalla sin su método (RN-D02).
      const metrics = page.locator('[data-metric]');
      const count = await metrics.count();
      expect(count).toBeGreaterThan(20);
      await expect(metrics.filter({ hasText: 'Método:' })).toHaveCount(count);
      expect(await seriousViolations(page)).toEqual([]);

      // Peso objetivo con 15 % de grasa (G-12).
      await page.getByLabel('% de grasa deseado').fill('15');
      await page.getByRole('button', { name: 'Calcular el peso objetivo' }).click();
      await expect(
        page.getByRole('status').filter({ hasText: 'Con 15.0 % de grasa' }),
      ).toContainText(/75\.\d kg, perder 4\.\d kg/);

      // Métodos de Luis (RF-16): los de su población en la organización.
      await recordTab(page, 'Evaluaciones');
      await expect(
        page.getByRole('heading', { level: 2, name: 'Métodos de cálculo' }),
      ).toBeVisible();
      await expect(page.getByText('Población: Adulto.')).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);
    });

    await test.step('5 · comparación con la evaluación anterior frente al CMD95 (RN-C06, G-04)', async () => {
      await page
        .getByRole('row')
        .filter({ hasText: 'Antropometría y bioimpedancia' })
        .getByRole('link')
        .click();
      await page.getByRole('link', { name: 'Comparar con la anterior' }).click();
      await expect(
        page.getByRole('heading', { level: 2, name: 'Comparación con la evaluación anterior' }),
      ).toBeVisible();
      const sum = page.getByRole('region', { name: 'Suma de 6 pliegues' });
      await expect(sum).toContainText('De 101.9 a 95.0 mm: -6.9 mm');
      await expect(sum).toContainText('CMD95 de 6.18 mm');
      await expect(sum).toContainText('Cambio real');
      await expect(page.getByText('Mismas condiciones y mismo evaluador')).toBeVisible();
      await expect(page.getByRole('row', { name: /Pliegue del tríceps/ })).toContainText(
        'Cambio real',
      );
      await expect(page.getByRole('row', { name: /Pliegue abdominal/ })).toContainText(
        'Sin cambio significativo',
      );
      await expect(page.getByRole('row', { name: /Pliegue del bíceps/ })).toContainText('Sin ETM');
      await expect(
        page.getByRole('article', { name: 'Durnin & Womersley (1974) + Siri' }),
      ).toContainText('de 21.3 a 20.3 %');
      expect(await seriousViolations(page)).toEqual([]);
    });

    await test.step('6 · energía y macronutrientes (RF-17, RF-18 adelantado, G-13 a G-17)', async () => {
      await recordTab(page, 'Energía');
      await page.getByRole('link', { name: 'Nueva prescripción' }).click();
      await expect(
        page.getByRole('heading', { level: 2, name: 'Nueva prescripción' }),
      ).toBeVisible();
      for (const [method, kcal] of [
        ['Mifflin-St Jeor (1990)', '1,759'],
        ['Harris-Benedict (1919)', '1,853'],
        ['FAO/OMS/UNU (Schofield)', '1,897'],
        ['Cunningham (1980)', '1,903'],
        ['Katch-McArdle', '1,748'],
      ] as const) {
        await expect(
          page.getByRole('radio', { name: new RegExp(method.replace(/[()]/g, '\\$&')) }),
        ).toBeVisible();
        await expect(page.locator('label').filter({ hasText: method })).toContainText(
          `${kcal} kcal`,
        );
      }
      expect(await seriousViolations(page)).toEqual([]);
      await page.getByRole('radio', { name: /Mifflin-St Jeor/ }).check();
      await page.getByLabel('PAL de la vida diaria', { exact: true }).fill('1.4');
      await page.getByLabel('Buscar actividad').fill('correr');
      await page.getByRole('button', { name: 'Agregar Correr a 6–6.3 mph (unos 10 km/h)' }).click();
      await page.getByLabel('Minutos por sesión: Correr a 6–6.3 mph (unos 10 km/h)').fill('30');
      await page.getByLabel('Sesiones por semana: Correr a 6–6.3 mph (unos 10 km/h)').fill('3');
      await page.getByLabel('Cantidad').fill('3');
      await page.getByLabel('% de grasa deseado').fill('15');
      await page.getByLabel('Proteína (g por kg de peso)').fill('2');
      await page.getByLabel('Grasa (% de las kcal)').fill('25');

      const preview = page.getByRole('region', { name: 'Vista previa' });
      await expect(preview).toContainText('Base: TMR × PAL 1.4');
      await expect(preview).toContainText('2,462 kcal');
      await expect(preview).toContainText('372 kcal brutas y 332 netas por sesión');
      await expect(preview).toContainText('142 kcal');
      await expect(preview).toContainText('GET 2,605 kcal');
      await expect(preview).toContainText('770 kcal por día');
      await expect(preview).toContainText('Objetivo 1,835 kcal');
      await expect(preview).toContainText('0.9 % del peso por semana');
      await expect(preview).toContainText(/1\.\d meses/);
      await expect(preview).toContainText('160 g');
      await expect(preview).toContainText('51 g');
      await expect(preview).toContainText('184 g');
      expect(await seriousViolations(page)).toEqual([]);
      await page.getByRole('button', { name: 'Guardar prescripción' }).click();
      await page.waitForURL(/\/energia\/[0-9a-f-]{36}$/);
      await expect(
        page.getByRole('heading', { level: 2, name: 'Prescripción energética' }),
      ).toBeVisible();
      await expect(page.getByText('Objetivo 1,835 kcal')).toBeVisible();

      await recordTab(page, 'Línea de tiempo');
      await expect(page.getByRole('cell', { name: 'Objetivo: perder grasa' })).toBeVisible();
    });

    await test.step('7 · auditoría: quién abrió el expediente (RF-06, RN-B03)', async () => {
      await page.goto(`/panel/auditoria?paciente=${luisId}`);
      await expect(page.getByRole('heading', { level: 1, name: 'Auditoría' })).toBeVisible();
      const rows = page.getByRole('row').filter({ hasText: 'Dueña E2E' });
      for (const resource of [
        'Ficha',
        'Evaluación',
        'Resultados de una evaluación',
        'Datos para la energía',
      ]) {
        await expect(
          rows.filter({ hasText: 'Lectura' }).filter({ hasText: resource }).first(),
        ).toBeVisible();
      }
      // Las escrituras se auditan desde sus eventos (02 §10): llegan unos segundos después.
      await expect(async () => {
        await page.reload();
        await expect(
          rows.filter({ hasText: 'Alta' }).filter({ hasText: 'Prescripción energética' }).first(),
        ).toBeVisible({ timeout: 1_000 });
      }).toPass({ timeout: 20_000 });
      expect(await seriousViolations(page)).toEqual([]);
    });
  });
});

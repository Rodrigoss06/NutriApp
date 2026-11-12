import { expect, test, type Page } from '@playwright/test';
import {
  appReady,
  editWindowByApi,
  hundredKcalFoodByApi,
  limaDate,
  patientPostsByApi,
  startedProgramByApi,
} from './support/analytics';
import { seriousViolations } from './support/axe';
import { luisWithPrescription } from './support/luis';
import { appAccessByApi, publishedExchangePlanByApi } from './support/patient-app';
import { createOrganization, loginInPage } from './support/stack';

/**
 * P14 (PR 4) de punta a punta, en escritorio y en el celular (RF-32, RF-33, RF-42; RN-G16, RN-F17, RN-F12; 07 §10 y §11). Luis,
 * con su plan publicado (G-17: 1835 kcal) y un programa que empezó hace 7 días, registra lo que comió hoy, el entreno de la
 * sesión 1 y siete registros diarios con fatiga alta (preparado por la API, como desde su app). Su coach ve la analítica de
 * dieta y de rutina, abre el control semanal (ámbar, factor ajustado 0.945), decide ajustar con el factor sugerido a 2
 * decimales y su nota, y la semana 2 cambia al publicar la versión nueva. La dueña cambia los umbrales. axe en cada pantalla.
 * Datos sintéticos.
 */

/** La analítica sale de proyecciones que actualiza el worker: se recarga hasta que aparezcan. */
async function gotoUntil(page: Page, path: string, ready: () => Promise<void>) {
  await expect(async () => {
    await page.goto(path);
    await ready();
  }).toPass({ timeout: 45_000 });
}

test.describe('P14 · Analítica y control semanal', () => {
  test('RF-32, RF-33 y RF-42: la analítica de Luis y la decisión sobre su semana', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const organization = await createOrganization();
    const owner = organization.ownerEmail;
    const luis = await luisWithPrescription(owner);
    const email = await appAccessByApi(owner, luis);
    await publishedExchangePlanByApi(owner, luis);
    await editWindowByApi(owner, 7);
    const foodId = await hundredKcalFoodByApi(owner);
    const program = await startedProgramByApi(owner, luis, 7);
    await appReady(
      email,
      (today) => today.target !== null && today.sessions !== null && today.editWindowDays === 7,
    );

    const catalog = (mealSlotCode: string, grams: number) => ({
      path: '/me/food-logs',
      localDate: limaDate(0),
      body: { source: { kind: 'CATALOG', mealSlotCode, foodId, grams } },
    });
    await patientPostsByApi(email, [
      // Hoy, 1800 kcal: 500, 800 y 500 g de un alimento de 100 kcal por 100 g.
      catalog('BREAKFAST', 500),
      catalog('LUNCH', 800),
      catalog('DINNER', 500),
      // La semana 1 (de hace 7 días a ayer): el entreno de la sesión 1, antes de su registro diario (P-09)...
      {
        path: '/me/workouts',
        localDate: limaDate(6),
        body: {
          sessionId: program.firstSessionId,
          outcome: 'COMPLETED',
          durationMinutes: 60,
          sessionRpe: 7,
          sets: [1, 2, 3].map((setNo) => ({
            exerciseId: program.exerciseId,
            setNo,
            reps: 8,
            loadKg: 60,
            rir: 2,
          })),
        },
      },
      // ...y siete registros diarios con fatiga 5: el promedio pasa de 4 (07 §10).
      ...[7, 6, 5, 4, 3, 2, 1].map((daysAgo) => ({
        path: '/me/checkins',
        localDate: limaDate(daysAgo),
        body: {
          sessionMinutes: 60,
          sessionRpe: 7,
          sleepHours: 7.5,
          fatigue: 5,
          soreness: 3,
          stress: 2,
          motivation: 4,
          nutritionCompliancePct: 90,
        },
      })),
    ]);
    await loginInPage(page, owner);

    // RF-32: consumo contra la meta de hoy, adecuación con su método (RN-D02) y días en rango.
    const days = page.getByRole('region', { name: 'Registros de cada día' });
    await gotoUntil(page, `/panel/pacientes/${luis}/analitica`, async () => {
      await expect(days.getByText('1,800 kcal')).toBeVisible({ timeout: 2_000 });
    });
    await expect(days.getByText('1,835 kcal')).toBeVisible();
    await expect(days.getByText('98.1 %')).toBeVisible();
    await expect(days.getByText('En rango')).toBeVisible();
    await expect(page.getByText('% de adecuación').first()).toBeVisible();
    await expect(page.getByRole('region', { name: 'Tiempos de comida' })).toContainText('Almuerzo');
    expect(await seriousViolations(page)).toEqual([]);

    // RF-33: la semana 1 del mesociclo, con el tonelaje del entreno y el 1RM de Epley (60 × (1 + 8/30) = 76 kg).
    const base = page.getByRole('region', { name: 'Semanas del mesociclo Base' });
    await gotoUntil(page, `/panel/pacientes/${luis}/analitica/rutina`, async () => {
      await expect(base.getByRole('row', { name: /^S1 ·/ })).toContainText('1,440 kg', {
        timeout: 2_000,
      });
    });
    await expect(base.getByRole('row', { name: /^S1 ·/ })).toContainText('1 de 3');
    await expect(base.getByRole('row', { name: /^S1 ·/ })).toContainText('Acumulación');
    await expect(
      page.getByRole('table', { name: '1RM estimado de Sentadilla goblet' }),
    ).toContainText('76.0');
    await expect(
      page.getByRole('region', { name: /Series por grupo muscular de la semana/ }),
    ).toBeVisible();
    // P14.5, PR 3 (P-23, P-24): el panel de fatiga de la semana 1. La fatiga percibida de 5 la pone en rojo; sin semanas previas,
    // la carga queda «sin base» y no suma alerta.
    const panel = page.getByRole('region', { name: 'Panel de fatiga y recuperación por semana' });
    await expect(panel.getByRole('row', { name: /^S1 ·/ })).toContainText('Sin base');
    await expect(panel.getByRole('row', { name: /^S1 ·/ })).toContainText('Rojo');
    await expect(page.getByText('Panel de fatiga y recuperación (JV Fitness)')).toBeVisible();
    // P14.5, PR 4 (P-27): la fatiga por grupo muscular de la misma semana. Sin semanas previas, cada grupo queda «sin base» y sin
    // recuperación estimada.
    const muscleFatigue = page.getByRole('region', {
      name: /Fatiga por grupo muscular de la semana 1/,
    });
    await expect(muscleFatigue.getByRole('row', { name: /^Cuádriceps/ })).toContainText('Sin base');
    await expect(page.getByText('Fatiga por grupo muscular (JV Fitness)')).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    // La semana 1 ya cerró: Inicio avisa del panel en rojo, que solo informa (P-25).
    await gotoUntil(page, '/panel', async () => {
      await expect(
        page
          .getByRole('list', { name: 'Alertas de Luis Ejemplo Sintético' })
          .getByText('Fatiga y recuperación en rojo'),
      ).toBeVisible({ timeout: 2_000 });
    });

    // RF-42: al abrir el control, la semana 1 se calcula ya (07 §10): ámbar por la fatiga, 1.05 × 0.90 = 0.945 (RN-G16).
    const control = `/panel/pacientes/${luis}/entrenamiento/control-semanal`;
    await page.goto(control);
    const weeks = page.getByRole('region', { name: 'Semanas del macrociclo' });
    await expect(weeks.getByText('Ámbar')).toBeVisible({ timeout: 20_000 });
    const week = page.getByRole('region', { name: /^Semana 1:/ });
    await expect(week.getByText('Ajustar 5–15 %')).toBeVisible();
    await expect(week.getByText('Fatiga alta')).toBeVisible();
    await expect(week.getByText('0.945')).toBeVisible();
    await expect(week.getByText('Control semanal (JV Fitness)')).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    // RN-F17: ajustar, con el sugerido a 2 decimales (ADR-090: 0.945 → 0.95) y la nota; queda con autor y fecha.
    const form = page.getByRole('form', { name: 'Decisión de la semana 1' });
    await expect(async () => {
      await form.getByText('Ajustar', { exact: true }).click();
      await expect(form.getByLabel('Factor de volumen de la semana 2')).toBeVisible({
        timeout: 1_000,
      });
    }).toPass({ timeout: 15_000 });
    await expect(form.getByLabel('Factor de volumen de la semana 2')).toHaveValue('0.95');
    await form
      .getByLabel('Nota')
      .fill('Fatiga alta toda la semana: bajamos el volumen de la semana 2.');
    await form.getByRole('button', { name: 'Registrar decisión' }).click();
    await expect(week.getByText('Decisión: Ajustar · factor 0.95 para la semana 2')).toBeVisible();
    await expect(week.getByText(/^Dueña E2E · /)).toBeVisible();
    await expect(week.getByText('Falta publicar la versión nueva')).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    // RN-F12: la semana 2 cambia para Luis solo al publicar la versión nueva del programa.
    await week.getByRole('link', { name: 'Revisar y publicar la versión nueva' }).click();
    await page.getByRole('button', { name: 'Publicar programa' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Publicar' }).click();
    await expect(page.getByText('Vigente', { exact: true })).toBeVisible();
    await page.goto(control);
    await expect(week.getByText('Versión nueva publicada')).toBeVisible();
    await expect(week.getByText('La semana 2 ya usa el factor 0.95.')).toBeVisible();
    await expect(weeks.getByRole('row', { name: /^S2 ·/ })).toContainText('0.95');
  });

  test('07 §11: la dueña cambia los umbrales; rigen desde hoy y lo calculado no cambia', async ({
    page,
  }) => {
    const organization = await createOrganization();
    await loginInPage(page, organization.ownerEmail);
    await page.goto('/panel/ajustes');
    const form = page.getByRole('form', { name: 'Umbrales del entrenamiento' });
    await expect(
      form.getByText('Rigen los valores base de la plantilla V3 de JV Fitness.'),
    ).toBeVisible();
    const nutrition = form.getByLabel('Alimentación mínima');
    await expect(nutrition).toHaveValue('80');
    await expect(async () => {
      await nutrition.fill('85');
      await form.getByRole('button', { name: 'Guardar umbrales' }).click();
      await expect(form.getByText(/^Rigen los de tu organización desde el /)).toBeVisible({
        timeout: 2_000,
      });
    }).toPass({ timeout: 15_000 });
    await expect(form.getByText('Umbrales guardados: rigen desde hoy')).toBeVisible();
    await expect(nutrition).toHaveValue('85');
    expect(await seriousViolations(page)).toEqual([]);

    // «Usar los valores base» deja los de la V3 en el formulario, para volver a guardarlos.
    await form.getByRole('button', { name: 'Usar los valores base' }).click();
    await expect(nutrition).toHaveValue('80');
  });
});

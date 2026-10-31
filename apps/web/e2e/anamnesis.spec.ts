import { expect, test, type Page } from '@playwright/test';
import { seriousViolations } from './support/axe';
import {
  acceptByApi,
  createOrganization,
  DEMO_OWNER,
  DEMO_PASSWORD,
  grantInPersonByApi,
  inviteByApi,
  loginInPage,
  registerPatientByApi,
  uniqueEmail,
} from './support/stack';

/**
 * P12 (PR 3) de punta a punta (RF-43, RN-F16, G-40) en escritorio y en el celular (WebKit): la anamnesis V2, su perfil de
 * rendimiento con su método, las revisiones de solo lectura y la historia v1, que ya no se edita. axe en cada pantalla
 * nueva.
 */

/** Las respuestas que dan 80, 60, 70, 90, 50, 70 y 60, de objetivo a adherencia (G-40). */
const SCALES = [
  ['¿Qué prioridad tiene este proceso para ti?', '4'],
  ['¿Qué confianza tienes en poder cumplir el proceso?', '4'],
  ['Estabilidad de tus horarios', '3'],
  ['Acceso al equipamiento que necesitas', '3'],
  ['Confianza técnica en patrones básicos', '4'],
  ['Capacidad de entrenar sin supervisión constante', '3'],
  ['Calidad percibida del sueño', '5'],
  ['Energía diaria habitual', '4'],
  ['Estrés habitual', '2'],
  ['Fatiga general actual', '2'],
  ['Motivación para entrenar', '5'],
  ['Capacidad histórica de sostener un plan', '3'],
  ['Apoyo de tu entorno para cumplir el proceso', '3'],
  ['Impacto esperado de tus barreras actuales', '3'],
  ['Capacidad para organizar horarios y tareas', '3'],
  ['Disposición a registrar y reportar tu progreso', '3'],
] as const;
const OPTIONS = [
  ['Experiencia acumulada con entrenamiento de fuerza', '1 a 3 años'],
  ['Consistencia en los últimos 12 meses', 'Intermitente'],
  ['Frecuencia habitual de alcohol', 'Semanal'],
  ['¿Consumes tabaco o nicotina?', 'Sí'],
  ['Estructura general de tu alimentación', 'Variable'],
  ['¿Con qué frecuencia incluyes proteína en comidas principales?', 'Habitualmente'],
  ['Consumo habitual de frutas y verduras', 'Moderado'],
] as const;
const NUMBERS = [
  ['Días reales disponibles para entrenar por semana', '3'],
  ['Tiempo real disponible por sesión en minutos', '45'],
  ['Horas promedio de sueño por noche', '8'],
  ['Horas aproximadas sentado/a al día', '8'],
  ['Pasos diarios aproximados (si los conoces)', '3000'],
  ['Agua aproximada al día en litros', '1,5'],
] as const;

/** Luis, de la semilla: su historia es la v1 de texto libre (ADR-072). */
const SEEDED_PATIENT = '01920000-0000-7000-8000-0000000000c1';

async function pick(page: Page, question: string, option: string): Promise<void> {
  await page
    .getByRole('group', { name: question, exact: true })
    .getByRole('radio', { name: option, exact: true })
    .check();
}

test.describe('P12 · Anamnesis V2 y perfil de rendimiento', () => {
  test('G-40: la anamnesis da el perfil con su método; cada revisión queda de solo lectura', async ({
    page,
  }) => {
    const organization = await createOrganization();
    const patient = await registerPatientByApi(organization.ownerEmail);
    await grantInPersonByApi(organization.ownerEmail, patient.id, 'HEALTH_DATA');
    await loginInPage(page, organization.ownerEmail);
    await page.goto(`/panel/pacientes/${patient.id}/historia`);
    await expect(page.getByRole('heading', { level: 2, name: 'Historia clínica' })).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    // Un número fuera de rango no se envía.
    await page.getByLabel('Días reales disponibles para entrenar por semana').fill('9');
    await page.getByRole('button', { name: 'Guardar anamnesis' }).click();
    await expect(page.getByText('Escribe un número entero de 0 a 7.')).toBeVisible();

    // RN-F16: se guarda aunque falten respuestas; sin puntaje no hay PRI.
    await page.getByLabel('Días reales disponibles para entrenar por semana').fill('');
    await page.getByLabel('Describe con precisión qué quieres conseguir').fill('Volver a correr.');
    await pick(page, 'Modalidad', 'Online');
    await page.getByRole('button', { name: 'Guardar anamnesis' }).click();
    await expect(page.getByText('Revisión 1 guardada')).toBeVisible();
    await expect(page.getByText('Todavía no hay respuestas que den puntaje.')).toBeVisible();

    for (const [question, option] of [...SCALES, ...OPTIONS]) await pick(page, question, option);
    for (const [question, value] of NUMBERS) await page.getByLabel(question).fill(value);
    await page.getByRole('button', { name: 'Guardar anamnesis' }).click();
    await expect(page.getByText('Revisión 2 guardada')).toBeVisible();

    const profile = page.getByRole('region', { name: 'Perfil de rendimiento' });
    await expect(profile.getByText('69.5', { exact: true })).toBeVisible();
    await expect(profile.getByText('Perfil de rendimiento (PRI de JV Fitness)')).toHaveCount(2);
    const domains = profile.getByRole('region', { name: 'Puntaje por dominio' });
    await expect(domains).toContainText('Recuperación');
    await expect(domains).toContainText('90.0');
    await expect(domains).toContainText('50.0');
    const classes = profile.getByRole('region', { name: 'Clases del perfil' });
    await expect(classes).toContainText('Tolerancia inicial al volumen');
    await expect(classes).toContainText('Moderada');
    await expect(classes).toContainText('Semanal o quincenal');
    await expect(classes).toContainText('Prioridad principal');
    await expect(classes).toContainText('Estilo de vida');
    expect(await seriousViolations(page)).toEqual([]);

    // Una respuesta se puede quitar: la que falta no cuenta (recuperación 92, PRI 69.9).
    await page.getByRole('button', { name: 'Quitar respuesta: Estrés habitual' }).click();
    await page.getByRole('button', { name: 'Guardar anamnesis' }).click();
    await expect(page.getByText('Revisión 3 guardada')).toBeVisible();
    await expect(profile.getByText('69.9', { exact: true })).toBeVisible();

    // La revisión anterior se lee con su propio perfil, sin nada que editar.
    await page.getByRole('link', { name: 'Revisión 2', exact: true }).click();
    await page.waitForURL(/\/historia\/revisiones\/2$/);
    await expect(page.getByRole('heading', { level: 2, name: 'Revisión 2' })).toBeVisible();
    await expect(page.getByText('Anamnesis V2 · Guardada el')).toBeVisible();
    await expect(
      page
        .getByRole('region', { name: 'Perfil de rendimiento' })
        .getByText('69.5', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Modalidad: Online')).toBeVisible();
    await expect(page.getByText('Volver a correr.')).toBeVisible();
    await expect(page.getByText('2 de 5').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Guardar anamnesis' })).toHaveCount(0);
    await expect(page.getByRole('radio')).toHaveCount(0);
    expect(await seriousViolations(page)).toEqual([]);

    await page.goto(`/panel/pacientes/${patient.id}/historia/revisiones/9`);
    await expect(page.getByText('No encontramos esa revisión')).toBeVisible();
  });

  test('RN-A05: el responsable la escribe; quien no está en el equipo con escritura la lee, y no se le ofrece guardar', async ({
    page,
    browser,
  }) => {
    const organization = await createOrganization();
    const professional = uniqueEmail();
    await acceptByApi(await inviteByApi(organization.ownerEmail, professional), 'Profesional E2E');
    const patient = await registerPatientByApi(professional);
    await loginInPage(page, organization.ownerEmail);

    await page.goto(`/panel/pacientes/${patient.id}/historia`);

    await expect(page.getByText('Solo lectura')).toBeVisible();
    await expect(
      page.getByText('La anamnesis la escribe el equipo').getByRole('link', { name: 'Ficha' }),
    ).toBeVisible();
    await expect(page.getByLabel('Ocupación')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Guardar anamnesis' })).toHaveCount(0);
    expect(await seriousViolations(page)).toEqual([]);

    const responsibleContext = await browser.newContext();
    const responsible = await responsibleContext.newPage();
    await loginInPage(responsible, professional);
    await responsible.goto(`/panel/pacientes/${patient.id}/historia`);
    await expect(responsible.getByRole('button', { name: 'Guardar anamnesis' })).toBeEnabled();
    await expect(responsible.getByLabel('Ocupación')).toBeEnabled();
    await expect(responsible.getByText('Solo lectura')).toHaveCount(0);
    await responsibleContext.close();
  });

  test('la historia v1 queda de solo lectura y la anamnesis parte en blanco', async ({ page }) => {
    await loginInPage(page, DEMO_OWNER, DEMO_PASSWORD);
    await page.goto(`/panel/pacientes/${SEEDED_PATIENT}/historia`);

    await expect(page.getByText('La historia anterior queda de solo lectura')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Perfil de rendimiento' })).toHaveCount(0);
    await expect(page.getByLabel('Describe con precisión qué quieres conseguir')).toHaveValue('');
    expect(await seriousViolations(page)).toEqual([]);

    await page.getByRole('link', { name: 'Ver la revisión 1' }).click();
    await page.waitForURL(/\/historia\/revisiones\/1$/);
    await expect(page.getByText('Historia v1, de texto libre · Guardada el')).toBeVisible();
    await expect(page.getByText('Siete horas por noche.')).toBeVisible();
    await expect(page.getByRole('textbox')).toHaveCount(0);
    expect(await seriousViolations(page)).toEqual([]);
  });
});

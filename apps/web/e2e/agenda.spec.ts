import { expect, test } from '@playwright/test';
import { seriousViolations } from './support/axe';
import {
  createOrganization,
  loginAsPatientInPage,
  loginInPage,
  patientWithAccess,
} from './support/stack';

/**
 * P15 (PR 2) de punta a punta, en escritorio y en el celular (RF-37; RN-J01, RN-J03; ADR-125): el profesional carga su
 * disponibilidad, agenda una cita desde el expediente del paciente, ve que un cruce falla con RN-J01, la confirma y la ve en el mes;
 * el paciente la ve en su app. axe en cada pantalla. Datos sintéticos.
 */

const limaDate = (offsetDays: number): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(
    new Date(Date.now() + offsetDays * 86_400_000),
  );

test.describe('P15 · Agenda', () => {
  test('RF-37: disponibilidad, una cita desde el expediente, el cruce con RN-J01, confirmarla y verla en la app', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const organization = await createOrganization();
    const owner = organization.ownerEmail;
    const patient = await patientWithAccess(owner);
    const day = limaDate(2);

    // La disponibilidad del lunes, de 08:00 a 13:00.
    await loginInPage(page, owner);
    await page.goto('/panel/agenda/disponibilidad');
    await page.getByRole('button', { name: 'Agregar franja el lunes' }).click();
    await page.getByRole('button', { name: 'Guardar disponibilidad' }).click();
    await expect(page.getByText('Disponibilidad guardada')).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    // Desde la pestaña Citas del expediente, la cita nueva ya trae al paciente.
    await page.goto(`/panel/pacientes/${patient.id}/citas`);
    await expect(page.getByText('Sin citas próximas.')).toBeVisible();
    await page.getByRole('link', { name: 'Nueva cita' }).click();
    await page.waitForURL(/\/panel\/agenda\?paciente=/);
    const form = page.getByRole('form', { name: 'Nueva cita' });
    await expect(form.getByText('Paciente Sintético E2E')).toBeVisible();
    await form.getByLabel('Fecha', { exact: true }).fill(day);
    await form.getByLabel('Hora', { exact: true }).fill('10:00');
    await form.getByLabel('Lugar (opcional)').fill('Sede de prueba');
    await form.getByRole('button', { name: 'Guardar cita' }).click();
    await expect(form).toBeHidden();

    // La semana de la cita la muestra con su paciente; un cruce falla con RN-J01.
    await page.goto(`/panel/agenda?vista=semana&fecha=${day}`);
    const item = page.getByRole('article', {
      name: 'Control de las 10:00 con Paciente Sintético E2E',
    });
    await expect(item).toContainText('Programada');
    await expect(item).toContainText('Sede de prueba');
    expect(await seriousViolations(page)).toEqual([]);
    await page.getByRole('button', { name: 'Nueva cita' }).click();
    const overlap = page.getByRole('form', { name: 'Nueva cita' });
    await overlap.getByLabel('Fecha', { exact: true }).fill(day);
    await overlap.getByLabel('Hora', { exact: true }).fill('10:15');
    await overlap.getByRole('button', { name: 'Guardar cita' }).click();
    await expect(
      overlap.getByText('Ese horario se cruza con otra cita del mismo profesional.'),
    ).toBeVisible();
    await overlap.getByRole('button', { name: 'Cancelar', exact: true }).click();

    // Confirmarla; el mes la cuenta en su día.
    await item.getByRole('button', { name: 'Confirmar' }).click();
    await expect(item).toContainText('Confirmada');
    await page.getByRole('link', { name: 'Mes', exact: true }).click();
    await expect(page.getByRole('table', { name: 'Citas del mes, por día' })).toBeVisible();
    await expect(
      page.getByRole('link', {
        name: new RegExp(`\\b${String(Number(day.slice(8)))} de [a-zñ]+: 1 cita$`),
      }),
    ).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    // El paciente la ve en su app, sin la nota del profesional.
    await page.context().clearCookies();
    await loginAsPatientInPage(page, patient.email);
    await page.goto('/mi/mas');
    await page.getByRole('link', { name: 'Tus citas con tu profesional' }).click();
    await page.waitForURL(/\/mi\/citas$/);
    const upcoming = page.getByRole('region', { name: 'Próximas' });
    await expect(upcoming.getByRole('listitem').filter({ hasText: 'Control' })).toContainText(
      'Confirmada',
    );
    await expect(upcoming).toContainText('Sede de prueba');
    expect(await seriousViolations(page)).toEqual([]);
  });
});

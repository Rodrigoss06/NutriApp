import { randomBytes } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { seriousViolations } from './support/axe';
import {
  createOrganization,
  DEMO_PASSWORD,
  DEMO_PLATFORM_ADMIN,
  loginInPage,
  registerPatientByApi,
} from './support/stack';

/**
 * P15 (PR 4b) de punta a punta, en escritorio y en el celular (RN-A09, RN-B03; ADR-129, ADR-130). Criterio 2 de P15 desde las
 * pantallas: el dueño le da al soporte un permiso para ver pacientes por 24 horas; el soporte entra a la organización en modo soporte,
 * abre el expediente en solo lectura y sale; el dueño revoca el permiso y el soporte ya no puede entrar. axe en cada pantalla. Datos
 * sintéticos.
 */

async function choose(page: Page, label: string, option: string): Promise<void> {
  await page.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option }).first().click();
}

async function loginAsPlatform(page: Page): Promise<void> {
  await page.goto('/entrar');
  await page.getByLabel('Correo').fill(DEMO_PLATFORM_ADMIN);
  await page.getByLabel('Contraseña', { exact: true }).fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL(/\/admin\/plataforma$/);
}

/** El menú del panel: en el celular está detrás del botón «Abrir menú». */
async function panelNavigation(page: Page) {
  const menu = page.getByRole('button', { name: 'Abrir menú' });
  if (await menu.isVisible()) await menu.click();
  return page.getByRole('navigation', { name: 'Secciones del panel' });
}

test.describe('P15 · Soporte con permiso', () => {
  test('RN-A09: el dueño da un permiso, el soporte mira el expediente en solo lectura y, revocado, ya no entra', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const name = `Consultorio soporte ${randomBytes(4).toString('hex')}`;
    const organization = await createOrganization(name);
    const patient = await registerPatientByApi(organization.ownerEmail);

    // El dueño le da al soporte un permiso para ver pacientes, por 24 horas.
    await loginInPage(page, organization.ownerEmail);
    await page.goto('/panel/organizacion');
    const form = page.getByRole('form', { name: 'Dar un permiso de soporte' });
    await choose(page, 'Persona de soporte', 'Plataforma Demo');
    await choose(page, 'Qué puede ver', 'Equipo, ajustes, pacientes y expedientes');
    await form.getByLabel('Motivo').fill('Revisar el expediente que no carga');
    await form.getByRole('button', { name: 'Dar el permiso' }).click();
    const grants = page.getByRole('list', { name: 'Permisos de soporte' });
    await expect(grants.getByRole('listitem').first()).toContainText('Plataforma Demo');
    await expect(grants.getByRole('listitem').first()).toContainText('Vigente');
    expect(await seriousViolations(page)).toEqual([]);

    // El soporte ve el permiso en el panel interno y entra en modo soporte.
    await page.context().clearCookies();
    await loginAsPlatform(page);
    const mine = page.getByRole('list', { name: 'Tus permisos de soporte' });
    await expect(mine).toContainText(name);
    expect(await seriousViolations(page)).toEqual([]);
    await mine
      .getByRole('listitem')
      .filter({ hasText: name })
      .getByRole('button', { name: /Entrar en modo soporte/ })
      .click();
    await page.waitForURL(/\/panel$/);
    await expect(page.getByText('Modo soporte · solo lectura')).toBeVisible();
    await expect(page.getByRole('link', { name: /^Nuevo / })).toHaveCount(0);
    expect(await seriousViolations(page)).toEqual([]);

    // Abre el expediente: lo ve, sin poder cambiar nada.
    const navigation = await panelNavigation(page);
    await expect(navigation.getByRole('link', { name: 'Mi cuenta' })).toHaveCount(0);
    await expect(navigation.getByRole('link', { name: 'Auditoría' })).toHaveCount(0);
    await page.goto(`/panel/pacientes/${patient.id}`);
    await expect(page.getByRole('heading', { name: /Paciente Sintético E2E/ })).toBeVisible();
    await expect(page.getByText('Modo soporte · solo lectura')).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
    await page.getByRole('button', { name: 'Salir del modo soporte' }).click();
    await page.waitForURL(/\/admin\/plataforma$/);

    // El dueño revoca el permiso; el soporte ya no lo tiene.
    await page.context().clearCookies();
    await loginInPage(page, organization.ownerEmail);
    await page.goto('/panel/organizacion');
    const active = page
      .getByRole('list', { name: 'Permisos de soporte' })
      .getByRole('listitem')
      .filter({ hasText: 'Vigente' });
    await active.getByRole('button', { name: 'Revocar' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Revocar' }).click();
    await expect(
      page.getByRole('list', { name: 'Permisos de soporte' }).getByRole('listitem').first(),
    ).toContainText('Revocado');

    await page.context().clearCookies();
    await loginAsPlatform(page);
    await expect(page.getByRole('region', { name: 'Tus permisos de soporte' })).not.toContainText(
      name,
    );
  });
});

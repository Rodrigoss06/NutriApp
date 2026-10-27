import { expect, test } from '@playwright/test';
import { seriousViolations } from './support/axe';
import { pngLogo } from './support/images';
import {
  acceptByApi,
  createOrganization,
  inviteByApi,
  loginInPage,
  uniqueEmail,
} from './support/stack';

/**
 * P11 (PR 3) · marca de las fichas en la configuración de la organización (RN-H03, ADR-066), en escritorio y en el
 * celular: el dueño sube el logo (el navegador rechaza lo que no es imagen), elige el color con su contraste y escribe
 * el nombre, el contacto y el pie, con la vista previa de la ficha en vivo; queda guardado; un profesional la ve sin
 * poder cambiarla. axe en la pantalla.
 */

test.describe('P11 · Marca de las fichas', () => {
  test('RN-H03 · el dueño fija el logo, el color, el nombre y el contacto; un profesional la ve sin cambiarla', async ({
    page,
    browser,
  }) => {
    const organization = await createOrganization('Consultorio Marca E2E');
    await loginInPage(page, organization.ownerEmail);
    await page.goto('/panel/organizacion');
    const section = page.getByRole('region', { name: 'Marca de las fichas' });
    const preview = section.getByRole('figure', { name: 'Vista previa de la ficha' });
    await expect(section.getByText('Sin logo')).toBeVisible();
    await expect(preview).toContainText('Consultorio Marca E2E');

    await test.step('logo: lo que no es imagen se rechaza en el navegador; un PNG se sube al elegirlo', async () => {
      const input = section.getByLabel('Subir un logo');
      await input.setInputFiles({
        name: 'logo.png',
        mimeType: 'image/png',
        buffer: Buffer.from('%PDF-1.7\n'),
      });
      await expect(section.getByText('El logo debe ser una imagen PNG o JPG.')).toBeVisible();
      await input.setInputFiles({
        name: 'logo.png',
        mimeType: 'image/png',
        buffer: pngLogo(120, 40),
      });
      const logo = section.getByRole('img', { name: 'Logo actual de las fichas' });
      await expect(logo).toBeVisible();
      await expect
        .poll(() => logo.evaluate((image: HTMLImageElement) => image.naturalWidth))
        .toBe(120);
    });

    await test.step('color, nombre, contacto y pie, con la vista previa en vivo', async () => {
      await section.getByLabel('Color de la ficha').fill('#7c3aed');
      await section.getByLabel('Nombre en la ficha').fill('Nutrición Marca E2E');
      await section.getByLabel('Teléfono').fill('+51 999 000 333');
      await section.getByLabel('Correo').fill('fichas@demo.test');
      await section.getByLabel('Web').fill('marca.demo.test');
      await section.getByLabel('Pie de la ficha').fill('Colegiatura CNP 0000');
      await expect(preview).toContainText('Nutrición Marca E2E');
      await expect(preview).toContainText(
        '+51 999 000 333 · fichas@demo.test · marca.demo.test · Colegiatura CNP 0000',
      );
      await expect(section.getByText('Contraste AA')).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);
      await section.getByRole('button', { name: 'Guardar marca' }).click();
      await expect(section.getByText('Marca guardada')).toBeVisible();
    });

    await test.step('al volver, la marca sigue', async () => {
      await page.reload();
      await expect(section.getByLabel('Nombre en la ficha')).toHaveValue('Nutrición Marca E2E');
      await expect(section.getByLabel('Color de la ficha')).toHaveValue('#7c3aed');
      await expect(section.getByLabel('Pie de la ficha')).toHaveValue('Colegiatura CNP 0000');
      await expect(section.getByRole('img', { name: 'Logo actual de las fichas' })).toBeVisible();
    });

    await test.step('un profesional la ve, sin poder cambiarla', async () => {
      const email = uniqueEmail();
      await acceptByApi(await inviteByApi(organization.ownerEmail, email), 'Profesional E2E');
      const context = await browser.newContext();
      const other = await context.newPage();
      await loginInPage(other, email);
      await other.goto('/panel/organizacion');
      const seen = other.getByRole('region', { name: 'Marca de las fichas' });
      await expect(seen.getByLabel('Nombre en la ficha')).toHaveValue('Nutrición Marca E2E');
      await expect(seen.getByLabel('Nombre en la ficha')).toBeDisabled();
      await expect(seen.getByText('La cambian el dueño y los administradores.')).toBeVisible();
      await expect(seen.getByRole('button', { name: 'Guardar marca' })).toHaveCount(0);
      await expect(seen.getByLabel('Cambiar el logo')).toHaveCount(0);
      await context.close();
    });
  });
});

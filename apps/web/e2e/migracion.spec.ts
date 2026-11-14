import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { seriousViolations } from './support/axe';
import {
  apiAs,
  createOrganization,
  DEMO_PLATFORM_ADMIN,
  loginInPage,
  type TestOrganization,
} from './support/stack';

/**
 * P15 (PR 7a y 7b) de punta a punta, en escritorio y en el celular (RF-40, RN-I05; ADR-135): un administrador de plataforma migra
 * una cuenta con la CLI account:import, como en producción, y la dueña ve al paciente importado con su consentimiento «Migrado», su
 * plan del sistema anterior en Dieta y sus metas de referencia en Nuevo plan. La CLI es la única entrada de la migración: la
 * prueba la corre compilada, con las variables de la base del entorno. axe en cada pantalla. Datos sintéticos.
 */

const API_DIR = fileURLToPath(new URL('../../api/', import.meta.url));

const FILES = {
  'pacientes.csv': [
    'id_origen,nombres,apellidos,sexo,fecha_nacimiento,tipo_documento,numero_documento,telefono,correo,poblacion,activo,consentimiento_datos_salud',
    'NP-1,Elsa,Sintética Migración,F,1991-04-22,,,,,,SI,2024-02-05',
  ],
  'evaluaciones.csv': [
    'id_origen,id_paciente,fecha,nivel,en_ayunas,actividad_intensa_24h',
    'EV-1,NP-1,2025-01-15 07:45,BASICO,SI,NO',
  ],
  'tomas.csv': [
    'id_evaluacion,sitio,toma_1,toma_2,toma_3,lado',
    'EV-1,BASIC_WEIGHT,64.2,64.2,,',
    'EV-1,BASIC_HEIGHT,160.5,160.5,,',
    'EV-1,GIRTH_WAIST,72.0,72.2,,',
    'EV-1,GIRTH_HIP,95.4,95.4,,',
  ],
  'planes.csv': [
    'id_origen,id_paciente,desde,hasta,kcal,proteina_g,grasa_g,carbohidratos_g,agua_ml,indicaciones',
    'PL-1,NP-1,2024-11-04,2025-01-14,1650,90,55,195,2000,Cena temprano.',
    'PL-2,NP-1,2025-01-15,,1850,110,60,215,2500,"Desayuno antes de entrenar, sin frituras."',
  ],
} as const;

/** La migración de una cuenta con la CLI compilada (pnpm account:import), en una carpeta temporal. */
function importAccount(organization: TestOrganization): string {
  const folder = mkdtempSync(join(tmpdir(), 'migracion-e2e-'));
  try {
    for (const [name, lines] of Object.entries(FILES)) {
      writeFileSync(join(folder, name), `${lines.join('\r\n')}\r\n`, 'utf8');
    }
    return execFileSync(
      process.execPath,
      [
        'dist/cli/import-account.js',
        folder,
        '--org',
        organization.id,
        '--member',
        organization.ownerEmail,
        '--admin',
        DEMO_PLATFORM_ADMIN,
      ],
      { cwd: API_DIR, encoding: 'utf8' },
    );
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

test.describe('P15 · Migración de una cuenta', () => {
  test('RF-40: la cuenta migrada se ve en el expediente, con su consentimiento migrado y su plan anterior de referencia', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const organization = await createOrganization('Consultorio migración');
    const output = importAccount(organization);
    expect(output).toContain('Resultado: correcto.');

    const owner = await apiAs(organization.ownerEmail);
    const listed = await owner.get('/api/v1/patients');
    const { patients } = (await listed.json()) as { patients: { id: string; lastName: string }[] };
    await owner.dispose();
    const patient = patients.find((p) => p.lastName === 'Sintética Migración');
    expect(patient, 'el paciente importado').toBeDefined();
    const base = `/panel/pacientes/${patient?.id ?? ''}`;

    await loginInPage(page, organization.ownerEmail);
    await page.goto(`${base}/consentimientos`);
    await expect(
      page.getByText(/Migrado del sistema anterior · otorgado el 5 de febrero de 2024/),
    ).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    await page.goto(`${base}/dieta`);
    const imported = page.getByRole('region', { name: 'Planes del sistema anterior' });
    await expect(imported.getByText('Desde el 15 de enero de 2025')).toBeVisible();
    await expect(
      imported.getByText('Del 4 de noviembre de 2024 al 14 de enero de 2025'),
    ).toBeVisible();
    await expect(imported.getByText('1,850 kcal')).toBeVisible();
    await expect(imported.getByText('Desayuno antes de entrenar, sin frituras.')).toBeVisible();
    await expect(imported.getByText('Importado')).toHaveCount(2);
    expect(await seriousViolations(page)).toEqual([]);

    await page.goto(`${base}/dieta/nuevo`);
    const reference = page
      .getByRole('status')
      .filter({ hasText: 'Último plan del sistema anterior' });
    await expect(reference.getByText('1,850 kcal')).toBeVisible();
    await expect(reference.getByText('110 g')).toBeVisible();
    await expect(reference.getByText('2,500 ml')).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
  });
});

import { Test, type TestingModule } from '@nestjs/testing';
import type { OrganizationId } from '@nutricoach/shared-kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccountCliModule } from '../../src/cli/account-cli.module.js';
import {
  AccountImporter,
  type AccountReport,
  type TemplateFile,
} from '../../src/modules/migration/index.js';
import { ApiHarness, type StaffOrganization } from './support/api-harness.js';
import { id, pool } from './support/database.js';

/**
 * RF-40 · RN-I05 · la migración de una cuenta de nutricionista desde la plantilla CSV propia (ADR-135), como app_user, con el
 * criterio 3 de P15: importar una cuenta dos veces no duplica y el informe cuadra con los conteos de origen. Datos sintéticos.
 */

const harness = new ApiHarness();
let importerModule: TestingModule;
let org: StaffOrganization;
let adminEmail: string;

const owner = async <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  (await pool('owner').query(sql, params)).rows as T[];

/** CSV según RFC 4180: con comillas la celda que trae coma, comillas o salto de línea. */
const cell = (value: string): string =>
  /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
const csv = (rows: readonly (readonly string[])[]): Uint8Array =>
  Buffer.from(`${rows.map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`, 'utf8');

const PATIENTS = [
  [
    'id_origen',
    'nombres',
    'apellidos',
    'sexo',
    'fecha_nacimiento',
    'tipo_documento',
    'numero_documento',
    'telefono',
    'correo',
    'poblacion',
    'activo',
    'consentimiento_datos_salud',
  ],
  [
    'NP-1',
    'Zoila',
    'Prueba Uno',
    'F',
    '1990-05-12',
    'DNI',
    '70000001',
    '987000111',
    'zoila@demo.test',
    '',
    'SI',
    '2024-03-01',
  ],
  [
    'NP-2',
    'Rufo',
    'Prueba Dos',
    'M',
    '1985-01-20',
    '',
    '',
    '',
    '',
    'DEPORTISTA',
    'NO',
    '2023-07-15',
  ],
  ['NP-3', 'Tula', 'Prueba Tres', 'F', '1999-11-02', '', '', '', '', '', 'SI', ''],
  ['NP-4', 'Ezio', 'Prueba Cuatro', 'X', '1992-02-02', '', '', '', '', '', 'SI', '2024-01-01'],
  ['NP-5', 'Lida', 'Prueba Cinco', 'F', '1994-08-30', '', '', '', '', '', 'SI', '2024-02-02'],
];
const EVALUATIONS = [
  ['id_origen', 'id_paciente', 'fecha', 'nivel', 'en_ayunas', 'actividad_intensa_24h'],
  ['EV-1', 'NP-1', '2025-02-10 08:30', 'BASICO', 'SI', ''],
  ['EV-2', 'NP-2', '2024-09-01', 'BASICO', '', ''],
  ['EV-3', 'NP-3', '2025-01-05', 'BASICO', '', ''],
  ['EV-4', 'NP-1', '2025-03-10', 'ISAK1', '', ''],
  ['EV-5', 'NP-5', '2025-03-11', 'BASICO', '', ''],
];
const basicTomas = (evaluation: string): string[][] => [
  [evaluation, 'BASIC_WEIGHT', '72.5', '72.5', '', ''],
  [evaluation, 'BASIC_HEIGHT', '165.0', '165.0', '', ''],
  [evaluation, 'GIRTH_WAIST', '80.1', '80.1', '', ''],
  [evaluation, 'GIRTH_HIP', '98.0', '98.0', '', ''],
];
const MEASUREMENTS = [
  ['id_evaluacion', 'sitio', 'toma_1', 'toma_2', 'toma_3', 'lado'],
  ...['EV-1', 'EV-2', 'EV-3', 'EV-4', 'EV-5'].flatMap(basicTomas),
];
const PLANS = [
  [
    'id_origen',
    'id_paciente',
    'desde',
    'hasta',
    'kcal',
    'proteina_g',
    'grasa_g',
    'carbohidratos_g',
    'agua_ml',
    'indicaciones',
  ],
  [
    'PL-1',
    'NP-1',
    '2025-02-10',
    '2025-03-10',
    '1850',
    '110',
    '60',
    '215.5',
    '2500',
    'Cenar temprano; "sin" frituras',
  ],
  ['PL-2', 'NP-4', '2025-02-10', '', '2000', '', '', '', '', ''],
];

const FILES: Record<TemplateFile, Uint8Array> = {
  pacientes: csv(PATIENTS),
  evaluaciones: csv(EVALUATIONS),
  tomas: csv(MEASUREMENTS),
  planes: csv(PLANS),
};

function run(options: { member?: string; dryRun?: boolean } = {}): Promise<AccountReport> {
  return importerModule
    .get(AccountImporter)
    .run({
      organizationId: org.organizationId as OrganizationId,
      accountEmail: options.member ?? org.staff.responsible.email,
      adminEmail,
      files: Object.fromEntries(
        Object.entries(FILES).map(([file, content]) => [file, { name: `${file}.csv`, content }]),
      ) as Record<TemplateFile, { name: string; content: Uint8Array }>,
      dryRun: options.dryRun ?? false,
      sampleSize: 10,
    })
    .then((result) => {
      if (!result.ok) throw new Error(result.error);
      return result.value;
    });
}

const counts = (report: AccountReport) =>
  Object.fromEntries(
    report.files.map((f) => [f.file, [f.total, f.created, f.already, f.failed, f.status]]),
  );

async function importedRows(): Promise<{ patients: number; evaluations: number; plans: number }> {
  const [row] = await owner<{ patients: string; evaluations: string; plans: string }>(
    `SELECT (SELECT count(*) FROM clinical.patient WHERE organization_id = $1) AS patients,
            (SELECT count(*) FROM assessment.evaluation WHERE organization_id = $1) AS evaluations,
            (SELECT count(*) FROM nutrition.imported_plan WHERE organization_id = $1) AS plans`,
    [org.organizationId],
  );
  return {
    patients: Number(row?.patients),
    evaluations: Number(row?.evaluations),
    plans: Number(row?.plans),
  };
}

let first: AccountReport;

beforeAll(async () => {
  await harness.start();
  org = await harness.createStaffOrganization({ maxActivePatients: 2 });
  adminEmail = `plataforma-${id()}@demo.test`;
  await owner(
    `INSERT INTO iam.user_account (id, email, display_name, status, is_platform_admin)
     VALUES ($1, $2, 'Soporte de prueba', 'ACTIVE', true)`,
    [id(), adminEmail],
  );
  importerModule = await Test.createTestingModule({ imports: [AccountCliModule] }).compile();
  await importerModule.init();
  first = await run();
}, 120_000);

afterAll(async () => {
  await importerModule.close();
  await harness.stop();
});

describe('RF-40 · RN-I05 · la migración de una cuenta desde la plantilla CSV', () => {
  it('el informe cuadra con los conteos de origen: fila por fila, lo que entró, lo que falló y por qué', () => {
    expect(counts(first)).toEqual({
      pacientes: [5, 3, 0, 2, 'COMPLETED_WITH_ERRORS'],
      evaluaciones: [5, 2, 0, 3, 'COMPLETED_WITH_ERRORS'],
      tomas: [20, 8, 0, 12, 'COMPLETED_WITH_ERRORS'],
      planes: [2, 1, 0, 1, 'COMPLETED_WITH_ERRORS'],
    });
    const errors = (file: TemplateFile) =>
      first.files.find((f) => f.file === file)?.errors.map((e) => [e.row, e.messages.join(' ')]);
    expect(errors('pacientes')).toEqual([
      [5, 'sexo: F o M.'],
      [6, expect.stringContaining('NC-TEN')],
    ]);
    expect(errors('evaluaciones')).toEqual([
      [4, expect.stringContaining('RN-B01')],
      [5, expect.stringContaining('NC-ASM')],
      [6, 'Su paciente (id_origen NP-5) no entró.'],
    ]);
    expect(errors('planes')).toEqual([
      [3, 'id_paciente: NP-4 no está en pacientes.csv o su fila tiene errores.'],
    ]);
    expect(first.files[0]?.warnings).toEqual([
      { row: 4, messages: [expect.stringContaining('Sin consentimiento de datos de salud')] },
    ]);
    expect(first.counts.map((c) => [c.entity, c.expected, c.inDatabase, c.ok])).toEqual([
      ['PATIENT', 3, 3, true],
      ['EVALUATION', 2, 2, true],
      ['PLAN', 1, 1, true],
    ]);
    expect(first.samples.map((s) => [s.entity, s.checked, s.mismatches])).toEqual([
      ['PATIENT', 3, []],
      ['EVALUATION', 2, []],
      ['PLAN', 1, []],
    ]);
    expect(first.ok).toBe(false);
  });

  it('el informe no trae nombres, documentos, teléfonos ni correos: solo filas e id_origen', () => {
    const text = JSON.stringify(first);
    for (const value of [
      'Zoila',
      'Prueba',
      '70000001',
      '987000111',
      'zoila@demo.test',
      'frituras',
    ]) {
      expect(text).not.toContain(value);
    }
  });

  it('cada paciente queda a cargo del nutricionista; el inactivo, archivado; el consentimiento, migrado con su fecha', async () => {
    const rows = await owner<{
      code: string;
      status: string;
      responsible: boolean;
      population: string;
      channel: string | null;
      granted_at: Date | null;
      evidence: string | null;
    }>(
      `SELECT p.code, p.status, p.responsible_member_id = $2 AS responsible, p.population,
              c.channel, c.granted_at, c.evidence_file_id AS evidence
       FROM clinical.patient p
       LEFT JOIN clinical.consent c ON c.patient_id = p.id AND c.purpose = 'HEALTH_DATA'
       WHERE p.organization_id = $1 ORDER BY p.code`,
      [org.organizationId, org.staff.responsible.memberId],
    );
    expect(
      rows.map((r) => [
        r.status,
        r.responsible,
        r.population,
        r.channel,
        r.granted_at?.toISOString() ?? null,
        r.evidence,
      ]),
    ).toEqual([
      ['ACTIVE', true, 'ADULT', 'MIGRATED', '2024-03-01T12:00:00.000Z', null],
      ['ARCHIVED', true, 'ATHLETE', 'MIGRATED', '2023-07-15T12:00:00.000Z', null],
      ['ACTIVE', true, 'ADULT', null, null, null],
    ]);
  });

  it('la evaluación entra cerrada a su hora local, también la del archivado, y el motor calcula sus resultados con su método', async () => {
    const evaluations = await owner<{
      id: string;
      status: string;
      measured_at: Date;
      fasting: boolean;
    }>(
      `SELECT e.id, e.status, e.measured_at, (e.conditions->>'fasting')::boolean AS fasting
       FROM assessment.evaluation e WHERE e.organization_id = $1 ORDER BY e.measured_at DESC`,
      [org.organizationId],
    );
    expect(evaluations.map((e) => [e.status, e.measured_at.toISOString(), e.fasting])).toEqual([
      ['CLOSED', '2025-02-10T13:30:00.000Z', true],
      ['CLOSED', '2024-09-01T14:00:00.000Z', false],
    ]);
    await harness.deliver('assessment.calculation');
    const results = await owner<{ evaluation_id: string; method_code: string }>(
      `SELECT evaluation_id, method_code FROM assessment.calculation_result WHERE organization_id = $1`,
      [org.organizationId],
    );
    for (const evaluation of evaluations) {
      expect(results.filter((r) => r.evaluation_id === evaluation.id).length).toBeGreaterThan(0);
    }
    expect(results.every((r) => r.method_code.length > 0)).toBe(true);
  });

  it('el plan entra al historial tal como venía, sin plan de NutriCoach (RN-D01)', async () => {
    const plans = await owner<Record<string, unknown>>(
      `SELECT to_char(valid_from, 'YYYY-MM-DD') AS valid_from, to_char(valid_to, 'YYYY-MM-DD') AS valid_to,
              target_kcal::float AS kcal, target_cho_g::float AS cho, hydration_target_ml AS water, instructions
       FROM nutrition.imported_plan WHERE organization_id = $1`,
      [org.organizationId],
    );
    expect(plans).toEqual([
      {
        valid_from: '2025-02-10',
        valid_to: '2025-03-10',
        kcal: 1850,
        cho: 215.5,
        water: 2500,
        instructions: 'Cenar temprano; "sin" frituras',
      },
    ]);
    const [{ count } = { count: '' }] = await owner<{ count: string }>(
      `SELECT count(*) FROM nutrition.plan WHERE organization_id = $1`,
      [org.organizationId],
    );
    expect(count).toBe('0');
  });

  it('cada archivo deja su lote con su hash, sus conteos y quién la corrió', async () => {
    const batches = await owner<{
      kind: string;
      status: string;
      rows_ok: number;
      rows_failed: number;
      admin: boolean;
    }>(
      `SELECT b.kind, b.status, b.rows_ok, b.rows_failed, u.email = $2 AS admin
       FROM platform.import_batch b JOIN iam.user_account u ON u.id = b.started_by
       WHERE b.organization_id = $1 AND b.id = ANY($3::uuid[]) ORDER BY b.kind`,
      [org.organizationId, adminEmail, first.files.map((f) => f.batchId)],
    );
    expect(batches.map((b) => [b.kind, b.status, b.rows_ok, b.rows_failed, b.admin])).toEqual([
      ['ACCOUNT_EVALUATIONS', 'COMPLETED_WITH_ERRORS', 2, 3, true],
      ['ACCOUNT_MEASUREMENTS', 'COMPLETED_WITH_ERRORS', 8, 12, true],
      ['ACCOUNT_PATIENTS', 'COMPLETED_WITH_ERRORS', 3, 2, true],
      ['ACCOUNT_PLANS', 'COMPLETED_WITH_ERRORS', 1, 1, true],
    ]);
  });

  it('importar la misma cuenta dos veces no duplica: lo que ya entró se salta y el conteo sigue cuadrando', async () => {
    const before = await importedRows();
    const second = await run();
    expect(counts(second)).toEqual({
      pacientes: [5, 0, 3, 2, 'COMPLETED_WITH_ERRORS'],
      evaluaciones: [5, 0, 2, 3, 'COMPLETED_WITH_ERRORS'],
      tomas: [20, 0, 8, 12, 'COMPLETED_WITH_ERRORS'],
      planes: [2, 0, 1, 1, 'COMPLETED_WITH_ERRORS'],
    });
    expect(second.counts.every((c) => c.ok)).toBe(true);
    expect(second.samples.every((s) => s.mismatches.length === 0)).toBe(true);
    expect(await importedRows()).toEqual(before);
  });

  it('lo que falló entra al corregir la causa (el cupo, RN-A03), sin tocar lo demás', async () => {
    await owner(
      `UPDATE tenancy.subscription SET max_active_patients = 3 WHERE organization_id = $1`,
      [org.organizationId],
    );
    const third = await run();
    expect(counts(third)).toEqual({
      pacientes: [5, 1, 3, 1, 'COMPLETED_WITH_ERRORS'],
      evaluaciones: [5, 1, 2, 2, 'COMPLETED_WITH_ERRORS'],
      tomas: [20, 4, 8, 8, 'COMPLETED_WITH_ERRORS'],
      planes: [2, 0, 1, 1, 'COMPLETED_WITH_ERRORS'],
    });
    expect(await importedRows()).toEqual({ patients: 4, evaluations: 3, plans: 1 });
  });

  it('--dry-run valida y cuenta lo que entraría sin escribir nada, tampoco el lote', async () => {
    const before = await importedRows();
    const [{ count: batchesBefore } = { count: '' }] = await owner<{ count: string }>(
      `SELECT count(*) FROM platform.import_batch WHERE organization_id = $1`,
      [org.organizationId],
    );
    const dry = await run({ member: org.staff.team.email, dryRun: true });
    expect(counts(dry)).toEqual({
      pacientes: [5, 4, 0, 1, 'VALIDATED'],
      evaluaciones: [5, 5, 0, 0, 'VALIDATED'],
      tomas: [20, 20, 0, 0, 'VALIDATED'],
      planes: [2, 1, 0, 1, 'VALIDATED'],
    });
    expect(await importedRows()).toEqual(before);
    const [{ count: batchesAfter } = { count: '' }] = await owner<{ count: string }>(
      `SELECT count(*) FROM platform.import_batch WHERE organization_id = $1`,
      [org.organizationId],
    );
    expect(batchesAfter).toBe(batchesBefore);
  });

  it('sin un administrador de plataforma o con alguien que no es miembro activo, no corre', async () => {
    const result = await importerModule.get(AccountImporter).run({
      organizationId: org.organizationId as OrganizationId,
      accountEmail: `nadie-${id()}@demo.test`,
      adminEmail,
      files: { pacientes: null, evaluaciones: null, tomas: null, planes: null },
      dryRun: true,
      sampleSize: 0,
    });
    expect(result.ok).toBe(false);
    const notAdmin = await importerModule.get(AccountImporter).run({
      organizationId: org.organizationId as OrganizationId,
      accountEmail: org.staff.responsible.email,
      adminEmail: org.staff.owner.email,
      files: { pacientes: null, evaluaciones: null, tomas: null, planes: null },
      dryRun: true,
      sampleSize: 0,
    });
    expect(notAdmin.ok).toBe(false);
  });

  it('en la base, import_record e imported_plan solo se agregan: app_user no los cambia', async () => {
    const user = pool('user');
    await expect(user.query(`UPDATE platform.import_record SET external_id = 'x'`)).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      user.query(`UPDATE nutrition.imported_plan SET instructions = NULL`),
    ).rejects.toThrow(/permission denied/);
  });
});

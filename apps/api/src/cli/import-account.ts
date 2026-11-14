import '../env-file.js';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { NestFactory } from '@nestjs/core';
import type { OrganizationId } from '@nutricoach/shared-kernel';
import {
  AccountImporter,
  TEMPLATE_FILES,
  type AccountFile,
  type AccountReport,
  type TemplateFile,
} from '../modules/migration/index.js';
import { AccountCliModule } from './account-cli.module.js';

/**
 * Migra una cuenta de nutricionista desde la plantilla CSV propia (RF-40, RN-I05; ADR-135): una carpeta con pacientes.csv,
 * evaluaciones.csv, tomas.csv y planes.csv. Correrla dos veces no duplica. Con --dry-run solo valida y cuenta lo que ya entró.
 * El informe no trae nombres ni documentos: solo números de fila e id_origen.
 *
 * Uso: node dist/cli/import-account.js <carpeta> --org <id> --member <correo del nutricionista> --admin <correo>
 *        [--dry-run] [--sample N] [--report <informe.json>]
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USAGE =
  'Uso: account:import <carpeta> --org <id> --member <correo> --admin <correo> [--dry-run] [--sample N] [--report <archivo.json>]';
/** Los errores que se muestran por archivo; el informe JSON los trae todos. */
const SHOWN_ERRORS = 20;
// Antes del código de arriba del módulo, que llama a print() con await: una const declarada después todavía no existe.
const ENTITY_LABELS = { PATIENT: 'Pacientes', EVALUATION: 'Evaluaciones', PLAN: 'Planes' } as const;

const { values, positionals } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
  allowPositionals: true,
  options: {
    org: { type: 'string' },
    member: { type: 'string' },
    admin: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    sample: { type: 'string', default: '10' },
    report: { type: 'string' },
  },
});
const [folder] = positionals;
const sampleSize = Number(values.sample);

if (
  !folder ||
  positionals.length !== 1 ||
  !values.org ||
  !UUID.test(values.org) ||
  !values.member ||
  !values.admin ||
  !Number.isInteger(sampleSize) ||
  sampleSize < 0 ||
  sampleSize > 1000
) {
  console.error(USAGE);
  process.exitCode = 2;
} else {
  const app = await NestFactory.createApplicationContext(AccountCliModule, {
    logger: ['error', 'warn'],
  });
  try {
    const files = Object.fromEntries(
      await Promise.all(
        TEMPLATE_FILES.map(async (file) => [file, await readTemplateFile(folder, file)] as const),
      ),
    ) as Record<TemplateFile, AccountFile | null>;
    const result = await app.get(AccountImporter).run({
      organizationId: values.org as OrganizationId,
      accountEmail: values.member,
      adminEmail: values.admin,
      files,
      dryRun: values['dry-run'],
      sampleSize,
    });
    if (!result.ok) {
      console.error(result.error);
      process.exitCode = 1;
    } else {
      print(result.value);
      if (values.report) {
        await writeFile(values.report, `${JSON.stringify(result.value, null, 2)}\n`, 'utf8');
        console.log(`Informe completo en ${values.report}`);
      }
      if (!result.value.ok) process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

async function readTemplateFile(dir: string, file: TemplateFile): Promise<AccountFile | null> {
  const name = `${file}.csv`;
  try {
    return { name, content: await readFile(join(dir, name)) };
  } catch {
    return null;
  }
}

function print(report: AccountReport): void {
  console.log(
    report.dryRun
      ? 'Validación (no se escribió nada):'
      : `Cuenta del miembro ${report.accountMemberId}:`,
  );
  for (const file of report.files) {
    const batch = file.batchId ? ` · lote ${file.batchId}` : '';
    const verb = report.dryRun ? 'entrarían' : 'entraron';
    console.log(
      `  ${file.file}.csv · ${file.status}${batch} · ${String(file.total)} filas: ${String(file.created)} ${verb}, ${String(file.already)} ya estaban, ${String(file.failed)} con error`,
    );
    for (const error of file.errors.slice(0, SHOWN_ERRORS)) {
      const where = error.row === null ? 'Archivo' : `Fila ${String(error.row)}`;
      console.log(`    ${where}: ${error.messages.join(' · ')}`);
    }
    if (file.errors.length > SHOWN_ERRORS) {
      console.log(`    … y ${String(file.errors.length - SHOWN_ERRORS)} filas más con error.`);
    }
    for (const warning of file.warnings.slice(0, SHOWN_ERRORS)) {
      console.log(`    Aviso, fila ${String(warning.row)}: ${warning.messages.join(' · ')}`);
    }
    if (file.warnings.length > SHOWN_ERRORS) {
      console.log(`    … y ${String(file.warnings.length - SHOWN_ERRORS)} avisos más.`);
    }
  }
  for (const count of report.counts) {
    console.log(
      `  Conteo · ${ENTITY_LABELS[count.entity]}: ${String(count.inDatabase)} en la base de ${String(count.expected)} esperadas · ${count.ok ? 'cuadra' : 'NO CUADRA'}`,
    );
  }
  for (const sample of report.samples) {
    const result =
      sample.mismatches.length === 0
        ? 'todas coinciden'
        : sample.mismatches
            .map((m) => `id_origen ${m.externalId} (${m.fields.join(', ')})`)
            .join('; ');
    console.log(
      `  Muestreo · ${ENTITY_LABELS[sample.entity]}: ${String(sample.checked)} revisadas, ${result}`,
    );
  }
  console.log(report.ok ? 'Resultado: correcto.' : 'Resultado: revisa los errores.');
}

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import type { INestApplicationContext } from '@nestjs/common';
import {
  anonymousContext,
  UNIT_OF_WORK,
  type UnitOfWork,
  type UserId,
} from '@nutricoach/shared-kernel';
import { IamApi } from '../modules/iam/index.js';
import { CatalogImporter, type ImportReport } from '../platform/index.js';

/** Los errores que se muestran por lote; el resto queda en rows_failed. */
const SHOWN_ERRORS = 20;

/** El PLATFORM_ADMIN activo que inicia los lotes (RN-I04), o un error que explica por qué no sirve. */
export async function platformAdmin(app: INestApplicationContext, email: string): Promise<UserId> {
  const uow = app.get<UnitOfWork>(UNIT_OF_WORK);
  const userId = await uow.query(anonymousContext(), () =>
    app.get(IamApi).activePlatformAdmin(email),
  );
  if (!userId) {
    throw new Error(`«${email}» no es la cuenta activa de un administrador de plataforma.`);
  }
  return userId;
}

/** Importa un archivo como lote global (organization_id NULL) e imprime su informe. true si quedó bien o repetido. */
export async function importCatalog(
  app: INestApplicationContext,
  kind: string,
  path: string,
  startedBy: UserId,
): Promise<boolean> {
  const report = await app.get(CatalogImporter).run({
    kind,
    fileName: basename(path),
    content: await readFile(path),
    organizationId: null,
    startedBy,
  });
  print(kind, path, report);
  return report.status === 'COMPLETED' || report.status === 'DUPLICATE';
}

function print(kind: string, path: string, report: ImportReport): void {
  console.log(`${kind} · ${path}`);
  if (report.status === 'DUPLICATE') {
    console.log(
      `  Repetido: el lote ${report.appliedBy ?? ''} ya aplicó este archivo. No se tocó nada.`,
    );
    return;
  }
  const counts =
    report.rowsTotal === null
      ? ''
      : ` · ${String(report.rowsTotal)} filas, ${String(report.rowsOk ?? 0)} correctas, ${String(report.rowsFailed ?? 0)} con error`;
  console.log(`  Lote ${report.batchId}: ${report.status}${counts}`);
  for (const error of report.errors.slice(0, SHOWN_ERRORS)) {
    const where = error.row === null ? 'Archivo' : `Fila ${String(error.row)}`;
    console.log(`  ${where}: ${error.messages.join(' · ')}`);
  }
  if (report.errors.length > SHOWN_ERRORS) {
    console.log(`  … y ${String(report.errors.length - SHOWN_ERRORS)} filas más con error.`);
  }
  if (report.failure) console.log(`  Detalle: ${report.failure}`);
}

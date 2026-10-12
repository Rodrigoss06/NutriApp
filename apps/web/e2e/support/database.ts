import pg from 'pg';

/**
 * Lectura directa de la base del E2E, solo para comprobar lo que la interfaz no puede mostrar: que un dato se guarda
 * cifrado. Con app_owner de la pila local (CI la expone en DATABASE_OWNER_URL); nunca para preparar datos.
 */
const OWNER_URL =
  process.env['DATABASE_OWNER_URL'] ??
  'postgresql://app_owner:app_owner_local@127.0.0.1:5432/nutricoach';

export async function patientDocumentColumns(
  patientId: string,
): Promise<{ enc: Buffer; bidx: Buffer } | null> {
  const client = new pg.Client({ connectionString: OWNER_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ enc: Buffer; bidx: Buffer }>(
      `SELECT document_number_enc AS enc, document_number_bidx AS bidx FROM clinical.patient WHERE id = $1`,
      [patientId],
    );
    return rows[0] ?? null;
  } finally {
    await client.end();
  }
}

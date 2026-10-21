import { err, ok } from '@nutricoach/shared-kernel';
import { describe, expect, it } from 'vitest';
import { readCatalogFile, statusOf, validateFile, type CatalogImport } from './catalog-import.js';
import { parseCsv } from './csv.js';

interface Row {
  readonly code: string;
  readonly met: number;
}

const activities: CatalogImport<Row> = {
  kind: 'TEST_ACTIVITIES',
  columns: ['codigo', 'met'],
  parse: (record) => {
    const met = Number(record.met);
    return record.met && Number.isFinite(met)
      ? ok({ code: record.codigo ?? '', met })
      : err([`met: «${record.met ?? ''}» no es un número`]);
  },
  key: (row) => row.code,
  save: () => Promise.resolve(),
};

const validate = (text: string) => {
  const records = parseCsv(text);
  if (!records.ok) throw new Error(records.error.message);
  return validateFile(activities, records.value);
};

describe('RN-I04 · validación por fila de un archivo de catálogo', () => {
  it('convierte las filas válidas y cuenta el total', () => {
    const result = validate('codigo,met\n01200,6.8\n12050,9.3\n');
    expect(result).toEqual(
      ok({
        rows: [
          { code: '01200', met: 6.8 },
          { code: '12050', met: 9.3 },
        ],
        total: 2,
        errors: [],
      }),
    );
    expect(result.ok && statusOf(result.value)).toBe('COMPLETED');
  });

  it('una fila mala no detiene a las demás: el error lleva su fila de hoja de cálculo', () => {
    const result = validate('codigo,met\n01200,6.8\n02048,\n12050,9.3,extra\n');
    expect(result.ok && result.value.rows).toEqual([{ code: '01200', met: 6.8 }]);
    expect(result.ok && result.value.errors).toEqual([
      { row: 3, messages: ['met: «» no es un número'] },
      { row: 4, messages: ['Tiene 3 columnas y el encabezado 2.'] },
    ]);
    expect(result.ok && statusOf(result.value)).toBe('COMPLETED_WITH_ERRORS');
  });

  it('un código repetido es un error de la segunda fila', () => {
    const result = validate('codigo,met\n01200,6.8\n01200,7\n');
    expect(result.ok && result.value.errors).toEqual([
      { row: 3, messages: ['Código 01200 repetido: ya está en la fila 2.'] },
    ]);
  });

  it('sin ninguna fila válida, el lote falla', () => {
    const result = validate('codigo,met\n01200,x\n');
    expect(result.ok && statusOf(result.value)).toBe('FAILED');
  });

  it('el archivo entero falla si está vacío, si no tiene filas o si su encabezado es otro', () => {
    expect(validate('')).toEqual(err('El archivo está vacío.'));
    expect(validate('codigo,met\n')).toEqual(err('El archivo no tiene filas.'));
    expect(validate('met,codigo\n6.8,01200\n')).toEqual(err('El encabezado debe ser: codigo,met'));
  });

  it('lee los bytes en UTF-8 estricto y con la fila de un error de sintaxis', () => {
    const utf8 = new TextEncoder().encode('codigo,met\n01200,6.8\n');
    expect(readCatalogFile(activities, utf8).ok).toBe(true);
    expect(readCatalogFile(activities, Uint8Array.from([0x63, 0xff, 0x0a]))).toEqual(
      err('El archivo no está en UTF-8.'),
    );
    expect(
      readCatalogFile(activities, new TextEncoder().encode('codigo,met\n"01200,6.8\n')),
    ).toEqual(err('Fila 2: Comillas sin cerrar.'));
  });
});

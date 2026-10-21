import { err, ok, type Result } from '@nutricoach/shared-kernel';

/** Un registro con su fila: la 1 es el encabezado, como en una hoja de cálculo. */
export interface CsvRecord {
  readonly row: number;
  readonly cells: readonly string[];
}

export interface CsvError {
  readonly row: number;
  readonly message: string;
}

type State = 'START' | 'UNQUOTED' | 'QUOTED' | 'CLOSED';

/**
 * CSV según RFC 4180 (RN-I04): campos separados por comas y registros por LF o CRLF; un campo con comas, comillas o
 * saltos de línea va entre comillas dobles, y una comilla dentro se escribe dos veces. Un campo vacío queda vacío: el
 * importador decide si es «sin dato» (RN-I03). Quita la marca BOM y salta las líneas en blanco, que sí cuentan como
 * fila para que los números coincidan con los de una hoja de cálculo.
 */
export function parseCsv(text: string): Result<CsvRecord[], CsvError> {
  const input = text.startsWith('﻿') ? text.slice(1) : text;
  const records: CsvRecord[] = [];
  let cells: string[] = [];
  let field = '';
  let state: State = 'START';
  let row = 1;

  const endField = () => {
    cells.push(field);
    field = '';
    state = 'START';
  };
  const endRecord = () => {
    endField();
    if (cells.length > 1 || cells[0] !== '') records.push({ row, cells });
    cells = [];
    row += 1;
  };

  for (let i = 0; i < input.length; i += 1) {
    const char = input.charAt(i);
    if (state === 'QUOTED') {
      if (char !== '"') field += char;
      else if (input.charAt(i + 1) === '"') {
        field += '"';
        i += 1;
      } else state = 'CLOSED';
    } else if (char === ',') {
      endField();
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && input.charAt(i + 1) === '\n') i += 1;
      endRecord();
    } else if (state === 'CLOSED') {
      return err({ row, message: 'Texto después de cerrar las comillas.' });
    } else if (char === '"') {
      if (state === 'UNQUOTED') {
        return err({ row, message: 'Comillas dentro de un campo sin comillas.' });
      }
      state = 'QUOTED';
    } else {
      field += char;
      state = 'UNQUOTED';
    }
  }
  if (state === 'QUOTED') return err({ row, message: 'Comillas sin cerrar.' });
  if (state !== 'START' || cells.length > 0) endRecord();
  return ok(records);
}

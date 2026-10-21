import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv.js';

const records = (text: string) => {
  const result = parseCsv(text);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};
const value = (text: string) => records(text).map((record) => record.cells);

describe('RN-I04 · CSV (RFC 4180)', () => {
  it('separa campos por comas y registros por LF o CRLF; el salto final no agrega un registro', () => {
    expect(value('a,b\n1,2\r\n3,4\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('un campo entre comillas puede tener comas, comillas dobladas y saltos de línea', () => {
    expect(value('nombre,nota\n"Achita, kiwicha o achis","dice ""hola""\ny sigue"\n')).toEqual([
      ['nombre', 'nota'],
      ['Achita, kiwicha o achis', 'dice "hola"\ny sigue'],
    ]);
  });

  it('conserva los campos vacíos: «sin dato» no es cero (RN-I03)', () => {
    expect(value('a,b,c\n1,,\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', '', ''],
    ]);
  });

  it('quita la marca BOM del comienzo y salta las líneas en blanco', () => {
    expect(value('﻿a,b\n\n1,2\n\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('cada registro lleva su fila de hoja de cálculo: las líneas en blanco cuentan y un salto entre comillas no', () => {
    expect(records('a\n\n"1\n2"\n3\n').map((record) => record.row)).toEqual([1, 3, 4]);
  });

  it('el último registro puede no terminar en salto de línea', () => {
    expect(value('a\n1')).toEqual([['a'], ['1']]);
  });

  it('un archivo vacío no tiene registros', () => {
    expect(value('')).toEqual([]);
  });

  it('rechaza comillas sin cerrar, con la fila donde empiezan', () => {
    const result = parseCsv('a,b\n1,"2\n3,4\n');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toEqual({ row: 2, message: 'Comillas sin cerrar.' });
  });

  it('rechaza texto pegado a una comilla de cierre y comillas dentro de un campo sin comillas', () => {
    const after = parseCsv('a\n"1"x\n');
    const inside = parseCsv('a\n1"2\n');
    expect(!after.ok && after.error).toEqual({
      row: 2,
      message: 'Texto después de cerrar las comillas.',
    });
    expect(!inside.ok && inside.error).toEqual({
      row: 2,
      message: 'Comillas dentro de un campo sin comillas.',
    });
  });
});

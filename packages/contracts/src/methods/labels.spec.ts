import { METHOD_CODES } from '@nutricoach/engine';
import { describe, expect, it } from 'vitest';
import { METHOD_LABELS, methodLabel } from './labels.js';

describe('RN-D02 · RN-H04 · cada método del motor tiene su nombre legible', () => {
  it('ningún código del registro del motor queda sin etiqueta, y no sobran etiquetas', () => {
    expect(Object.keys(METHOD_LABELS).sort()).toEqual([...METHOD_CODES].sort());
  });

  it('las etiquetas no se repiten: dos métodos distintos nunca se ven iguales', () => {
    const labels = Object.values(METHOD_LABELS);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('un código desconocido se muestra tal cual', () => {
    expect(methodLabel('FAT_DW1974_SIRI1961')).toBe('Durnin & Womersley (1974) + Siri');
    expect(methodLabel('NUEVO_METODO')).toBe('NUEVO_METODO');
  });
});

import { describe, expect, it } from 'vitest';
import { stateFromName, stateHint } from './food-state.js';

describe('RN-E12 · estado del alimento según su nombre oficial', () => {
  it('cocido cuando el nombre dice cómo se coció', () => {
    expect(stateFromName('Arroz pilado o pulido cocido')).toBe('COOKED');
    expect(stateFromName('Huevo de gallina entero, sancochado en agua')).toBe('COOKED');
    expect(stateFromName('Pollo, pechuga frita de')).toBe('COOKED');
    expect(stateFromName('Plátano verde asado')).toBe('COOKED');
    expect(stateFromName('Maíz cancha tostada de')).toBe('COOKED');
    expect(stateFromName('Kiwicha, precocida, hojuela de')).toBe('COOKED');
    expect(stateFromName('Lentejas chicas cocidas')).toBe('COOKED');
    expect(stateFromName('Pescado pejesapo, pulpa sancochada')).toBe('COOKED');
  });

  it('crudo, tal como se compra, en todo lo demás', () => {
    expect(stateFromName('Avena, hojuela cruda')).toBe('RAW');
    expect(stateFromName('Achita, kiwicha o achis')).toBe('RAW');
    expect(stateFromName('Plátano de seda')).toBe('RAW');
  });

  it('mira palabras enteras: «cocido» dentro de otra palabra no cuenta', () => {
    expect(stateFromName('Cocidita')).toBe('RAW');
    expect(stateFromName('Asadero')).toBe('RAW');
  });
});

describe('RN-E12 · estado que pide un término de búsqueda', () => {
  it('cocido si el término nombra una cocción; crudo si lo dice; si no, ninguno', () => {
    expect(stateHint('arroz cocido')).toBe('COOKED');
    expect(stateHint('Papa sancochada')).toBe('COOKED');
    expect(stateHint('pescado crudo')).toBe('RAW');
    expect(stateHint('Avena, hojuela cruda')).toBe('RAW');
    expect(stateHint('platano')).toBeNull();
  });
});

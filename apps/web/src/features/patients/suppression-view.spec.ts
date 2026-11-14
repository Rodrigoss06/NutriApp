import { describe, expect, it } from 'vitest';
import { codeMatches } from './suppression-view';

describe('RN-B05 · confirmar la supresión con el código del paciente', () => {
  it('vale sin espacios a los lados y sin distinguir mayúsculas, como la API', () => {
    expect(codeMatches(' p-000007 ', 'P-000007')).toBe(true);
    expect(codeMatches('P-000007', 'P-000007')).toBe(true);
  });

  it('otro código o vacío, no', () => {
    expect(codeMatches('P-000008', 'P-000007')).toBe(false);
    expect(codeMatches('', 'P-000007')).toBe(false);
  });
});

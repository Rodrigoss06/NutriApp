import { describe, expect, it } from 'vitest';
import { visibleSheets } from './my-sheets-view';

describe('ADR-095 · las fichas de la app siguen las secciones que el profesional dejó a la vista', () => {
  it('sin Progreso no hay resultados ni evolución; sin Entrenamiento, no hay rutina', () => {
    const all = ['PLAN', 'PROGRAM', 'RESULTS', 'EVOLUTION'] as const;
    expect(visibleSheets(all, ['NUTRITION', 'TRAINING', 'EVOLUTION'])).toEqual(all);
    expect(visibleSheets(all, ['NUTRITION', 'HYDRATION'])).toEqual(['PLAN']);
    expect(visibleSheets(all, ['TRAINING', 'EVOLUTION'])).toEqual([
      'PROGRAM',
      'RESULTS',
      'EVOLUTION',
    ]);
  });
});

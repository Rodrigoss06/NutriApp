import { describe, expect, it } from 'vitest';
import { LUIS_EVOLUTION_SHEET } from './sheet-fixtures.spec-support.js';

describe('RN-H01 · ADR-091 · la ficha de evolución', () => {
  it('cada evaluación con su fecha y lo que cambió frente a la anterior (RN-C09)', () => {
    expect(LUIS_EVOLUTION_SHEET.evaluations).toEqual([
      { measuredOn: '2026-09-15', conditionDifferences: [] },
      { measuredOn: '2026-10-13', conditionDifferences: ['EVALUATOR'] },
    ]);
  });

  it('solo las series con evolución: un sitio medido una vez queda en la ficha de resultados', () => {
    expect(LUIS_EVOLUTION_SHEET.sites.map((site) => site.name)).toEqual(['Peso', 'Abdominal']);
  });

  it('RN-C06: cada medida con su cambio contra el CMD95; RN-D03: un indicador por método', () => {
    expect(LUIS_EVOLUTION_SHEET.skinfoldSum6?.overall).toEqual({
      change: -6.9,
      mdc95: 6.18,
      significance: 'CHANGE',
    });
    expect(LUIS_EVOLUTION_SHEET.sites[1]?.points.at(-1)).toEqual({
      measuredOn: '2026-10-13',
      value: 25,
      change: -1,
      significance: 'NO_SIGNIFICANT_CHANGE',
    });
    expect(LUIS_EVOLUTION_SHEET.metrics.map((m) => m.methodCode)).toEqual([
      'FAT_DW1974_SIRI1961',
      'FAT_YUHASZ1974',
    ]);
    expect(LUIS_EVOLUTION_SHEET.bia[0]?.device).toBe('Marca Demo · BIA-200');
  });
});

import type { ImportedPlan } from '@nutricoach/contracts';
import { describe, expect, it } from 'vitest';
import { importedPeriod, importedTargets } from './imported-plan-view';

const plan = (overrides: Partial<ImportedPlan> = {}): ImportedPlan => ({
  id: '01920000-0000-7000-8000-000000000001',
  validFrom: '2025-02-10',
  validTo: '2025-03-10',
  targetKcal: 1850,
  targetProteinG: 110,
  targetFatG: 60,
  targetChoG: 215.5,
  hydrationTargetMl: 2500,
  instructions: 'Cenar temprano',
  ...overrides,
});

describe('RF-40 · el plan del sistema anterior', () => {
  it('sus metas tal como venían, enteras al presentar (RN-D09)', () => {
    expect(importedTargets(plan())).toEqual([
      { label: 'Energía', value: '1,850 kcal' },
      { label: 'Proteína', value: '110 g' },
      { label: 'Grasa', value: '60 g' },
      { label: 'Carbohidratos', value: '216 g' },
      { label: 'Agua', value: '2,500 ml' },
    ]);
  });

  it('una meta que no venía no se muestra', () => {
    expect(
      importedTargets(
        plan({ targetProteinG: null, targetFatG: null, targetChoG: null, hydrationTargetMl: null }),
      ),
    ).toEqual([{ label: 'Energía', value: '1,850 kcal' }]);
    expect(
      importedTargets(
        plan({
          targetKcal: null,
          targetProteinG: null,
          targetFatG: null,
          targetChoG: null,
          hydrationTargetMl: null,
        }),
      ),
    ).toEqual([]);
  });

  it('su vigencia, con o sin fin', () => {
    expect(importedPeriod(plan())).toBe('Del 10 de febrero de 2025 al 10 de marzo de 2025');
    expect(importedPeriod(plan({ validTo: null }))).toBe('Desde el 10 de febrero de 2025');
  });
});

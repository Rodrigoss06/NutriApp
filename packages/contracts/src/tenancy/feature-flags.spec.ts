import { describe, expect, it } from 'vitest';
import { FEATURE_FLAG_DEFAULTS, FEATURE_FLAGS, setFeatureFlagSchema } from './feature-flags.js';
import { createPlanSchema, updatePlanSchema } from './organization.js';

describe('RF-39 · el panel interno (ADR-127)', () => {
  it('las banderas son un catálogo cerrado: las tres de la fase C, encendidas de fábrica', () => {
    expect(FEATURE_FLAGS).toEqual(['MESOCYCLE_REPORT', 'PROGRESS_PHOTOS', 'RECORD_DOCUMENTS']);
    expect(Object.values(FEATURE_FLAG_DEFAULTS).every(Boolean)).toBe(true);
    expect(setFeatureFlagSchema.safeParse({ enabled: 'no' }).success).toBe(false);
  });

  it('RN-A03 · un plan con su código en mayúsculas, límites positivos y el precio en céntimos', () => {
    const plan = {
      code: 'TRAMO_50',
      name: 'Tramo 50',
      maxActivePatients: 50,
      maxProfessionals: 10,
      durationMonths: 12,
      priceCents: 120_000,
      currency: 'PEN',
    };
    expect(createPlanSchema.parse(plan)).toEqual(plan);
    expect(createPlanSchema.safeParse({ ...plan, code: 'tramo-50' }).success).toBe(false);
    expect(createPlanSchema.safeParse({ ...plan, maxActivePatients: 0 }).success).toBe(false);
    expect(createPlanSchema.safeParse({ ...plan, priceCents: 12.5 }).success).toBe(false);
    expect(updatePlanSchema.safeParse({}).success).toBe(false);
    expect(updatePlanSchema.safeParse({ code: 'OTRO' }).success).toBe(false);
    expect(updatePlanSchema.parse({ isActive: false })).toEqual({ isActive: false });
  });
});

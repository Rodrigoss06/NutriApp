import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  ADEQUACY,
  DEMO_EXCHANGE_LIST,
  EXCHANGES_CLASSIC,
  MEAL_SPLIT_LARGEST_REMAINDER,
} from '../../src/diet/index.js';
import { runMethod } from '../../src/registry/run-method.js';
import { expectOk } from '../support.js';

/** Porcentajes enteros que suman 100, como los fija el profesional. */
const sharesSumming100 = fc
  .array(fc.integer({ min: 1, max: 100 }), { minLength: 1, maxLength: 8 })
  .map((weights) => {
    const total = weights.reduce((a, b) => a + b, 0);
    const pcts = weights.map((weight) => Math.floor((weight / total) * 100));
    pcts[0] = (pcts[0] ?? 0) + 100 - pcts.reduce((a, b) => a + b, 0);
    return pcts.map((pct, index) => ({ meal: `T${index}`, pct }));
  })
  .filter((meals) => meals.every(({ pct }) => pct >= 0));

describe('03 · propiedades de la dieta', () => {
  it('subir la proteína objetivo nunca baja los intercambios de carne', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 100, max: 400, noNaN: true }),
        fc.double({ min: 40, max: 250, noNaN: true }),
        fc.double({ min: 0, max: 60, noNaN: true }),
        fc.double({ min: 20, max: 150, noNaN: true }),
        (choG, proteinG, extraProteinG, fatG) => {
          const meat = (protein: number) =>
            expectOk(
              runMethod(EXCHANGES_CLASSIC, {
                target: { choG, proteinG: protein, fatG },
                fixedServings: { VEG: 4, FRU: 3, MILK: 3 },
                list: DEMO_EXCHANGE_LIST,
              }),
            ).outputs.servings.MEAT;
          expect(meat(proteinG + extraProteinG)).toBeGreaterThanOrEqual(meat(proteinG));
        },
      ),
    );
  });

  it('el reparto por tiempos siempre suma el total diario', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 40 }), sharesSumming100, (totalServings, meals) => {
        const { servingsByMeal } = expectOk(
          runMethod(MEAL_SPLIT_LARGEST_REMAINDER, { totalServings, meals }),
        ).outputs;
        expect(servingsByMeal.reduce((sum, { servings }) => sum + servings, 0)).toBe(totalServings);
        expect(
          servingsByMeal.every(({ servings }) => Number.isInteger(servings) && servings >= 0),
        ).toBe(true);
      }),
    );
  });

  it('la adecuación es 100 % cuando lo consumido es igual a lo prescrito', () => {
    fc.assert(
      fc.property(fc.double({ min: 1, max: 10_000, noNaN: true }), (prescribed) => {
        expect(
          expectOk(runMethod(ADEQUACY, { prescribed, consumedDaily: [prescribed] })).outputs
            .adequacyPct,
        ).toBe(100);
      }),
    );
  });
});

import { describe, expect, it } from 'vitest';
import { inputsHash } from '../hash/index.js';
import { ENGINE_VERSION } from '../version.js';
import { defineMethod, runMethod } from './run-method.js';

interface DemoInput {
  sex: 'M' | 'F';
  ageYears: number;
  weightKg: number;
  heightCm: number;
  tricepsMm: number;
}

const demo = defineMethod<DemoInput, { indexValue: number }>({
  code: 'BMI',
  version: '1.0.0',
  kind: 'INDICATOR',
  population: 'ALL',
  requiredInputs: ['weightKg', 'heightCm'],
  requiredSites: ['BASIC_WEIGHT', 'BASIC_HEIGHT'],
  citation: 'Método de prueba',
  measurements: (input) => [
    { field: 'weightKg', kind: 'WEIGHT_KG', value: input.weightKg },
    { field: 'heightCm', kind: 'HEIGHT_CM', value: input.heightCm },
    { field: 'tricepsMm', kind: 'SKINFOLD_MM', value: input.tricepsMm },
  ],
  validity: [
    {
      severity: 'ERROR',
      code: 'NC-ENG-101',
      message: 'Sin coeficientes para menores de 16 años.',
      when: (input) => input.ageYears < 16,
    },
    {
      severity: 'WARNING',
      code: 'NC-ENG-102',
      message: 'Fuera de la muestra de validación en menores de 18 años.',
      when: (input) => input.ageYears < 18,
    },
    { severity: 'INFO', code: 'NC-ENG-103', message: 'Ecuación de adultos.' },
  ],
  compute: (input) => ({
    outputs: { indexValue: input.weightKg / (input.heightCm / 100) ** 2 },
    issues:
      input.weightKg > 150
        ? [{ rule: 'RN-D07', severity: 'WARNING', code: 'NC-ENG-104', message: 'Revisar medidas.' }]
        : [],
  }),
});

const adult: DemoInput = { sex: 'M', ageYears: 28, weightKg: 80, heightCm: 175, tricepsMm: 12 };

describe('RN-D01 · sobre de resultado común', () => {
  it('lleva método, versión del método, versión del motor, insumos con su hash, resultados y advertencias', () => {
    const run = runMethod(demo, adult);

    expect(run.ok).toBe(true);
    if (!run.ok) return;
    expect(run.result).toEqual({
      methodCode: 'BMI',
      methodVersion: '1.0.0',
      engineVersion: ENGINE_VERSION,
      inputs: adult,
      inputsHash: inputsHash(adult),
      outputs: { indexValue: 80 / 1.75 ** 2 },
      warnings: [],
    });
    expect(ENGINE_VERSION).toBe('1.0.0');
  });

  it('copia y congela los insumos: cambiar el objeto de origen no altera el resultado', () => {
    const input = { ...adult };
    const run = runMethod(demo, input);
    input.weightKg = 90;

    expect(run.ok && run.result.inputs.weightKg).toBe(80);
    expect(run.ok && Object.isFrozen(run.result)).toBe(true);
  });
});

describe('RN-C04 · validación fisiológica antes de calcular', () => {
  it.each([
    ['un pliegue de 81 mm', { tricepsMm: 81 }],
    ['un pliegue negativo', { tricepsMm: -1 }],
    ['una talla de 99 cm', { heightCm: 99 }],
    ['una talla de 231 cm', { heightCm: 231 }],
    ['un peso de 19 kg', { weightKg: 19 }],
    ['un peso de 301 kg', { weightKg: 301 }],
    ['un valor que no es finito', { weightKg: Number.NaN }],
  ])('rechaza %s y no calcula', (_case, change) => {
    const run = runMethod(demo, { ...adult, ...change });

    expect(run.ok).toBe(false);
    expect(!run.ok && run.errors.map((error) => error.rule)).toEqual(['RN-C04']);
  });

  it('acepta los extremos del rango', () => {
    expect(runMethod(demo, { ...adult, tricepsMm: 0, heightCm: 230, weightKg: 20 }).ok).toBe(true);
    expect(runMethod(demo, { ...adult, tricepsMm: 80, heightCm: 100, weightKg: 300 }).ok).toBe(
      true,
    );
  });
});

describe('RN-D06 · validez por método con gravedad', () => {
  it('ERROR: no se calcula', () => {
    const run = runMethod(demo, { ...adult, ageYears: 15 });

    expect(run.ok).toBe(false);
    expect(!run.ok && run.errors).toEqual([
      expect.objectContaining({ rule: 'RN-D06', severity: 'ERROR', code: 'NC-ENG-101' }),
    ]);
  });

  it('ADVERTENCIA: se calcula y el aviso viaja con el resultado', () => {
    const run = runMethod(demo, { ...adult, ageYears: 17 });

    expect(run.ok && run.result.warnings).toEqual([
      expect.objectContaining({ rule: 'RN-D06', severity: 'WARNING', code: 'NC-ENG-102' }),
    ]);
  });

  it('INFO: queda en la definición del método, no en cada resultado', () => {
    const run = runMethod(demo, adult);

    expect(run.ok && run.result.warnings).toEqual([]);
    expect(demo.validity.find((rule) => rule.severity === 'INFO')?.message).toBe(
      'Ecuación de adultos.',
    );
  });

  it('las advertencias del cálculo citan su regla', () => {
    const run = runMethod(demo, { ...adult, weightKg: 160 });

    expect(run.ok && run.result.warnings).toEqual([
      expect.objectContaining({ rule: 'RN-D07', code: 'NC-ENG-104' }),
    ]);
  });

  it('un error del cálculo impide guardar, con su regla', () => {
    const failing = defineMethod<DemoInput, { indexValue: number }>({
      ...demo,
      compute: () => ({
        outputs: { indexValue: 0 },
        issues: [
          { rule: 'RN-E07', severity: 'ERROR', code: 'NC-ENG-105', message: 'No se puede.' },
        ],
      }),
    });

    const run = runMethod(failing, adult);

    expect(!run.ok && run.errors.map((error) => error.rule)).toEqual(['RN-E07']);
  });
});

describe('RN-D01 · métodos sin medidas fisiológicas', () => {
  const sum = defineMethod<{ valuesKcal: number[] }, { totalKcal: number }>({
    code: 'ADEQUACY',
    version: '1.0.0',
    kind: 'DIET',
    population: 'ALL',
    requiredInputs: ['valuesKcal'],
    requiredSites: [],
    citation: 'Método de prueba',
    validity: [],
    compute: ({ valuesKcal }) => ({
      outputs: { totalKcal: valuesKcal.reduce((a, b) => a + b, 0) },
    }),
  });

  it('calcula sin validar rangos y copia los arreglos de los insumos', () => {
    const valuesKcal = [1790, 1950];
    const run = runMethod(sum, { valuesKcal });
    valuesKcal.push(1600);

    expect(run.ok && run.result.outputs.totalKcal).toBe(3740);
    expect(run.ok && run.result.inputs.valuesKcal).toEqual([1790, 1950]);
  });
});

import { describe, expect, it } from 'vitest';
import { SITES } from '../sites.js';
import { METHODS, availableMethods } from './methods.js';
import { DEFAULT_ONE_RM_METHOD, METHODS_BY_POPULATION } from './population-defaults.js';
import { METHOD_CODES } from './types.js';

const ISAK_RESTRICTED_SKINFOLDS = [
  SITES.SKF_TRICEPS,
  SITES.SKF_SUBSCAPULAR,
  SITES.SKF_BICEPS,
  SITES.SKF_ILIAC_CREST,
  SITES.SKF_SUPRASPINALE,
  SITES.SKF_ABDOMINAL,
  SITES.SKF_FRONT_THIGH,
  SITES.SKF_MEDIAL_CALF,
];
const BASICS = [SITES.BASIC_WEIGHT, SITES.BASIC_HEIGHT, SITES.BASIC_SITTING_HEIGHT];
const adult = { sex: 'M', ageYears: 28, population: 'ADULT' };

describe('02 §9 · registro de métodos de la versión 1.0', () => {
  it('registra los 40 códigos (39 de 02 §9 más TEE_PAL), cada uno bajo su propio código', () => {
    expect(Object.keys(METHODS).sort()).toEqual([...METHOD_CODES].sort());
    expect(METHOD_CODES).toHaveLength(40);
    for (const [code, method] of Object.entries(METHODS)) expect(method.code).toBe(code);
  });

  it('cada método tiene versión semver, familia y cita bibliográfica', () => {
    for (const method of Object.values(METHODS)) {
      expect(method.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(method.kind).toBeTruthy();
      expect(method.citation.length).toBeGreaterThan(10);
    }
  });

  it('un código de aviso significa siempre lo mismo: misma regla y misma gravedad', () => {
    const meaning = new Map<string, string>();
    for (const method of Object.values(METHODS)) {
      for (const { code, rule = 'RN-D06', severity } of method.validity) {
        const current = `${rule} ${severity}`;
        expect(meaning.get(code) ?? current).toBe(current);
        meaning.set(code, current);
      }
    }
  });
});

describe('RN-D04 · un método solo se ofrece con sus sitios medidos y su validez obligatoria', () => {
  it('con el perfil ISAK 1 de Luis ofrece Durnin y Womersley, Faulkner y Yuhasz, pero no Jackson y Pollock', () => {
    const measured = [...BASICS, ...ISAK_RESTRICTED_SKINFOLDS];
    const offered = availableMethods(measured, adult);

    expect(offered).toEqual(
      expect.arrayContaining(['FAT_DW1974_SIRI1961', 'FAT_FAULKNER1968', 'FAT_YUHASZ1974']),
    );
    expect(offered).not.toContain('FAT_JP1978_7');
  });

  it('con pectoral, axilar medio y suprailíaco como sitios extra ofrece Jackson y Pollock', () => {
    const measured = [
      ...BASICS,
      ...ISAK_RESTRICTED_SKINFOLDS,
      SITES.SKF_CHEST,
      SITES.SKF_MIDAXILLARY,
      SITES.SKF_SUPRAILIAC,
    ];
    expect(availableMethods(measured, adult)).toContain('FAT_JP1978_7');
  });

  it('no ofrece un método cuya validez obligatoria falla: Durnin y Womersley a los 15 años', () => {
    const measured = [...BASICS, ...ISAK_RESTRICTED_SKINFOLDS];
    expect(availableMethods(measured, { ...adult, ageYears: 15 })).not.toContain(
      'FAT_DW1974_SIRI1961',
    );
  });

  it('Lee no se ofrece sin el coeficiente de grupo que fija la organización (RN-D11)', () => {
    const measured = [
      ...BASICS,
      ...ISAK_RESTRICTED_SKINFOLDS,
      SITES.GIRTH_ARM_RELAXED,
      SITES.GIRTH_THIGH,
      SITES.GIRTH_CALF,
    ];
    expect(availableMethods(measured, adult)).not.toContain('MUSCLE_LEE2000');
    expect(availableMethods(measured, { ...adult, ethnicityCoefficient: 0 })).toContain(
      'MUSCLE_LEE2000',
    );
  });

  it('solo considera métodos que dependen de sitios medidos', () => {
    expect(availableMethods([], adult)).toEqual([]);
  });
});

describe('RN-D05 · métodos por población como datos', () => {
  it('adultos y adultos mayores: Durnin y Womersley + Siri, músculo por Lee o por diferencia, hueso por Rocha', () => {
    for (const population of ['ADULT', 'OLDER_ADULT'] as const) {
      expect(METHODS_BY_POPULATION[population]).toMatchObject({
        fatPct: 'FAT_DW1974_SIRI1961',
        muscle: ['MUSCLE_LEE2000', 'COMP4_DEROSE_GUIMARAES'],
        bone: 'BONE_ROCHA1975',
      });
    }
  });

  it('deportistas: grasa por Yuhasz, masas por Kerr y hueso por Rocha', () => {
    expect(METHODS_BY_POPULATION.ATHLETE).toMatchObject({
      fatPct: 'FAT_YUHASZ1974',
      muscle: ['COMP5_KERR1988'],
      bone: 'BONE_ROCHA1975',
    });
  });

  it('niños, adolescentes y obesidad: sin ecuación de pliegues por defecto; priorizan IMC, cintura y cintura/talla', () => {
    for (const population of ['CHILD', 'ADOLESCENT', 'OBESITY'] as const) {
      expect(METHODS_BY_POPULATION[population]).toMatchObject({
        fatPct: null,
        priorityIndicators: ['BMI', 'WAIST_HEIGHT'],
      });
      expect(METHODS_BY_POPULATION[population].note).toBeTruthy();
    }
  });

  it('RN-F04 · el 1RM se estima con Epley por defecto', () => {
    expect(DEFAULT_ONE_RM_METHOD).toBe('ONERM_EPLEY1985');
  });

  it('todo método de la tabla está registrado', () => {
    for (const defaults of Object.values(METHODS_BY_POPULATION)) {
      for (const code of [
        defaults.fatPct,
        defaults.bone,
        ...defaults.muscle,
        ...defaults.priorityIndicators,
      ]) {
        if (code !== null) expect(METHODS).toHaveProperty(code);
      }
    }
  });
});

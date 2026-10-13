import { describe, expect, it } from 'vitest';
import catalogSeed from '../../../../../../seeds/assessment/measurement-sites.json' with { type: 'json' };
import {
  canRecordTechnicalError,
  checkAttempts,
  checkTechnicalErrorPairs,
  closeError,
  decimalAgeYears,
  progressOf,
  requiredSiteCodes,
  type Consolidation,
  type SiteDefinition,
} from './assessment-rules.js';

const SITES = catalogSeed.sites as SiteDefinition[];
const site = (code: string): SiteDefinition => {
  const found = SITES.find((s) => s.code === code);
  if (!found) throw new Error(code);
  return found;
};

const consolidated = (value: number): Consolidation => ({
  value,
  diffPct: 0,
  needsThird: false,
  method: 'MEAN_2',
});
const pendingThird: Consolidation = { value: null, diffPct: 8.33, needsThird: true, method: null };
const oneAttempt: Consolidation = { value: null, diffPct: null, needsThird: false, method: null };

describe('RN-C01 · el nivel define los sitios requeridos', () => {
  it('básico: peso, talla, cintura y cadera; ISAK 1: 21; ISAK 2: 42; bioimpedancia sin nivel: ninguno', () => {
    expect(requiredSiteCodes('BASIC', SITES)).toEqual([
      'BASIC_WEIGHT',
      'BASIC_HEIGHT',
      'GIRTH_WAIST',
      'GIRTH_HIP',
    ]);
    expect(requiredSiteCodes('ISAK1', SITES)).toHaveLength(21);
    expect(requiredSiteCodes('ISAK2', SITES)).toHaveLength(42);
    expect(requiredSiteCodes(null, SITES)).toEqual([]);
  });
});

describe('RN-C04 · rangos de rechazo del catálogo', () => {
  it('rechaza peso bajo 20 kg, pliegue sobre 80 mm y cintura bajo 40 cm; acepta los bordes', () => {
    expect(checkAttempts(site('BASIC_WEIGHT'), [19.9], null)?.code).toBe('NC-ASM-003');
    expect(checkAttempts(site('SKF_TRICEPS'), [12, 80.5], consolidated(12))?.rule).toBe('RN-C04');
    expect(checkAttempts(site('GIRTH_WAIST'), [39], null)?.code).toBe('NC-ASM-003');
    expect(checkAttempts(site('BASIC_WEIGHT'), [20, 20], consolidated(20))).toBeNull();
    expect(checkAttempts(site('SKF_TRICEPS'), [0, 0], consolidated(0))).toBeNull();
  });
});

describe('RN-C02 · la tercera toma solo cuando hace falta', () => {
  it('con las dos primeras fuera de tolerancia se acepta; dentro, se rechaza', () => {
    expect(checkAttempts(site('SKF_TRICEPS'), [12, 13, 12.6], pendingThird)).toBeNull();
    const extra = checkAttempts(site('SKF_TRICEPS'), [12, 12.4, 12.2], consolidated(12.2));
    expect(extra?.code).toBe('NC-ASM-005');
    expect(extra?.rule).toBe('RN-C02');
  });
});

describe('02 §7 · qué falta para cerrar', () => {
  const basic = { kind: 'ANTHROPOMETRY', level: 'BASIC' } as const;
  const all = (codes: readonly string[]) =>
    codes.map((siteCode) => ({ siteCode, consolidation: consolidated(1) }));

  it('se cierra con los sitios del nivel consolidados', () => {
    const progress = progressOf(basic, SITES, all(requiredSiteCodes('BASIC', SITES)), 0);
    expect(progress).toMatchObject({ missingSites: [], needsThirdSites: [], canClose: true });
    expect(closeError(basic, progress, 0)).toBeNull();
  });

  it('RN-C02 · una tercera toma pendiente bloquea primero, con NC-ASM-004', () => {
    const measured = [
      ...all(['BASIC_WEIGHT', 'BASIC_HEIGHT', 'GIRTH_WAIST']),
      { siteCode: 'GIRTH_HIP', consolidation: pendingThird },
    ];
    const progress = progressOf(basic, SITES, measured, 0);
    expect(progress.needsThirdSites).toEqual(['GIRTH_HIP']);
    expect(closeError(basic, progress, 0)?.code).toBe('NC-ASM-004');
  });

  it('RN-C01 · faltan sitios exigidos o un extra quedó con una sola toma', () => {
    const measured = [
      ...all(['BASIC_WEIGHT', 'BASIC_HEIGHT', 'GIRTH_WAIST']),
      { siteCode: 'SKF_CHEST', consolidation: oneAttempt },
    ];
    const progress = progressOf(basic, SITES, measured, 0);
    expect(progress.missingSites).toEqual(['GIRTH_HIP', 'SKF_CHEST']);
    const error = closeError(basic, progress, 0);
    expect(error?.code).toBe('NC-ASM-006');
    expect(error?.rule).toBe('RN-C01');
  });

  it('RN-C08 · una evaluación de bioimpedancia o mixta se cierra con su lectura', () => {
    const bia = { kind: 'BIA', level: null } as const;
    expect(progressOf(bia, SITES, [], 0).canClose).toBe(false);
    expect(closeError(bia, progressOf(bia, SITES, [], 0), 0)?.code).toBe('NC-ASM-012');
    expect(progressOf(bia, SITES, [], 1).canClose).toBe(true);
  });
});

describe('ADR-044 · edad decimal al medir', () => {
  it('es exacta el día del cumpleaños y crece con la fracción del año', () => {
    expect(decimalAgeYears('1998-10-13', '2026-10-13')).toBe(28);
    expect(decimalAgeYears('1998-10-13', '2026-10-12')).toBeCloseTo(27.997, 3);
    expect(decimalAgeYears('1998-10-13', '2027-04-13')).toBeCloseTo(28 + 182 / 365, 9);
  });

  it('el 29 de febrero se cuenta el 28 en años no bisiestos', () => {
    expect(decimalAgeYears('2000-02-29', '2027-02-28')).toBe(27);
    expect(decimalAgeYears('2000-02-29', '2028-02-29')).toBe(28);
  });
});

describe('RN-C05 · ETM del evaluador', () => {
  it('lo registra el propio evaluador, el dueño o un administrador', () => {
    const member = 'm-1';
    expect(canRecordTechnicalError({ role: 'PROFESSIONAL', memberId: member }, member)).toBe(true);
    expect(canRecordTechnicalError({ role: 'PROFESSIONAL', memberId: 'm-2' }, member)).toBe(false);
    expect(canRecordTechnicalError({ role: 'OWNER', memberId: 'm-2' }, member)).toBe(true);
    expect(canRecordTechnicalError({ role: 'ADMIN', memberId: null }, member)).toBe(true);
  });

  it('los pares van dentro del rango del sitio y con media mayor que cero', () => {
    expect(checkTechnicalErrorPairs(site('SKF_TRICEPS'), [[12, 12.4]])).toBeNull();
    expect(checkTechnicalErrorPairs(site('SKF_TRICEPS'), [[12, 90]])?.code).toBe('NC-ASM-003');
    expect(checkTechnicalErrorPairs(site('SKF_TRICEPS'), [[0, 0]])?.code).toBe('NC-ASM-016');
  });
});

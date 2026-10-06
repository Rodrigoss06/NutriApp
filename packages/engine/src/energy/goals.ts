import { defineMethod } from '../registry/run-method.js';
import type { Issue, MethodCode } from '../registry/types.js';
import type { Kg } from '../units.js';

/** Regla estática de 7700 kcal por kg de grasa; sobrestima a largo plazo (Hall et al., Lancet 2011). */
export const KCAL_PER_KG_FAT = 7700;
/** Días por mes del déficit diario (RN-E04). */
export const DAYS_PER_MONTH = 30;
/** Semanas por mes del ritmo semanal (52.14 semanas ÷ 12 meses), como en docs/reference/examples.ts. */
export const WEEKS_PER_MONTH = 4.345;

/** Ritmos semanales aceptados, en % del peso (RN-E04; Helms et al. 2014, Iraki et al. 2019). */
export const WEEKLY_RATE_PCT = { LOSS: [0.5, 1], GAIN: [0.25, 0.5] } as const;

export interface FatLossInput {
  readonly teeKcal: number;
  readonly weightKg: Kg;
  /** Kg de grasa por mes: negativo para perder, positivo para ganar. */
  readonly fatChangeKgPerMonth: number;
}

export interface FatLossOutput {
  /** Kcal por día que se restan al GET; negativo es superávit. */
  readonly deficitKcal: number;
  readonly targetKcal: number;
  readonly weeklyRatePct: number;
  /** Proyección lineal inicial: se recalcula con el peso nuevo en cada evaluación (RN-E05). */
  readonly projection: 'INITIAL_ESTIMATE';
}

const rateWarning = (code: 'NC-ENG-206' | 'NC-ENG-207', message: string): Issue => ({
  rule: 'RN-E04',
  severity: 'WARNING',
  code,
  message,
});

export const FAT_LOSS_7700 = defineMethod<FatLossInput, FatLossOutput>({
  code: 'FAT_LOSS_7700',
  version: '1.0.0',
  kind: 'GOAL',
  population: 'ALL',
  requiredInputs: ['teeKcal', 'weightKg', 'fatChangeKgPerMonth'],
  requiredSites: [],
  citation: `Wishnofsky 1958, ${KCAL_PER_KG_FAT} kcal por kg; ${DAYS_PER_MONTH} días y ${WEEKS_PER_MONTH} semanas por mes; Hall et al., Lancet 2011`,
  validity: [],
  compute: ({ teeKcal, weightKg, fatChangeKgPerMonth }) => {
    const deficitKcal = (-fatChangeKgPerMonth * KCAL_PER_KG_FAT) / DAYS_PER_MONTH;
    const weeklyRatePct = (Math.abs(fatChangeKgPerMonth) / WEEKS_PER_MONTH / weightKg) * 100;
    const issues: Issue[] = [];
    if (fatChangeKgPerMonth < 0) {
      const [min, max] = WEEKLY_RATE_PCT.LOSS;
      if (weeklyRatePct < min || weeklyRatePct > max) {
        issues.push(
          rateWarning(
            'NC-ENG-206',
            'El ritmo de pérdida aconsejado es de 0.5 a 1 % del peso por semana.',
          ),
        );
      }
    } else if (fatChangeKgPerMonth > 0) {
      const [min, max] = WEEKLY_RATE_PCT.GAIN;
      if (weeklyRatePct < min || weeklyRatePct > max) {
        issues.push(
          rateWarning(
            'NC-ENG-207',
            'El ritmo de ganancia aconsejado es de 0.25 a 0.5 % del peso por semana.',
          ),
        );
      }
    }
    return {
      outputs: {
        deficitKcal,
        targetKcal: teeKcal - deficitKcal,
        weeklyRatePct,
        projection: 'INITIAL_ESTIMATE',
      },
      issues,
    };
  },
});

export interface TargetWeightInput {
  readonly weightKg: Kg;
  readonly fatFreeMassKg: Kg;
  readonly fatFreeMassMethodCode: MethodCode;
  readonly targetFatPct: number;
  /** Ritmo mensual de cambio de grasa, para estimar el tiempo (RN-E06). */
  readonly fatChangeKgPerMonth?: number;
}

export interface TargetWeightOutput {
  readonly targetWeightKg: Kg;
  /** Objetivo − peso actual: negativo es perder. */
  readonly weightChangeKg: number;
  /** null sin ritmo o si el ritmo va en sentido contrario. */
  readonly monthsToTarget: number | null;
}

/** Peso objetivo = masa libre de grasa ÷ (1 − % de grasa deseado ÷ 100) (RN-E06). */
export const TARGET_WEIGHT_FAT_PCT = defineMethod<TargetWeightInput, TargetWeightOutput>({
  code: 'TARGET_WEIGHT_FAT_PCT',
  version: '1.0.0',
  kind: 'GOAL',
  population: 'ALL',
  requiredInputs: ['weightKg', 'fatFreeMassKg', 'fatFreeMassMethodCode', 'targetFatPct'],
  requiredSites: [],
  citation: 'Peso objetivo con masa libre de grasa constante; guía de dominio §3.9 y §4.6',
  validity: [],
  compute: ({ weightKg, fatFreeMassKg, targetFatPct, fatChangeKgPerMonth }) => {
    if (!(targetFatPct > 0 && targetFatPct < 100)) {
      return {
        outputs: {
          targetWeightKg: Number.NaN as Kg,
          weightChangeKg: Number.NaN,
          monthsToTarget: null,
        },
        issues: [
          {
            rule: 'RN-E06',
            severity: 'ERROR',
            code: 'NC-ENG-208',
            message: 'El % de grasa objetivo va entre 0 y 100.',
          },
        ],
      };
    }
    const targetWeightKg = (fatFreeMassKg / (1 - targetFatPct / 100)) as Kg;
    const weightChangeKg = targetWeightKg - weightKg;
    const sameDirection =
      fatChangeKgPerMonth !== undefined &&
      fatChangeKgPerMonth !== 0 &&
      Math.sign(fatChangeKgPerMonth) === Math.sign(weightChangeKg);
    return {
      outputs: {
        targetWeightKg,
        weightChangeKg,
        monthsToTarget: sameDirection ? weightChangeKg / fatChangeKgPerMonth : null,
      },
    };
  },
});

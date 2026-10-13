import {
  BMR_SCHOFIELD1985,
  DAYS_PER_MONTH,
  EE_MET_COMPENDIUM2024,
  ENGINE_VERSION,
  FAT_LOSS_7700,
  inputsHash,
  KCAL_PER_KG_FAT,
  MACROS_PROTEIN_FIRST,
  RMR_CUNNINGHAM1980,
  RMR_HB1919,
  RMR_KATCH_MCARDLE,
  RMR_MIFFLIN1990,
  runMethod,
  TARGET_WEIGHT_FAT_PCT,
  TEE_PAL,
  cm,
  kg,
  type AnyMethod,
  type Issue,
  type MethodCode,
} from '@nutricoach/engine';
import type {
  BodyCompositionInput,
  EnergyAdjustment,
  EnergyGoal,
  EnergyStrategy,
  RmrMethodCode,
} from '../domain/energy-rules.js';

/** El sobre de un componente (RN-D01, 02 §7): método, versión, insumos con su hash, salidas y avisos. */
export interface EnergyComponent {
  readonly methodCode: MethodCode;
  readonly methodVersion: string;
  readonly inputs: Readonly<Record<string, unknown>>;
  readonly inputsHash: string;
  readonly outputs: Readonly<Record<string, unknown>>;
  readonly warnings: readonly Issue[];
}

export interface ActivityChoice {
  readonly activityCode: string;
  readonly minutesPerSession: number;
  readonly sessionsPerWeek: number;
}

export interface CatalogActivity {
  readonly code: string;
  readonly descriptionEs: string;
  readonly met: number;
}

export interface PrescriptionRequest {
  readonly rmrMethodCode: RmrMethodCode;
  readonly strategy: EnergyStrategy;
  readonly pal: number;
  readonly activities: readonly ActivityChoice[];
  readonly goal: EnergyGoal;
  readonly adjustment: EnergyAdjustment;
  readonly targetFatPct: number | null;
  readonly proteinGPerKg: number;
  readonly fatPctKcal: number;
}

export interface PrescriptionComponents {
  readonly rmr: EnergyComponent;
  readonly exercise: EnergyComponent;
  readonly tee: EnergyComponent;
  readonly adjustment: EnergyComponent;
  readonly projection: (EnergyComponent & { readonly estimatedDate: string | null }) | null;
  readonly macros: EnergyComponent;
}

export interface PrescriptionCalculation {
  readonly components: PrescriptionComponents;
  readonly fatKgPerMonth: number;
  readonly engineVersion: string;
  /** SHA-256 del JSON canónico de la composición usada y de lo que pidió el profesional. */
  readonly inputsHash: string;
}

export type PrescriptionFailure =
  | { readonly kind: 'RULE'; readonly methodCode: MethodCode; readonly issue: Issue }
  | { readonly kind: 'NO_FAT_FREE_MASS' };

const RMR_METHODS = {
  RMR_MIFFLIN1990,
  RMR_HB1919,
  BMR_SCHOFIELD1985,
  RMR_CUNNINGHAM1980,
  RMR_KATCH_MCARDLE,
} as const;

/** Insumos de cada TMR (RN-E01): Cunningham y Katch-McArdle usan la masa libre de grasa y citan su método. */
function rmrInputs(method: RmrMethodCode, basis: BodyCompositionInput): Record<string, unknown> {
  switch (method) {
    case 'RMR_MIFFLIN1990':
    case 'RMR_HB1919':
      return {
        sex: basis.sex,
        ageYears: basis.ageYears,
        weightKg: kg(basis.weightKg),
        heightCm: cm(basis.heightCm),
      };
    case 'BMR_SCHOFIELD1985':
      return { sex: basis.sex, ageYears: basis.ageYears, weightKg: kg(basis.weightKg) };
    case 'RMR_CUNNINGHAM1980':
    case 'RMR_KATCH_MCARDLE':
      return {
        ageYears: basis.ageYears,
        ...(basis.fatFreeMass
          ? {
              fatFreeMassKg: kg(basis.fatFreeMass.kg),
              fatFreeMassMethodCode: basis.fatFreeMass.methodCode,
            }
          : {}),
      };
  }
}

type Run =
  | { readonly ok: true; readonly component: EnergyComponent }
  | {
      readonly ok: false;
      readonly methodCode: MethodCode;
      readonly errors: readonly Issue[];
      readonly warnings: readonly Issue[];
    };

function run(method: AnyMethod, inputs: Record<string, unknown>): Run {
  const result = runMethod(method, inputs as never);
  if (!result.ok) {
    return { ok: false, methodCode: method.code, errors: result.errors, warnings: result.warnings };
  }
  return {
    ok: true,
    component: {
      methodCode: result.result.methodCode,
      methodVersion: result.result.methodVersion,
      inputs: result.result.inputs,
      inputsHash: result.result.inputsHash,
      outputs: result.result.outputs as Readonly<Record<string, unknown>>,
      warnings: result.result.warnings,
    },
  };
}

/** La TMR con los cinco métodos para elegir (RN-E01, G-13): los que no se pueden calcular dicen por qué. */
export function rmrOptions(basis: BodyCompositionInput) {
  return (Object.keys(RMR_METHODS) as RmrMethodCode[]).map((methodCode) => {
    const result = run(RMR_METHODS[methodCode], rmrInputs(methodCode, basis));
    return result.ok
      ? {
          methodCode,
          methodVersion: result.component.methodVersion,
          rmrKcal: number(result.component.outputs, 'rmrKcal'),
          issues: result.component.warnings,
        }
      : {
          methodCode,
          methodVersion: RMR_METHODS[methodCode].version,
          rmrKcal: null,
          issues: [...result.errors, ...result.warnings],
        };
  });
}

const number = (outputs: Readonly<Record<string, unknown>>, key: string): number => {
  const value = outputs[key];
  if (typeof value !== 'number') throw new Error(`Salida ${key} sin número.`);
  return value;
};

/** Días civiles después de una fecha (YYYY-MM-DD). */
function addDays(date: string, days: number): string {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/**
 * Prescripción energética (RN-E01 a RN-E07) con el motor, componente por componente: TMR elegida, ejercicio neto por
 * METs (RN-E03), GET con PAL (TEE_PAL, ADR-029), objetivo con 7700 kcal por kg (RN-E04), peso objetivo y fecha
 * estimada como estimación inicial (RN-E05, RN-E06) y macronutrientes con proteína primero (RN-E07). Un ERROR de
 * cualquier componente detiene la prescripción.
 */
export function calculatePrescription(
  basis: BodyCompositionInput,
  request: PrescriptionRequest,
  catalog: ReadonlyMap<string, CatalogActivity>,
  today: string,
): { ok: true; value: PrescriptionCalculation } | { ok: false; failure: PrescriptionFailure } {
  const fail = (result: Extract<Run, { ok: false }>) => {
    const [issue] = result.errors;
    if (!issue) throw new Error(`${result.methodCode} falló sin aviso.`);
    return {
      ok: false as const,
      failure: { kind: 'RULE' as const, methodCode: result.methodCode, issue },
    };
  };
  const rmr = run(RMR_METHODS[request.rmrMethodCode], rmrInputs(request.rmrMethodCode, basis));
  if (!rmr.ok) return fail(rmr);
  const activities = request.strategy === 'ADDITIVE' ? request.activities : [];
  const exercise = run(EE_MET_COMPENDIUM2024, {
    weightKg: kg(basis.weightKg),
    activities: activities.map((choice) => ({
      code: choice.activityCode,
      met: catalog.get(choice.activityCode)?.met ?? Number.NaN,
      minutesPerSession: choice.minutesPerSession,
      sessionsPerWeek: choice.sessionsPerWeek,
    })),
  });
  if (!exercise.ok) return fail(exercise);
  const tee = run(TEE_PAL, {
    rmrKcal: number(rmr.component.outputs, 'rmrKcal'),
    pal: request.pal,
    strategy: request.strategy,
    exerciseMode: 'NET',
    exerciseDailyNetKcal: number(exercise.component.outputs, 'dailyAverageNetKcal'),
    ageYears: basis.ageYears,
  });
  if (!tee.ok) return fail(tee);
  // RN-E04: un ajuste en kcal por día equivale a kcal × 30 ÷ 7700 kg de grasa por mes; así se muestra su ritmo semanal.
  const fatKgPerMonth =
    request.adjustment.kind === 'FAT_KG_PER_MONTH'
      ? request.adjustment.fatKgPerMonth
      : (request.adjustment.kcalPerDay * DAYS_PER_MONTH) / KCAL_PER_KG_FAT;
  const adjustment = run(FAT_LOSS_7700, {
    teeKcal: number(tee.component.outputs, 'teeKcal'),
    weightKg: kg(basis.weightKg),
    fatChangeKgPerMonth: fatKgPerMonth,
  });
  if (!adjustment.ok) return fail(adjustment);
  const targetKcal = number(adjustment.component.outputs, 'targetKcal');
  let projection: PrescriptionComponents['projection'] = null;
  if (request.targetFatPct !== null) {
    if (!basis.fatFreeMass) return { ok: false, failure: { kind: 'NO_FAT_FREE_MASS' } };
    const target = run(TARGET_WEIGHT_FAT_PCT, {
      weightKg: kg(basis.weightKg),
      fatFreeMassKg: kg(basis.fatFreeMass.kg),
      fatFreeMassMethodCode: basis.fatFreeMass.methodCode,
      targetFatPct: request.targetFatPct,
      fatChangeKgPerMonth: fatKgPerMonth,
    });
    if (!target.ok) return fail(target);
    const months = target.component.outputs.monthsToTarget;
    projection = {
      ...target.component,
      estimatedDate:
        typeof months === 'number' ? addDays(today, Math.round(months * DAYS_PER_MONTH)) : null,
    };
  }
  const macros = run(MACROS_PROTEIN_FIRST, {
    targetKcal,
    weightKg: kg(basis.weightKg),
    proteinGPerKg: request.proteinGPerKg,
    fatPctKcal: request.fatPctKcal,
  });
  if (!macros.ok) return fail(macros);
  return {
    ok: true,
    value: {
      components: {
        rmr: rmr.component,
        exercise: exercise.component,
        tee: tee.component,
        adjustment: adjustment.component,
        projection,
        macros: macros.component,
      },
      fatKgPerMonth,
      engineVersion: ENGINE_VERSION,
      inputsHash: inputsHash({ basis, request }),
    },
  };
}

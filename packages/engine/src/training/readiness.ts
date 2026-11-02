import { defineMethod } from '../registry/run-method.js';
import type { Issue } from '../registry/types.js';
import { mean, sum } from '../stats.js';

/** Lo que el paciente registra en su día y usa la recuperación (RN-G11, 07 §9). null es «sin dato», nunca cero. */
export interface ReadinessDay {
  /** Minutos de la sesión; 0 en un día sin sesión. */
  readonly sessionMinutes: number | null;
  /** Esfuerzo percibido de toda la sesión, de 0 a 10 (P-12). */
  readonly sessionRpe: number | null;
  readonly sleepHours: number | null;
  /** De 1 a 5: 5 es el peor estado. */
  readonly fatigue: number | null;
  readonly soreness: number | null;
  readonly stress: number | null;
  /** De 1 a 5: 5 es la mayor. */
  readonly motivation: number | null;
  /** De 0 a 3, solo con el consentimiento MENSTRUAL_TRACKING (RN-G17). */
  readonly menstrualSymptoms: number | null;
  /** El rendimiento planificado y el real del día (P-09). */
  readonly performancePlanned: number | null;
  readonly performanceActual: number | null;
  /** A mano en la 1.0: sin reloj. */
  readonly restingHrBpm: number | null;
  readonly hrvMs: number | null;
}

/** La línea base del perfil de entrenamiento (07 §2). Sin perfil, todo null. */
export interface ReadinessBaseline {
  readonly sleepTargetHours: number | null;
  readonly restingHrBpm: number | null;
  readonly hrvMs: number | null;
}

/** Los umbrales vigentes de la organización (07 §11): son datos versionados, no constantes del método. */
export interface ReadinessThresholds {
  /** Lo que vale una parte sin su dato o sin su línea base. */
  readonly neutralScore: number;
  readonly readinessGreenMin: number;
  readonly readinessRedBelow: number;
  readonly performanceMinPct: number;
}

export interface ReadinessInput {
  readonly day: ReadinessDay;
  readonly baseline: ReadinessBaseline;
  readonly thresholds: ReadinessThresholds;
}

export const READINESS_COMPONENTS = ['sleep', 'heartRate', 'hrv', 'subjective'] as const;
export type ReadinessComponent = (typeof READINESS_COMPONENTS)[number];

/** Verde mantener, amarillo ajustar 5–15 %, rojo recuperar o revisar, y sin datos suficientes (RN-G15). */
export const DAILY_INDICATIONS = ['GREEN', 'YELLOW', 'RED', 'NO_DATA'] as const;
export type DailyIndication = (typeof DAILY_INDICATIONS)[number];

export interface Readiness {
  /** Minutos × RPE; sin uno de los dos, null. */
  readonly srpeLoad: number | null;
  /** mín(120, real ÷ planificado × 100); null sin planificado mayor que 0 o sin real. */
  readonly performancePct: number | null;
  /** Cada parte de 0 a 100, con el neutral donde falta el dato. */
  readonly components: Readonly<Record<ReadinessComponent, number>>;
  /** Las partes que valen el neutral, en el orden de READINESS_COMPONENTS. */
  readonly neutralComponents: readonly ReadinessComponent[];
  /** El promedio de las cuatro partes; null si el día no tiene ningún dato de recuperación. */
  readonly readinessScore: number | null;
  readonly indication: DailyIndication;
}

/** Constantes del método V3 (07 §9): cambian con su versión, no por organización (05.2). */
const HEART_RATE_POINTS_PER_BPM = 6;
const HEART_RATE_FLOOR = 20;
const COMPONENT_MAX = 100;
const PERFORMANCE_CAP_PCT = 120;
const RED_MENSTRUAL_SYMPTOMS = 3;
const SUBJECTIVE_MAX_PER_ANSWER = 5;

/** Carga sRPE de la sesión: minutos × RPE (RN-G14). */
export function srpeLoad(minutes: number | null, rpe: number | null): number | null {
  return minutes === null || rpe === null ? null : minutes * rpe;
}

/** Rendimiento del día: real frente a planificado, con tope de 120 % (RN-G14). Solo con planificado mayor que 0 y real. */
export function performancePct(planned: number | null, actual: number | null): number | null {
  if (planned === null || actual === null || planned <= 0) return null;
  return Math.min(PERFORMANCE_CAP_PCT, (actual * 100) / planned);
}

/**
 * Indicación del día, en el orden de la V3 (RN-G15): sin recuperación no hay indicación; síntomas del ciclo en 3 o
 * recuperación bajo la roja, rojo; bajo la verde o rendimiento bajo el mínimo, amarillo; si no, verde. Es un consejo para
 * el día: no cambia el plan.
 */
export function dailyIndication(
  day: {
    readonly readinessScore: number | null;
    readonly menstrualSymptoms: number | null;
    readonly performancePct: number | null;
  },
  thresholds: ReadinessThresholds,
): DailyIndication {
  const { readinessScore, menstrualSymptoms, performancePct: performance } = day;
  if (readinessScore === null) return 'NO_DATA';
  if (
    menstrualSymptoms === RED_MENSTRUAL_SYMPTOMS ||
    readinessScore < thresholds.readinessRedBelow
  ) {
    return 'RED';
  }
  if (
    readinessScore < thresholds.readinessGreenMin ||
    (performance !== null && performance < thresholds.performanceMinPct)
  ) {
    return 'YELLOW';
  }
  return 'GREEN';
}

/** Las partes con su dato; null donde falta el dato del día o su línea base (07 §9). */
function rawComponents(
  day: ReadinessDay,
  baseline: ReadinessBaseline,
): Record<ReadinessComponent, number | null> {
  const sleep =
    day.sleepHours === null || baseline.sleepTargetHours === null
      ? null
      : Math.min(COMPONENT_MAX, (day.sleepHours * 100) / baseline.sleepTargetHours);
  // P-19: la fórmula no pone tope a la FC bajo la basal; el tope de 100 respeta el rango de 0 a 100 de la recuperación.
  const heartRate =
    day.restingHrBpm === null || baseline.restingHrBpm === null
      ? null
      : Math.min(
          COMPONENT_MAX,
          Math.max(
            HEART_RATE_FLOOR,
            100 - (day.restingHrBpm - baseline.restingHrBpm) * HEART_RATE_POINTS_PER_BPM,
          ),
        );
  const hrv =
    day.hrvMs === null || baseline.hrvMs === null
      ? null
      : Math.min(COMPONENT_MAX, (day.hrvMs * 100) / baseline.hrvMs);
  // P-02: la parte subjetiva promedia solo lo respondido.
  const answered = [
    day.fatigue === null ? null : 6 - day.fatigue,
    day.soreness === null ? null : 6 - day.soreness,
    day.stress === null ? null : 6 - day.stress,
    day.motivation,
  ].filter((value): value is number => value !== null);
  const subjective =
    answered.length === 0
      ? null
      : (sum(answered) * 100) / (SUBJECTIVE_MAX_PER_ANSWER * answered.length);
  return { sleep, heartRate, hrv, subjective };
}

/** Un día con al menos un dato de recuperación: sueño, FC, HRV o una respuesta subjetiva (07 §9). */
const hasRecoveryData = (day: ReadinessDay): boolean =>
  [
    day.sleepHours,
    day.restingHrBpm,
    day.hrvMs,
    day.fatigue,
    day.soreness,
    day.stress,
    day.motivation,
  ].some((value) => value !== null);

/** Un rango cerrado; POSITIVE es «mayor que 0», sin tope. */
type Bounds = readonly [min: number, max: number] | 'POSITIVE';
type Range = readonly [field: string, value: number | null, bounds: Bounds, integer?: boolean];

const within = (value: number, bounds: Bounds): boolean =>
  bounds === 'POSITIVE' ? value > 0 : value >= bounds[0] && value <= bounds[1];

const describeBounds = (bounds: Bounds): string => {
  if (bounds === 'POSITIVE') return 'mayor que 0';
  const [min, max] = bounds;
  return max === Infinity ? `${String(min)} o más` : `de ${String(min)} a ${String(max)}`;
};

/** Lo que está fuera de rango, con su regla y su código. */
function outOfRange(ranges: readonly Range[], issue: Omit<Issue, 'message'>): Issue[] {
  return ranges.flatMap(([field, value, bounds, integer = false]) => {
    if (value === null) return [];
    if (Number.isFinite(value) && within(value, bounds) && (!integer || Number.isInteger(value))) {
      return [];
    }
    const kind = integer ? ', entero' : '';
    return [{ ...issue, message: `${field} fuera de rango (${describeBounds(bounds)}${kind}).` }];
  });
}

/** Los rangos del registro diario (RN-G11, 05.2) y de la línea base (07 §2), y umbrales coherentes (07 §11). */
function inputIssues({ day, baseline, thresholds }: ReadinessInput): Issue[] {
  const dayIssues = outOfRange(
    [
      ['Los minutos de la sesión', day.sessionMinutes, [0, 600], true],
      ['El RPE de la sesión', day.sessionRpe, [0, 10]],
      ['Las horas de sueño', day.sleepHours, [0, 24]],
      ['La fatiga', day.fatigue, [1, 5], true],
      ['El dolor muscular', day.soreness, [1, 5], true],
      ['El estrés', day.stress, [1, 5], true],
      ['La motivación', day.motivation, [1, 5], true],
      ['Los síntomas del ciclo', day.menstrualSymptoms, [0, 3], true],
      ['El rendimiento planificado', day.performancePlanned, [0, Infinity]],
      ['El rendimiento real', day.performanceActual, [0, Infinity]],
      ['La FC en reposo', day.restingHrBpm, [25, 220], true],
      ['La HRV', day.hrvMs, 'POSITIVE'],
    ],
    { rule: 'RN-G11', severity: 'ERROR', code: 'NC-ENG-406' },
  );
  const baselineIssues = outOfRange(
    [
      ['El sueño objetivo', baseline.sleepTargetHours, [4, 12]],
      ['La FC en reposo basal', baseline.restingHrBpm, [25, 220], true],
      ['La HRV basal', baseline.hrvMs, 'POSITIVE'],
    ],
    { rule: 'RN-G14', severity: 'ERROR', code: 'NC-ENG-407' },
  );
  const thresholdIssue = { rule: 'RN-G15', severity: 'ERROR', code: 'NC-ENG-408' } as const;
  const thresholdIssues = outOfRange(
    [
      ['El valor neutral', thresholds.neutralScore, [0, 100]],
      ['La recuperación verde', thresholds.readinessGreenMin, [0, 100]],
      ['La recuperación roja', thresholds.readinessRedBelow, [0, 100]],
      ['El rendimiento mínimo', thresholds.performanceMinPct, [0, PERFORMANCE_CAP_PCT]],
    ],
    thresholdIssue,
  );
  if (thresholdIssues.length === 0 && thresholds.readinessRedBelow > thresholds.readinessGreenMin) {
    thresholdIssues.push({
      ...thresholdIssue,
      message: 'La recuperación roja no puede pasar a la verde.',
    });
  }
  return [...dayIssues, ...baselineIssues, ...thresholdIssues];
}

/**
 * Recuperación e indicación del día de JV Fitness (RN-G14, RN-G15, 07 §9): carga sRPE, rendimiento, las cuatro partes de la
 * recuperación con el neutral de la organización donde falta un dato, su promedio y la indicación con los umbrales vigentes.
 */
export const READINESS_JV = defineMethod<ReadinessInput, Readiness>({
  code: 'READINESS_JV',
  version: '3.0.0',
  kind: 'TRAINING',
  population: 'ALL',
  requiredInputs: ['day', 'baseline', 'thresholds'],
  requiredSites: [],
  citation: 'JV Fitness, plantilla de periodización V3: hojas REGISTRO DIARIO y MI PLAN (2026)',
  validity: [],
  compute: (input) => {
    const issues = inputIssues(input);
    const { day, baseline, thresholds } = input;
    const raw = rawComponents(day, baseline);
    const components = Object.fromEntries(
      READINESS_COMPONENTS.map((name) => [name, raw[name] ?? thresholds.neutralScore]),
    ) as Record<ReadinessComponent, number>;
    const readinessScore = hasRecoveryData(day)
      ? mean(READINESS_COMPONENTS.map((name) => components[name]))
      : null;
    const performance = performancePct(day.performancePlanned, day.performanceActual);
    return {
      outputs: {
        srpeLoad: srpeLoad(day.sessionMinutes, day.sessionRpe),
        performancePct: performance,
        components,
        neutralComponents: READINESS_COMPONENTS.filter((name) => raw[name] === null),
        readinessScore,
        indication: dailyIndication(
          { readinessScore, menstrualSymptoms: day.menstrualSymptoms, performancePct: performance },
          thresholds,
        ),
      },
      issues,
    };
  },
});

import type { ProgramSnapshot } from '../../../training/index.js';
import type { SheetBrand } from '../../domain/sheet.js';
import type { AnthropometrySheet } from './anthropometry-sheet.js';
import type { MenuSheet, SheetTotals } from './menu-sheet.js';
import type { ExchangeDietSheet } from './sheet-content.js';
import { trainingSheet, type TrainingSheet } from './training-sheet.js';

/**
 * Ficha sintética de Luis con G-17 a G-19 (03, casos dorados): 1835 kcal, 2 g/kg de proteína, 25 % de grasa y la lista
 * de demostración. Datos de prueba sintéticos (RN-B08).
 */
export const LUIS_EXCHANGE_SHEET: ExchangeDietSheet = {
  kind: 'EXCHANGE_DIET',
  patient: { code: 'P-000001', fullName: 'Luis Demo', sex: 'M', ageYears: 28 },
  plan: {
    versionNo: 1,
    validFrom: '2026-10-24',
    publishedAt: '2026-10-24T15:00:00.000Z',
    engineVersion: '1.3.0',
  },
  energy: {
    rmr: { methodCode: 'RMR_MIFFLIN1990', kcal: 1758.75 },
    tee: { methodCode: 'TEE_PAL', kcal: 2604.54 },
    strategy: 'ADDITIVE',
    pal: 1.4,
    exerciseKcal: 142.29,
    goal: 'LOSE_FAT',
    adjustmentKcal: -770,
    targetKcal: 1834.54,
    macros: { methodCode: 'MACROS_PROTEIN_FIRST', proteinGPerKg: 2, fatPctKcal: 25 },
    weightKg: 80,
  },
  targets: { kcal: 1834.54, choG: 183.6, proteinG: 160, fatG: 50.96 },
  totals: { kcal: 1889, choG: 191, proteinG: 162, fatG: 53 },
  adequacy: {
    rangePct: [90, 110],
    kcal: { pct: 102.97, inRange: true },
    cho: { pct: 104.03, inRange: true },
    protein: { pct: 101.25, inRange: true },
    fat: { pct: 104.0, inRange: true },
  },
  list: { name: 'Lista de demostración', version: '1.0', provisional: true },
  groups: [
    { code: 'VEG', name: 'Verduras', servings: 4, choG: 5, proteinG: 2, fatG: 0, kcal: 28 },
    { code: 'FRU', name: 'Frutas', servings: 3, choG: 15, proteinG: 0, fatG: 0, kcal: 60 },
    { code: 'MILK', name: 'Lácteos', servings: 3, choG: 12, proteinG: 8, fatG: 1, kcal: 89 },
    { code: 'STA', name: 'Almidones', servings: 6, choG: 15, proteinG: 3, fatG: 0, kcal: 72 },
    { code: 'MEAT', name: 'Carnes', servings: 16, choG: 0, proteinG: 7, fatG: 1.5, kcal: 41.5 },
    { code: 'FAT', name: 'Grasas', servings: 3, choG: 0, proteinG: 0, fatG: 5, kcal: 45 },
  ],
  meals: [
    {
      name: 'Desayuno',
      timeOfDay: '07:00',
      sharePct: 25,
      exchanges: [
        {
          groupName: 'Almidones',
          servings: 1,
          foods: [
            { name: 'Pan francés', grams: 30, householdText: '1 unidad' },
            { name: 'Avena cocida', grams: 120, householdText: null },
          ],
        },
        {
          groupName: 'Carnes',
          servings: 4,
          foods: [
            { name: 'Huevo de gallina entero', grams: 50, householdText: '1 unidad mediana' },
          ],
        },
      ],
    },
    {
      name: 'Almuerzo',
      timeOfDay: '13:00',
      sharePct: 35,
      exchanges: [
        {
          groupName: 'Almidones',
          servings: 2,
          foods: [{ name: 'Arroz pilado o pulido cocido', grams: 90, householdText: '½ taza' }],
        },
        { groupName: 'Carnes', servings: 5, foods: [] },
      ],
    },
  ],
  hydrationMl: 2500,
  instructions: 'Toma agua durante el día y evita las bebidas azucaradas.',
  methods: [
    { methodCode: 'EXCHANGES_CLASSIC', methodVersion: '1.0.0' },
    { methodCode: 'MEAL_SPLIT_LARGEST_REMAINDER', methodVersion: '1.0.0' },
    { methodCode: 'ADEQUACY', methodVersion: '1.0.0' },
  ],
};

export const DEMO_BRAND: SheetBrand = {
  displayName: 'Consultorio Demo',
  logoFileId: null,
  primaryColor: null,
  secondaryColor: null,
  contact: { phone: '999 000 111', email: 'hola@consultorio.example', website: null },
  footer: 'Atención con cita previa',
};

const known = (value: number) => ({ value, known: value, missing: 0 });

/** Una porción de la receta de P10 (arroz con pollo, 2 porciones): la fibra del pollo no está en la TPCA (RN-I03). */
const RECIPE_SERVING: SheetTotals = {
  kcal: known(204.25),
  cho: known(23),
  protein: known(17.6),
  fat: known(2.4),
  fiber: { value: null, known: 0.6, missing: 1 },
  of: 2,
};

const PLAN = {
  versionNo: 1,
  validFrom: '2026-10-24',
  publishedAt: '2026-10-24T15:00:00.000Z',
  engineVersion: '1.3.0',
};

const ADEQUACY = (days: number) => ({
  rangePct: [90, 110] as const,
  kcal: { pct: 11.13, daysInRange: 0, days, missing: 0, of: days },
  cho: { pct: 12.53, daysInRange: 0, days, missing: 0, of: days },
  protein: { pct: 11, daysInRange: 0, days, missing: 0, of: days },
  fat: { pct: 4.71, daysInRange: 0, days, missing: 0, of: days },
});

const PATIENT = { code: 'P-000001', fullName: 'Luis Demo', sex: 'M', ageYears: 28 } as const;

/** El menú de la E2E de P10: la receta en la opción A del almuerzo toda la semana y pollo en la B del lunes. */
export const LUIS_MENU_SHEET: MenuSheet = {
  kind: 'WEEKLY_MENU',
  modality: 'WEEKLY_MENU',
  patient: PATIENT,
  plan: PLAN,
  energy: LUIS_EXCHANGE_SHEET.energy,
  targets: LUIS_EXCHANGE_SHEET.targets,
  meals: [{ name: 'Almuerzo', timeOfDay: '13:00', sharePct: 100 }],
  days: Array.from({ length: 7 }, (_, d) => ({
    dayOfWeek: d + 1,
    cells: [
      {
        optionA: [{ kind: 'RECIPE' as const, name: 'Arroz con pollo', servings: 1 }],
        optionB:
          d === 0
            ? [
                {
                  kind: 'FOOD' as const,
                  name: 'Pollo, carne pulpa',
                  grams: 120,
                  householdText: null,
                },
              ]
            : [],
      },
    ],
    totals: RECIPE_SERVING,
  })),
  average: { ...RECIPE_SERVING, fiber: { value: null, known: 0.6, missing: 7 }, of: 7 },
  adequacy: ADEQUACY(7),
  recipes: [
    {
      name: 'Arroz con pollo',
      servings: 2,
      ingredients: [
        { name: 'Arroz pilado o pulido cocido', grams: 200 },
        { name: 'Pollo, carne pulpa', grams: 150 },
      ],
      perServing: RECIPE_SERVING,
    },
  ],
  hydrationMl: 2500,
  instructions: null,
  methods: [
    { methodCode: 'RECIPE_NUTRIENTS', methodVersion: '1.1.0' },
    { methodCode: 'ADEQUACY', methodVersion: '1.0.0' },
  ],
};

/** La composición de la E2E de P10: arroz y pollo en el almuerzo. */
export const LUIS_COMPOSITION_SHEET: MenuSheet = {
  ...LUIS_MENU_SHEET,
  modality: 'COMPOSITION',
  days: [
    {
      dayOfWeek: null,
      cells: [
        {
          optionA: [
            {
              kind: 'FOOD',
              name: 'Arroz pilado o pulido cocido',
              grams: 200,
              householdText: '1 taza',
            },
            { kind: 'FOOD', name: 'Pollo, carne pulpa', grams: 150, householdText: null },
          ],
          optionB: [],
        },
      ],
      totals: {
        ...RECIPE_SERVING,
        kcal: known(408.5),
        cho: known(46),
        protein: known(35.2),
        fat: known(4.8),
      },
    },
  ],
  average: null,
  adequacy: ADEQUACY(1),
  recipes: [],
};

/** Resultados sintéticos de Luis (G-05, G-06, G-08): IMC, Durnin & Womersley + Siri y cuatro componentes. */
export const LUIS_RESULTS_SHEET: AnthropometrySheet = {
  kind: 'ANTHROPOMETRY',
  patient: PATIENT,
  evaluation: {
    kind: 'MIXED',
    level: 'ISAK2',
    measuredOn: '2026-10-13',
    revision: 1,
    amended: false,
    fasting: true,
    intenseActivityLast24h: false,
    hydration: null,
  },
  sites: [
    { family: 'BASIC', name: 'Peso', unit: 'kg', value: 80 },
    { family: 'BASIC', name: 'Talla', unit: 'cm', value: 175 },
    { family: 'SKINFOLD', name: 'Tríceps', unit: 'mm', value: 12 },
    { family: 'SKINFOLD', name: 'Subescapular', unit: 'mm', value: 16 },
    { family: 'GIRTH', name: 'Cintura (mínima)', unit: 'cm', value: 86 },
  ],
  results: [
    {
      methodCode: 'BMI',
      methodVersion: '1.0.0',
      engineVersion: '1.3.0',
      principalFor: [],
      metrics: [
        {
          metricCode: 'BMI',
          methodCode: 'BMI',
          value: 26.122,
          unit: 'kg/m2',
          interpretation: { label: 'Sobrepeso', tone: 'CAUTION', source: 'OMS 2008' },
          note: null,
        },
      ],
      warnings: [],
    },
    {
      methodCode: 'FAT_DW1974_SIRI1961',
      methodVersion: '1.1.0',
      engineVersion: '1.3.0',
      principalFor: ['FAT_PCT'],
      metrics: [
        {
          metricCode: 'FAT_PCT',
          methodCode: 'FAT_DW1974_SIRI1961',
          value: 20.2563,
          unit: '%',
          interpretation: { label: 'Promedio', tone: 'NEUTRAL', source: 'ACE' },
          note: null,
        },
        {
          metricCode: 'FAT_MASS_KG',
          methodCode: 'FAT_DW1974_SIRI1961',
          value: 16.205,
          unit: 'kg',
          interpretation: null,
          note: null,
        },
      ],
      warnings: [],
    },
    {
      methodCode: 'COMP4_DEROSE_GUIMARAES',
      methodVersion: '1.0.0',
      engineVersion: '1.3.0',
      principalFor: [],
      metrics: [
        {
          metricCode: 'BONE_MASS_KG',
          methodCode: 'BONE_ROCHA1975',
          value: 12.02,
          unit: 'kg',
          interpretation: null,
          note: null,
        },
      ],
      warnings: [
        {
          severity: 'INFO',
          message: 'Rocha modifica la fórmula de Von Döbeln en población brasileña.',
        },
      ],
    },
  ],
  siteInterpretations: [
    {
      name: 'Cintura (mínima)',
      value: 86,
      unit: 'cm',
      interpretation: { label: 'Sin riesgo aumentado', tone: 'NEUTRAL', source: 'OMS 2008' },
      note: null,
    },
  ],
  bia: [
    {
      deviceBrand: 'Marca sintética',
      deviceModel: 'BIA-1',
      readings: [
        { metric: 'FAT_PCT', value: 21.4, unit: '%', deviceLabel: 'Body Fat' },
        { metric: 'PHASE_ANGLE', value: 6.8, unit: 'deg', deviceLabel: 'Phase angle' },
      ],
    },
  ],
  populationNote: null,
};

type ProgramWeek = ProgramSnapshot['mesocycles'][number]['weeks'][number];
type ProgramExercise = ProgramWeek['sessions'][number]['exercises'][number];
type ProgramSet = ProgramExercise['sets'][number];

/** Ids fijos: los de la biblioteca y los de cada fila de la semana. */
const LIBRARY = (n: number) => `019a2000-0000-7000-8000-1000000000${String(n).padStart(2, '0')}`;
const ROW = (week: number, n: number) =>
  `019a2000-0000-7000-8000-2000000${String(week).padStart(2, '0')}${String(n).padStart(3, '0')}`;

const muscle = (code: string, name: string) => ({ code, name });
const ref = (n: number, name: string) => ({ id: LIBRARY(n), name });

/** Las semanas 1 a 8 de hipertrofia de la V3 (07 §7): fase, objetivo, factor de volumen, intensidad, RIR y revisión. */
const HYPERTROPHY = [
  ['Adaptación', 'Técnica y base', 0.75, 'MODERATE', 3, 'DAILY'],
  ['Acumulación', 'Volumen tolerable', 0.9, 'MODERATE', 3, 'DAILY'],
  ['Hipertrofia', 'Progresar volumen', 1, 'MODERATE', 2, 'DAILY'],
  ['Hipertrofia', 'Sobrecarga', 1.1, 'MODERATE_HIGH', 1, 'CONTROL'],
  ['Descarga', 'Disipar fatiga', 0.65, 'LOW_MODERATE', 4, 'DAILY'],
  ['Hipertrofia II', 'Retomar volumen', 0.95, 'MODERATE', 3, 'DAILY'],
  ['Hipertrofia II', 'Progresar', 1.05, 'MODERATE_HIGH', 2, 'DAILY'],
  ['Intensificación', 'Más carga', 1, 'HIGH', 1, 'CONTROL'],
] as const;

/** Las series de un bloque en su semana: las de la plantilla por el factor, con el RIR de la semana (07 §6, ADR-070). */
const working = (count: number, rir: number, from = 1): ProgramSet[] =>
  Array.from({ length: count }, (_, index) => ({
    setNo: from + index,
    setType: 'WORKING',
    repsMin: 8,
    repsMax: 12,
    loadKind: 'RIR',
    loadValue: rir,
    restSeconds: 90,
    tempo: '2-1-2',
    durationSeconds: null,
    distanceM: null,
    met: null,
  }));

function exercise(
  fields: Pick<ProgramExercise, 'id' | 'exerciseId' | 'name' | 'pattern' | 'position' | 'sets'> &
    Partial<ProgramExercise>,
): ProgramExercise {
  return {
    supersetGroup: null,
    notes: null,
    movementPattern: fields.pattern,
    suggestedExerciseId: fields.exerciseId,
    substitutionNote: null,
    approvedBy: LIBRARY(90),
    approvedAt: '2026-10-31T14:00:00.000Z',
    primaryMuscles: [],
    secondaryMuscles: [],
    caution: null,
    alternative: null,
    easierVariant: null,
    harderVariant: null,
    mediaUrl: null,
    instructions: null,
    ...fields,
  };
}

/** Una semana de la propuesta de 2 días, con lo que el coach cambió: la sustitución del empuje y el cardio en minutos. */
function trainingWeek(weekNo: number): ProgramWeek {
  const phase = HYPERTROPHY[weekNo - 1];
  if (!phase) throw new Error(`La semana ${String(weekNo)} no está en la tabla.`);
  const [phaseEs, phaseGoalEs, volumeFactor, intensity, targetRir, reviewKind] = phase;
  const sets = Math.max(1, Math.round(3 * volumeFactor));
  return {
    id: ROW(weekNo, 0),
    weekNo,
    isDeload: phaseEs === 'Descarga',
    phaseEs,
    phaseGoalEs,
    volumeFactor,
    intensity,
    targetRir,
    reviewKind,
    sessions: [
      {
        id: ROW(weekNo, 1),
        position: 1,
        name: 'Cuerpo completo A',
        dayOfWeek: null,
        notes: 'Calienta 10 minutos antes de empezar.',
        setsByMuscle: { QUADRICEPS: sets, GLUTES: sets / 2, CHEST: sets, TRICEPS: sets / 2 },
        exercises: [
          exercise({
            id: ROW(weekNo, 11),
            exerciseId: LIBRARY(1),
            name: 'Sentadilla goblet',
            pattern: 'SQUAT',
            position: 1,
            notes: 'Baja controlado y sin rebotar.',
            primaryMuscles: [muscle('QUADRICEPS', 'Cuádriceps')],
            secondaryMuscles: [muscle('GLUTES', 'Glúteo')],
            caution: 'Dolor de rodilla o lumbar',
            alternative: ref(11, 'Sentarse y levantarse'),
            easierVariant: ref(12, 'Sentadilla a caja'),
            harderVariant: ref(13, 'Prensa de piernas'),
            sets: working(sets, targetRir),
          }),
          exercise({
            id: ROW(weekNo, 12),
            exerciseId: LIBRARY(2),
            name: 'Flexión de brazos inclinada',
            pattern: 'HORIZONTAL_PUSH',
            position: 2,
            suggestedExerciseId: LIBRARY(5),
            substitutionNote: 'Le molesta el hombro en la máquina.',
            primaryMuscles: [muscle('CHEST', 'Pectoral')],
            secondaryMuscles: [muscle('TRICEPS', 'Tríceps')],
            caution: 'Dolor de hombro',
            easierVariant: ref(14, 'Flexión de brazos en pared'),
            harderVariant: ref(15, 'Flexión de brazos'),
            sets: [
              {
                setNo: 1,
                setType: 'WARMUP',
                repsMin: 12,
                repsMax: 12,
                loadKind: 'BODYWEIGHT',
                loadValue: null,
                restSeconds: 60,
                tempo: null,
                durationSeconds: null,
                distanceM: null,
                met: null,
              },
              ...working(sets, targetRir, 2),
            ],
          }),
        ],
      },
      {
        id: ROW(weekNo, 2),
        position: 2,
        name: 'Cuerpo completo B',
        dayOfWeek: null,
        notes: null,
        setsByMuscle: { HAMSTRINGS: sets, GLUTES: sets / 2, CARDIO: 1 },
        exercises: [
          exercise({
            id: ROW(weekNo, 21),
            exerciseId: LIBRARY(3),
            name: 'Peso muerto rumano con mancuernas',
            pattern: 'HINGE',
            position: 1,
            primaryMuscles: [muscle('HAMSTRINGS', 'Isquiosurales')],
            secondaryMuscles: [muscle('GLUTES', 'Glúteo')],
            caution: 'Dolor lumbar',
            sets: working(sets, targetRir),
          }),
          exercise({
            id: ROW(weekNo, 22),
            exerciseId: LIBRARY(4),
            name: 'Caminata inclinada',
            pattern: 'CONDITIONING',
            position: 2,
            primaryMuscles: [muscle('CARDIO', 'Cardiorrespiratorio')],
            caution: 'Síntomas cardiovasculares',
            sets: [
              {
                setNo: 1,
                setType: 'WORKING',
                repsMin: null,
                repsMax: null,
                loadKind: null,
                loadValue: null,
                restSeconds: null,
                tempo: null,
                durationSeconds: 1_200,
                distanceM: null,
                met: 4.3,
              },
            ],
          }),
        ],
      },
    ],
  };
}

const WEEKS = Array.from({ length: 8 }, (_, index) => trainingWeek(index + 1));

/**
 * Snapshot sintético de una propuesta de hipertrofia de 2 días y 8 semanas, publicada y aprobada (RN-F12, RN-F14): las series de
 * cada semana salen del factor de volumen y el RIR, de la semana (07 §6 y §7). Datos de prueba sintéticos (RN-B08).
 */
export const TRAINING_SNAPSHOT: ProgramSnapshot = {
  schemaVersion: 1,
  engineVersion: '1.4.0',
  programId: LIBRARY(80),
  lineageId: LIBRARY(81),
  versionNo: 1,
  patientId: LIBRARY(82),
  name: 'Macrociclo de hipertrofia',
  goal: 'Ganar masa muscular con buena técnica.',
  origin: 'PROPOSAL',
  oneRmFormula: 'ONERM_EPLEY1985',
  objective: 'HYPERTROPHY',
  level: 'BEGINNER',
  daysPerWeek: 2,
  split: 'FULL_BODY',
  macrocycleWeeks: 8,
  periodizationValidFrom: '2026-10-15',
  templateVersion: '1.0.0',
  athleteProfileId: LIBRARY(83),
  startDate: '2026-11-02',
  endDate: '2026-12-27',
  publishedAt: '2026-10-31T15:00:00.000Z',
  publishedBy: LIBRARY(84),
  totalWeeks: 8,
  setsMethod: { code: 'FRACTIONAL_SETS', version: '1.0.0' },
  mesocycles: [
    { id: LIBRARY(85), position: 1, name: 'Mesociclo 1', focus: null, weeks: WEEKS.slice(0, 5) },
    { id: LIBRARY(86), position: 2, name: 'Mesociclo 2', focus: null, weeks: WEEKS.slice(5) },
  ],
  schedule: {
    weeks: WEEKS.map((week) => ({
      weekNo: week.weekNo,
      sessions: week.sessions.map(({ position, dayOfWeek, setsByMuscle }) => ({
        position,
        dayOfWeek,
        setsByMuscle,
      })),
    })),
  },
};

export const TRAINING_PATIENT = {
  code: 'P-000002',
  fullName: 'Ana Sintética',
  sex: 'F',
  ageYears: 31,
} as const;

export const DEMO_TRAINING_SHEET: TrainingSheet = trainingSheet(
  TRAINING_SNAPSHOT,
  TRAINING_PATIENT,
);

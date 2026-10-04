// Motor de cálculo de ejemplo para la guía "Conocimiento de dominio NutriPlace".
// Funciones puras, unidades explícitas en los nombres. No usar en producción sin validar
// cada coeficiente contra la fuente original.

export type Sex = 'M' | 'F';

// ─────────────────────────────────────────────────────────────
// 1. Calidad del dato antropométrico
// ─────────────────────────────────────────────────────────────

/** Protocolo ISAK: 2 tomas; si la 2.ª difiere >5 % (pliegues) o >1 % (resto) de la 1.ª, se toma una 3.ª.
 *  Con 2 tomas válidas → media; con 3 → mediana. */
export function consolidateMeasurement(attempts: number[], kind: 'skinfold' | 'other') {
  const tolerancePct = kind === 'skinfold' ? 5 : 1;
  if (attempts.length < 2) throw new Error('Se requieren al menos 2 tomas');
  const [a, b] = attempts;
  const diffPct = (Math.abs(b - a) / a) * 100;
  if (attempts.length === 2) {
    if (diffPct > tolerancePct) return { value: null, needsThird: true, diffPct };
    return { value: (a + b) / 2, needsThird: false, diffPct };
  }
  const sorted = [...attempts].slice(0, 3).sort((x, y) => x - y);
  return { value: sorted[1], needsThird: false, diffPct };
}

/** Error técnico de medida (ETM) con pares de mediciones repetidas. */
export function technicalErrorOfMeasurement(pairs: Array<[number, number]>) {
  const n = pairs.length;
  const sumD2 = pairs.reduce((s, [a, b]) => s + (a - b) ** 2, 0);
  const tem = Math.sqrt(sumD2 / (2 * n));
  const mean = pairs.reduce((s, [a, b]) => s + a + b, 0) / (2 * n);
  return { tem, temPct: (tem / mean) * 100 };
}

/** Cambio mínimo detectable al 95 % a partir del error de medida. */
export const minimalDetectableChange95 = (measurementError: number) =>
  1.96 * Math.SQRT2 * measurementError;

// ─────────────────────────────────────────────────────────────
// 2. Indicadores simples
// ─────────────────────────────────────────────────────────────

export const bmi = (weightKg: number, heightCm: number) => weightKg / (heightCm / 100) ** 2;
export const waistToHeightRatio = (waistCm: number, heightCm: number) => waistCm / heightCm;

// ─────────────────────────────────────────────────────────────
// 3. Composición corporal: 2 componentes
// ─────────────────────────────────────────────────────────────

type DWRow = { minAge: number; maxAge: number; c: number; m: number };
// Durnin & Womersley (1974), filas adultas según consenso GREC-FEMEDE (2009).
const DURNIN_WOMERSLEY: Record<Sex, DWRow[]> = {
  M: [
    { minAge: 20, maxAge: 29, c: 1.1631, m: 0.0632 },
    { minAge: 30, maxAge: 39, c: 1.1422, m: 0.0544 },
    { minAge: 40, maxAge: 49, c: 1.162, m: 0.07 },
    { minAge: 50, maxAge: 72, c: 1.1715, m: 0.0779 }, // artículo original; GREC 2009 imprime 0.0799 (errata)
  ],
  F: [
    { minAge: 20, maxAge: 29, c: 1.1599, m: 0.0717 },
    { minAge: 30, maxAge: 39, c: 1.1423, m: 0.0632 },
    { minAge: 40, maxAge: 49, c: 1.1333, m: 0.0612 },
    { minAge: 50, maxAge: 68, c: 1.1339, m: 0.0645 },
  ],
};

export interface Skinfolds4DW { tricepsMm: number; bicepsMm: number; subscapularMm: number; iliacCrestMm: number }

export function densityDurninWomersley(sex: Sex, ageYears: number, s: Skinfolds4DW) {
  const row = DURNIN_WOMERSLEY[sex].find(r => ageYears >= r.minAge && ageYears <= r.maxAge);
  if (!row) throw new Error(`Edad ${ageYears} fuera del rango de la ecuación`);
  const sum = s.tricepsMm + s.bicepsMm + s.subscapularMm + s.iliacCrestMm;
  return row.c - row.m * Math.log10(sum);
}

/** Siri (1961): densidad → % de grasa. */
export const fatPercentSiri = (density: number) => 495 / density - 450;

/** Jackson & Pollock 7 pliegues (hombres 1978 / mujeres 1980). */
export function densityJacksonPollock7(sex: Sex, ageYears: number, sum7Mm: number) {
  return sex === 'M'
    ? 1.112 - 0.00043499 * sum7Mm + 0.00000055 * sum7Mm ** 2 - 0.00028826 * ageYears
    : 1.097 - 0.00046971 * sum7Mm + 0.00000056 * sum7Mm ** 2 - 0.00012828 * ageYears;
}

/** Faulkner: tríceps + subescapular + supraespinal + abdominal. */
export const fatPercentFaulkner = (sum4Mm: number) => 0.153 * sum4Mm + 5.783;

/** Yuhasz (1974): tríceps, subescapular, supraespinal, abdominal, muslo anterior, pierna medial. */
export const fatPercentYuhasz = (sex: Sex, sum6Mm: number) =>
  sex === 'M' ? 0.1051 * sum6Mm + 2.585 : 0.1548 * sum6Mm + 3.58;

export function twoComponent(weightKg: number, fatPct: number) {
  const fatMassKg = (weightKg * fatPct) / 100;
  return { fatPct, fatMassKg, fatFreeMassKg: weightKg - fatMassKg };
}

// ─────────────────────────────────────────────────────────────
// 4. Composición corporal: 4 componentes (De Rose & Guimarães)
// ─────────────────────────────────────────────────────────────

/** Rocha (1975): talla, diámetro biestiloideo (muñeca) y bicondíleo de fémur, TODO en metros. */
export const boneMassRocha = (heightM: number, wristBreadthM: number, femurBreadthM: number) =>
  3.02 * (heightM ** 2 * wristBreadthM * femurBreadthM * 400) ** 0.712;

/** Würch (1974): % fijo del peso según sexo. */
export const residualMassWurch = (sex: Sex, weightKg: number) => weightKg * (sex === 'M' ? 0.241 : 0.209);

export function fourComponent(sex: Sex, weightKg: number, fatMassKg: number, heightM: number, wristM: number, femurM: number) {
  const boneKg = boneMassRocha(heightM, wristM, femurM);
  const residualKg = residualMassWurch(sex, weightKg);
  const muscleKg = weightKg - (fatMassKg + boneKg + residualKg); // Matiegka: por diferencia
  return { fatMassKg, boneKg, residualKg, muscleKg };
}

/** Perímetro corregido: perímetro (cm) − π × pliegue (convertido a cm). */
export const correctedGirthCm = (girthCm: number, skinfoldMm: number) => girthCm - Math.PI * (skinfoldMm / 10);

/** Lee et al. (2000): masa muscular esquelética. ethnicity: 0 caucásico/hispano, −2 asiático, 1.1 afroamericano. */
export function skeletalMuscleLee(p: {
  sex: Sex; ageYears: number; heightM: number; ethnicity: number;
  armGirthCm: number; tricepsMm: number; thighGirthCm: number; frontThighMm: number; calfGirthCm: number; medialCalfMm: number;
}) {
  const cag = correctedGirthCm(p.armGirthCm, p.tricepsMm);
  const ctg = correctedGirthCm(p.thighGirthCm, p.frontThighMm);
  const ccg = correctedGirthCm(p.calfGirthCm, p.medialCalfMm);
  return p.heightM * (0.00744 * cag ** 2 + 0.00088 * ctg ** 2 + 0.00441 * ccg ** 2)
    + 2.4 * (p.sex === 'M' ? 1 : 0) - 0.048 * p.ageYears + p.ethnicity + 7.8;
}

// ─────────────────────────────────────────────────────────────
// 5. Composición corporal: 5 componentes (Kerr & Ross, 1988)
// ─────────────────────────────────────────────────────────────

export const PHANTOM_HEIGHT_CM = 170.18;
export const PHANTOM_SITTING_HEIGHT_CM = 89.92;

/** Estrategia Phantom: escala la medida a la talla del Phantom y la convierte en puntuación Z. */
export const phantomZ = (value: number, heightCm: number, p: number, s: number, d = 1, refHeight = PHANTOM_HEIGHT_CM) =>
  (value * (refHeight / heightCm) ** d - p) / s;

/** Convierte la Z de vuelta a una masa real para la talla del sujeto. */
export const massFromZ = (z: number, massP: number, massS: number, heightCm: number, refHeight = PHANTOM_HEIGHT_CM) =>
  (z * massS + massP) / (refHeight / heightCm) ** 3;

export interface KerrInput {
  sex: Sex; weightKg: number; heightCm: number; sittingHeightCm: number; adult: boolean;
  skinfoldsMm: { triceps: number; subscapular: number; supraspinale: number; abdominal: number; frontThigh: number; medialCalf: number };
  girthsCm: { headGirth: number; armRelaxed: number; forearm: number; chest: number; waist: number; thigh: number; calf: number };
  breadthsCm: { biacromial: number; biiliocristal: number; humerus: number; femur: number; transverseChest: number; apChestDepth: number };
}

export function kerrFiveComponent(k: KerrInput) {
  const sf = k.skinfoldsMm, g = k.girthsCm, b = k.breadthsCm;

  // Piel: superficie corporal (m²) × grosor (mm) × densidad 1.05
  const csa = !k.adult ? 70.691 : k.sex === 'M' ? 68.308 : 73.704;
  const bsaM2 = (csa * k.weightKg ** 0.425 * k.heightCm ** 0.725) / 10000;
  const skinKg = bsaM2 * (k.sex === 'M' ? 2.07 : 1.96) * 1.05;

  // Tejido adiposo: suma de 6 pliegues
  const sum6 = sf.triceps + sf.subscapular + sf.supraspinale + sf.abdominal + sf.frontThigh + sf.medialCalf;
  const zAdipose = phantomZ(sum6, k.heightCm, 116.41, 34.79);
  const adiposeKg = massFromZ(zAdipose, 25.6, 5.85, k.heightCm);

  // Músculo: 5 perímetros (4 corregidos por su pliegue)
  const sumMuscle =
    correctedGirthCm(g.armRelaxed, sf.triceps) + g.forearm + correctedGirthCm(g.chest, sf.subscapular)
    + correctedGirthCm(g.thigh, sf.frontThigh) + correctedGirthCm(g.calf, sf.medialCalf);
  const zMuscle = phantomZ(sumMuscle, k.heightCm, 207.21, 13.74);
  const muscleKg = massFromZ(zMuscle, 24.5, 5.4, k.heightCm);

  // Hueso: cabeza (sin escalar por talla) + cuerpo
  const headBoneKg = ((g.headGirth - 56.0) / 1.44) * 0.18 + 1.2;
  const sumBone = b.biacromial + b.biiliocristal + 2 * b.humerus + 2 * b.femur;
  const zBone = phantomZ(sumBone, k.heightCm, 98.88, 5.33);
  const bodyBoneKg = massFromZ(zBone, 6.7, 1.34, k.heightCm);
  const boneKg = headBoneKg + bodyBoneKg;

  // Residual: tórax y cintura corregida, escalado por TALLA SENTADO
  const sumResidual = b.transverseChest + b.apChestDepth + correctedGirthCm(g.waist, sf.abdominal);
  const zResidual = phantomZ(sumResidual, k.sittingHeightCm, 109.35, 7.08, 1, PHANTOM_SITTING_HEIGHT_CM);
  const residualKg = massFromZ(zResidual, 6.1, 1.24, k.sittingHeightCm, PHANTOM_SITTING_HEIGHT_CM);

  const structuredKg = skinKg + adiposeKg + muscleKg + boneKg + residualKg;
  return {
    bsaM2, skinKg, adiposeKg, muscleKg, headBoneKg, bodyBoneKg, boneKg, residualKg,
    zAdipose, zMuscle, zBone, zResidual,
    structuredKg, diffPct: ((structuredKg - k.weightKg) / k.weightKg) * 100,
  };
}

// ─────────────────────────────────────────────────────────────
// 6. Proporcionalidad e interpretación
// ─────────────────────────────────────────────────────────────

export const cormicIndex = (sittingHeightCm: number, heightCm: number) => (sittingHeightCm / heightCm) * 100;
export const manouvrierIndex = (heightCm: number, sittingHeightCm: number) => ((heightCm - sittingHeightCm) / sittingHeightCm) * 100;
export const acromioIliacIndex = (biiliocristalCm: number, biacromialCm: number) => (biiliocristalCm / biacromialCm) * 100;

export interface ReferenceRange { indicator: string; sex?: Sex; min?: number; max?: number; label: string; source: string }

export function classify(value: number, ranges: ReferenceRange[], indicator: string, sex?: Sex) {
  const r = ranges.find(x => x.indicator === indicator && (!x.sex || x.sex === sex)
    && (x.min === undefined || value >= x.min) && (x.max === undefined || value < x.max));
  return r?.label ?? 'sin clasificar';
}

/** Peso ideal manteniendo la masa libre de grasa y cambiando solo el % de grasa. */
export const idealWeightForFatPct = (fatFreeMassKg: number, targetFatPct: number) => fatFreeMassKg / (1 - targetFatPct / 100);

// ─────────────────────────────────────────────────────────────
// 7. Energía
// ─────────────────────────────────────────────────────────────

export const rmrMifflin = (sex: Sex, kg: number, cm: number, age: number) => 10 * kg + 6.25 * cm - 5 * age + (sex === 'M' ? 5 : -161);

export const rmrHarrisBenedict1919 = (sex: Sex, kg: number, cm: number, age: number) =>
  sex === 'M' ? 66.473 + 13.7516 * kg + 5.0033 * cm - 6.755 * age : 655.0955 + 9.5634 * kg + 1.8496 * cm - 4.6756 * age;

/** FAO/OMS/UNU (2004, ecuaciones de Schofield) — solo adultos. */
export function bmrFaoWho(sex: Sex, kg: number, age: number) {
  if (age < 18) throw new Error('Usar tabla pediátrica');
  const t = sex === 'M'
    ? age < 30 ? [15.057, 692.2] : age < 60 ? [11.472, 873.1] : [11.711, 587.7]
    : age < 30 ? [14.818, 486.6] : age < 60 ? [8.126, 845.6] : [9.082, 658.5];
  return t[0] * kg + t[1];
}

export const rmrCunningham = (fatFreeMassKg: number) => 500 + 22 * fatFreeMassKg;
export const rmrKatchMcArdle = (fatFreeMassKg: number) => 370 + 21.6 * fatFreeMassKg;

/** Gasto de una actividad por METs. net=true descuenta el reposo (1 MET) para no contarlo dos veces. */
export const activityKcal = (met: number, kg: number, minutes: number, net = false) => (net ? met - 1 : met) * kg * (minutes / 60);

export const KCAL_PER_KG_FAT = 7700; // regla estática: útil para planificar, sobreestima a largo plazo (Hall 2011)

export function dailyTargetForFatLoss(tdeeKcal: number, kgFatPerMonth: number, daysPerMonth = 30) {
  const deficit = (kgFatPerMonth * KCAL_PER_KG_FAT) / daysPerMonth;
  return { deficitKcal: deficit, targetKcal: tdeeKcal - deficit };
}

// ─────────────────────────────────────────────────────────────
// 8. Macronutrientes e intercambios
// ─────────────────────────────────────────────────────────────

export const ATWATER = { cho: 4, protein: 4, fat: 9 } as const;
export interface Macros { cho: number; protein: number; fat: number }
export const kcalOf = (m: Macros) => m.cho * ATWATER.cho + m.protein * ATWATER.protein + m.fat * ATWATER.fat;

export function macroTargets(kcal: number, kg: number, proteinGPerKg: number, fatPctKcal: number): Macros {
  const protein = proteinGPerKg * kg;
  const fat = (kcal * fatPctKcal) / 100 / ATWATER.fat;
  const cho = (kcal - protein * ATWATER.protein - fat * ATWATER.fat) / ATWATER.cho;
  return { cho, protein, fat };
}

export interface ExchangeGroup { code: string; name: string; cho: number; protein: number; fat: number }

/** Lista de EJEMPLO con valores tipo ADA; en producción se carga la lista oficial (ADA o Dextre) como datos. */
export const DEMO_EXCHANGE_LIST: ExchangeGroup[] = [
  { code: 'VEG', name: 'Verduras', cho: 5, protein: 2, fat: 0 },
  { code: 'FRU', name: 'Frutas', cho: 15, protein: 0, fat: 0 },
  { code: 'MILK', name: 'Lácteos descremados', cho: 12, protein: 8, fat: 0 },
  { code: 'STA', name: 'Cereales/almidones', cho: 15, protein: 3, fat: 1 },
  { code: 'MEAT', name: 'Carnes magras', cho: 0, protein: 7, fat: 2 },
  { code: 'FAT', name: 'Grasas', cho: 0, protein: 0, fat: 5 },
];

/** Cálculo clásico: se fijan verduras/frutas/lácteos y se despejan almidones (CHO), carnes (proteína) y grasas (lípidos). */
export function computeExchanges(target: Macros, fixed: { VEG: number; FRU: number; MILK: number }, list = DEMO_EXCHANGE_LIST) {
  const g = Object.fromEntries(list.map(x => [x.code, x])) as Record<string, ExchangeGroup>;
  const plan: Record<string, number> = { VEG: fixed.VEG, FRU: fixed.FRU, MILK: fixed.MILK, STA: 0, MEAT: 0, FAT: 0 };
  const total = () => Object.entries(plan).reduce<Macros>((acc, [code, n]) => ({
    cho: acc.cho + n * g[code].cho, protein: acc.protein + n * g[code].protein, fat: acc.fat + n * g[code].fat,
  }), { cho: 0, protein: 0, fat: 0 });

  plan.STA = Math.round((target.cho - total().cho) / g.STA.cho);
  plan.MEAT = Math.round((target.protein - total().protein) / g.MEAT.protein);
  plan.FAT = Math.round((target.fat - total().fat) / g.FAT.fat);

  const t = total();
  const adequacy = {
    kcal: (kcalOf(t) / kcalOf(target)) * 100,
    cho: (t.cho / target.cho) * 100,
    protein: (t.protein / target.protein) * 100,
    fat: (t.fat / target.fat) * 100,
  };
  return { plan, totals: t, kcal: kcalOf(t), adequacy };
}

/** Reparte N intercambios entre tiempos de comida según % y redondea por "mayor residuo" para que la suma no cambie. */
export function distributeByMeals(total: number, sharesPct: Record<string, number>) {
  const raw = Object.entries(sharesPct).map(([meal, pct]) => ({ meal, exact: (total * pct) / 100 }));
  const base = raw.map(r => ({ ...r, n: Math.floor(r.exact), rest: r.exact - Math.floor(r.exact) }));
  let missing = total - base.reduce((s, r) => s + r.n, 0);
  [...base].sort((a, b) => b.rest - a.rest).forEach(r => { if (missing > 0) { r.n += 1; missing -= 1; } });
  return Object.fromEntries(base.map(r => [r.meal, r.n]));
}

export const adequacyPct = (consumed: number, target: number) => (consumed / target) * 100;

// ─────────────────────────────────────────────────────────────
// 9. Entrenamiento
// ─────────────────────────────────────────────────────────────

export interface SetLog { exercise: string; loadKg: number; reps: number; rir?: number }

export const tonnageKg = (sets: SetLog[]) => sets.reduce((s, x) => s + x.loadKg * x.reps, 0);
export const oneRmEpley = (loadKg: number, reps: number) => (reps <= 1 ? loadKg : loadKg * (1 + reps / 30));
export const oneRmBrzycki = (loadKg: number, reps: number) => loadKg * (36 / (37 - reps));
export const rpeFromRir = (rir: number) => 10 - rir;

export type MuscleMap = Record<string, Array<{ muscle: string; role: 'primary' | 'secondary' }>>;

/** Series semanales por grupo muscular con conteo fraccional (directa = 1, indirecta = 0,5). */
export function weeklySetsByMuscle(sets: SetLog[], map: MuscleMap) {
  const out: Record<string, number> = {};
  for (const s of sets) for (const m of map[s.exercise] ?? []) out[m.muscle] = (out[m.muscle] ?? 0) + (m.role === 'primary' ? 1 : 0.5);
  return out;
}

export const compliancePct = (done: number, planned: number) => (planned === 0 ? 0 : (done / planned) * 100);

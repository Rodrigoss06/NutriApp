import * as E from './engine';

const r = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
const line = (t: string) => console.log('\n=== ' + t + ' ===');

// Paciente de ejemplo
const P = {
  sex: 'M' as E.Sex, age: 28, weightKg: 80, heightCm: 175, sittingHeightCm: 91,
  sf: { triceps: 12, subscapular: 16, biceps: 6, iliacCrest: 22, supraspinale: 14, abdominal: 25, frontThigh: 18, medialCalf: 10 },
  girths: { headGirth: 57, armRelaxed: 33, forearm: 28, chest: 100, waist: 86, hip: 98, thigh: 55, calf: 37 },
  breadths: { humerus: 7.0, wrist: 5.8, femur: 9.8, biacromial: 40, biiliocristal: 28.5, transverseChest: 30, apChestDepth: 20 },
};

line('1. Calidad del dato');
console.log('2 tomas pliegue 12.0 y 12.4:', E.consolidateMeasurement([12.0, 12.4], 'skinfold'));
console.log('2 tomas pliegue 12.0 y 13.0:', E.consolidateMeasurement([12.0, 13.0], 'skinfold'));
console.log('3 tomas 12.0, 13.0, 12.6 →', E.consolidateMeasurement([12.0, 13.0, 12.6], 'skinfold'));
const tem = E.technicalErrorOfMeasurement([[12.0, 12.4], [16.0, 15.6], [25.0, 26.0], [18.0, 17.6], [10.0, 10.2], [14.0, 14.4]]);
console.log('ETM pliegues:', r(tem.tem, 3), 'mm;', r(tem.temPct, 2), '%');
console.log('Cambio mínimo detectable 95 %:', r(E.minimalDetectableChange95(tem.tem), 2), 'mm');

line('2. Indicadores simples');
console.log('IMC:', r(E.bmi(P.weightKg, P.heightCm)));
console.log('Cintura/talla:', r(E.waistToHeightRatio(P.girths.waist, P.heightCm), 3));

line('3. Dos componentes');
const dens = E.densityDurninWomersley(P.sex, P.age, { tricepsMm: P.sf.triceps, bicepsMm: P.sf.biceps, subscapularMm: P.sf.subscapular, iliacCrestMm: P.sf.iliacCrest });
const sum4DW = P.sf.triceps + P.sf.biceps + P.sf.subscapular + P.sf.iliacCrest;
console.log('Suma 4 pliegues D&W:', sum4DW, 'mm');
console.log('Densidad D&W:', r(dens, 5), 'g/ml');
const fatDW = E.fatPercentSiri(dens);
console.log('% grasa (Siri):', r(fatDW));
const twoC = E.twoComponent(P.weightKg, fatDW);
console.log('Masa grasa:', r(twoC.fatMassKg), 'kg | Masa libre de grasa:', r(twoC.fatFreeMassKg), 'kg');
const sum4F = P.sf.triceps + P.sf.subscapular + P.sf.supraspinale + P.sf.abdominal;
console.log('Faulkner (suma', sum4F, 'mm):', r(E.fatPercentFaulkner(sum4F)), '%');
const sum6 = P.sf.triceps + P.sf.subscapular + P.sf.supraspinale + P.sf.abdominal + P.sf.frontThigh + P.sf.medialCalf;
console.log('Yuhasz (suma', sum6, 'mm):', r(E.fatPercentYuhasz(P.sex, sum6)), '%');

line('4. Cuatro componentes');
const four = E.fourComponent(P.sex, P.weightKg, twoC.fatMassKg, P.heightCm / 100, P.breadths.wrist / 100, P.breadths.femur / 100);
console.log('Ósea (Rocha):', r(four.boneKg), 'kg |', r((four.boneKg / P.weightKg) * 100, 1), '%');
console.log('Residual (Würch):', r(four.residualKg), 'kg');
console.log('Muscular (por diferencia):', r(four.muscleKg), 'kg |', r((four.muscleKg / P.weightKg) * 100, 1), '%');
const lee = E.skeletalMuscleLee({ sex: P.sex, ageYears: P.age, heightM: P.heightCm / 100, ethnicity: 0, armGirthCm: P.girths.armRelaxed, tricepsMm: P.sf.triceps, thighGirthCm: P.girths.thigh, frontThighMm: P.sf.frontThigh, calfGirthCm: P.girths.calf, medialCalfMm: P.sf.medialCalf });
console.log('Muscular (Lee 2000):', r(lee), 'kg');
console.log('Perímetro brazo corregido:', r(E.correctedGirthCm(P.girths.armRelaxed, P.sf.triceps)), 'cm');

line('5. Cinco componentes (Kerr)');
const k = E.kerrFiveComponent({
  sex: P.sex, weightKg: P.weightKg, heightCm: P.heightCm, sittingHeightCm: P.sittingHeightCm, adult: true,
  skinfoldsMm: { triceps: P.sf.triceps, subscapular: P.sf.subscapular, supraspinale: P.sf.supraspinale, abdominal: P.sf.abdominal, frontThigh: P.sf.frontThigh, medialCalf: P.sf.medialCalf },
  girthsCm: { headGirth: P.girths.headGirth, armRelaxed: P.girths.armRelaxed, forearm: P.girths.forearm, chest: P.girths.chest, waist: P.girths.waist, thigh: P.girths.thigh, calf: P.girths.calf },
  breadthsCm: { biacromial: P.breadths.biacromial, biiliocristal: P.breadths.biiliocristal, humerus: P.breadths.humerus, femur: P.breadths.femur, transverseChest: P.breadths.transverseChest, apChestDepth: P.breadths.apChestDepth },
});
console.log('Superficie corporal:', r(k.bsaM2, 4), 'm²');
console.log('Piel:', r(k.skinKg), 'kg');
console.log('Adiposa:', r(k.adiposeKg), 'kg (Z =', r(k.zAdipose, 3), ')');
console.log('Muscular:', r(k.muscleKg), 'kg (Z =', r(k.zMuscle, 3), ')');
console.log('Ósea:', r(k.boneKg), 'kg (cabeza', r(k.headBoneKg), '+ cuerpo', r(k.bodyBoneKg), ')');
console.log('Residual:', r(k.residualKg), 'kg (Z =', r(k.zResidual, 3), ')');
console.log('Masa estructurada:', r(k.structuredKg), 'kg | diferencia vs peso real:', r(k.diffPct, 2), '%');

line('6. Proporcionalidad y peso ideal');
console.log('Índice córmico:', r(E.cormicIndex(P.sittingHeightCm, P.heightCm)));
console.log('Índice de Manouvrier:', r(E.manouvrierIndex(P.heightCm, P.sittingHeightCm)));
console.log('Índice acromio-ilíaco:', r(E.acromioIliacIndex(P.breadths.biiliocristal, P.breadths.biacromial)));
const ideal = E.idealWeightForFatPct(twoC.fatFreeMassKg, 15);
console.log('Peso para 15 % de grasa:', r(ideal), 'kg | debe perder', r(P.weightKg - ideal), 'kg');

line('7. Energía');
const mifflin = E.rmrMifflin(P.sex, P.weightKg, P.heightCm, P.age);
console.log('Mifflin-St Jeor:', r(mifflin, 0), 'kcal');
console.log('Harris-Benedict:', r(E.rmrHarrisBenedict1919(P.sex, P.weightKg, P.heightCm, P.age), 0), 'kcal');
console.log('FAO/OMS/UNU:', r(E.bmrFaoWho(P.sex, P.weightKg, P.age), 0), 'kcal');
console.log('Cunningham (MLG):', r(E.rmrCunningham(twoC.fatFreeMassKg), 0), 'kcal');
console.log('Katch-McArdle (MLG):', r(E.rmrKatchMcArdle(twoC.fatFreeMassKg), 0), 'kcal');
const pal = 1.4;
const baseTdee = mifflin * pal;
console.log('Gasto sin ejercicio (PAL', pal, '):', r(baseTdee, 0), 'kcal');
const perSessionGross = E.activityKcal(9.3, P.weightKg, 30);
const perSessionNet = E.activityKcal(9.3, P.weightKg, 30, true);
console.log('Correr 30 min a 10 km/h (9,3 MET): bruto', r(perSessionGross, 0), 'kcal | neto', r(perSessionNet, 0), 'kcal');
const exerciseDaily = (perSessionNet * 3) / 7;
console.log('Promedio diario de ejercicio (3 sesiones/sem):', r(exerciseDaily, 0), 'kcal');
const tdee = baseTdee + exerciseDaily;
console.log('GET:', r(tdee, 0), 'kcal');
const goal = E.dailyTargetForFatLoss(tdee, 3);
console.log('Déficit para −3 kg grasa/mes:', r(goal.deficitKcal, 0), 'kcal/día → objetivo', r(goal.targetKcal, 0), 'kcal');
console.log('Ritmo semanal:', r((3 / 4.345 / P.weightKg) * 100, 2), '% del peso por semana');
console.log('Tiempo estimado para llegar a 15 % de grasa:', r((P.weightKg - ideal) / 3, 2), 'meses');

line('8. Macros e intercambios');
const target = E.macroTargets(goal.targetKcal, P.weightKg, 2.0, 25);
console.log('Objetivo:', r(goal.targetKcal, 0), 'kcal | CHO', r(target.cho, 0), 'g | PROT', r(target.protein, 0), 'g | GRASA', r(target.fat, 0), 'g');
const ex = E.computeExchanges(target, { VEG: 4, FRU: 3, MILK: 3 });
console.log('Intercambios:', ex.plan);
console.log('Totales: CHO', r(ex.totals.cho, 0), 'g | PROT', r(ex.totals.protein, 0), 'g | GRASA', r(ex.totals.fat, 0), 'g |', r(ex.kcal, 0), 'kcal');
console.log('Adecuación: kcal', r(ex.adequacy.kcal, 1), '% | CHO', r(ex.adequacy.cho, 1), '% | PROT', r(ex.adequacy.protein, 1), '% | GRASA', r(ex.adequacy.fat, 1), '%');
const shares = { Desayuno: 25, MediaMañana: 10, Almuerzo: 35, MediaTarde: 10, Cena: 20 };
console.log('Reparto de', ex.plan.STA, 'almidones:', E.distributeByMeals(ex.plan.STA, shares));
console.log('Reparto de', ex.plan.MEAT, 'carnes:', E.distributeByMeals(ex.plan.MEAT, shares));

line('9. Adherencia de la semana');
const week = [1790, 1950, 1600, 2100, 1830, 2400, 1700];
const avg = week.reduce((a, b) => a + b, 0) / week.length;
console.log('Consumo diario:', week.join(', '));
console.log('Promedio:', r(avg, 0), 'kcal | objetivo', r(goal.targetKcal, 0), 'kcal | adecuación', r(E.adequacyPct(avg, goal.targetKcal), 1), '%');
console.log('Días dentro de 90-110 %:', week.filter(d => { const a = E.adequacyPct(d, goal.targetKcal); return a >= 90 && a <= 110; }).length, 'de 7');

line('10. Entrenamiento');
const sets: E.SetLog[] = [
  { exercise: 'Sentadilla', loadKg: 100, reps: 8, rir: 2 },
  { exercise: 'Sentadilla', loadKg: 100, reps: 8, rir: 1 },
  { exercise: 'Sentadilla', loadKg: 100, reps: 7, rir: 0 },
  { exercise: 'Press banca', loadKg: 70, reps: 10, rir: 2 },
  { exercise: 'Press banca', loadKg: 70, reps: 9, rir: 1 },
];
console.log('Tonelaje de la sesión:', E.tonnageKg(sets), 'kg');
console.log('1RM sentadilla (Epley, 100x8):', r(E.oneRmEpley(100, 8), 1), 'kg | (Brzycki):', r(E.oneRmBrzycki(100, 8), 1), 'kg');
console.log('RPE con 2 RIR:', E.rpeFromRir(2));
const map: E.MuscleMap = {
  'Sentadilla': [{ muscle: 'Cuádriceps', role: 'primary' }, { muscle: 'Glúteo', role: 'primary' }, { muscle: 'Isquiosurales', role: 'secondary' }],
  'Press banca': [{ muscle: 'Pectoral', role: 'primary' }, { muscle: 'Tríceps', role: 'secondary' }, { muscle: 'Deltoides anterior', role: 'secondary' }],
};
console.log('Series por grupo (fraccionadas):', E.weeklySetsByMuscle(sets, map));
console.log('Cumplimiento 12 de 16 series:', r(E.compliancePct(12, 16), 1), '%');

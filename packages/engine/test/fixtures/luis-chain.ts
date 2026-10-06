import {
  EE_MET_COMPENDIUM2024,
  FAT_LOSS_7700,
  RMR_MIFFLIN1990,
  totalEnergyExpenditure,
} from '../../src/energy/index.js';
import { runMethod } from '../../src/registry/run-method.js';
import { expectOk } from '../support.js';
import { LUIS } from './luis.js';

/**
 * Objetivo diario exacto de Luis, encadenado como en docs/reference/examples.ts: Mifflin × PAL 1.4 +
 * correr 3 veces por semana − déficit de 3 kg de grasa al mes. 03 lo muestra redondeado como 1835 kcal;
 * G-17, G-18 y G-20 parten de este valor sin redondear (RN-D09).
 */
export function luisDailyTargetKcal(): number {
  const rmrKcal = expectOk(
    runMethod(RMR_MIFFLIN1990, {
      sex: LUIS.sex,
      ageYears: LUIS.ageYears,
      weightKg: LUIS.weightKg,
      heightCm: LUIS.heightCm,
    }),
  ).outputs.rmrKcal;
  const exercise = expectOk(
    runMethod(EE_MET_COMPENDIUM2024, {
      weightKg: LUIS.weightKg,
      activities: [{ met: 9.3, minutesPerSession: 30, sessionsPerWeek: 3 }],
    }),
  ).outputs.dailyAverageNetKcal;
  const tee = totalEnergyExpenditure({
    rmrKcal,
    pal: 1.4,
    strategy: 'ADDITIVE',
    exerciseDailyNetKcal: exercise,
    ageYears: LUIS.ageYears,
  });
  if (!tee.ok) throw new Error('El GET de Luis no calculó.');
  return expectOk(
    runMethod(FAT_LOSS_7700, {
      teeKcal: tee.outputs.teeKcal,
      weightKg: LUIS.weightKg,
      fatChangeKgPerMonth: -3,
    }),
  ).outputs.targetKcal;
}

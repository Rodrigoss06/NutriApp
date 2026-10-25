import type { SheetBrand } from '../../domain/sheet.js';
import type { ExchangeDietSheet } from './sheet-content.js';

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

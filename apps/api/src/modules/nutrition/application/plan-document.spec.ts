import { ENGINE_VERSION } from '@nutricoach/engine';
import { describe, expect, it } from 'vitest';
import { DEFAULT_MEALS } from '../domain/nutrition-plan.js';
import { calculateWeeklyMenu } from './food-plan-calculation.js';
import {
  CHICKEN,
  EGG,
  MENU,
  RICE,
  SOURCES,
  STEW,
  TARGETS as MENU_TARGETS,
} from './food-plan.spec-support.js';
import { calculatePlan, type PlanList } from './plan-calculation.js';
import { planDocument, planSnapshot, weeklyMenuDocument } from './plan-document.js';

const LIST: PlanList = {
  id: '01926200-0000-7000-8000-000000000001',
  code: 'DEMO',
  name: 'Lista de demostración',
  version: '1.0.0',
  provisional: true,
  groups: [
    { code: 'VEG', name: 'Verduras', choG: 5, proteinG: 2, fatG: 0, kcal: 28 },
    { code: 'FRU', name: 'Frutas', choG: 15, proteinG: 0, fatG: 0, kcal: 60 },
    { code: 'MILK', name: 'Lácteos', choG: 12, proteinG: 8, fatG: 0, kcal: 80 },
    { code: 'STA', name: 'Almidones', choG: 15, proteinG: 3, fatG: 1, kcal: 81 },
    { code: 'MEAT', name: 'Carnes magras', choG: 0, proteinG: 7, fatG: 2, kcal: 46 },
    { code: 'FAT', name: 'Grasas', choG: 0, proteinG: 0, fatG: 5, kcal: 45 },
  ],
};
const TARGETS = {
  kcal: 1834.5357142857142,
  choG: 183.97544642857142,
  proteinG: 160,
  fatG: 50.95932539682539,
};
const META = {
  planId: '01927100-0000-7000-8000-000000000001',
  lineageId: '01927100-0000-7000-8000-000000000002',
  versionNo: 1,
  patientId: '01927100-0000-7000-8000-000000000003',
  energyPrescriptionId: '01927100-0000-7000-8000-000000000004',
  validFrom: '2026-10-22',
  publishedAt: '2026-10-22T15:00:00.000Z',
  publishedBy: '01927100-0000-7000-8000-000000000005',
};

const document = (hydrationTargetMl: number) => {
  const calculation = calculatePlan(
    {
      fixedServings: { VEG: 4, FRU: 3, MILK: 3 },
      overrides: {},
      meals: DEFAULT_MEALS,
      splitOverrides: {},
      hydrationTargetMl,
      instructions: null,
    },
    TARGETS,
    LIST,
    [90, 110],
  );
  if (!calculation.ok) throw new Error('G-18 debía calcularse.');
  return planDocument(
    { calculation: calculation.value, targets: TARGETS, list: LIST, foods: new Map() },
    DEFAULT_MEALS.map((_, i) => `01927200-0000-7000-8000-00000000000${String(i)}`),
  );
};

describe('RN-E15 · RN-H02 · snapshot del plan publicado', () => {
  it('lleva su versión de esquema, la del motor, las metas exactas y cada método', () => {
    const { snapshot } = planSnapshot(document(2_500), META);

    expect(snapshot).toMatchObject({
      schemaVersion: 1,
      modality: 'EXCHANGES',
      engineVersion: ENGINE_VERSION,
      validFrom: '2026-10-22',
      targets: TARGETS,
      exchangeList: { code: 'DEMO', version: '1.0.0', provisional: true },
      hydrationTargetMl: 2_500,
    });
    if (snapshot.modality !== 'EXCHANGES') throw new Error('Debía ser por intercambios.');
    expect(snapshot.meals.map((m) => m.servings.MEAT)).toEqual([4, 2, 5, 2, 3]);
    expect(snapshot.methods[0]?.methodCode).toBe('EXCHANGES_CLASSIC');
  });

  it('el mismo plan da el mismo hash; cualquier cambio da otro', () => {
    const first = planSnapshot(document(2_500), META);

    expect(planSnapshot(document(2_500), META).hash).toBe(first.hash);
    expect(first.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(planSnapshot(document(2_600), META).hash).not.toBe(first.hash);
    expect(planSnapshot(document(2_500), { ...META, validFrom: '2026-10-23' }).hash).not.toBe(
      first.hash,
    );
  });
});

const menuDocument = () => {
  const calculation = calculateWeeklyMenu(MENU, MENU_TARGETS, SOURCES, [90, 110]);
  if (!calculation.ok) throw new Error('El menú debía calcularse.');
  return weeklyMenuDocument(
    { calculation: calculation.value, targets: MENU_TARGETS, sources: SOURCES },
    Array.from({ length: 14 }, (_, i) => `01927300-0000-7000-8000-${String(i).padStart(12, '0')}`),
  );
};

describe('RN-E15 · RN-E16 · snapshot de un menú semanal', () => {
  it('congela cada alimento con todos sus nutrientes y cada receta con sus ingredientes y lo de una porción', () => {
    const { snapshot } = planSnapshot(menuDocument(), META);
    if (snapshot.modality !== 'WEEKLY_MENU') throw new Error('Debía ser un menú.');

    expect(snapshot.schemaVersion).toBe(1);
    expect(Object.keys(snapshot.foods).sort()).toEqual([RICE, CHICKEN, EGG].sort());
    expect(snapshot.foods[EGG]?.nutrientsPer100g).toMatchObject({ CHOCDF: null, NA: 140 });
    expect(snapshot.recipes[STEW]).toMatchObject({ name: 'Arroz con pollo', servings: 2 });
    expect(snapshot.recipes[STEW]?.perServing.nutrients.ENERC_KCAL?.value).toBeCloseTo(202.5, 10);
  });

  it('de lunes a domingo, con el id de cada celda día por día', () => {
    const document = menuDocument();
    expect(document.days.map((day) => day.dayOfWeek)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(document.days[1]?.meals[0]?.id).toBe('01927300-0000-7000-8000-000000000002');
    expect(document.days[0]?.meals[1]?.optionA[0]).toMatchObject({
      itemType: 'RECIPE',
      recipeName: 'Arroz con pollo',
    });
  });

  it('el mismo menú da el mismo hash', () => {
    expect(planSnapshot(menuDocument(), META).hash).toBe(planSnapshot(menuDocument(), META).hash);
  });
});

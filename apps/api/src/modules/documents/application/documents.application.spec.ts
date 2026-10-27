import { createHash } from 'node:crypto';
import {
  asId,
  isErr,
  type AuditEntry,
  type AuditPort,
  type Clock,
  type DomainEvent,
  type EventMetadata,
  type IdGenerator,
  type OrganizationId,
  type Outbox,
  type SecurityContext,
  type UnitOfWork,
  type UserId,
} from '@nutricoach/shared-kernel';
import { v7 as uuidv7 } from 'uuid';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AssessmentApi, EvaluationSheet } from '../../assessment/index.js';
import type { ClinicalApi, PatientCard } from '../../clinical/index.js';
import type {
  EnergySummary,
  ExchangePlanDocument,
  NutritionApi,
  PlanSnapshot,
  PublishedPlan,
} from '../../nutrition/index.js';
import type { BrandingRecord, SheetBranding, TenancyApi } from '../../tenancy/index.js';
import type { FileRegistry } from '../../../platform/index.js';
import { DocumentGeneration } from './document-generation.js';
import { DocumentRequests } from './document-requests.js';
import type {
  DocumentKey,
  DocumentStore,
  GeneratedDocumentRecord,
  PdfRenderer,
  SheetRender,
} from './ports/documents.ports.js';
import { menuSheet } from './sheets/menu-sheet.js';
import { exchangeDietSheet, uniqueMethods } from './sheets/sheet-content.js';
import { documentKey, SheetSources } from './sheet-sources.js';

/** Datos sintéticos (RN-B08). */
const ORG = asId<'OrganizationId'>(uuidv7()) as OrganizationId;
const PUBLISHER = asId<'UserId'>(uuidv7()) as UserId;
const REQUESTER = asId<'UserId'>(uuidv7()) as UserId;
const PATIENT = uuidv7();
const PLAN = uuidv7();
const PRESCRIPTION = uuidv7();
const EVALUATION = uuidv7();
const EVALUATOR = uuidv7();
const RICE = uuidv7();
const CHICKEN = uuidv7();
const RECIPE = uuidv7();

const context: SecurityContext = {
  organizationId: ORG,
  userId: REQUESTER,
  role: 'PROFESSIONAL',
  patientId: null,
  memberId: null,
};

const SNAPSHOT = {
  schemaVersion: 1,
  planId: PLAN,
  lineageId: uuidv7(),
  versionNo: 2,
  patientId: PATIENT,
  energyPrescriptionId: PRESCRIPTION,
  validFrom: '2026-10-24',
  publishedAt: '2026-10-24T15:00:00.000Z',
  publishedBy: PUBLISHER,
  engineVersion: '1.3.0',
  modality: 'EXCHANGES',
  targets: { kcal: 1834.54, choG: 183.6, proteinG: 160, fatG: 50.96 },
  exchangeList: {
    id: uuidv7(),
    code: 'DEMO',
    name: 'Lista de demostración',
    version: '1.0',
    provisional: true,
    groups: [
      { code: 'VEG', name: 'Verduras', choG: 5, proteinG: 2, fatG: 0, kcal: 28 },
      { code: 'STA', name: 'Almidones', choG: 15, proteinG: 3, fatG: 0, kcal: 72 },
      { code: 'FAT', name: 'Grasas', choG: 0, proteinG: 0, fatG: 5, kcal: 45 },
    ],
  },
  exchanges: [
    { groupCode: 'VEG', servings: 4, automatic: 4, manual: false },
    { groupCode: 'STA', servings: 6, automatic: 6, manual: false },
    { groupCode: 'FAT', servings: 0, automatic: 1, manual: true },
  ],
  manualSplit: [],
  meals: [
    {
      id: uuidv7(),
      slotCode: 'BREAKFAST',
      name: 'Desayuno',
      timeOfDay: '07:00',
      sharePct: 40,
      servings: { VEG: 0, STA: 2, FAT: 0 },
      allowedFoods: [
        {
          groupCode: 'STA',
          foodId: uuidv7(),
          foodName: 'Pan francés',
          grams: 30,
          householdText: '1 unidad',
          nutrientsPer100g: {},
        },
        {
          groupCode: 'VEG',
          foodId: uuidv7(),
          foodName: 'Tomate',
          grams: 100,
          householdText: null,
          nutrientsPer100g: {},
        },
      ],
    },
    {
      id: uuidv7(),
      slotCode: 'LUNCH',
      name: 'Almuerzo',
      timeOfDay: null,
      sharePct: 60,
      servings: { VEG: 4, STA: 4, FAT: 0 },
      allowedFoods: [],
    },
  ],
  totals: { kcal: 1889, choG: 191, proteinG: 162, fatG: 53 },
  adequacy: {
    rangePct: [90, 110],
    kcal: { pct: 102.97, inRange: true },
    cho: { pct: 104.03, inRange: true },
    protein: { pct: 101.25, inRange: true },
    fat: { pct: 104, inRange: true },
  },
  methods: [
    { methodCode: 'EXCHANGES_CLASSIC', methodVersion: '1.0.0', inputsHash: 'a', warnings: [] },
    { methodCode: 'ADEQUACY', methodVersion: '1.0.0', inputsHash: 'b', warnings: [] },
    { methodCode: 'ADEQUACY', methodVersion: '1.0.0', inputsHash: 'c', warnings: [] },
  ],
  hydrationTargetMl: 2_500,
  instructions: null,
} as unknown as PlanSnapshot & ExchangePlanDocument;

const ENERGY: EnergySummary = {
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
};

const CARD: PatientCard = {
  id: PATIENT,
  sex: 'M',
  birthDate: '1998-10-25',
  population: 'ADULT',
  timezone: 'America/Lima',
  status: 'ACTIVE',
  code: 'P-000001',
  fullName: 'Luis Demo',
};

/** Totales de un alimento o un día: energía, macronutrientes y fibra; la fibra del pollo no está en la tabla. */
const totals = (kcal: number, missingFiber = 0) => ({
  ingredientCount: 2,
  nutrients: {
    ENERC_KCAL: { value: kcal, known: kcal, missing: 0 },
    CHOCDF: { value: 46, known: 46, missing: 0 },
    PROCNT: { value: 34, known: 34, missing: 0 },
    FAT: { value: 4, known: 4, missing: 0 },
    FIBTG: { value: missingFiber > 0 ? null : 1, known: 0.6, missing: missingFiber },
  },
});

const FOOD_PLAN_BASE = {
  schemaVersion: 1,
  planId: PLAN,
  lineageId: uuidv7(),
  versionNo: 1,
  patientId: PATIENT,
  energyPrescriptionId: PRESCRIPTION,
  validFrom: '2026-10-24',
  publishedAt: '2026-10-24T15:00:00.000Z',
  publishedBy: PUBLISHER,
  engineVersion: '1.3.0',
  targets: { kcal: 1834.54, choG: 183.6, proteinG: 160, fatG: 50.96 },
  nutrients: [],
  foods: {
    [RICE]: { name: 'Arroz cocido', state: 'COOKED', nutrientsPer100g: {} },
    [CHICKEN]: { name: 'Pollo', state: 'RAW', nutrientsPer100g: {} },
  },
  adequacy: {
    rangePct: [90, 110],
    kcal: { pct: 22, daysInRange: 0, days: 1, missing: 0, of: 2 },
    cho: { pct: 25, daysInRange: 0, days: 1, missing: 0, of: 2 },
    protein: { pct: 21, daysInRange: 0, days: 1, missing: 0, of: 2 },
    fat: { pct: 8, daysInRange: 0, days: 1, missing: 0, of: 2 },
  },
  methods: [
    { methodCode: 'RECIPE_NUTRIENTS', methodVersion: '1.1.0', inputsHash: 'a', warnings: [] },
  ],
  hydrationTargetMl: 2_000,
  instructions: null,
};

const COMPOSITION_SNAPSHOT = {
  ...FOOD_PLAN_BASE,
  modality: 'COMPOSITION',
  meals: [
    {
      id: uuidv7(),
      slotCode: 'LUNCH',
      name: 'Almuerzo',
      timeOfDay: '13:00',
      sharePct: 100,
      items: [
        {
          itemType: 'FOOD',
          foodId: RICE,
          grams: 200,
          householdText: '1 taza',
          foodName: 'Arroz cocido',
        },
        { itemType: 'FOOD', foodId: CHICKEN, grams: 150, householdText: null, foodName: 'Pollo' },
      ],
      totals: totals(408, 1),
    },
  ],
  totals: totals(408, 1),
} as unknown as PlanSnapshot;

const MENU_SNAPSHOT = {
  ...FOOD_PLAN_BASE,
  modality: 'WEEKLY_MENU',
  meals: [{ slotCode: 'LUNCH', name: 'Almuerzo', timeOfDay: null, sharePct: 100 }],
  days: Array.from({ length: 7 }, (_, d) => ({
    dayOfWeek: d + 1,
    meals: [
      {
        id: uuidv7(),
        optionA: [
          { itemType: 'RECIPE', recipeId: RECIPE, servings: 1, recipeName: 'Arroz con pollo' },
        ],
        optionB:
          d === 0
            ? [
                {
                  itemType: 'FOOD',
                  foodId: CHICKEN,
                  grams: 120,
                  householdText: null,
                  foodName: 'Pollo',
                },
              ]
            : [],
        totalsA: totals(204),
        totalsB: totals(143, 1),
      },
    ],
    totals: totals(204),
  })),
  weeklyAverage: {
    ENERC_KCAL: { value: 204, known: 204, missingDays: 0 },
    FIBTG: { value: null, known: 0.6, missingDays: 2 },
  },
  recipes: {
    [RECIPE]: {
      name: 'Arroz con pollo',
      servings: 2,
      ingredients: [
        { foodId: RICE, grams: 200 },
        { foodId: CHICKEN, grams: 150 },
      ],
      perServing: totals(204),
    },
  },
} as unknown as PlanSnapshot;

const EVALUATION_SHEET: EvaluationSheet = {
  evaluation: {
    id: EVALUATION,
    patientId: PATIENT,
    kind: 'ANTHROPOMETRY',
    level: 'ISAK2',
    status: 'CLOSED',
    revision: 1,
    localDate: '2026-10-13',
    measuredAt: new Date('2026-10-13T13:30:00.000Z'),
    closedAt: new Date('2026-10-13T14:00:00.000Z'),
    conditions: { schemaVersion: 1, fasting: true, intenseActivityLast24h: false, hydration: null },
    subject: { sex: 'M', ageYears: 27.97, population: 'ADULT' },
    evaluatorMemberId: EVALUATOR,
    createdBy: PUBLISHER,
  },
  results: {
    evaluationId: EVALUATION,
    status: 'READY',
    results: [
      {
        id: uuidv7(),
        evaluationId: EVALUATION,
        patientId: PATIENT,
        methodCode: 'FAT_DW1974_SIRI1961',
        methodVersion: '1.1.0',
        engineVersion: '1.3.0',
        inputs: {},
        inputsHash: 'a',
        outputs: {},
        warnings: [
          {
            rule: 'RN-D06',
            severity: 'WARNING',
            code: 'NC-ENG-001',
            message: 'Fuera de la muestra.',
          },
        ],
        status: 'CURRENT',
        supersededBy: null,
        measuredAt: new Date('2026-10-13T13:30:00.000Z'),
        computedAt: new Date('2026-10-13T14:00:01.000Z'),
        principalFor: ['FAT_PCT'],
        metrics: [
          {
            metricCode: 'FAT_PCT',
            value: 20.26,
            unit: '%',
            methodCode: 'FAT_DW1974_SIRI1961',
            zScore: null,
            stored: true,
            interpretation: { label: 'Adecuado', tone: 'NEUTRAL', source: 'ACE' },
            interpretationNote: null,
            referenceScale: null,
          },
        ],
      },
    ],
    unavailable: [],
    populationNote: null,
    siteInterpretations: [
      {
        siteCode: 'GIRTH_WAIST',
        value: 86,
        unit: 'cm',
        interpretation: null,
        interpretationNote: 'Sin interpretación pediátrica.',
        referenceScale: null,
      },
    ],
  },
  sites: [
    { code: 'BASIC_WEIGHT', family: 'BASIC', name: 'Peso', unit: 'kg', value: 80 },
    { code: 'GIRTH_WAIST', family: 'GIRTH', name: 'Cintura', unit: 'cm', value: 86 },
  ],
  bia: [],
};

const ORGANIZATION_BRAND: BrandingRecord = {
  displayName: null,
  logoFileId: null,
  primaryColor: '#1d4ed8',
  secondaryColor: null,
  contact: { phone: '999 000 111', email: null, website: null },
  pdfFooter: null,
};

/** Las API de los otros contextos, como las ve documents. */
class World {
  plan: PublishedPlan | null = {
    planId: PLAN,
    patientId: PATIENT,
    status: 'PUBLISHED',
    snapshot: SNAPSHOT,
  };
  status: 'DRAFT' | 'PUBLISHED' | null = 'PUBLISHED';
  card: PatientCard | null = CARD;
  branding: SheetBranding | null = {
    organizationName: 'Consultorio Demo',
    organization: ORGANIZATION_BRAND,
    member: null,
  };
  brandingAuthor: unknown = null;
  evaluation: EvaluationSheet | null = EVALUATION_SHEET;

  readonly assessment = {
    evaluationSheet: (id: string) => Promise.resolve(id === EVALUATION ? this.evaluation : null),
  } as unknown as AssessmentApi;

  readonly nutrition = {
    publishedPlan: (id: string) => Promise.resolve(id === PLAN ? this.plan : null),
    planStatus: (id: string) => Promise.resolve(id === PLAN ? this.status : null),
    energySummary: (id: string) => Promise.resolve(id === PRESCRIPTION ? ENERGY : null),
  } as unknown as NutritionApi;

  readonly clinical = {
    patientCard: () => Promise.resolve(this.card),
  } as unknown as ClinicalApi;

  readonly tenancy = {
    sheetBranding: (_org: OrganizationId, author: unknown) => {
      this.brandingAuthor = author;
      return Promise.resolve(this.branding);
    },
  } as unknown as TenancyApi;

  sources(): SheetSources {
    return new SheetSources(this.assessment, this.nutrition, this.clinical, this.tenancy);
  }
}

class MemoryDocumentStore implements DocumentStore {
  template: string | null = '1.0.0';
  readonly rows: GeneratedDocumentRecord[] = [];
  /** Simula que otro trabajo guardó el mismo PDF justo antes. */
  raceWith: GeneratedDocumentRecord | null = null;

  activeTemplateVersion() {
    return Promise.resolve(this.template);
  }
  findByKey(key: DocumentKey) {
    const same = (row: GeneratedDocumentRecord) =>
      (Object.keys(key) as (keyof DocumentKey)[]).every((k) => row[k] === key[k]);
    return Promise.resolve(this.rows.find(same) ?? null);
  }
  find(id: string) {
    return Promise.resolve(this.rows.find((row) => row.id === id) ?? null);
  }
  insert(record: GeneratedDocumentRecord) {
    if (this.raceWith) {
      this.rows.push(this.raceWith);
      this.raceWith = null;
      return Promise.resolve(false);
    }
    this.rows.push(record);
    return Promise.resolve(true);
  }
}

class FakeRenderer implements PdfRenderer {
  readonly calls: SheetRender[] = [];
  render(input: SheetRender) {
    this.calls.push(input);
    return Promise.resolve(new TextEncoder().encode(`%PDF-1.3 ${input.content.patient.code}`));
  }
}

class FakeFiles {
  readonly written: string[] = [];
  readonly registered: { id: string; purpose: string }[] = [];
  readonly discarded: string[] = [];
  readonly contents = new Map<string, { content: Buffer; mimeType: string }>();
  notPdf = false;

  write(organizationId: string, content: Uint8Array) {
    const id = uuidv7();
    const key = `${organizationId}/${id}`;
    this.written.push(key);
    this.contents.set(id, { content: Buffer.from(content), mimeType: 'application/pdf' });
    return Promise.resolve({
      id,
      key,
      mimeType: this.notPdf ? 'image/png' : 'application/pdf',
      sha256: createHash('sha256').update(content).digest(),
    });
  }
  register(file: { id: string; purpose: string }) {
    this.registered.push({ id: file.id, purpose: file.purpose });
    return Promise.resolve();
  }
  discard(key: string) {
    this.discarded.push(key);
    return Promise.resolve();
  }
  read(id: string) {
    return Promise.resolve(this.contents.get(id) ?? null);
  }
}

class FakeOutbox implements Outbox {
  readonly events: { event: DomainEvent; metadata: EventMetadata | undefined }[] = [];
  append(events: readonly DomainEvent[], metadata?: EventMetadata) {
    for (const event of events) this.events.push({ event, metadata });
    return Promise.resolve();
  }
}

const clock: Clock = { now: () => new Date('2026-10-25T12:00:00Z') };
const ids: IdGenerator = { newId: <T extends string>() => asId<T>(uuidv7()) };
const uow: UnitOfWork = {
  run: (_context, work) => work(),
  query: (_context, work) => work(),
};

let world: World;
let store: MemoryDocumentStore;
let renderer: FakeRenderer;
let files: FakeFiles;
let outbox: FakeOutbox;
let audits: AuditEntry[];
let generation: DocumentGeneration;
let requests: DocumentRequests;

beforeEach(() => {
  world = new World();
  store = new MemoryDocumentStore();
  renderer = new FakeRenderer();
  files = new FakeFiles();
  outbox = new FakeOutbox();
  audits = [];
  const audit: AuditPort = {
    record: (_context, entry) => {
      audits.push(entry);
      return Promise.resolve();
    },
  };
  const registry = files as unknown as FileRegistry;
  generation = new DocumentGeneration(
    world.sources(),
    store,
    renderer,
    registry,
    outbox,
    clock,
    ids,
  );
  requests = new DocumentRequests(uow, world.sources(), store, registry, audit, outbox, clock, ids);
});

const PLAN_SOURCE = { type: 'NUTRITION_PLAN', id: PLAN } as const;

describe('RN-H01 · RN-D02 · la ficha de una dieta por intercambios sale de su snapshot', () => {
  it('trae las metas con su origen, la lista y su versión, los grupos con intercambios y cada tiempo', () => {
    const sheet = exchangeDietSheet(
      SNAPSHOT,
      { code: 'P-1', fullName: 'Luis Demo', sex: 'M', ageYears: 28 },
      ENERGY,
    );
    expect(sheet.energy).toBe(ENERGY);
    expect(sheet.list).toEqual({
      name: 'Lista de demostración',
      version: '1.0',
      provisional: true,
    });
    // Un grupo sin intercambios en el día no se lista.
    expect(sheet.groups.map((g) => [g.name, g.servings])).toEqual([
      ['Verduras', 4],
      ['Almidones', 6],
    ]);
    // En cada tiempo, los grupos con intercambios y lo que se puede elegir de cada uno.
    expect(sheet.meals[0]).toEqual({
      name: 'Desayuno',
      timeOfDay: '07:00',
      sharePct: 40,
      exchanges: [
        {
          groupName: 'Almidones',
          servings: 2,
          foods: [{ name: 'Pan francés', grams: 30, householdText: '1 unidad' }],
        },
      ],
    });
    expect(sheet.meals[1]?.exchanges.map((e) => [e.groupName, e.servings, e.foods.length])).toEqual(
      [
        ['Verduras', 4, 0],
        ['Almidones', 4, 0],
      ],
    );
  });

  it('cada método se cita una vez, en el orden en que se usó', () => {
    expect(uniqueMethods(SNAPSHOT.methods)).toEqual([
      { methodCode: 'EXCHANGES_CLASSIC', methodVersion: '1.0.0' },
      { methodCode: 'ADEQUACY', methodVersion: '1.0.0' },
    ]);
  });
});

describe('RN-H03 · RN-H02 · preparar la ficha', () => {
  it('la firma quien publicó, con la edad del día del origen y la fecha del PDF de la publicación', async () => {
    const prepared = await world.sources().prepare(ORG, PLAN_SOURCE);
    if (!prepared.ok) throw new Error(prepared.reason);
    expect(world.brandingAuthor).toEqual({ userId: PUBLISHER });
    expect(prepared.sheet.authorUserId).toBe(PUBLISHER);
    expect(prepared.sheet.issuedAt.toISOString()).toBe('2026-10-24T15:00:00.000Z');
    // Cumple 28 el 25 de octubre: el día del origen todavía tiene 27.
    expect(prepared.sheet.content.patient.ageYears).toBe(27);
    expect(prepared.sheet.brand).toMatchObject({
      displayName: 'Consultorio Demo',
      primaryColor: '#1d4ed8',
    });
  });

  it('un borrador no está publicado; un plan que no se ve no existe', async () => {
    world.plan = null;
    world.status = 'DRAFT';
    expect(await world.sources().prepare(ORG, PLAN_SOURCE)).toEqual({
      ok: false,
      reason: 'NOT_PUBLISHED',
    });
    world.status = null;
    expect(await world.sources().prepare(ORG, PLAN_SOURCE)).toEqual({
      ok: false,
      reason: 'NOT_FOUND',
    });
  });

  it('sin paciente visible o sin organización no hay ficha', async () => {
    world.card = null;
    expect((await world.sources().prepare(ORG, PLAN_SOURCE)).ok).toBe(false);
    expect((await world.sources().prepare(ORG, { type: 'EVALUATION', id: EVALUATION })).ok).toBe(
      false,
    );
    world.card = CARD;
    world.branding = null;
    expect((await world.sources().prepare(ORG, PLAN_SOURCE)).ok).toBe(false);
    expect((await world.sources().prepare(ORG, { type: 'EVALUATION', id: EVALUATION })).ok).toBe(
      false,
    );
  });

  it('el hash del contenido no depende de la marca, y el de la marca no depende del contenido', async () => {
    const prepared = await world.sources().prepare(ORG, PLAN_SOURCE);
    if (!prepared.ok) throw new Error(prepared.reason);
    const base = documentKey(prepared.sheet, '1.0.0');
    const rebranded = documentKey(
      { ...prepared.sheet, brand: { ...prepared.sheet.brand, primaryColor: '#be123c' } },
      '1.0.0',
    );
    expect(rebranded.sourceHash).toBe(base.sourceHash);
    expect(rebranded.brandingHash).not.toBe(base.brandingHash);
    expect(documentKey(prepared.sheet, '1.1.0').templateVersion).toBe('1.1.0');
  });
});

describe('RN-H02 · generar en el worker', () => {
  it('dibuja, guarda el PDF y su fila, y deja el evento para la auditoría', async () => {
    const record = await generation.generate(ORG, PLAN_SOURCE, null);
    expect(record).toMatchObject({
      kind: 'EXCHANGE_DIET',
      templateVersion: '1.0.0',
      generatedBy: PUBLISHER,
    });
    expect(renderer.calls).toHaveLength(1);
    expect(renderer.calls[0]?.issuedAt.toISOString()).toBe('2026-10-24T15:00:00.000Z');
    expect(files.registered).toEqual([{ id: record?.fileId, purpose: 'GENERATED_DOCUMENT' }]);
    expect(outbox.events.map((e) => [e.event.type, e.metadata?.actorUserId])).toEqual([
      ['documents.document.generated', PUBLISHER],
    ]);
  });

  it('pedida desde el panel, la firma quien la pidió', async () => {
    expect((await generation.generate(ORG, PLAN_SOURCE, REQUESTER))?.generatedBy).toBe(REQUESTER);
  });

  it('si ya existe un PDF igual, lo devuelve sin dibujar otro', async () => {
    const first = await generation.generate(ORG, PLAN_SOURCE, null);
    const second = await generation.generate(ORG, PLAN_SOURCE, null);
    expect(second).toBe(first);
    expect(renderer.calls).toHaveLength(1);
  });

  it('si otro trabajo lo guardó primero, descarta su archivo y usa el del otro', async () => {
    const prepared = await world.sources().prepare(ORG, PLAN_SOURCE);
    if (!prepared.ok) throw new Error(prepared.reason);
    const other: GeneratedDocumentRecord = {
      id: uuidv7(),
      organizationId: ORG,
      patientId: PATIENT,
      ...documentKey(prepared.sheet, '1.0.0'),
      fileId: uuidv7(),
      sha256: 'f'.repeat(64),
      generatedBy: PUBLISHER,
      generatedAt: clock.now(),
    };
    store.raceWith = other;
    expect(await generation.generate(ORG, PLAN_SOURCE, null)).toBe(other);
    expect(files.discarded).toEqual(files.written);
    expect(files.registered).toEqual([]);
    expect(outbox.events).toEqual([]);
  });

  it('sin origen publicado no hay ficha; sin plantilla activa o si no sale un PDF, falla', async () => {
    world.plan = null;
    expect(await generation.generate(ORG, PLAN_SOURCE, null)).toBeNull();
    world.plan = { planId: PLAN, patientId: PATIENT, status: 'PUBLISHED', snapshot: SNAPSHOT };
    store.template = null;
    await expect(generation.generate(ORG, PLAN_SOURCE, null)).rejects.toThrow(
      'No hay una plantilla activa',
    );
    store.template = '1.0.0';
    files.notPdf = true;
    await expect(generation.generate(ORG, PLAN_SOURCE, null)).rejects.toThrow('no devolvió un PDF');
    expect(files.discarded).toHaveLength(1);
  });
});

describe('RF-24 · pedir la ficha desde el panel', () => {
  it('si no existe, queda pendiente y se pide al worker; cuando existe, está lista', async () => {
    const pending = await requests.request(context, PATIENT, PLAN_SOURCE);
    expect(pending).toEqual({ ok: true, value: { status: 'PENDING' } });
    expect(
      outbox.events.map((e) => [e.event.type, e.event.payload, e.metadata?.actorUserId]),
    ).toEqual([
      [
        'documents.document.requested',
        { patientId: PATIENT, sourceType: 'NUTRITION_PLAN', sourceId: PLAN },
        REQUESTER,
      ],
    ]);

    const record = await generation.generate(ORG, PLAN_SOURCE, REQUESTER);
    const ready = await requests.request(context, PATIENT, PLAN_SOURCE);
    expect(ready).toEqual({ ok: true, value: { status: 'READY', document: record } });
    expect(await requests.status(context, PATIENT, PLAN_SOURCE)).toEqual(ready);
  });

  it('el estado no pide nada al worker', async () => {
    expect(await requests.status(context, PATIENT, PLAN_SOURCE)).toEqual({
      ok: true,
      value: { status: 'PENDING' },
    });
    expect(outbox.events).toEqual([]);
  });

  it('otro paciente en la ruta o un origen que no se ve: NC-DOC-001; un borrador: NC-DOC-002', async () => {
    const other = await requests.request(context, uuidv7(), PLAN_SOURCE);
    expect(isErr(other) && other.error.code).toBe('NC-DOC-001');
    world.plan = null;
    world.status = 'DRAFT';
    const draft = await requests.request(context, PATIENT, PLAN_SOURCE);
    expect(isErr(draft) && draft.error).toMatchObject({ code: 'NC-DOC-002', rule: 'RN-H02' });
    expect(outbox.events).toEqual([]);
  });

  it('la descarga entrega el PDF con su nombre y queda auditada como exportación (RN-B03)', async () => {
    const record = await generation.generate(ORG, PLAN_SOURCE, REQUESTER);
    const file = await requests.file(context, record?.id ?? '');
    expect(file?.fileName).toBe('ficha-dieta-por-intercambios.pdf');
    expect(file?.content.toString()).toBe('%PDF-1.3 P-000001');
    expect(audits).toEqual([
      {
        action: 'EXPORT',
        resourceType: 'documents.generated_document',
        resourceId: record?.id,
        patientId: PATIENT,
      },
    ]);
    expect(await requests.file(context, uuidv7())).toBeNull();
    expect(audits).toHaveLength(1);
  });

  it('sin organización activa no hay ficha', async () => {
    await expect(
      requests.request({ ...context, organizationId: null }, PATIENT, PLAN_SOURCE),
    ).rejects.toThrow('organización activa');
  });
});

describe('RN-H01 · RN-E16 · la ficha del menú, también para la composición', () => {
  it('el menú: cada día con la opción A y la B, el promedio y cada receta con sus ingredientes', () => {
    const sheet = menuSheet(
      MENU_SNAPSHOT as Parameters<typeof menuSheet>[0],
      { code: 'P-1', fullName: 'Luis Demo', sex: 'M', ageYears: 28 },
      null,
    );
    expect(sheet).toMatchObject({ kind: 'WEEKLY_MENU', modality: 'WEEKLY_MENU' });
    expect(sheet.days).toHaveLength(7);
    expect(sheet.days[0]?.dayOfWeek).toBe(1);
    expect(sheet.days[0]?.cells[0]).toEqual({
      optionA: [{ kind: 'RECIPE', name: 'Arroz con pollo', servings: 1 }],
      optionB: [{ kind: 'FOOD', name: 'Pollo', grams: 120, householdText: null }],
    });
    expect(sheet.days[1]?.cells[0]?.optionB).toEqual([]);
    // El promedio de la semana: un nutriente sin dato en algún día queda con lo conocido (RN-I03).
    expect(sheet.average?.kcal).toEqual({ value: 204, known: 204, missing: 0 });
    expect(sheet.average?.fiber).toEqual({ value: null, known: 0.6, missing: 2 });
    // Lo que el snapshot no trae, sin dato en todos los días.
    expect(sheet.average?.protein).toEqual({ value: null, known: 0, missing: 7 });
    expect(sheet.recipes).toEqual([
      {
        name: 'Arroz con pollo',
        servings: 2,
        ingredients: [
          { name: 'Arroz cocido', grams: 200 },
          { name: 'Pollo', grams: 150 },
        ],
        perServing: expect.objectContaining({ of: 2 }) as unknown,
      },
    ]);
  });

  it('la composición es un plan de un día: sin día de la semana, sin opción B ni promedio', () => {
    const sheet = menuSheet(
      COMPOSITION_SNAPSHOT as Parameters<typeof menuSheet>[0],
      { code: 'P-1', fullName: 'Luis Demo', sex: 'M', ageYears: 28 },
      ENERGY,
    );
    expect(sheet).toMatchObject({
      kind: 'WEEKLY_MENU',
      modality: 'COMPOSITION',
      average: null,
      recipes: [],
    });
    expect(sheet.days).toHaveLength(1);
    expect(sheet.days[0]?.dayOfWeek).toBeNull();
    expect(sheet.days[0]?.cells[0]?.optionA).toEqual([
      { kind: 'FOOD', name: 'Arroz cocido', grams: 200, householdText: '1 taza' },
      { kind: 'FOOD', name: 'Pollo', grams: 150, householdText: null },
    ]);
    expect(sheet.days[0]?.totals.fiber).toEqual({ value: null, known: 0.6, missing: 1 });
    expect(sheet.days[0]?.totals.of).toBe(2);
  });

  it('un plan por composición se prepara con la ficha del menú', async () => {
    world.plan = {
      planId: PLAN,
      patientId: PATIENT,
      status: 'PUBLISHED',
      snapshot: COMPOSITION_SNAPSHOT,
    };
    const prepared = await world.sources().prepare(ORG, PLAN_SOURCE);
    expect(prepared.ok && prepared.sheet.kind).toBe('WEEKLY_MENU');
    expect(prepared.ok && prepared.sheet.content.kind).toBe('WEEKLY_MENU');
  });
});

describe('RN-H01 · RN-D02 · RN-D10 · la ficha de resultados de una evaluación', () => {
  const EVALUATION_SOURCE = { type: 'EVALUATION', id: EVALUATION } as const;

  it('la firma el evaluador, con la fecha del cierre y la edad del día de la medición', async () => {
    const prepared = await world.sources().prepare(ORG, EVALUATION_SOURCE);
    if (!prepared.ok) throw new Error(prepared.reason);
    expect(world.brandingAuthor).toEqual({ memberId: EVALUATOR });
    expect(prepared.sheet.kind).toBe('ANTHROPOMETRY');
    expect(prepared.sheet.issuedAt.toISOString()).toBe('2026-10-13T14:00:00.000Z');
    const content = prepared.sheet.content;
    if (content.kind !== 'ANTHROPOMETRY') throw new Error(content.kind);
    expect(content.patient.ageYears).toBe(27);
    expect(content.evaluation).toEqual({
      kind: 'ANTHROPOMETRY',
      level: 'ISAK2',
      measuredOn: '2026-10-13',
      revision: 1,
      amended: false,
      fasting: true,
      intenseActivityLast24h: false,
      hydration: null,
    });
    expect(content.results[0]).toEqual({
      methodCode: 'FAT_DW1974_SIRI1961',
      methodVersion: '1.1.0',
      engineVersion: '1.3.0',
      principalFor: ['FAT_PCT'],
      metrics: [
        {
          metricCode: 'FAT_PCT',
          methodCode: 'FAT_DW1974_SIRI1961',
          value: 20.26,
          unit: '%',
          interpretation: { label: 'Adecuado', tone: 'NEUTRAL', source: 'ACE' },
          note: null,
        },
      ],
      warnings: [{ severity: 'WARNING', message: 'Fuera de la muestra.' }],
    });
    expect(content.siteInterpretations).toEqual([
      {
        name: 'Cintura',
        value: 86,
        unit: 'cm',
        interpretation: null,
        note: 'Sin interpretación pediátrica.',
      },
    ]);
    expect(content.sites.map((site) => site.name)).toEqual(['Peso', 'Cintura']);
  });

  it('un borrador no tiene ficha; con los resultados en cálculo, todavía no', async () => {
    world.evaluation = {
      ...EVALUATION_SHEET,
      evaluation: { ...EVALUATION_SHEET.evaluation, status: 'DRAFT', closedAt: null },
    };
    expect(await world.sources().prepare(ORG, EVALUATION_SOURCE)).toEqual({
      ok: false,
      reason: 'NOT_PUBLISHED',
    });
    world.evaluation = {
      ...EVALUATION_SHEET,
      results: { ...EVALUATION_SHEET.results, status: 'PENDING', results: [] },
    };
    expect(await world.sources().prepare(ORG, EVALUATION_SOURCE)).toEqual({
      ok: false,
      reason: 'NOT_READY',
    });
    const pending = await requests.request(context, PATIENT, EVALUATION_SOURCE);
    expect(isErr(pending) && pending.error.code).toBe('NC-DOC-003');
    world.evaluation = null;
    expect(await world.sources().prepare(ORG, EVALUATION_SOURCE)).toEqual({
      ok: false,
      reason: 'NOT_FOUND',
    });
  });

  it('una rutina todavía no tiene ficha (P12)', async () => {
    expect(await world.sources().prepare(ORG, { type: 'TRAINING_PROGRAM', id: uuidv7() })).toEqual({
      ok: false,
      reason: 'NOT_SUPPORTED',
    });
  });
});

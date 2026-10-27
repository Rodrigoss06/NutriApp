import { type DomainError, type Result } from '@nutricoach/shared-kernel';
import { beforeEach, describe, expect, it } from 'vitest';
import luisSeed from '../../../../../../seeds/luis/luis.json' with { type: 'json' };
import { PEDIATRIC_NOTE, type ReferenceRange } from '../domain/interpretation.js';
import {
  FakeAudit,
  FakeClinical,
  FakeClock,
  fakeIds,
  FakeOutbox,
  fakeTenancy,
  FakeUow,
  MemoryCalculations,
  memoryCatalog,
  MemoryEvaluations,
  MemoryTechnicalErrors,
  staffContext,
} from './assessment-fakes.spec-support.js';
import { AssessmentApi } from './assessment-api.js';
import { CalculationService } from './calculation.service.js';
import { CalculationCommands } from './commands/calculation.commands.js';
import { EvaluationCommands } from './commands/evaluation.commands.js';
import { TechnicalErrorCommands } from './commands/technical-error.commands.js';
import { ResultsQueries } from './queries/results.queries.js';
import { ResultsAssembly } from './results-assembly.js';

const RESPONSIBLE = '0192f0a0-0000-7000-8000-0000000000a1';
const COLLEAGUE = '0192f0a0-0000-7000-8000-0000000000a2';
const PATIENT = '0192f0a0-0000-7000-8000-0000000000c1';
const responsible = staffContext('PROFESSIONAL', RESPONSIBLE);
const colleague = staffContext('PROFESSIONAL', COLLEAGUE);
const owner = staffContext('OWNER', '0192f0a0-0000-7000-8000-0000000000a0');

/** Los rangos de la migración que usa el caso Luis (RN-D10). */
const range = (
  id: string,
  metricCode: string,
  sex: 'M' | null,
  minValue: number | null,
  maxValue: number | null,
  label: string,
  source: string,
): ReferenceRange => ({
  id,
  organizationId: null,
  metricCode,
  sex,
  minAge: 18,
  maxAge: null,
  population: null,
  minValue,
  maxValue,
  label,
  tone: 'NEUTRAL',
  source,
  validFrom: '2026-10-13',
});
const RANGES: ReferenceRange[] = [
  range('b1', 'BMI', null, 18.5, 25, 'Normal', 'OMS'),
  range('b2', 'BMI', null, 25, 30, 'Sobrepeso', 'OMS'),
  range('w1', 'GIRTH_WAIST', 'M', null, 94, 'Sin riesgo aumentado', 'OMS 2008'),
  range('f1', 'FAT_PCT', 'M', 6, 14, 'Atlético', 'ACE'),
  range('f2', 'FAT_PCT', 'M', 14, 18, 'Fitness', 'ACE'),
  range('f3', 'FAT_PCT', 'M', 18, 25, 'Promedio', 'ACE'),
];

let clock: FakeClock;
let uow: FakeUow;
let outbox: FakeOutbox;
let audit: FakeAudit;
let evaluations: MemoryEvaluations;
let errors: MemoryTechnicalErrors;
let calculations: MemoryCalculations;
let clinical: FakeClinical;

const tenancy = () => fakeTenancy(new Set([RESPONSIBLE, COLLEAGUE]));
const evaluationCommands = () =>
  new EvaluationCommands(
    uow,
    clock,
    fakeIds,
    outbox,
    evaluations,
    memoryCatalog,
    clinical.asApi(),
    tenancy(),
  );
const service = () =>
  new CalculationService(
    clock,
    fakeIds,
    outbox,
    evaluations,
    memoryCatalog,
    calculations,
    tenancy(),
  );
const commands = () =>
  new CalculationCommands(
    uow,
    clock,
    fakeIds,
    outbox,
    evaluations,
    calculations,
    clinical.asApi(),
    service(),
  );
const queries = () =>
  new ResultsQueries(
    uow,
    audit,
    evaluations,
    memoryCatalog,
    calculations,
    errors,
    clinical.asApi(),
    service(),
    new ResultsAssembly(evaluations, memoryCatalog, calculations, service()),
  );

const assessmentApi = () =>
  new AssessmentApi(
    evaluations,
    memoryCatalog,
    calculations,
    service(),
    new ResultsAssembly(evaluations, memoryCatalog, calculations, service()),
  );

function value<T>(result: Result<T, DomainError>): T {
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}
const errorOf = <T>(result: Result<T, DomainError>) => (result.ok ? null : result.error);
const versionOf = async (id: string) => (await evaluations.find(id))?.version ?? -1;

const CONDITIONS = {
  schemaVersion: 1,
  fasting: true,
  intenseActivityLast24h: false,
  hydration: null,
} as const;

/** Una evaluación cerrada y calculada como lo hace el worker; ISAK 2 de Luis si no se indica otra cosa. */
async function closedLuis(
  measuredAt: string,
  measurements: Record<string, number[]>,
  options: { patientId?: string; level?: 'BASIC' | 'ISAK2' } = {},
): Promise<string> {
  const id = value(
    await evaluationCommands().create(responsible, options.patientId ?? PATIENT, {
      kind: 'ANTHROPOMETRY',
      level: options.level ?? 'ISAK2',
      measuredAt,
      conditions: CONDITIONS,
    }),
  ).id;
  for (const [siteCode, attempts] of Object.entries(measurements)) {
    value(
      await evaluationCommands().recordMeasurement(responsible, id, siteCode, await versionOf(id), {
        attempts,
        side: 'RIGHT',
      }),
    );
  }
  value(await evaluationCommands().close(responsible, id, await versionOf(id)));
  const evaluation = await evaluations.find(id);
  if (!evaluation) throw new Error(id);
  await service().compute(responsible, evaluation);
  return id;
}

const current = () =>
  closedLuis('2026-10-13T13:30:00.000Z', luisSeed.evaluations.current.measurements);

/** Una evaluación solo de bioimpedancia, cerrada: sin nivel ni sitios (RN-C08). */
async function closedBiaOnly(measuredAt: string): Promise<string> {
  const id = value(
    await evaluationCommands().create(responsible, PATIENT, {
      kind: 'BIA',
      level: null,
      measuredAt,
      conditions: CONDITIONS,
    }),
  ).id;
  value(
    await evaluationCommands().addBiaReading(responsible, id, {
      deviceBrand: 'Marca Demo',
      deviceModel: 'BIA-200',
      readings: [{ metric: 'FAT_PCT', value: 18.4, unit: '%', deviceLabel: 'Grasa corporal' }],
    }),
  );
  value(await evaluationCommands().close(responsible, id, await versionOf(id)));
  return id;
}
const currentResults = (id: string) =>
  calculations.rows.filter((r) => r.evaluationId === id && r.status === 'CURRENT');

beforeEach(() => {
  clock = new FakeClock();
  outbox = new FakeOutbox();
  audit = new FakeAudit();
  evaluations = new MemoryEvaluations();
  errors = new MemoryTechnicalErrors();
  calculations = new MemoryCalculations();
  calculations.ranges = RANGES;
  uow = new FakeUow().track(evaluations, errors, calculations, outbox);
  clinical = new FakeClinical();
  clinical.add(
    {
      id: PATIENT,
      sex: 'M',
      birthDate: '1998-10-13',
      population: 'ADULT',
      timezone: 'America/Lima',
      status: 'ACTIVE',
    },
    RESPONSIBLE,
  );
});

describe('RN-D01 · RN-D08 · resultados inmutables', () => {
  it('al cerrar, 12 resultados con su método y sus indicadores; Jackson y Pollock no, por sitios', async () => {
    const id = await current();
    expect(
      currentResults(id)
        .map((r) => r.methodCode)
        .sort(),
    ).toEqual(
      [
        'ACROMIOILIAC_INDEX',
        'BMI',
        'COMP4_DEROSE_GUIMARAES',
        'COMP5_KERR1988',
        'CORMIC_INDEX',
        'FAT_DW1974_SIRI1961',
        'FAT_FAULKNER1968',
        'FAT_YUHASZ1974',
        'MANOUVRIER_INDEX',
        'MUSCLE_LEE2000',
        'WAIST_HEIGHT',
        'WAIST_HIP',
      ].sort(),
    );
    const comp4 = currentResults(id).find((r) => r.methodCode === 'COMP4_DEROSE_GUIMARAES');
    expect(
      calculations.metrics.filter((m) => m.resultId === comp4?.id).map((m) => m.metric),
    ).toEqual([
      expect.objectContaining({ metricCode: 'BONE_MASS_KG', methodCode: 'BONE_ROCHA1975' }),
      expect.objectContaining({ metricCode: 'RESIDUAL_MASS_KG', methodCode: 'RESIDUAL_WURCH1974' }),
      expect.objectContaining({
        metricCode: 'MUSCLE_MASS_KG',
        methodCode: 'COMP4_DEROSE_GUIMARAES',
      }),
    ]);
    expect(outbox.types().at(-1)).toBe('assessment.result.computed');
  });

  it('calcular otra vez con los mismos insumos no crea nada', async () => {
    const id = await current();
    const evaluation = await evaluations.find(id);
    if (!evaluation) throw new Error(id);
    const events = outbox.events.length;
    expect(await service().compute(responsible, evaluation)).toEqual({ created: 0, superseded: 0 });
    expect(outbox.events).toHaveLength(events);
  });

  it('criterio P7 · recalcular con otro coeficiente de Lee crea un resultado nuevo y deja el anterior como SUPERSEDED', async () => {
    const id = await current();
    const before = currentResults(id).find((r) => r.methodCode === 'MUSCLE_LEE2000');
    expect(
      value(await commands().recalculate(responsible, id, { referenceGroupCoefficient: -2 })),
    ).toEqual({
      created: 1,
      superseded: 1,
    });
    const after = currentResults(id).find((r) => r.methodCode === 'MUSCLE_LEE2000');
    expect(after?.inputs.referenceGroupCoefficient).toBe(-2);
    expect(calculations.rows.find((r) => r.id === before?.id)).toMatchObject({
      status: 'SUPERSEDED',
      supersededBy: after?.id,
    });
    // RN-D11: el coeficiente elegido en la evaluación se mantiene al recalcular sin indicarlo.
    expect(value(await commands().recalculate(responsible, id, {}))).toEqual({
      created: 0,
      superseded: 0,
    });
    // Volver al coeficiente anterior reactiva su resultado: mismos insumos, mismo hash.
    expect(
      value(await commands().recalculate(responsible, id, { referenceGroupCoefficient: 0 })),
    ).toEqual({
      created: 0,
      superseded: 1,
    });
    expect(currentResults(id).find((r) => r.methodCode === 'MUSCLE_LEE2000')?.id).toBe(before?.id);
  });

  it('RN-D05 · RN-D08 · cambiar la preferencia no recalcula; al recalcular, 4 componentes usa la grasa elegida', async () => {
    const id = await current();
    value(await commands().setPatientPreference(responsible, PATIENT, 'FAT_PCT', 'FAT_YUHASZ1974'));
    const comp4 = () =>
      currentResults(id).find((r) => r.methodCode === 'COMP4_DEROSE_GUIMARAES')?.inputs
        .fatMethodCode;
    expect(comp4()).toBe('FAT_DW1974_SIRI1961');
    expect(value(await commands().recalculate(responsible, id, {}))).toEqual({
      created: 1,
      superseded: 1,
    });
    expect(comp4()).toBe('FAT_YUHASZ1974');
    const view = await queries().results(responsible, id);
    expect(view?.results.find((r) => r.methodCode === 'FAT_YUHASZ1974')?.principalFor).toEqual([
      'FAT_PCT',
    ]);
  });

  it('solo se recalcula una evaluación cerrada vigente, con escritura en el equipo', async () => {
    const id = await current();
    expect(errorOf(await commands().recalculate(colleague, id, {}))?.code).toBe('NC-CLI-020');
    const revision = value(
      await evaluationCommands().amend(responsible, id, 'Peso mal digitado'),
    ).id;
    value(await evaluationCommands().close(responsible, revision, await versionOf(revision)));
    expect(errorOf(await commands().recalculate(responsible, id, {}))?.code).toBe('NC-ASM-018');
  });
});

describe('RF-15 · resultados con método e interpretación con fuente', () => {
  it('RN-D10 · IMC «Sobrepeso» (OMS), % de grasa por método (ACE) y cintura (OMS 2008); READ en auditoría', async () => {
    const id = await current();
    const view = await queries().results(responsible, id);
    expect(view?.status).toBe('READY');
    const metric = (method: string, code: string) =>
      view?.results
        .find((r) => r.methodCode === method)
        ?.metrics.find((m) => m.metricCode === code);
    expect(metric('BMI', 'BMI')?.interpretation).toEqual({
      label: 'Sobrepeso',
      tone: 'NEUTRAL',
      source: 'OMS',
    });
    expect(metric('FAT_DW1974_SIRI1961', 'FAT_PCT')?.interpretation?.label).toBe('Promedio');
    // RN-D10: la tabla completa viaja con el valor, para dibujar dónde cae.
    const scale = metric('BMI', 'BMI')?.referenceScale;
    expect(scale?.source).toBe('OMS');
    expect(scale?.bands.map((band) => band.label)).toContain('Sobrepeso');
    expect(metric('FAT_FAULKNER1968', 'FAT_PCT')?.interpretation?.label).toBe('Fitness');
    expect(metric('FAT_YUHASZ1974', 'FAT_PCT')?.interpretation?.label).toBe('Atlético');
    expect(view?.siteInterpretations).toEqual([
      expect.objectContaining({ siteCode: 'GIRTH_WAIST', unit: 'cm' }),
    ]);
    expect(view?.siteInterpretations[0]?.interpretation?.source).toBe('OMS 2008');
    expect(view?.unavailable).toEqual([
      {
        methodCode: 'FAT_JP1978_7',
        reason: 'MISSING_SITES',
        missingSites: ['SKF_CHEST', 'SKF_MIDAXILLARY', 'SKF_SUPRAILIAC'],
        issues: [],
      },
    ]);
    expect(audit.entries.at(-1)).toMatchObject({
      action: 'READ',
      resourceType: 'assessment.calculation_result',
      patientId: PATIENT,
    });
  });

  it('G-12 · peso objetivo para 15 % de grasa: 75.05 kg, perder 4.95 kg, con la masa libre de grasa de Durnin & Womersley', async () => {
    const id = await current();
    const view = await queries().targetWeight(responsible, id, 15);
    if (!view || view === 'NO_FAT_FREE_MASS') throw new Error('sin peso objetivo');
    expect(view.fatFreeMassMethodCode).toBe('FAT_DW1974_SIRI1961');
    expect(view.targetWeightKg).toBeCloseTo(75.05, 2);
    expect(view.weightChangeKg).toBeCloseTo(-4.95, 2);
  });

  it('RN-D10 · rigen los rangos de la fecha de la evaluación: una versión posterior no cambia lo ya medido', async () => {
    // Primero en la lista: sin elegir la versión, ganaría la nueva.
    calculations.ranges = [
      {
        ...range('b9', 'BMI', null, 25, 30, 'Otra etiqueta', 'Fuente nueva'),
        validFrom: '2026-10-14',
      },
      ...RANGES,
    ];
    const id = await current();
    const bmi = (await queries().results(responsible, id))?.results
      .find((r) => r.methodCode === 'BMI')
      ?.metrics.find((m) => m.metricCode === 'BMI');
    expect(bmi).toMatchObject({
      interpretation: { label: 'Sobrepeso', source: 'OMS' },
      interpretationNote: null,
    });
  });

  it('RN-D05 · en menores, cada valor con su método y el aviso «Sin interpretación pediátrica en la versión 1.0»', async () => {
    const TEEN = '0192f0a0-0000-7000-8000-0000000000c2';
    clinical.add(
      {
        id: TEEN,
        sex: 'M',
        birthDate: '2010-04-01',
        population: 'ADOLESCENT',
        timezone: 'America/Lima',
        status: 'ACTIVE',
      },
      RESPONSIBLE,
    );
    const id = await closedLuis(
      '2026-10-13T13:30:00.000Z',
      {
        BASIC_WEIGHT: [61.0, 61.0],
        BASIC_HEIGHT: [170.0, 170.0],
        GIRTH_WAIST: [70.0, 70.0],
        GIRTH_HIP: [88.0, 88.0],
      },
      { patientId: TEEN, level: 'BASIC' },
    );
    const view = await queries().results(responsible, id);
    const bmi = view?.results.find((r) => r.methodCode === 'BMI')?.metrics[0];
    expect(bmi).toMatchObject({
      metricCode: 'BMI',
      methodCode: 'BMI',
      interpretation: null,
      interpretationNote: PEDIATRIC_NOTE,
    });
    expect(bmi?.value).toBeCloseTo(21.11, 2);
    expect(view?.siteInterpretations).toEqual([
      {
        siteCode: 'GIRTH_WAIST',
        value: 70,
        unit: 'cm',
        interpretation: null,
        interpretationNote: 'Sin interpretación pediátrica en la versión 1.0',
        referenceScale: null,
      },
    ]);
    // Sin rangos para el indicador, no hay interpretación ni aviso.
    const whr = view?.results.find((r) => r.methodCode === 'WAIST_HIP')?.metrics[0];
    expect(whr).toMatchObject({ interpretation: null, interpretationNote: null });
  });
});

describe('RN-C06 · RN-D03 · comparación con la evaluación anterior', () => {
  it('G-04 · la suma de 6 pliegues baja 6.9 mm frente a un CMD95 de 6.18: cambio; sitio a sitio, por encima y por debajo', async () => {
    value(
      await new TechnicalErrorCommands(
        uow,
        clock,
        fakeIds,
        outbox,
        errors,
        memoryCatalog,
        tenancy(),
      ).record(responsible, RESPONSIBLE, {
        source: 'CALCULATED',
        validFrom: '2026-07-15',
        sites: luisSeed.technicalErrorStudy.sites as {
          siteCode: string;
          pairs: [number, number][];
        }[],
      }),
    );
    await closedLuis('2026-09-15T13:30:00.000Z', luisSeed.evaluations.previous.measurements);
    const id = await current();
    const view = await queries().comparison(responsible, id, undefined);
    expect(view?.conditionDifferences).toEqual([]);
    expect(view?.skinfoldSum6?.current).toBeCloseTo(95, 9);
    expect(view?.skinfoldSum6?.delta).toBeCloseTo(-6.9, 9);
    expect(view?.skinfoldSum6?.temRelPct).toBeCloseTo(2.35, 2);
    expect(view?.skinfoldSum6?.mdc95).toBeCloseTo(6.18, 2);
    expect(view?.skinfoldSum6?.significance).toBe('CHANGE');
    const site = (code: string) => view?.sites.find((s) => s.siteCode === code);
    expect(site('SKF_TRICEPS')?.significance).toBe('CHANGE');
    expect(site('SKF_ABDOMINAL')?.significance).toBe('NO_SIGNIFICANT_CHANGE');
    expect(site('SKF_MEDIAL_CALF')?.significance).toBe('NO_SIGNIFICANT_CHANGE');
    expect(site('SKF_BICEPS')).toMatchObject({ mdc95: null, significance: 'UNKNOWN' });
    // RN-D03: solo se comparan indicadores del mismo método.
    const fat = view?.metrics.filter((m) => m.metricCode === 'FAT_PCT').map((m) => m.methodCode);
    expect(fat?.sort()).toEqual(['FAT_DW1974_SIRI1961', 'FAT_FAULKNER1968', 'FAT_YUHASZ1974']);
  });

  it('RN-C08 · por defecto se compara con la anterior con antropometría, no con una solo de bioimpedancia', async () => {
    const previous = await closedLuis(
      '2026-09-15T13:30:00.000Z',
      luisSeed.evaluations.previous.measurements,
    );
    await closedBiaOnly('2026-10-01T13:30:00.000Z');
    const id = await current();
    const view = await queries().comparison(responsible, id, undefined);
    expect(view?.previous?.id).toBe(previous);
    expect(view?.skinfoldSum6?.delta).toBeCloseTo(-6.9, 9);
  });

  it('sin evaluación anterior, la comparación viene vacía', async () => {
    const id = await current();
    expect(await queries().comparison(responsible, id, undefined)).toMatchObject({
      previous: null,
      sites: [],
      skinfoldSum6: null,
    });
  });
});

describe('RN-C07 · los resultados de una evaluación enmendada quedan como histórico', () => {
  it('cerrar la revisión deja los de la original como SUPERSEDED, reemplazados por los del mismo método', async () => {
    const id = await current();
    const revision = value(
      await evaluationCommands().amend(responsible, id, 'Peso mal digitado'),
    ).id;
    value(
      await evaluationCommands().recordMeasurement(
        responsible,
        revision,
        'BASIC_WEIGHT',
        await versionOf(revision),
        {
          attempts: [80.5, 80.5],
          side: 'RIGHT',
        },
      ),
    );
    value(await evaluationCommands().close(responsible, revision, await versionOf(revision)));
    const closed = await evaluations.find(revision);
    if (!closed) throw new Error(revision);
    await service().compute(responsible, closed);
    await service().supersedeAmended(id, revision);
    expect(currentResults(id)).toEqual([]);
    const bmi = calculations.rows.find((r) => r.evaluationId === id && r.methodCode === 'BMI');
    const newBmi = currentResults(revision).find((r) => r.methodCode === 'BMI');
    expect(bmi?.supersededBy).toBe(newBmi?.id);
    const history = await queries().results(responsible, id);
    expect(history?.results.map((r) => r.status)).toEqual(Array(12).fill('SUPERSEDED'));
  });
});

describe('RN-D05 · RF-16 · preferencias de métodos', () => {
  it('la organización fija el método por población; un método de otro propósito se rechaza', async () => {
    value(
      await commands().setOrganizationPreference(owner, 'ATHLETE', 'FAT_PCT', 'FAT_FAULKNER1968'),
    );
    expect(
      errorOf(
        await commands().setOrganizationPreference(owner, 'ADULT', 'FAT_PCT', 'RMR_MIFFLIN1990'),
      )?.code,
    ).toBe('NC-ASM-019');
    expect(
      errorOf(
        await commands().setOrganizationPreference(owner, 'MARCIANO', 'FAT_PCT', 'FAT_YUHASZ1974'),
      )?.code,
    ).toBe('NC-ASM-019');
    const table = await queries().organizationPreferences(owner);
    const athlete = table.find((row) => row.population === 'ATHLETE');
    expect(athlete?.preferences.FAT_PCT).toEqual({
      methodCode: 'FAT_FAULKNER1968',
      source: 'ORGANIZATION',
    });
    expect(table.find((row) => row.population === 'ADULT')?.preferences.FAT_PCT.source).toBe(
      'PLATFORM',
    );
    value(await commands().setOrganizationPreference(owner, 'ATHLETE', 'FAT_PCT', null));
    expect(
      (await queries().organizationPreferences(owner)).find((row) => row.population === 'ATHLETE')
        ?.preferences.FAT_PCT.source,
    ).toBe('PLATFORM');
    expect(outbox.types().filter((t) => t === 'assessment.preference.changed')).toHaveLength(2);
  });

  it('la del paciente la escribe su equipo con escritura y gana a la de la organización', async () => {
    expect(
      errorOf(
        await commands().setPatientPreference(colleague, PATIENT, 'FAT_PCT', 'FAT_YUHASZ1974'),
      )?.code,
    ).toBe('NC-CLI-020');
    value(await commands().setPatientPreference(responsible, PATIENT, 'FAT_PCT', 'FAT_YUHASZ1974'));
    expect((await queries().patientPreferences(responsible, PATIENT))?.preferences.FAT_PCT).toEqual(
      {
        methodCode: 'FAT_YUHASZ1974',
        source: 'PATIENT',
      },
    );
  });
});

describe('RF-17 · la composición que usa la prescripción energética', () => {
  it('es la última cerrada con peso y talla: una solo de bioimpedancia posterior no la reemplaza', async () => {
    const id = await current();
    await closedBiaOnly('2026-10-13T15:00:00.000Z');
    const api = assessmentApi();
    const basis = await api.compositionBasis(PATIENT, null);
    expect(basis?.evaluationId).toBe(id);
    expect(basis?.weightKg).toBe(80);
    expect(basis?.heightCm).toBeCloseTo(175, 9);
    expect(basis?.fatFreeMass?.methodCode).toBe('FAT_DW1974_SIRI1961');
    const [bia] = await evaluations.listByPatient(PATIENT);
    expect(bia?.kind).toBe('BIA');
    expect(await api.compositionBasis(PATIENT, bia?.id ?? '')).toBeNull();
  });
});

describe('RN-H04 · RN-D02 · lo que la ficha de resultados dice de una evaluación', () => {
  it('las medidas consolidadas en el orden del catálogo y cada resultado con su método e interpretación', async () => {
    const id = await current();
    const sheet = await assessmentApi().evaluationSheet(id);
    expect(sheet?.evaluation).toMatchObject({
      id,
      patientId: PATIENT,
      status: 'CLOSED',
      revision: 1,
    });
    expect(sheet?.sites.find((site) => site.code === 'BASIC_WEIGHT')).toMatchObject({
      family: 'BASIC',
      unit: 'kg',
      value: 80,
    });
    expect(sheet?.results.status).toBe('READY');
    const dw = sheet?.results.results.find((r) => r.methodCode === 'FAT_DW1974_SIRI1961');
    expect(dw?.metrics.find((m) => m.metricCode === 'FAT_PCT')?.value).toBeCloseTo(20.26, 2);
    expect(dw?.principalFor).toContain('FAT_PCT');
    expect(sheet?.bia).toEqual([]);
    expect(
      await assessmentApi().evaluationSheet('00000000-0000-7000-8000-000000000000'),
    ).toBeNull();
  });
});

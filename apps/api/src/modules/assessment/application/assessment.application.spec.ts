import { isErr, isOk, type DomainError, type Result } from '@nutricoach/shared-kernel';
import { beforeEach, describe, expect, it } from 'vitest';
import luisSeed from '../../../../../../seeds/luis/luis.json' with { type: 'json' };
import {
  FakeAudit,
  FakeClinical,
  FakeClock,
  fakeIds,
  FakeOutbox,
  fakeTenancy,
  FakeUow,
  memoryCatalog,
  MemoryEvaluations,
  MemoryTechnicalErrors,
  staffContext,
} from './assessment-fakes.spec-support.js';
import { AssessmentTimelineSource } from './assessment-timeline.js';
import { EvaluationCommands, type CreateEvaluationInput } from './commands/evaluation.commands.js';
import { TechnicalErrorCommands } from './commands/technical-error.commands.js';
import { EvaluationQueries } from './queries/evaluation.queries.js';

const RESPONSIBLE = '0192f0a0-0000-7000-8000-0000000000a1';
const COLLEAGUE = '0192f0a0-0000-7000-8000-0000000000a2';
const OWNER = '0192f0a0-0000-7000-8000-0000000000a0';
const PATIENT = '0192f0a0-0000-7000-8000-0000000000c1';

const responsible = staffContext('PROFESSIONAL', RESPONSIBLE);
const colleague = staffContext('PROFESSIONAL', COLLEAGUE);
const owner = staffContext('OWNER', OWNER);

const CONDITIONS = {
  schemaVersion: 1,
  fasting: true,
  intenseActivityLast24h: false,
  hydration: null,
} as const;

let clock: FakeClock;
let uow: FakeUow;
let outbox: FakeOutbox;
let audit: FakeAudit;
let evaluations: MemoryEvaluations;
let errors: MemoryTechnicalErrors;
let clinical: FakeClinical;

const tenancy = () => fakeTenancy(new Set([RESPONSIBLE, COLLEAGUE, OWNER]));
const commands = () =>
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
const queries = () =>
  new EvaluationQueries(
    uow,
    clock,
    audit,
    evaluations,
    memoryCatalog,
    errors,
    clinical.asApi(),
    tenancy(),
  );
const temCommands = () =>
  new TechnicalErrorCommands(uow, clock, fakeIds, outbox, errors, memoryCatalog, tenancy());

beforeEach(() => {
  clock = new FakeClock();
  outbox = new FakeOutbox();
  audit = new FakeAudit();
  evaluations = new MemoryEvaluations();
  errors = new MemoryTechnicalErrors();
  uow = new FakeUow().track(evaluations, errors, outbox);
  clinical = new FakeClinical();
  // Luis cumple 28 años el día de la evaluación (seeds/luis/README).
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

function value<T>(result: Result<T, DomainError>): T {
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

const errorOf = <T>(result: Result<T, DomainError>) => (isErr(result) ? result.error : null);

async function created(input: Partial<CreateEvaluationInput> = {}): Promise<string> {
  return value(
    await commands().create(responsible, PATIENT, {
      kind: 'ANTHROPOMETRY',
      level: 'BASIC',
      measuredAt: '2026-10-13T13:30:00.000Z',
      conditions: CONDITIONS,
      ...input,
    }),
  ).id;
}

const versionOf = async (id: string) => (await evaluations.find(id))?.version ?? -1;

async function record(id: string, siteCode: string, attempts: number[]) {
  return commands().recordMeasurement(responsible, id, siteCode, await versionOf(id), {
    attempts,
    side: 'RIGHT',
  });
}

async function measuredAll(id: string, measurements: Record<string, number[]>) {
  for (const [siteCode, attempts] of Object.entries(measurements)) {
    value(await record(id, siteCode, attempts));
  }
}

describe('RF-11 · crear una evaluación', () => {
  it('RN-B01 · RN-A05 · sin escritura en el equipo o sin consentimiento no se crea', async () => {
    const outsider = await commands().create(colleague, PATIENT, {
      kind: 'ANTHROPOMETRY',
      level: 'BASIC',
      measuredAt: '2026-10-13T13:30:00.000Z',
      conditions: CONDITIONS,
    });
    expect(errorOf(outsider)?.code).toBe('NC-CLI-020');
    clinical.consented.delete(PATIENT);
    const unconsented = await commands().create(responsible, PATIENT, {
      kind: 'ANTHROPOMETRY',
      level: 'BASIC',
      measuredAt: '2026-10-13T13:30:00.000Z',
      conditions: CONDITIONS,
    });
    expect(errorOf(unconsented)?.rule).toBe('RN-B01');
    expect(evaluations.rows.size).toBe(0);
  });

  it('ADR-044 · guarda el día local del paciente y su edad decimal al medir', async () => {
    // 22:30 en Lima del 12 de octubre: un día antes de cumplir 28.
    const id = await created({ measuredAt: '2026-10-13T03:30:00.000Z' });
    const evaluation = await evaluations.find(id);
    expect(evaluation?.localDate).toBe('2026-10-12');
    expect(evaluation?.patientSnapshot).toEqual({
      sex: 'M',
      ageYears: 27 + 364 / 365,
      population: 'ADULT',
    });
    const birthday = await created();
    expect((await evaluations.find(birthday))?.patientSnapshot.ageYears).toBe(28);
    expect(outbox.types()).toEqual([
      'assessment.evaluation.created',
      'assessment.evaluation.created',
    ]);
  });

  it('RN-C09 · el evaluador es quien crea, u otro miembro activo de la organización', async () => {
    const id = await created();
    expect((await evaluations.find(id))?.evaluatorMemberId).toBe(RESPONSIBLE);
    const other = await created({ evaluatorMemberId: COLLEAGUE });
    expect((await evaluations.find(other))?.evaluatorMemberId).toBe(COLLEAGUE);
    const stranger = await commands().create(responsible, PATIENT, {
      kind: 'ANTHROPOMETRY',
      level: 'BASIC',
      measuredAt: '2026-10-13T13:30:00.000Z',
      conditions: CONDITIONS,
      evaluatorMemberId: '0192f0a0-0000-7000-8000-0000000000ff',
    });
    expect(errorOf(stranger)?.code).toBe('NC-ASM-014');
  });
});

describe('RF-11 · tomas por sitio', () => {
  it('G-01 a G-03 · consolida con el motor y pide la tercera toma cuando hace falta (RN-C02, RN-C03)', async () => {
    const id = await created({ level: 'ISAK1' });
    value(await record(id, 'SKF_TRICEPS', [12.0, 12.4]));
    let triceps = (await queries().get(responsible, id))?.measurements[0];
    expect(triceps?.consolidation.value).toBeCloseTo(12.2, 9);
    expect(triceps?.consolidation.diffPct).toBeCloseTo(3.33, 2);
    value(await record(id, 'SKF_TRICEPS', [12.0, 13.0]));
    triceps = (await queries().get(responsible, id))?.measurements[0];
    expect(triceps?.consolidation).toMatchObject({ value: null, needsThird: true });
    expect(triceps?.consolidation.diffPct).toBeCloseTo(8.33, 2);
    value(await record(id, 'SKF_TRICEPS', [12.0, 13.0, 12.6]));
    triceps = (await queries().get(responsible, id))?.measurements[0];
    expect(triceps?.consolidation).toMatchObject({ value: 12.6, method: 'MEDIAN_3' });
  });

  it('RN-C04 · fuera de rango se rechaza; RN-C02 · una tercera toma innecesaria también', async () => {
    const id = await created();
    expect(errorOf(await record(id, 'BASIC_WEIGHT', [301]))?.code).toBe('NC-ASM-003');
    expect(errorOf(await record(id, 'BASIC_WEIGHT', [80, 80, 80]))?.code).toBe('NC-ASM-005');
    expect(errorOf(await record(id, 'NO_EXISTE', [1, 1]))?.code).toBe('NC-ASM-002');
    expect(evaluations.measurementRows.get(id)?.size ?? 0).toBe(0);
  });

  it('06 §5 · con una versión vieja responde conflicto y no guarda nada', async () => {
    const id = await created();
    const stale = await versionOf(id);
    value(await record(id, 'BASIC_WEIGHT', [80, 80]));
    const late = await commands().recordMeasurement(responsible, id, 'BASIC_HEIGHT', stale, {
      attempts: [175, 175],
      side: 'RIGHT',
    });
    expect(errorOf(late)?.code).toBe('NC-ASM-008');
    expect([...(evaluations.measurementRows.get(id)?.keys() ?? [])]).toEqual(['BASIC_WEIGHT']);
  });

  it('quitar un sitio del borrador', async () => {
    const id = await created();
    value(await record(id, 'BASIC_WEIGHT', [80, 80]));
    value(await commands().removeMeasurement(responsible, id, 'BASIC_WEIGHT', await versionOf(id)));
    expect(evaluations.measurementRows.get(id)?.size).toBe(0);
    const again = await commands().removeMeasurement(
      responsible,
      id,
      'BASIC_WEIGHT',
      await versionOf(id),
    );
    expect(errorOf(again)?.code).toBe('NC-ASM-002');
  });
});

describe('RF-14 · cerrar y enmendar', () => {
  it('RN-C01 · RN-C02 · no cierra con sitios del nivel sin consolidar ni con una tercera toma pendiente', async () => {
    const id = await created();
    await measuredAll(id, {
      BASIC_WEIGHT: [80, 80],
      BASIC_HEIGHT: [175, 175],
      GIRTH_WAIST: [86, 86],
    });
    expect(errorOf(await commands().close(responsible, id, await versionOf(id)))?.code).toBe(
      'NC-ASM-006',
    );
    value(await record(id, 'GIRTH_HIP', [98, 100]));
    expect(errorOf(await commands().close(responsible, id, await versionOf(id)))?.code).toBe(
      'NC-ASM-004',
    );
    value(await record(id, 'GIRTH_HIP', [98, 100, 98.1]));
    value(await commands().close(responsible, id, await versionOf(id)));
    expect((await evaluations.find(id))?.status).toBe('CLOSED');
    expect(outbox.types().at(-1)).toBe('assessment.evaluation.closed');
  });

  it('el caso Luis: ISAK 2 completa, 42 sitios consolidados, se cierra', async () => {
    const id = await created({ level: 'ISAK2' });
    await measuredAll(id, luisSeed.evaluations.current.measurements);
    const view = await queries().get(responsible, id);
    expect(view?.progress).toMatchObject({ missingSites: [], needsThirdSites: [], canClose: true });
    expect(view?.measurements).toHaveLength(42);
    value(await commands().close(responsible, id, await versionOf(id)));
  });

  it('RN-C07 · cerrada no se edita; se enmienda con motivo y la original queda como histórico', async () => {
    const id = await created();
    await measuredAll(id, {
      BASIC_WEIGHT: [80, 80],
      BASIC_HEIGHT: [175, 175],
      GIRTH_WAIST: [86, 86],
      GIRTH_HIP: [98, 98],
    });
    value(await commands().close(responsible, id, await versionOf(id)));
    expect(errorOf(await record(id, 'BASIC_WEIGHT', [81, 81]))?.code).toBe('NC-ASM-007');

    const revision = value(
      await commands().amend(responsible, id, 'Peso mal digitado en la consulta'),
    ).id;
    const draft = await queries().get(responsible, revision);
    expect(draft).toMatchObject({
      status: 'DRAFT',
      revision: 2,
      amendsEvaluationId: id,
      amendReason: 'Peso mal digitado en la consulta',
    });
    expect(draft?.measurements).toHaveLength(4);
    expect(errorOf(await commands().amend(responsible, id, 'Otra revisión a la vez'))?.code).toBe(
      'NC-ASM-009',
    );
    expect(errorOf(await commands().amend(responsible, revision, 'Sobre un borrador'))?.code).toBe(
      'NC-ASM-009',
    );

    value(await record(revision, 'BASIC_WEIGHT', [81, 81]));
    value(await commands().close(responsible, revision, await versionOf(revision)));
    expect((await evaluations.find(id))?.status).toBe('AMENDED');
    expect(outbox.types().slice(-2)).toEqual([
      'assessment.evaluation.amended',
      'assessment.evaluation.closed',
    ]);
    const list = await queries().list(responsible, PATIENT);
    expect(list?.find((e) => e.id === id)?.amendedByEvaluationId).toBe(revision);
  });

  it('RF-10 · las cerradas entran a la línea de tiempo, con el motivo si es una enmienda', async () => {
    const id = await created();
    await measuredAll(id, {
      BASIC_WEIGHT: [80, 80],
      BASIC_HEIGHT: [175, 175],
      GIRTH_WAIST: [86, 86],
      GIRTH_HIP: [98, 98],
    });
    expect(await new AssessmentTimelineSource(evaluations).entries(PATIENT, null, 5)).toEqual([]);
    value(await commands().close(responsible, id, await versionOf(id)));
    expect(await new AssessmentTimelineSource(evaluations).entries(PATIENT, null, 5)).toEqual([
      expect.objectContaining({
        kind: 'EVALUATION_CLOSED',
        refId: id,
        label: 'BASIC',
        detail: null,
      }),
    ]);
  });
});

describe('RN-C08 · bioimpedancia cargada a mano', () => {
  const reading = {
    deviceBrand: 'Marca',
    deviceModel: 'Modelo X',
    readings: [{ metric: 'FAT_PCT', value: 21.4, unit: '%', deviceLabel: 'Grasa corporal' }],
  };

  it('solo en evaluaciones de bioimpedancia o mixtas, y cierra con su lectura', async () => {
    const anthropometry = await created();
    expect(errorOf(await commands().addBiaReading(responsible, anthropometry, reading))?.code).toBe(
      'NC-ASM-011',
    );
    const bia = await created({ kind: 'BIA', level: null });
    expect(errorOf(await commands().close(responsible, bia, await versionOf(bia)))?.code).toBe(
      'NC-ASM-012',
    );
    const readingId = value(await commands().addBiaReading(responsible, bia, reading)).id;
    expect((await queries().get(responsible, bia))?.biaReadings[0]).toMatchObject({
      deviceBrand: 'Marca',
      deviceModel: 'Modelo X',
    });
    value(await commands().removeBiaReading(responsible, bia, readingId));
    value(await commands().addBiaReading(responsible, bia, reading));
    value(await commands().close(responsible, bia, await versionOf(bia)));
  });
});

describe('RN-B03 · lecturas auditadas', () => {
  it('la evaluación y la lista dejan un READ; lo que no se ve, no', async () => {
    const id = await created();
    await queries().get(responsible, id);
    await queries().list(responsible, PATIENT);
    expect(audit.entries.map((e) => [e.action, e.resourceType, e.patientId])).toEqual([
      ['READ', 'assessment.evaluation', PATIENT],
      ['READ', 'assessment.evaluation', PATIENT],
    ]);
    expect(await queries().get(responsible, '0192f0a0-0000-7000-8000-0000000000ee')).toBeNull();
    expect(await queries().list(responsible, '0192f0a0-0000-7000-8000-0000000000ee')).toBeNull();
    expect(audit.entries).toHaveLength(2);
  });
});

describe('RN-C05 · RF-12 · ETM del evaluador', () => {
  const study = {
    source: 'CALCULATED' as const,
    validFrom: '2026-07-15',
    sites: luisSeed.technicalErrorStudy.sites as { siteCode: string; pairs: [number, number][] }[],
  };

  it('G-04 · el estudio con los pares de Luis da 0.374 mm (2.35 %) agrupado y CMD95 1.04 mm', async () => {
    value(await temCommands().record(responsible, RESPONSIBLE, study));
    const view = await queries().technicalErrors(responsible, RESPONSIBLE);
    expect(view?.current).toHaveLength(6);
    const triceps = view?.current.find((row) => row.siteCode === 'SKF_TRICEPS');
    expect(triceps?.temAbs).toBeCloseTo(0.2828, 4);
    expect(triceps?.mdc95).toBeCloseTo(0.784, 3);
    expect(view?.pooled).toEqual([
      expect.objectContaining({ family: 'SKINFOLD', unit: 'mm', methodVersion: '1.0.0' }),
    ]);
    expect(view?.pooled[0]?.temAbs).toBeCloseTo(0.374, 3);
    expect(view?.pooled[0]?.temRelPct).toBeCloseTo(2.35, 2);
    expect(view?.pooled[0]?.mdc95).toBeCloseTo(1.04, 2);
    expect(outbox.types()).toEqual(['assessment.technicalerror.recorded']);
  });

  it('lo registra el propio evaluador, el dueño o un administrador; otro profesional, no', async () => {
    expect(errorOf(await temCommands().record(colleague, RESPONSIBLE, study))?.code).toBe(
      'NC-ASM-015',
    );
    expect(isOk(await temCommands().record(owner, RESPONSIBLE, study))).toBe(true);
    const stranger = await temCommands().record(
      owner,
      '0192f0a0-0000-7000-8000-0000000000ff',
      study,
    );
    expect(errorOf(stranger)?.code).toBe('NC-ASM-014');
  });

  it('el declarado vale por sitio y no entra al agrupado; el vigente es el de vigencia más reciente', async () => {
    value(
      await temCommands().record(responsible, RESPONSIBLE, {
        source: 'DECLARED',
        validFrom: '2026-08-01',
        sites: [{ siteCode: 'SKF_TRICEPS', temAbs: 0.3, temRelPct: 2.4 }],
      }),
    );
    value(
      await temCommands().record(responsible, RESPONSIBLE, { ...study, validFrom: '2026-07-15' }),
    );
    const view = await queries().technicalErrors(responsible, RESPONSIBLE);
    const triceps = view?.current.find((row) => row.siteCode === 'SKF_TRICEPS');
    expect(triceps).toMatchObject({ source: 'DECLARED', temAbs: 0.3, pairs: null });
    expect(view?.pooled[0]?.siteCodes).not.toContain('SKF_TRICEPS');
    const future = await temCommands().record(responsible, RESPONSIBLE, {
      ...study,
      validFrom: '2026-12-01',
    });
    expect(isOk(future)).toBe(true);
    expect(
      (await queries().technicalErrors(responsible, RESPONSIBLE))?.current.find(
        (row) => row.siteCode === 'SKF_TRICEPS',
      )?.source,
    ).toBe('DECLARED');
  });

  it('RN-C04 · pares fuera de rango o con media cero no se guardan', async () => {
    const out = await temCommands().record(responsible, RESPONSIBLE, {
      source: 'CALCULATED',
      validFrom: '2026-07-15',
      sites: [{ siteCode: 'SKF_TRICEPS', pairs: [[12, 90]] }],
    });
    expect(errorOf(out)?.code).toBe('NC-ASM-003');
    expect(errors.rows).toHaveLength(0);
  });
});

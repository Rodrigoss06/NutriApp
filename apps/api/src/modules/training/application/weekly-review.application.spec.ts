import {
  err,
  ok,
  type AuditEntry,
  type DomainEvent,
  type OrganizationId,
  type SecurityContext,
  type UserId,
} from '@nutricoach/shared-kernel';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ClinicalApi } from '../../clinical/index.js';
import type { TenancyApi } from '../../tenancy/index.js';
import { PROGRAM_VERSION_CONFLICT, type ProgramSession } from '../domain/program.js';
import {
  NO_PUBLISHED_PROGRAM,
  NO_THRESHOLDS,
  REVIEW_ALREADY_DECIDED,
  REVIEW_NOT_FOUND,
  REVIEW_SUPERSEDED,
  type WeeklyReviewRecord,
} from '../domain/weekly-review.js';
import { proposalSessionsFor, WeeklyReviewCommands } from './commands/weekly-review.commands.js';
import type { ProgramRecord, ProgramStore } from './ports/program.ports.js';
import type {
  PublishedProgramRef,
  ReviewDecision,
  ThresholdRow,
  ThresholdValues,
  WeeklyReviewStore,
} from './ports/weekly-review.ports.js';
import type { ProgramSnapshot } from './program-document.js';
import { WeeklyReviewQueries } from './queries/weekly-review.queries.js';
import { ReadinessThresholds } from './readiness-thresholds.js';
import { WeekCheckinSources, type WeekCheckin } from './week-checkins.js';
import { WeeklyReviewService } from './weekly-review.service.js';

const ORG = '0192f0a0-0000-7000-8000-00000000000a' as OrganizationId;
const PATIENT = '0192f0a0-0000-7000-8000-0000000000c1';
const MEMBER = '0192f0a0-0000-7000-8000-0000000000a1';
const context: SecurityContext = {
  organizationId: ORG,
  userId: '0192f0a0-0000-7000-8000-0000000000e1' as UserId,
  role: 'PROFESSIONAL',
  patientId: null,
  memberId: MEMBER as SecurityContext['memberId'],
};

/** Hoy es el 2026-11-16 en Lima: las semanas 1 (26-10 a 01-11) y 2 (02-11 a 08-11) cerraron; la 3 (09-11 a 15-11) también. */
const NOW = new Date('2026-11-16T15:00:00.000Z');
const START = '2026-10-26';

const THRESHOLD: ThresholdRow = {
  id: 'threshold-v3',
  organizationId: null,
  validFrom: '2026-10-21',
  neutralScore: 75,
  readinessGreenMin: 75,
  readinessRedBelow: 60,
  performanceMinPct: 90,
  weeklySleepMinHours: 6.5,
  fatigueSorenessAmberAbove: 4,
  nutritionMinPct: 80,
};

const checkin = (localDate: string, values: Partial<WeekCheckin> = {}): WeekCheckin => ({
  localDate,
  sessionMinutes: 60,
  sessionRpe: 7,
  sleepHours: 7.5,
  restingHrBpm: null,
  hrvMs: null,
  fatigue: 2,
  soreness: 2,
  performancePct: 100,
  nutritionCompliancePct: 90,
  menstrualSymptoms: null,
  stress: null,
  ...values,
});

const session = (sets: readonly { setType: string }[]): ProgramSession =>
  ({
    id: 's-1',
    position: 1,
    name: 'Sesión 1',
    dayOfWeek: null,
    notes: null,
    exercises: [
      {
        id: 'e-1',
        exerciseId: 'squat',
        sets: sets.map((set, i) => ({ setNo: i + 1, repsMin: 8, repsMax: 12, ...set })),
      },
    ],
  }) as unknown as ProgramSession;

const snapshot = (overrides: Partial<ProgramSnapshot> = {}): ProgramSnapshot =>
  ({
    programId: 'program-1',
    lineageId: 'lineage-1',
    patientId: PATIENT,
    name: 'Macrociclo',
    totalWeeks: 4,
    startDate: START,
    mesocycles: [
      {
        weeks: [
          { weekNo: 1, volumeFactor: 1.1 },
          { weekNo: 2, volumeFactor: 1 },
          { weekNo: 3, volumeFactor: null },
          { weekNo: 4, volumeFactor: 1 },
        ],
      },
    ],
    ...overrides,
  }) as unknown as ProgramSnapshot;

const record = (overrides: Partial<ProgramRecord> = {}): ProgramRecord =>
  ({
    id: 'program-1',
    organizationId: ORG,
    lineageId: 'lineage-1',
    patientId: PATIENT,
    versionNo: 1,
    status: 'PUBLISHED',
    origin: 'MANUAL',
    createdBy: 'user-1',
    version: 3,
    mesocycles: [
      {
        id: 'm-1',
        weeks: [1, 2, 3, 4].map((weekNo) => ({
          id: `w-${String(weekNo)}`,
          weekNo,
          volumeFactor: 1,
          sessions: [
            session([{ setType: 'WARMUP' }, { setType: 'WORKING' }, { setType: 'WORKING' }]),
          ],
        })),
      },
    ],
    ...overrides,
  }) as unknown as ProgramRecord;

class MemoryReviews implements WeeklyReviewStore {
  rows: WeeklyReviewRecord[] = [];
  thresholds: ThresholdRow[] = [THRESHOLD];
  published: PublishedProgramRef | null = {
    programId: 'program-1',
    patientId: PATIENT,
    lineageId: 'lineage-1',
  };
  raceLost = false;

  publishedPrograms() {
    return Promise.resolve(this.published ? [this.published] : []);
  }
  publishedProgramOf() {
    return Promise.resolve(this.published);
  }
  currentOf(_lineageId: string, weekNo: number) {
    return Promise.resolve(
      this.rows.find((r) => r.weekNo === weekNo && r.status === 'CURRENT') ?? null,
    );
  }
  insert(review: WeeklyReviewRecord) {
    this.rows.push(review);
    return Promise.resolve();
  }
  supersede(id: string) {
    this.rows = this.rows.map((r) => (r.id === id ? { ...r, status: 'SUPERSEDED' } : r));
    return Promise.resolve();
  }
  find(id: string) {
    return Promise.resolve(this.rows.find((r) => r.id === id) ?? null);
  }
  listOfLineage() {
    return Promise.resolve(this.rows);
  }
  decide(id: string, decision: ReviewDecision) {
    if (this.raceLost) return Promise.resolve(false);
    this.rows = this.rows.map((r) => (r.id === id ? { ...r, ...decision } : r));
    return Promise.resolve(true);
  }
  thresholdFor(organizationId: string, onDate: string) {
    const valid = this.thresholds.filter((t) => t.validFrom <= onDate);
    return Promise.resolve(
      valid.find((t) => t.organizationId === organizationId) ??
        valid.find((t) => t.organizationId === null) ??
        null,
    );
  }
  baseThreshold() {
    return Promise.resolve(this.thresholds.find((t) => t.organizationId === null) ?? null);
  }
  ownThresholdOn(organizationId: string, validFrom: string) {
    return Promise.resolve(
      this.thresholds.find(
        (t) => t.organizationId === organizationId && t.validFrom === validFrom,
      ) ?? null,
    );
  }
  insertThreshold(row: ThresholdRow) {
    this.thresholds.push(row);
    return Promise.resolve();
  }
  updateThreshold(id: string, values: ThresholdValues) {
    this.thresholds = this.thresholds.map((t) => (t.id === id ? { ...t, ...values } : t));
    return Promise.resolve();
  }
  /** El control semanal no usa el volumen ajustado (ADR-106). */
  volumeFactorVersions() {
    return Promise.resolve([]);
  }
  /** Ni el panel de fatiga (ADR-108). */
  fatiguePanelThresholdVersions() {
    return Promise.resolve([]);
  }
}

let reviews: MemoryReviews;
let checkins: WeekCheckin[];
/** Los check-in del domingo: su domingo y su alimentación (ADR-109). */
let weeklies: { weekDate: string; pct: number }[];
let events: DomainEvent[];
let audits: AuditEntry[];
let nextId: number;
let patientStatus: 'ACTIVE' | 'ARCHIVED' | null;
let writable: boolean;
let snapshots: Map<string, ProgramSnapshot>;
let records: Map<string, ProgramRecord>;
let saved: {
  weekId: string;
  factor: number | null | undefined;
  sessions: readonly ProgramSession[];
}[];
let touchFails: boolean;

const uow = {
  run: <T>(_c: SecurityContext, work: () => Promise<T>) => work(),
  query: <T>(_c: SecurityContext, work: () => Promise<T>) => work(),
};
const clock = { now: () => NOW };
const ids = {
  newId: () => {
    nextId += 1;
    return `id-${String(nextId)}` as never;
  },
};
const outbox = {
  append: (appended: readonly DomainEvent[]) => {
    events.push(...appended);
    return Promise.resolve();
  },
};
const audit = {
  record: (_c: SecurityContext, entry: AuditEntry) => {
    audits.push(entry);
    return Promise.resolve();
  },
};
const clinical = () =>
  ({
    patientRef: () =>
      Promise.resolve(patientStatus ? { timezone: 'America/Lima', status: patientStatus } : null),
    ensureRecordWritable: () =>
      Promise.resolve(
        writable ? ok({ timezone: 'America/Lima' }) : err({ code: 'NC-CLI-013', message: 'No.' }),
      ),
  }) as unknown as ClinicalApi;
const programs = () =>
  ({
    snapshot: (id: string) => Promise.resolve(snapshots.get(id) ?? null),
    latestSnapshot: () => Promise.resolve(snapshots.get('program-1') ?? null),
    find: (id: string) => Promise.resolve(records.get(id) ?? null),
    lineage: () =>
      Promise.resolve({
        lastVersionNo: 1,
        draftId: [...records.values()].find((r) => r.status === 'DRAFT')?.id ?? null,
      }),
    insert: (program: ProgramRecord) => {
      records.set(program.id, program);
      return Promise.resolve();
    },
    touch: () => Promise.resolve(!touchFails),
    saveWeek: (
      _org: string,
      weekId: string,
      phase: { volumeFactor?: number | null },
      sessions: readonly ProgramSession[],
    ) => {
      saved.push({ weekId, factor: phase.volumeFactor, sessions });
      return Promise.resolve();
    },
    status: (id: string) => Promise.resolve(records.get(id)?.status ?? null),
  }) as unknown as ProgramStore;

const sources = () => {
  const registry = new WeekCheckinSources();
  registry.register({
    checkins: (_p, from, to) =>
      Promise.resolve(checkins.filter((c) => c.localDate >= from && c.localDate <= to)),
    weeklyNutrition: (_p, from, to) =>
      Promise.resolve(
        weeklies.findLast((w) => w.weekDate >= from && w.weekDate <= to)?.pct ?? null,
      ),
  });
  return registry;
};
const service = () =>
  new WeeklyReviewService(clock, ids, clinical(), sources(), reviews, programs());
const commands = () =>
  new WeeklyReviewCommands(uow, clock, ids, outbox, clinical(), reviews, programs(), service());

beforeEach(() => {
  reviews = new MemoryReviews();
  checkins = [
    checkin('2026-10-26', { performancePct: 86 }),
    checkin('2026-10-28', { performancePct: 90 }),
    checkin('2026-10-30', { performancePct: 88 }),
    ...[4, 4, 5, 4, 4].map((fatigue, i) => checkin(`2026-11-0${String(2 + i)}`, { fatigue })),
  ];
  weeklies = [];
  events = [];
  audits = [];
  nextId = 0;
  patientStatus = 'ACTIVE';
  writable = true;
  snapshots = new Map([['program-1', snapshot()]]);
  records = new Map([['program-1', record()]]);
  saved = [];
  touchFails = false;
});

describe('RN-G16 · el control de las semanas cerradas', () => {
  it('G-39: rojo con 0.825 en la semana 1, ámbar con 0.90 en la 2; sin registros, falta registro', async () => {
    expect(await service().reviewProgram(ORG, 'program-1')).toBe(3);

    const [first, second, third] = reviews.rows;
    expect([first?.light, first?.suggestedAction]).toEqual(['RED', 'DELOAD']);
    expect(first?.suggestedVolumeFactor).toBeCloseTo(0.825, 10);
    expect([second?.light, second?.suggestedVolumeFactor]).toEqual(['AMBER', 0.9]);
    expect([third?.light, third?.suggestedAction, third?.plannedVolumeFactor]).toEqual([
      'NO_DATA',
      'MISSING_LOG',
      1,
    ]);
    expect(first).toMatchObject({
      methodCode: 'WEEKLY_REVIEW_JV',
      thresholdId: 'threshold-v3',
      status: 'CURRENT',
    });
  });

  it('con los mismos registros no cambia nada; un registro tardío reemplaza el control', async () => {
    await service().reviewProgram(ORG, 'program-1');
    expect(await service().reviewProgram(ORG, 'program-1')).toBe(0);

    checkins.push(checkin('2026-11-12', { fatigue: 2 }));
    expect(await service().reviewProgram(ORG, 'program-1')).toBe(1);
    expect(reviews.rows.filter((r) => r.weekNo === 3).map((r) => r.status)).toEqual([
      'SUPERSEDED',
      'CURRENT',
    ]);
  });

  it('P-22 · el check-in del domingo manda en la alimentación; sin él, los insumos no cambian y el control tampoco', async () => {
    await service().reviewProgram(ORG, 'program-1');
    const before = reviews.rows.find((r) => r.weekNo === 1);
    expect(before?.inputs).not.toHaveProperty('weeklyNutritionCompliancePct');

    // El domingo de la semana 1 declara 70 %: llega tarde (el martes) y reemplaza ese control.
    weeklies.push({ weekDate: '2026-11-01', pct: 70 });
    expect(await service().reviewProgram(ORG, 'program-1')).toBe(1);
    const week1 = reviews.rows.filter((r) => r.weekNo === 1);
    expect(week1.map((r) => r.status)).toEqual(['SUPERSEDED', 'CURRENT']);
    expect(week1[1]?.inputs).toMatchObject({ weeklyNutritionCompliancePct: 70 });
  });

  it('sin programa, sin paciente, archivado o sin umbrales no calcula', async () => {
    expect(await service().reviewProgram(ORG, 'otro')).toBe(0);
    patientStatus = null;
    expect(await service().reviewProgram(ORG, 'program-1')).toBe(0);
    patientStatus = 'ARCHIVED';
    expect(await service().reviewProgram(ORG, 'program-1')).toBe(0);
    patientStatus = 'ACTIVE';
    reviews.thresholds = [];
    expect(await service().reviewProgram(ORG, 'program-1')).toBe(0);
  });

  it('un registro fuera de rango no deja calcular esa semana', async () => {
    checkins = [checkin('2026-10-26', { fatigue: 9 })];
    expect(await service().reviewProgram(ORG, 'program-1')).toBe(2);
    expect(reviews.rows.map((r) => r.weekNo)).toEqual([2, 3]);
  });

  it('sin fuente de registros diarios registrada, falla con un mensaje claro', () => {
    expect(() => new WeekCheckinSources().get()).toThrow('tracking la registra');
  });

  it('calcular a pedido exige un programa publicado', async () => {
    expect(await commands().compute(context, PATIENT)).toEqual(ok({ written: 3 }));
    reviews.published = null;
    expect(await commands().compute(context, PATIENT)).toEqual(err(NO_PUBLISHED_PROGRAM));
    writable = false;
    expect((await commands().compute(context, PATIENT)).ok).toBe(false);
  });
});

describe('RN-F17 · la decisión del coach', () => {
  const decide = (weekNo: number, input: Parameters<WeeklyReviewCommands['decide']>[3]) => {
    const review = reviews.rows.find((r) => r.weekNo === weekNo && r.status === 'CURRENT');
    return commands().decide(context, PATIENT, review?.id ?? 'nada', input);
  };

  beforeEach(async () => {
    await service().reviewProgram(ORG, 'program-1');
  });

  it('mantener queda con autor, fecha y nota, sin versión nueva', async () => {
    const result = await decide(1, { decision: 'KEEP', volumeFactor: null, note: 'Sigue igual.' });

    expect(result.ok && result.value.draftProgramId).toBeNull();
    expect(reviews.rows[0]).toMatchObject({
      coachDecision: 'KEEP',
      decidedVolumeFactor: null,
      decisionNote: 'Sigue igual.',
      decidedBy: MEMBER,
      decidedAt: NOW,
    });
    expect(events.map((e) => e.type)).toEqual(['training.review.decided']);
  });

  it('ajustar crea el borrador con el factor en la semana siguiente; a mano, las series no cambian', async () => {
    const result = await decide(2, { decision: 'ADJUST', volumeFactor: 0.9, note: 'Bajamos.' });

    expect(result.ok && result.value.draftProgramId).toBe('id-4');
    expect(records.get('id-4')).toMatchObject({ status: 'DRAFT', versionNo: 2, version: 0 });
    expect(saved).toHaveLength(1);
    expect(saved[0]?.factor).toBe(0.9);
    expect(saved[0]?.sessions[0]?.exercises[0]?.sets).toHaveLength(3);
    expect(events.map((e) => e.type)).toEqual([
      'training.program.created',
      'training.program.updated',
      'training.review.decided',
    ]);
  });

  it('en una propuesta recalcula las series de trabajo con el factor (P-06) y usa el borrador que ya existía', async () => {
    records.set(
      'draft-1',
      record({ id: 'draft-1', status: 'DRAFT', origin: 'PROPOSAL', version: 5 }),
    );

    const result = await decide(2, { decision: 'DELOAD', volumeFactor: 0.65, note: 'Descarga.' });

    expect(result.ok && result.value.draftProgramId).toBe('draft-1');
    expect(saved[0]?.sessions[0]?.exercises[0]?.sets.map((s) => [s.setNo, s.setType])).toEqual([
      [1, 'WARMUP'],
      [2, 'WORKING'],
      [3, 'WORKING'],
    ]);
  });

  it('después de la última semana no hay semana siguiente: sin borrador', async () => {
    snapshots.set(
      'program-1',
      snapshot({ mesocycles: [{ weeks: [{ weekNo: 1, volumeFactor: 1.1 }] }] } as never),
    );
    records.set(
      'program-1',
      record({
        mesocycles: [{ id: 'm-1', weeks: [{ id: 'w-1', weekNo: 1, sessions: [] }] }],
      } as never),
    );

    const result = await decide(3, { decision: 'ADJUST', volumeFactor: 0.9, note: 'Ajuste.' });

    expect(result.ok && result.value.draftProgramId).toBeNull();
  });

  it('no se decide sobre un control de otro paciente, reemplazado o ya decidido', async () => {
    expect(
      await commands().decide(context, 'otro', reviews.rows[0]?.id ?? '', {
        decision: 'KEEP',
        volumeFactor: null,
        note: 'x',
      }),
    ).toEqual(err(REVIEW_NOT_FOUND));
    await reviews.supersede(reviews.rows[0]?.id ?? '');
    expect(
      await commands().decide(context, PATIENT, reviews.rows[0]?.id ?? '', {
        decision: 'KEEP',
        volumeFactor: null,
        note: 'x',
      }),
    ).toEqual(err(REVIEW_SUPERSEDED));
    reviews.raceLost = true;
    expect(await decide(2, { decision: 'KEEP', volumeFactor: null, note: 'x' })).toEqual(
      err(REVIEW_ALREADY_DECIDED),
    );
  });

  it('sin escritura no decide; si otro guardó el borrador antes, 409', async () => {
    writable = false;
    expect((await decide(2, { decision: 'KEEP', volumeFactor: null, note: 'x' })).ok).toBe(false);
    writable = true;
    touchFails = true;
    const conflict = await decide(2, { decision: 'ADJUST', volumeFactor: 0.9, note: 'x' });
    expect(conflict.ok ? null : conflict.error.code).toBe(PROGRAM_VERSION_CONFLICT.code);
  });
});

describe('P-06 · RN-F14 · las series de una propuesta con el factor nuevo', () => {
  it('series base × factor, redondeado y con mínimo 1, con el calentamiento primero', () => {
    const sessions = [session([{ setType: 'WARMUP' }, { setType: 'WORKING' }])];

    expect(proposalSessionsFor(sessions, 1.1)[0]?.exercises[0]?.sets.map((s) => s.setNo)).toEqual([
      1, 2, 3, 4,
    ]);
    expect(proposalSessionsFor(sessions, 0.1)[0]?.exercises[0]?.sets).toHaveLength(2);
    expect(
      proposalSessionsFor([session([{ setType: 'WARMUP' }])], 1)[0]?.exercises[0]?.sets,
    ).toHaveLength(1);
  });
});

describe('RF-42 · la lectura de los controles', () => {
  const queries = () =>
    new WeeklyReviewQueries(uow, audit, clinical(), reviews, programs(), sources());

  it('los vigentes por semana, con lo que dice el motor, los reemplazados y la versión que resultó', async () => {
    await service().reviewProgram(ORG, 'program-1');
    await commands().decide(context, PATIENT, reviews.rows[1]?.id ?? '', {
      decision: 'ADJUST',
      volumeFactor: 0.9,
      note: 'Bajamos.',
    });
    checkins.push(checkin('2026-11-12'));
    await service().reviewProgram(ORG, 'program-1');

    const result = await queries().list(context, PATIENT, null);

    if (!result.ok) throw new Error(result.error.code);
    const [first, second, third] = result.value.reviews;
    expect(first?.reasons).toEqual(['PERFORMANCE']);
    expect(first?.aggregates?.avgPerformancePct).toBe(88);
    // Sin estrés en el registro diario, sin promedio; solo informa (P-25, ADR-107).
    expect(first?.avgStress).toBeNull();
    expect(second?.resultingProgramStatus).toBe('DRAFT');
    expect(third?.supersededCount).toBe(1);
    expect(audits.map((a) => a.resourceType)).toEqual(['training.weekly_review']);
  });

  it('sin paciente, 404; un programa de otro, 404; sin programa, vacío', async () => {
    patientStatus = null;
    expect((await queries().list(context, PATIENT, null)).ok).toBe(false);
    patientStatus = 'ACTIVE';
    expect(await queries().list(context, PATIENT, 'otro')).toEqual(err(REVIEW_NOT_FOUND));
    reviews.published = null;
    expect(await queries().list(context, PATIENT, null)).toEqual(
      ok({ program: null, reviews: [] }),
    );
  });
});

describe('07 §11 · los umbrales de la organización', () => {
  const tenancy = {
    organization: () => Promise.resolve({ timezone: 'America/Lima' }),
  } as unknown as TenancyApi;
  const thresholds = () => new ReadinessThresholds(uow, clock, ids, outbox, tenancy, reviews);
  const values: ThresholdValues = {
    neutralScore: 70,
    readinessGreenMin: 75,
    readinessRedBelow: 60,
    performanceMinPct: 85,
    weeklySleepMinHours: 6.5,
    fatigueSorenessAmberAbove: 4,
    nutritionMinPct: 80,
  };

  it('rigen los de la V3 hasta que la organización crea su versión de hoy; un segundo cambio la corrige', async () => {
    expect(await thresholds().current(context)).toEqual(
      ok({ current: THRESHOLD, base: THRESHOLD, own: false }),
    );

    const first = await thresholds().save(context, values);
    const second = await thresholds().save(context, { ...values, performanceMinPct: 88 });

    expect(first.ok && first.value).toMatchObject({ organizationId: ORG, validFrom: '2026-11-16' });
    expect(second.ok && second.value.id).toBe(first.ok && first.value.id);
    const current = await thresholds().current(context);
    expect(current.ok && [current.value.own, current.value.current.performanceMinPct]).toEqual([
      true,
      88,
    ]);
    expect(events.map((e) => e.type)).toEqual([
      'training.threshold.changed',
      'training.threshold.changed',
    ]);
  });

  it('sin la fila base no hay umbrales', async () => {
    reviews.thresholds = [];
    expect(await thresholds().current(context)).toEqual(err(NO_THRESHOLDS));
  });
});

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
import type { AssessmentApi, EvolutionView } from '../../assessment/index.js';
import type { ClinicalApi } from '../../clinical/index.js';
import {
  REPORT_ALREADY_SENT,
  REPORT_EXISTS,
  REPORT_MESOCYCLE_NOT_FOUND,
  REPORT_NOT_CLOSED,
  REPORT_NOT_FOUND,
  REPORT_TEXTS_REQUIRED,
  REPORT_VERSION_CONFLICT,
  type MesocycleReportRecord,
  type MesocycleReportTexts,
  type ReportWorkout,
} from '../domain/mesocycle-report.js';
import { PROGRAM_NOT_FOUND } from '../domain/program.js';
import type { WeeklyReviewRecord } from '../domain/weekly-review.js';
import { MesocycleReportCommands } from './commands/mesocycle-report.commands.js';
import { MesocycleReportBuilder, type ReportBody } from './mesocycle-report-builder.js';
import { MesocycleReportSources } from './mesocycle-report-sources.js';
import type {
  MesocycleReportStore,
  ReportOneRmPoint,
  ReportSending,
} from './ports/mesocycle-report.ports.js';
import type { ProgramStore } from './ports/program.ports.js';
import type { WeeklyReviewStore } from './ports/weekly-review.ports.js';
import type { ProgramSnapshot } from './program-document.js';
import { MesocycleReportQueries } from './queries/mesocycle-report.queries.js';
import { WeekCheckinSources } from './week-checkins.js';
import type { WeeklyReviewService } from './weekly-review.service.js';

const ORG = '0192f0a0-0000-7000-8000-00000000000a' as OrganizationId;
const PATIENT = '0192f0a0-0000-7000-8000-0000000000c1';
const MEMBER = '0192f0a0-0000-7000-8000-0000000000a1';
const staff: SecurityContext = {
  organizationId: ORG,
  userId: '0192f0a0-0000-7000-8000-0000000000e1' as UserId,
  role: 'PROFESSIONAL',
  patientId: null,
  memberId: MEMBER as SecurityContext['memberId'],
};
const patient: SecurityContext = {
  organizationId: ORG,
  userId: '0192f0a0-0000-7000-8000-0000000000e2' as UserId,
  role: 'PATIENT',
  patientId: PATIENT as SecurityContext['patientId'],
  memberId: null,
};

/** Hoy es el 2026-11-11 en Lima: el mesociclo 1 (06/10 al 02/11) cerró; el 2 (03/11 al 30/11) no. */
const NOW = new Date('2026-11-11T15:00:00.000Z');

const TEXTS: MesocycleReportTexts = {
  achievement: 'Cumplió 12 de 12 sesiones.',
  limitation: 'Sueño en la semana 2.',
  adjustment: 'Mantener tres sesiones.',
  priority: 'Dormir 7 horas.',
};

const exercise = (exerciseId: string, name: string, muscle = 'CHEST') => ({
  exerciseId,
  name,
  primaryMuscles: [{ code: muscle }],
  secondaryMuscles: [],
  sets: [{ setType: 'WORKING' }, { setType: 'WORKING' }, { setType: 'WORKING' }],
});

const week = (weekNo: number) => ({
  weekNo,
  isDeload: false,
  sessions: [
    { exercises: [exercise('press-banca', 'Press banca')] },
    { exercises: [exercise('sentadilla', 'Sentadilla trasera', 'QUADRICEPS')] },
  ],
});

const SNAPSHOT = {
  programId: 'program-1',
  lineageId: 'lineage-1',
  patientId: PATIENT,
  versionNo: 1,
  name: 'Full Body',
  oneRmFormula: 'ONERM_EPLEY1985',
  startDate: '2026-10-06',
  mesocycles: [
    { position: 1, name: 'Mesociclo 1', weeks: [1, 2, 3, 4].map(week) },
    { position: 2, name: 'Mesociclo 2', weeks: [5, 6, 7, 8].map(week) },
  ],
} as unknown as ProgramSnapshot;

const DAY = 86_400_000;
const dateOf = (offset: number) =>
  new Date(Date.parse('2026-10-06T00:00:00Z') + offset * DAY).toISOString().slice(0, 10);

/** Dos sesiones por semana con sus 3 series; en la semana 3 una se saltó. */
const WORKOUTS: ReportWorkout[] = [1, 2, 3, 4, 5, 6].flatMap((weekNo) => [
  {
    outcome: 'COMPLETED' as const,
    programId: 'program-1',
    weekNo,
    sets: [1, 2, 3].map(() => ({ isWarmup: false, isCardio: false })),
  },
  {
    outcome: weekNo === 3 ? ('SKIPPED' as const) : ('COMPLETED' as const),
    programId: 'program-1',
    weekNo,
    sets: weekNo === 3 ? [] : [1, 2, 3].map(() => ({ isWarmup: false, isCardio: false })),
  },
]);

/** El press banca sube cada semana: récord en las semanas 2 a 4. */
const ONE_RM: ReportOneRmPoint[] = [0, 7, 14, 21].map((offset, index) => ({
  localDate: dateOf(offset),
  exerciseId: 'press-banca',
  formula: 'ONERM_EPLEY1985',
  estimated1rmKg: 56 + index * 3.5,
}));

const reviewInputs = (sleepHours: number) => ({
  days: [0, 1, 2, 3, 4, 5, 6].map(() => ({
    sessionMinutes: 60,
    sessionRpe: 7,
    sleepHours,
    restingHrBpm: null,
    hrvMs: null,
    fatigue: 3,
    soreness: 2,
    performancePct: 90,
    nutritionCompliancePct: 80,
    menstrualSymptoms: null,
  })),
  plannedVolumeFactor: 1,
  thresholds: {
    performanceMinPct: 90,
    weeklySleepMinHours: 6.5,
    fatigueSorenessAmberAbove: 4,
    nutritionMinPct: 80,
  },
});

const review = (
  weekNo: number,
  overrides: Partial<WeeklyReviewRecord> = {},
): WeeklyReviewRecord => ({
  id: `review-${String(weekNo)}`,
  organizationId: ORG,
  patientId: PATIENT,
  programId: 'program-1',
  weekNo,
  weekStart: dateOf((weekNo - 1) * 7),
  weekEnd: dateOf((weekNo - 1) * 7 + 6),
  methodCode: 'WEEKLY_REVIEW_JV',
  methodVersion: '3.1.0',
  engineVersion: '1.16.0',
  thresholdId: 'threshold',
  inputs: reviewInputs(7),
  inputsHash: '00',
  light: 'GREEN',
  plannedVolumeFactor: 1,
  suggestedVolumeFactor: null,
  suggestedAction: 'CONTINUE',
  computedAt: NOW,
  coachDecision: null,
  decidedVolumeFactor: null,
  decisionNote: null,
  decidedBy: null,
  decidedAt: null,
  resultingProgramId: null,
  status: 'CURRENT',
  ...overrides,
});

const EVOLUTION = {
  evaluations: [],
  sites: [
    { siteCode: 'BASIC_WEIGHT', points: [] },
    { siteCode: 'SKF_TRICEPS', points: [] },
  ],
  skinfoldSum6: { points: [], overall: null },
  metrics: [
    { metricCode: 'FAT_PCT', methodCode: 'DURNIN1974', points: [] },
    { metricCode: 'BMI', methodCode: 'BMI', points: [] },
  ],
  bia: [
    { metric: 'FAT_PCT', device: 'Tanita', points: [] },
    { metric: 'WATER_PCT', device: 'Tanita', points: [] },
  ],
} as unknown as EvolutionView;

const report = (overrides: Partial<MesocycleReportRecord> = {}): MesocycleReportRecord => ({
  id: 'report-1',
  organizationId: ORG,
  patientId: PATIENT,
  programLineageId: 'lineage-1',
  mesocyclePosition: 1,
  status: 'DRAFT',
  achievement: null,
  limitation: null,
  adjustment: null,
  priority: null,
  studentComment: null,
  studentCommentedAt: null,
  snapshot: null,
  sentAt: null,
  sentBy: null,
  createdBy: 'user-1',
  createdAt: NOW,
  updatedAt: NOW,
  version: 0,
  ...overrides,
});

class MemoryReports implements MesocycleReportStore {
  rows: MesocycleReportRecord[] = [];
  sent: ReportSending | null = null;
  raceLost = false;

  insert(row: MesocycleReportRecord) {
    this.rows.push(row);
    return Promise.resolve();
  }
  find(id: string) {
    return Promise.resolve(this.rows.find((row) => row.id === id) ?? null);
  }
  byPosition(lineageId: string, position: number) {
    return Promise.resolve(
      this.rows.find((r) => r.programLineageId === lineageId && r.mesocyclePosition === position) ??
        null,
    );
  }
  ofLineage(lineageId: string) {
    return Promise.resolve(this.rows.filter((row) => row.programLineageId === lineageId));
  }
  saveTexts(id: string, expectedVersion: number, texts: MesocycleReportTexts) {
    const row = this.rows.find((r) => r.id === id);
    if (!row || row.version !== expectedVersion || row.status !== 'DRAFT') {
      return Promise.resolve(false);
    }
    this.#replace({ ...row, ...texts, version: row.version + 1 });
    return Promise.resolve(true);
  }
  send(id: string, expectedVersion: number, texts: MesocycleReportTexts, sending: ReportSending) {
    const row = this.rows.find((r) => r.id === id);
    if (this.raceLost || !row || row.version !== expectedVersion) return Promise.resolve(false);
    this.sent = sending;
    this.#replace({
      ...row,
      ...texts,
      status: 'SENT',
      snapshot: sending.snapshot,
      sentAt: sending.sentAt,
      sentBy: sending.sentBy,
      version: row.version + 1,
    });
    return Promise.resolve(true);
  }
  saveComment(id: string, comment: string | null, at: Date) {
    const row = this.rows.find((r) => r.id === id);
    if (!row || row.status !== 'SENT') return Promise.resolve(false);
    this.#replace({ ...row, studentComment: comment, studentCommentedAt: comment ? at : null });
    return Promise.resolve(true);
  }
  sentOfPatient(patientId: string) {
    return Promise.resolve(
      this.rows.filter((row) => row.patientId === patientId && row.status === 'SENT'),
    );
  }
  #replace(row: MesocycleReportRecord) {
    this.rows = this.rows.map((r) => (r.id === row.id ? row : r));
  }
}

let reports: MemoryReports;
let reviews: WeeklyReviewRecord[];
let published: { programId: string; patientId: string; lineageId: string } | null;
let latest: ProgramSnapshot | null;
let points: ReportOneRmPoint[];
let evolution: EvolutionView | null;
let events: DomainEvent[];
let audits: AuditEntry[];
let reviewed: string[];
let patientExists: boolean;
let writable: boolean;
let consent: boolean;
let nextId: number;

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
const NOT_WRITABLE = { code: 'NC-CLI-013', message: 'Sin acceso de escritura.' };
const NO_CONSENT = { code: 'NC-CLI-002', rule: 'RN-B01', message: 'Sin HEALTH_DATA.' };
const clinical = {
  patientRef: () => Promise.resolve(patientExists ? { timezone: 'America/Lima' } : null),
  ensureRecordWritable: () =>
    Promise.resolve(writable ? ok({ timezone: 'America/Lima' }) : err(NOT_WRITABLE)),
  ensureHealthDataConsent: () => Promise.resolve(consent ? ok(undefined) : err(NO_CONSENT)),
  lockPatient: () => Promise.resolve(),
} as unknown as ClinicalApi;
const programs = {
  snapshot: (id: string) => Promise.resolve(id === 'program-1' ? SNAPSHOT : null),
  latestSnapshot: () => Promise.resolve(latest),
  listByPatient: () =>
    Promise.resolve([
      { id: 'program-1', lineageId: 'lineage-1' },
      { id: 'other', lineageId: 'lineage-2' },
    ]),
} as unknown as ProgramStore;
const weeklyStore = {
  listOfLineage: () => Promise.resolve(reviews),
  publishedProgramOf: () => Promise.resolve(published),
} as unknown as WeeklyReviewStore;
const weeklyService = {
  reviewProgram: (_org: string, programId: string) => {
    reviewed.push(programId);
    return Promise.resolve(0);
  },
} as unknown as WeeklyReviewService;

const builder = () => {
  const checkins = new WeekCheckinSources();
  checkins.register({
    checkins: () => Promise.resolve([{ stress: 2 }, { stress: 4 }] as never),
    weeklyNutrition: () => Promise.resolve(null),
  });
  const sources = new MesocycleReportSources();
  sources.register({
    workouts: () => Promise.resolve(WORKOUTS),
    oneRm: () => Promise.resolve(points),
  });
  const assessment = {
    evolutionUntil: () => Promise.resolve(evolution),
  } as unknown as AssessmentApi;
  return new MesocycleReportBuilder(programs, weeklyStore, checkins, sources, assessment);
};
const commands = () =>
  new MesocycleReportCommands(
    uow,
    clock,
    ids,
    outbox,
    reports,
    programs,
    clinical,
    builder(),
    weeklyService,
  );
const queries = () =>
  new MesocycleReportQueries(
    uow,
    clock,
    audit,
    clinical,
    reports,
    programs,
    weeklyStore,
    builder(),
  );

beforeEach(() => {
  reports = new MemoryReports();
  reviews = [
    review(1, { light: 'RED', suggestedAction: 'DELOAD' }),
    review(2, { inputs: reviewInputs(30) }),
  ];
  published = { programId: 'program-1', patientId: PATIENT, lineageId: 'lineage-1' };
  latest = SNAPSHOT;
  points = ONE_RM;
  evolution = EVOLUTION;
  events = [];
  audits = [];
  reviewed = [];
  patientExists = true;
  writable = true;
  consent = true;
  nextId = 0;
});

describe('RN-G19 · el borrador del informe', () => {
  it('se crea uno por mesociclo del programa del alumno, con su evento', async () => {
    const created = await commands().create(staff, PATIENT, {
      programId: 'program-1',
      mesocyclePosition: 1,
    });
    expect(created).toEqual(ok({ id: 'id-1', version: 0 }));
    expect(reports.rows[0]).toMatchObject({
      status: 'DRAFT',
      programLineageId: 'lineage-1',
      mesocyclePosition: 1,
      createdBy: staff.userId,
    });
    expect(events.map((e) => e.type)).toEqual(['training.report.created']);
    expect(
      await commands().create(staff, PATIENT, { programId: 'program-1', mesocyclePosition: 1 }),
    ).toEqual(err(REPORT_EXISTS));
  });

  it('sin acceso, con un programa ajeno o inexistente, o un mesociclo que no está, no se crea', async () => {
    const input = { programId: 'program-1', mesocyclePosition: 1 };
    writable = false;
    expect(await commands().create(staff, PATIENT, input)).toEqual(err(NOT_WRITABLE));
    writable = true;
    expect(await commands().create(staff, PATIENT, { ...input, programId: 'nope' })).toEqual(
      err(PROGRAM_NOT_FOUND),
    );
    expect(await commands().create(staff, 'otro-alumno', input)).toEqual(err(PROGRAM_NOT_FOUND));
    expect(await commands().create(staff, PATIENT, { ...input, mesocyclePosition: 3 })).toEqual(
      err(REPORT_MESOCYCLE_NOT_FOUND),
    );
    expect(reports.rows).toEqual([]);
  });

  it('los textos con la versión leída; la auditoría nombra los que cambiaron', async () => {
    reports.rows = [report({ achievement: 'Antes' })];
    const saved = await commands().saveTexts(staff, 'report-1', 0, {
      ...TEXTS,
      achievement: '  Antes  ',
      limitation: '   ',
    });
    expect(saved).toEqual(ok({ version: 1 }));
    expect(reports.rows[0]).toMatchObject({ achievement: 'Antes', limitation: null, version: 1 });
    expect(events[0]?.payload).toMatchObject({ fields: ['adjustment', 'priority'] });
    expect(await commands().saveTexts(staff, 'report-1', 0, TEXTS)).toEqual(
      err(REPORT_VERSION_CONFLICT),
    );
  });

  it('no se guardan textos de un informe que no existe, sin acceso o ya enviado', async () => {
    expect(await commands().saveTexts(staff, 'nope', 0, TEXTS)).toEqual(err(REPORT_NOT_FOUND));
    reports.rows = [report()];
    writable = false;
    expect(await commands().saveTexts(staff, 'report-1', 0, TEXTS)).toEqual(err(NOT_WRITABLE));
    writable = true;
    reports.rows = [report({ status: 'SENT' })];
    expect(await commands().saveTexts(staff, 'report-1', 0, TEXTS)).toEqual(
      err(REPORT_ALREADY_SENT),
    );
  });
});

describe('RN-G19 · RN-D08 · enviar el informe', () => {
  it('cerrado y con los cuatro textos, congela lo que muestra con su hash, después de controlar las semanas que falten', async () => {
    reports.rows = [report({ ...TEXTS, version: 2 })];
    expect(await commands().send(staff, 'report-1', 2)).toEqual(ok({ version: 3 }));
    expect(reviewed).toEqual(['program-1']);
    expect(reports.rows[0]).toMatchObject({ status: 'SENT', sentBy: MEMBER, sentAt: NOW });
    expect(reports.sent?.snapshotSchemaVersion).toBe(1);
    expect(reports.sent?.snapshotHash).toMatch(/^[0-9a-f]{64}$/);
    const body = reports.sent?.snapshot as ReportBody;
    expect(body.numbers?.outputs.total).toMatchObject({ plannedSets: 24, doneSets: 21 });
    expect(events.map((e) => e.type)).toEqual(['training.report.sent']);
  });

  it('no se envía si no existe, sin acceso, ya enviado o con otra versión', async () => {
    expect(await commands().send(staff, 'nope', 0)).toEqual(err(REPORT_NOT_FOUND));
    reports.rows = [report({ ...TEXTS })];
    writable = false;
    expect(await commands().send(staff, 'report-1', 0)).toEqual(err(NOT_WRITABLE));
    writable = true;
    expect(await commands().send(staff, 'report-1', 5)).toEqual(err(REPORT_VERSION_CONFLICT));
    reports.rows = [report({ ...TEXTS, status: 'SENT' })];
    expect(await commands().send(staff, 'report-1', 0)).toEqual(err(REPORT_ALREADY_SENT));
  });

  it('el mesociclo tiene que estar en el programa y cerrado, y los textos completos', async () => {
    reports.rows = [report({ ...TEXTS })];
    latest = null;
    expect(await commands().send(staff, 'report-1', 0)).toEqual(err(REPORT_MESOCYCLE_NOT_FOUND));
    latest = SNAPSHOT;
    reports.rows = [report({ ...TEXTS, mesocyclePosition: 2 })];
    expect(await commands().send(staff, 'report-1', 0)).toEqual(err(REPORT_NOT_CLOSED));
    reports.rows = [report({ ...TEXTS, priority: null })];
    expect(await commands().send(staff, 'report-1', 0)).toEqual(err(REPORT_TEXTS_REQUIRED));
    expect(reviewed).toEqual([]);
  });

  it('si otro lo cambió entre la lectura y el envío, conflicto; sin miembro del equipo, no se envía', async () => {
    reports.rows = [report({ ...TEXTS })];
    reports.raceLost = true;
    expect(await commands().send(staff, 'report-1', 0)).toEqual(err(REPORT_VERSION_CONFLICT));
    await expect(commands().send({ ...staff, memberId: null }, 'report-1', 0)).rejects.toThrow(
      /miembro del equipo/,
    );
  });
});

describe('RN-G19 · el comentario del alumno', () => {
  it('lo escribe en un informe enviado, sin espacios de más; vacío lo borra', async () => {
    reports.rows = [report({ status: 'SENT', snapshot: {} })];
    expect(await commands().comment(patient, 'report-1', '  Me siento mejor.  ')).toEqual(
      ok({ studentComment: 'Me siento mejor.', studentCommentedAt: NOW }),
    );
    expect(events[0]).toMatchObject({
      type: 'training.report.commented',
      payload: { fields: ['student_comment'] },
    });
    expect(await commands().comment(patient, 'report-1', '  ')).toEqual(
      ok({ studentComment: null, studentCommentedAt: null }),
    );
  });

  it('no comenta sin sesión de alumno, lo ajeno, un borrador ni sin HEALTH_DATA', async () => {
    expect((await commands().comment(staff, 'report-1', 'x')).ok).toBe(false);
    expect(await commands().comment(patient, 'nope', 'x')).toEqual(err(REPORT_NOT_FOUND));
    reports.rows = [report({ status: 'SENT', patientId: 'otro-alumno' })];
    expect(await commands().comment(patient, 'report-1', 'x')).toEqual(err(REPORT_NOT_FOUND));
    reports.rows = [report()];
    expect(await commands().comment(patient, 'report-1', 'x')).toEqual(err(REPORT_NOT_FOUND));
    consent = false;
    expect(await commands().comment(patient, 'report-1', 'x')).toEqual(err(NO_CONSENT));
  });
});

describe('RN-G19 · P-29 · lo que muestra el informe', () => {
  it('lo hecho en las semanas de la línea, los récords contra el mejor anterior y el resumen de cada control', async () => {
    const found = await builder().mesocycleOf('lineage-1', 1);
    if (!found) throw new Error('Falta el mesociclo.');
    const body = await builder().build(found.snapshot, found.mesocycle, '2026-11-11');
    const numbers = body.numbers?.outputs;
    expect(
      numbers?.weeks.map((w) => [w.plannedSets, w.doneSets, w.sessionsDone, w.records]),
    ).toEqual([
      [6, 6, 2, 0],
      [6, 6, 2, 1],
      [6, 3, 1, 1],
      [6, 6, 2, 1],
    ]);
    expect(numbers?.weeks[0]).toMatchObject({ sleepHours: 7, stress: 3, fatigue: 3 });
    expect(numbers?.weeks[1]).toMatchObject({ sleepHours: null, stress: 3 });
    expect(body.reviews.map((r) => [r.weekNo, r.light])).toEqual([
      [1, 'RED'],
      [2, 'GREEN'],
    ]);
    expect(body.exerciseNames).toEqual({ 'press-banca': 'Press banca' });
    expect(body.program.oneRmMethod).toEqual({ code: 'ONERM_EPLEY1985', version: '1.0.0' });
    expect(body.evolution?.sites.map((s) => s.siteCode)).toEqual(['BASIC_WEIGHT']);
    expect(body.evolution?.metrics.map((m) => m.metricCode)).toEqual(['FAT_PCT']);
    expect(body.evolution?.bia.map((b) => b.metric)).toEqual(['FAT_PCT']);
    expect(body.evolution?.skinfoldSum6).toBeNull();
  });

  it('antes de que empiece no hay números; a mitad del mesociclo, solo las semanas que empezaron', async () => {
    const found = await builder().mesocycleOf('lineage-1', 2);
    if (!found) throw new Error('Falta el mesociclo.');
    evolution = null;
    expect(
      (await builder().build(found.snapshot, found.mesocycle, '2026-11-02')).numbers,
    ).toBeNull();
    const midway = await builder().build(found.snapshot, found.mesocycle, '2026-11-11');
    expect(midway.numbers?.outputs.weeks.map((w) => w.weekNo)).toEqual([5, 6]);
    expect(midway.mesocycle.weeks.map((w) => w.started)).toEqual([true, true, false, false]);
    expect(midway.evolution).toBeNull();
  });

  it('un récord de un ejercicio que no está en el programa sale como «Ejercicio»; un dato inválido no se congela', async () => {
    points = [
      ...ONE_RM,
      {
        localDate: '2026-10-07',
        exerciseId: 'otro',
        formula: 'ONERM_EPLEY1985',
        estimated1rmKg: 40,
      },
      {
        localDate: '2026-10-08',
        exerciseId: 'otro',
        formula: 'ONERM_EPLEY1985',
        estimated1rmKg: 42,
      },
    ];
    const found = await builder().mesocycleOf('lineage-1', 1);
    if (!found) throw new Error('Falta el mesociclo.');
    const body = await builder().build(found.snapshot, found.mesocycle, '2026-11-11');
    expect(body.exerciseNames.otro).toBe('Ejercicio');
    points = [{ ...ONE_RM[0], estimated1rmKg: 0 } as ReportOneRmPoint];
    await expect(builder().build(found.snapshot, found.mesocycle, '2026-11-11')).rejects.toThrow(
      /NC-ENG-418/,
    );
  });

  it('sin la última versión publicada de la línea no hay mesociclo; sin fuente registrada, falla al usarla', async () => {
    latest = null;
    expect(await builder().mesocycleOf('lineage-1', 1)).toBeNull();
    expect(() => new MesocycleReportSources().get()).toThrow(/analytics la registra/);
  });
});

describe('RN-G19 · RN-B03 · leer los informes', () => {
  it('el equipo ve los mesociclos del programa publicado con su informe, y la lectura queda auditada', async () => {
    reports.rows = [report({ status: 'SENT', sentAt: NOW, studentComment: 'Bien', snapshot: {} })];
    const result = await queries().list(staff, PATIENT, null);
    if (!result.ok) throw new Error('Debía listar.');
    expect(result.value.program).toEqual({
      programId: 'program-1',
      lineageId: 'lineage-1',
      name: 'Full Body',
    });
    expect(
      result.value.mesocycles.map((m) => [
        m.position,
        m.closed,
        m.report?.status ?? null,
        m.report?.hasComment,
      ]),
    ).toEqual([
      [1, true, 'SENT', true],
      [2, false, null, undefined],
    ]);
    expect(audits).toHaveLength(1);
  });

  it('con un programa pedido, debe ser del alumno; sin programa publicado, nada que listar', async () => {
    expect((await queries().list(staff, PATIENT, 'program-1')).ok).toBe(true);
    expect(await queries().list(staff, PATIENT, 'nope')).toEqual(err(PROGRAM_NOT_FOUND));
    published = null;
    expect(await queries().list(staff, PATIENT, null)).toEqual(
      ok({ program: null, mesocycles: [] }),
    );
    patientExists = false;
    expect((await queries().list(staff, PATIENT, null)).ok).toBe(false);
  });

  it('el borrador se calcula al leerlo; el enviado es lo congelado; sin el mesociclo, sin cuerpo', async () => {
    reports.rows = [report()];
    const draft = await queries().get(staff, 'report-1');
    expect(draft.ok && draft.value.closed).toBe(true);
    expect(draft.ok && draft.value.body?.numbers?.outputs.total.plannedSets).toBe(24);
    latest = null;
    const orphan = await queries().get(staff, 'report-1');
    expect(orphan.ok && [orphan.value.body, orphan.value.closed]).toEqual([null, false]);
    const frozen = { schemaVersion: 1 } as unknown as ReportBody;
    reports.rows = [report({ status: 'SENT', snapshot: frozen })];
    const sent = await queries().get(staff, 'report-1');
    expect(sent.ok && sent.value.body).toBe(frozen);
    expect(await queries().get(staff, 'nope')).toEqual(err(REPORT_NOT_FOUND));
  });

  it('el alumno ve sus informes enviados y no un borrador ni uno ajeno', async () => {
    const body = {
      program: { name: 'Full Body' },
      mesocycle: { name: 'Mesociclo 1', startDate: '2026-10-06', endDate: '2026-11-02' },
    } as unknown as ReportBody;
    reports.rows = [
      report({ status: 'SENT', snapshot: body, sentAt: NOW }),
      report({ id: 'draft', mesocyclePosition: 2 }),
    ];
    expect(await queries().mine(patient)).toEqual([
      {
        id: 'report-1',
        programName: 'Full Body',
        mesocyclePosition: 1,
        mesocycleName: 'Mesociclo 1',
        startDate: '2026-10-06',
        endDate: '2026-11-02',
        sentAt: NOW,
        hasComment: false,
      },
    ]);
    expect(await queries().mine(staff)).toEqual([]);
    expect((await queries().myReport(patient, 'report-1')).ok).toBe(true);
    expect(await queries().myReport(patient, 'draft')).toEqual(err(REPORT_NOT_FOUND));
    expect(await queries().myReport(staff, 'report-1')).toEqual(err(REPORT_NOT_FOUND));
  });
});

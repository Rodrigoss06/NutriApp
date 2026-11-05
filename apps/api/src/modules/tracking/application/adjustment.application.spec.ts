import {
  domainError,
  err,
  isErr,
  ok,
  type AuditEntry,
  type DomainEvent,
  type OrganizationId,
  type SecurityContext,
  type UserId,
} from '@nutricoach/shared-kernel';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ClinicalApi } from '../../clinical/index.js';
import { AdjustmentCommands, type AdjustmentInput } from './commands/adjustment.commands.js';
import type {
  NewAdjustment,
  RecordStore,
  StoredAdjustment,
  StoredNote,
} from './ports/records.ports.js';
import { PatientRecordsQueries } from './queries/patient-records.queries.js';

const ORG = '0192f0a0-0000-7000-8000-00000000000a' as OrganizationId;
const PATIENT = '0192f0a0-0000-7000-8000-0000000000c1';
const MEMBER = '0192f0a0-0000-7000-8000-0000000000a1';
const DAY = '2026-11-04';
const context: SecurityContext = {
  organizationId: ORG,
  userId: '0192f0a0-0000-7000-8000-0000000000e1' as UserId,
  role: 'PROFESSIONAL',
  patientId: null,
  memberId: MEMBER as SecurityContext['memberId'],
};
const NO_WRITE = domainError({ code: 'NC-CLI-024', message: 'Sin acceso de escritura.' });

const food = {
  id: 'food-1',
  clientId: 'c-1',
  localDate: DAY,
  loggedAt: new Date('2026-11-04T13:00:00.000Z'),
  mealSlotCode: 'BREAKFAST',
  planId: null,
  itemType: 'FOOD' as const,
  itemName: 'Avena',
  exchangeGroupCode: null,
  servings: null,
  grams: 50,
  householdText: null,
  kcal: 190,
  choG: 30,
  proteinG: 6.5,
  fatG: 3.5,
  inPlan: false,
  status: 'ACTIVE' as const,
};
const water = (id: string, volumeMl: number) => ({
  id,
  clientId: id,
  localDate: DAY,
  loggedAt: new Date('2026-11-04T14:00:00.000Z'),
  volumeMl,
  status: 'ACTIVE' as const,
});
const set = {
  id: 'set-1',
  workoutLogId: 'workout-1',
  localDate: DAY,
  exerciseId: 'squat',
  exerciseName: 'Sentadilla goblet',
  setNo: 1,
  isWarmup: false,
  reps: 8,
  loadKg: 60,
  rir: null,
  rpe: null,
  durationSeconds: null,
  distanceM: null,
  tonnageKg: 480,
  status: 'ACTIVE' as const,
};
const workout = {
  id: 'workout-1',
  clientId: 'w-1',
  localDate: DAY,
  sessionId: 'session-1',
  outcome: 'COMPLETED' as const,
  durationMinutes: 40,
  sessionRpe: 7,
  tonnageKg: 480,
  setCount: 1,
  status: 'ACTIVE' as const,
};
const note: StoredNote = {
  id: 'note-1',
  clientId: 'n-1',
  localDate: DAY,
  body: 'Me dolió la rodilla.',
  createdAt: new Date('2026-11-04T15:00:00.000Z'),
  readAt: null,
};

let adjustments: StoredAdjustment[];
let readNotes: Set<string>;
let events: DomainEvent[];
let audits: AuditEntry[];
let visible: boolean;
let writable: boolean;
let sequence: number;

const store = {
  dayFoodLogs: () => Promise.resolve([food]),
  dayHydration: () => Promise.resolve([water('water-1', 250), water('water-2', 250)]),
  dayNotes: () => Promise.resolve([note]),
  dayMetrics: () =>
    Promise.resolve([
      {
        id: 'metric-1',
        clientId: 'm-1',
        localDate: DAY,
        metricCode: 'BODY_WEIGHT',
        value: 62,
        status: 'ACTIVE' as const,
      },
    ]),
  activeCheckin: () => Promise.resolve({ id: 'checkin-1' }),
  dayWorkouts: () => Promise.resolve([workout]),
  daySets: () =>
    Promise.resolve([
      set,
      { ...set, id: 'set-2', status: 'VOIDED' as const, workoutLogId: 'other' },
    ]),
  dayAdjustments: () => Promise.resolve(adjustments),
  metricRange: () => Promise.resolve({ min: 20, max: 300 }),
  insertAdjustment: (row: NewAdjustment) => {
    sequence += 1;
    adjustments.push({ ...row, createdAt: new Date(Date.UTC(2026, 10, 4, 16, sequence)) });
    return Promise.resolve();
  },
  adjustment: (id: string) => Promise.resolve(adjustments.find((a) => a.id === id) ?? null),
  unreadNotes: () => Promise.resolve(readNotes.has(note.id) ? [] : [note]),
  markNotesRead: (_patientId: string, ids: readonly string[]) => {
    const marked = ids.filter((id) => id === note.id && !readNotes.has(id));
    for (const id of marked) readNotes.add(id);
    return Promise.resolve(marked.map((id) => ({ id, localDate: DAY })));
  },
} as unknown as RecordStore;

const uow = {
  run: <T>(_c: SecurityContext, work: () => Promise<T>) => work(),
  query: <T>(_c: SecurityContext, work: () => Promise<T>) => work(),
};
const clock = { now: () => new Date('2026-11-04T17:00:00.000Z') };
const ids = {
  newId: () => {
    sequence += 1;
    return `0192f0a0-0000-7000-8000-${String(sequence).padStart(12, '0')}` as never;
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
const clinical = {
  patientRef: () => Promise.resolve(visible ? { id: PATIENT, timezone: 'America/Lima' } : null),
  ensureRecordWritable: () => Promise.resolve(writable ? ok({ id: PATIENT }) : err(NO_WRITE)),
} as unknown as ClinicalApi;

const commands = () => new AdjustmentCommands(uow, clock, ids, outbox, store, clinical);
const queries = () => new PatientRecordsQueries(uow, audit, store, clinical);
const adjust = (input: Partial<AdjustmentInput>) =>
  commands().adjust(context, PATIENT, {
    targetType: 'HYDRATION',
    targetId: 'water-2',
    targetLocalDate: DAY,
    action: 'EXCLUDE',
    correctedValues: null,
    reason: 'Lo registró dos veces por error.',
    ...input,
  });
const codeOf = async (input: Partial<AdjustmentInput>) => {
  const result = await adjust(input);
  return isErr(result) ? result.error.code : null;
};

beforeEach(() => {
  adjustments = [];
  readNotes = new Set();
  events = [];
  audits = [];
  visible = true;
  writable = true;
  sequence = 0;
});

describe('RN-G02 · ajustar un registro del paciente', () => {
  it('excluir guarda autor y motivo, y deja su evento con los nombres de lo corregido', async () => {
    const result = await adjust({});

    expect(isErr(result) ? null : result.value).toMatchObject({
      action: 'EXCLUDE',
      correctedValues: null,
      authorMemberId: MEMBER,
      reason: 'Lo registró dos veces por error.',
    });
    expect(events.map((event) => [event.type, event.payload])).toEqual([
      [
        'tracking.log.adjusted',
        {
          patientId: PATIENT,
          localDate: DAY,
          targetType: 'HYDRATION',
          action: 'EXCLUDE',
          fields: ['status'],
        },
      ],
    ]);
  });

  it('ADR-085: corregir cada tipo con lo suyo y lo que se deriva', async () => {
    const values = async (input: Partial<AdjustmentInput>) => {
      const result = await adjust({ action: 'CORRECT', ...input });
      return isErr(result) ? result.error.code : result.value.correctedValues;
    };
    expect(
      await values({ targetType: 'FOOD', targetId: 'food-1', correctedValues: { grams: 100 } }),
    ).toMatchObject({
      grams: 100,
      kcal: 380,
    });
    expect(
      await values({
        targetType: 'HYDRATION',
        targetId: 'water-1',
        correctedValues: { volumeMl: 300 },
      }),
    ).toEqual({
      volumeMl: 300,
    });
    expect(
      await values({ targetType: 'SET', targetId: 'set-1', correctedValues: { loadKg: 50 } }),
    ).toEqual({
      reps: 8,
      loadKg: 50,
      tonnageKg: 400,
    });
    expect(
      await values({
        targetType: 'WORKOUT',
        targetId: 'workout-1',
        correctedValues: { sessionRpe: 8 },
      }),
    ).toEqual({
      durationMinutes: 40,
      sessionRpe: 8,
    });
    expect(
      await values({
        targetType: 'METRIC',
        targetId: 'metric-1',
        correctedValues: { value: 61.5 },
      }),
    ).toEqual({
      value: 61.5,
    });
  });

  it('una corrección que no corresponde al registro, o un peso fuera de rango (RN-C04), no se guarda', async () => {
    expect(
      await codeOf({
        targetType: 'FOOD',
        targetId: 'food-1',
        action: 'CORRECT',
        correctedValues: { servings: 1 },
      }),
    ).toBe('NC-TRK-013');
    expect(
      await codeOf({
        targetType: 'HYDRATION',
        targetId: 'water-1',
        action: 'CORRECT',
        correctedValues: {},
      }),
    ).toBe('NC-TRK-013');
    expect(
      await codeOf({
        targetType: 'SET',
        targetId: 'set-1',
        action: 'CORRECT',
        correctedValues: {},
      }),
    ).toBe('NC-TRK-013');
    expect(
      await codeOf({
        targetType: 'WORKOUT',
        targetId: 'workout-1',
        action: 'CORRECT',
        correctedValues: {},
      }),
    ).toBe('NC-TRK-013');
    expect(
      await codeOf({
        targetType: 'METRIC',
        targetId: 'metric-1',
        action: 'CORRECT',
        correctedValues: {},
      }),
    ).toBe('NC-TRK-013');
    expect(
      await codeOf({
        targetType: 'METRIC',
        targetId: 'metric-1',
        action: 'CORRECT',
        correctedValues: { value: 500 },
      }),
    ).toBe('NC-TRK-009');
    expect(
      await codeOf({
        targetType: 'CHECKIN',
        targetId: 'checkin-1',
        action: 'CORRECT',
        correctedValues: { value: 1 },
      }),
    ).toBe('NC-TRK-013');
    expect(adjustments).toEqual([]);
  });

  it('el registro debe ser de ese paciente, de ese día y vigente; sin acceso de escritura no se ajusta', async () => {
    expect(await codeOf({ targetType: 'FOOD', targetId: 'otro' })).toBe('NC-TRK-005');
    expect(await codeOf({ targetType: 'METRIC', targetId: 'otro' })).toBe('NC-TRK-005');
    expect(await codeOf({ targetType: 'WORKOUT', targetId: 'otro' })).toBe('NC-TRK-005');
    expect(await codeOf({ targetType: 'CHECKIN', targetId: 'otro' })).toBe('NC-TRK-005');
    expect(await codeOf({ targetType: 'HYDRATION', targetId: 'otro' })).toBe('NC-TRK-005');
    expect(await codeOf({ targetType: 'SET', targetId: 'set-2' })).toBe('NC-TRK-005');
    expect(await codeOf({ targetType: 'CHECKIN', targetId: 'checkin-1' })).toBeNull();

    writable = false;
    expect(await codeOf({})).toBe('NC-CLI-024');
  });
});

describe('RN-G01 · RN-G02 · el día del paciente para su equipo', () => {
  it('con los ajustes aplicados en los totales y el agua; lo original, aparte; la lectura se audita', async () => {
    await adjust({});
    await adjust({
      targetType: 'FOOD',
      targetId: 'food-1',
      action: 'CORRECT',
      correctedValues: { grams: 100 },
    });

    const day = await queries().day(context, PATIENT, DAY);

    expect(day).toMatchObject({ waterMl: 250, originalWaterMl: 500 });
    expect(day?.totals.kcal.value).toBe(380);
    expect(day?.originalTotals.kcal.value).toBe(190);
    expect(day?.workouts[0]?.sets.map((s) => s.id)).toEqual(['set-1']);
    expect(day?.adjustments).toHaveLength(2);
    expect(audits).toEqual([
      expect.objectContaining({ action: 'READ', resourceType: 'tracking.day' }),
    ]);
  });

  it('RN-A05: si no es de su equipo, no existe y no se audita', async () => {
    visible = false;
    expect(await queries().day(context, PATIENT, DAY)).toBeUndefined();
    expect(await queries().unreadNotes(context, PATIENT)).toBeUndefined();
    expect(audits).toEqual([]);
  });
});

describe('RN-G13 · las notas sin leer', () => {
  it('abrirlas las marca leídas una sola vez, con su evento; sin el paciente, no existe', async () => {
    expect(await queries().unreadNotes(context, PATIENT)).toEqual([note]);

    const first = await commands().markNotesRead(context, PATIENT, ['note-1']);
    const second = await commands().markNotesRead(context, PATIENT, ['note-1']);

    expect(isErr(first) ? null : first.value).toEqual({ marked: 1 });
    expect(isErr(second) ? null : second.value).toEqual({ marked: 0 });
    expect(events.map((event) => event.type)).toEqual(['tracking.note.read']);
    expect(await queries().unreadNotes(context, PATIENT)).toEqual([]);

    visible = false;
    const missing = await commands().markNotesRead(context, PATIENT, ['note-1']);
    expect(isErr(missing) ? missing.error.code : null).toBe('NC-CLI-005');
  });
});

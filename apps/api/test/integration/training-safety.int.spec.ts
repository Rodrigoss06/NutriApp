import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiHarness, type StaffOrganization } from './support/api-harness.js';
import { errorCode, id as uuid, PG, pool, withContext } from './support/database.js';
import { patientWithConsent } from './support/luis.js';

/**
 * RF-41 · RN-F15: las tres llaves antes de prescribir, por HTTP contra PostgreSQL como app_user (07 §2 a §4, ADR-070, ADR-075).
 * El cribado y la postura no son un diagnóstico: solo detienen la propuesta hasta que el coach decide.
 */

const harness = new ApiHarness();
let org: StaffOrganization;
let cookie: string;

interface Safety {
  status: string;
  blocked: boolean;
  medicalClearance: string | null;
  alarmSymptoms: boolean;
  movement: { evaluated: boolean; painTests: number };
  screening: { id: string; status: string; reviewDecision: string | null } | null;
}
interface Evaluation {
  id: string;
  kind: string;
  status: string;
  revision: number;
  version: number;
  amendReason: string | null;
  amendedByEvaluationId: string | null;
  movementTests: {
    testCode: string;
    status: string;
    ruleVersion: string;
    hasEvidenceFile: boolean;
    evidenceUrl: string | null;
  }[];
  physicalResults: {
    testCode: string;
    value: number;
    unit: string;
    hasEvidenceFile: boolean;
    evidenceUrl: string | null;
  }[];
}
interface Problem {
  code: string;
  rule?: string;
  details?: { problems?: string[] };
}

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const MEASURED_AT = '2026-10-20T14:00:00.000Z';
const PROFILE = {
  objective: 'HYPERTROPHY',
  level: 'BEGINNER',
  daysPerWeek: 4,
  equipmentCodes: ['FULL_GYM'],
  medicalClearance: 'CLEARED',
};
const NO_ANSWERS = {
  S01: false,
  S02: false,
  S03: false,
  S04: false,
  S05: false,
  S06: false,
  S07: false,
  S08: false,
};

const newPatient = () =>
  patientWithConsent(harness, org, {
    firstName: 'Paciente',
    lastName: 'Sintético',
    sex: 'F',
    birthDate: '1995-03-02',
  });

const safety = async (patientId: string, as = cookie): Promise<Safety> => {
  const response = await harness.get(`/patients/${patientId}/training-safety`, as);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return response.body as Safety;
};

const saveProfile = (patientId: string, changes: object = {}, expectedRevision = 0) =>
  harness.put(
    `/patients/${patientId}/athlete-profile`,
    { ...PROFILE, expectedRevision, ...changes },
    cookie,
  );

const answer = async (patientId: string, yes: object = {}): Promise<string> => {
  const created = await harness.post(
    `/patients/${patientId}/screenings`,
    { answers: { ...NO_ANSWERS, ...yes } },
    cookie,
  );
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  return (created.body as { id: string }).id;
};

const review = (patientId: string, screeningId: string, decision: string, as = cookie) =>
  harness.post(
    `/patients/${patientId}/screenings/${screeningId}/review`,
    { decision, note: 'Revisado con el paciente.' },
    as,
  );

const read = async (id: string): Promise<Evaluation> =>
  (await harness.get(`/functional-evaluations/${id}`, cookie)).body as Evaluation;

const open = async (patientId: string, kind: 'MOVEMENT' | 'FITNESS'): Promise<Evaluation> => {
  const created = await harness.post(
    `/patients/${patientId}/functional-evaluations`,
    { kind, measuredAt: MEASURED_AT, moment: kind === 'FITNESS' ? 'BASELINE' : null },
    cookie,
  );
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  return read((created.body as { id: string }).id);
};

const movement = (evaluation: Evaluation, testCode: string, body: object) =>
  harness
    .put(`/functional-evaluations/${evaluation.id}/movement/${testCode}`, body, cookie)
    .set('If-Match', String(evaluation.version));

const physical = (evaluation: Evaluation, testCode: string, body: object) =>
  harness
    .put(`/functional-evaluations/${evaluation.id}/physical/${testCode}`, body, cookie)
    .set('If-Match', String(evaluation.version));

const close = (evaluation: Evaluation) =>
  harness
    .post(`/functional-evaluations/${evaluation.id}/close`, undefined, cookie)
    .set('If-Match', String(evaluation.version));

const attach = (evaluation: Evaluation, testCode: string, content: Buffer) =>
  harness
    .post(`/functional-evaluations/${evaluation.id}/tests/${testCode}/evidence`, undefined, cookie)
    .set('If-Match', String(evaluation.version))
    .attach('evidence', content, 'evidencia.png');

const grantImages = async (patientId: string): Promise<void> => {
  const listed = await harness.get('/patients/consent-documents', cookie);
  const { documents } = listed.body as {
    documents: { id: string; purpose: string; provisional: boolean }[];
  };
  const images = documents.find((d) => d.purpose === 'IMAGES');
  expect(images?.provisional).toBe(true);
  const granted = await harness
    .post(`/patients/${patientId}/consents`, undefined, cookie)
    .field('consentDocumentId', images?.id ?? '')
    .field('channel', 'IN_PERSON_DIGITAL');
  expect(granted.status, JSON.stringify(granted.body)).toBe(201);
};

beforeAll(async () => {
  await harness.start();
  org = await harness.createStaffOrganization();
  cookie = org.staff.responsible.cookie;
});

afterAll(async () => {
  await harness.stop();
});

describe('RN-F15 · las tres llaves deciden el estado', () => {
  it('sin perfil, el alta cuenta como pendiente', async () => {
    const status = await safety(await newPatient());

    expect(status).toMatchObject({
      status: 'BLOCKED_CLEARANCE',
      blocked: true,
      medicalClearance: null,
      screening: null,
    });
  });

  it('el alta pendiente bloquea antes que lo demás, y al resolverla sigue el cribado que falta (ADR-070)', async () => {
    const patientId = await newPatient();
    expect((await saveProfile(patientId, { medicalClearance: 'PENDING' })).status).toBe(200);
    expect((await safety(patientId)).status).toBe('BLOCKED_CLEARANCE');

    expect((await saveProfile(patientId, { medicalClearance: 'NOT_REQUIRED' }, 1)).status).toBe(
      200,
    );

    expect(await safety(patientId)).toMatchObject({
      status: 'BLOCKED_SCREENING',
      blocked: true,
      medicalClearance: 'NOT_REQUIRED',
    });
  });

  it('con el cribado en verde y sin evaluación postural no bloquea, y dice que falta (ADR-070)', async () => {
    const patientId = await newPatient();
    await saveProfile(patientId);
    await answer(patientId);

    expect(await safety(patientId)).toMatchObject({
      status: 'PENDING_APPROVAL',
      blocked: false,
      movement: { evaluated: false, painTests: 0 },
      screening: { status: 'GREEN', reviewDecision: null },
    });
  });

  it('los síntomas de alarma bloquean como el dolor', async () => {
    const patientId = await newPatient();
    await saveProfile(patientId, { alarmSymptoms: true });
    await answer(patientId);

    expect(await safety(patientId)).toMatchObject({ status: 'BLOCKED_PAIN', alarmSymptoms: true });
  });

  it('el dolor de una prueba bloquea desde el borrador, aunque falte un lado (P-14), y un borrador sin dolor no abre nada', async () => {
    const patientId = await newPatient();
    await saveProfile(patientId);
    await answer(patientId);
    let draft = await open(patientId, 'MOVEMENT');
    expect((await safety(patientId)).status).toBe('PENDING_APPROVAL');

    const pain = await movement(draft, 'OVERHEAD_SQUAT', { rightScore: 2, pain: true });
    expect(pain.status, JSON.stringify(pain.body)).toBe(200);
    draft = pain.body as Evaluation;

    expect(draft.movementTests[0]).toMatchObject({ status: 'REFER', ruleVersion: '1.0.0' });
    expect(await safety(patientId)).toMatchObject({
      status: 'BLOCKED_PAIN',
      movement: { evaluated: false, painTests: 1 },
    });

    const corrected = await movement(draft, 'OVERHEAD_SQUAT', { rightScore: 2, leftScore: 1 });
    expect((corrected.body as Evaluation).movementTests[0]?.status).toBe('CAUTION');
    expect((await safety(patientId)).status).toBe('PENDING_APPROVAL');
  });

  it('cerrada la postura, cuenta la vigente: una enmienda sin dolor abre la llave solo al cerrarse', async () => {
    const patientId = await newPatient();
    await saveProfile(patientId);
    await answer(patientId);
    const draft = await open(patientId, 'MOVEMENT');
    const saved = await movement(draft, 'PLANK', { rightScore: 2, leftScore: 2, pain: true });
    const closed = await close(saved.body as Evaluation);
    expect(closed.status, JSON.stringify(closed.body)).toBe(200);
    expect(await safety(patientId)).toMatchObject({
      status: 'BLOCKED_PAIN',
      movement: { evaluated: true, painTests: 1 },
    });

    const amended = await harness.post(
      `/functional-evaluations/${draft.id}/amend`,
      { reason: 'El dolor era de otra prueba.' },
      cookie,
    );
    const revision = await read((amended.body as { id: string }).id);
    // Mientras se corrige, la revisión lleva la misma prueba con dolor: sigue bloqueado.
    expect((await safety(patientId)).status).toBe('BLOCKED_PAIN');
    const fixed = await movement(revision, 'PLANK', { rightScore: 2, leftScore: 2 });
    expect((await safety(patientId)).status).toBe('BLOCKED_PAIN');

    await close(fixed.body as Evaluation);

    expect(await safety(patientId)).toMatchObject({
      status: 'PENDING_APPROVAL',
      movement: { evaluated: true, painTests: 0 },
    });
  });
});

describe('RN-F15 · el cribado y la revisión del coach', () => {
  it('rojo con una crítica sin revisar bloquea; iniciar abre la llave y queda el historial', async () => {
    const patientId = await newPatient();
    await saveProfile(patientId);
    const screeningId = await answer(patientId, { S02: true, S09: 'Dolor al correr.' });
    expect(await safety(patientId)).toMatchObject({
      status: 'BLOCKED_SCREENING',
      screening: { status: 'RED', reviewDecision: null },
    });

    const reviewed = await review(patientId, screeningId, 'START');
    expect(reviewed.status, JSON.stringify(reviewed.body)).toBe(204);

    expect(await safety(patientId)).toMatchObject({
      status: 'PENDING_APPROVAL',
      screening: { status: 'RED', reviewDecision: 'START' },
    });
    const listed = await harness.get(`/patients/${patientId}/screenings`, cookie);
    expect(listed.body).toMatchObject({
      screenings: [
        {
          status: 'RED',
          formVersion: 'JV_SCREENING_V2',
          ruleVersion: '1.0.0',
          answers: { S02: true, S09: 'Dolor al correr.' },
          review: { decision: 'START', reviewedBy: org.staff.responsible.memberId },
        },
      ],
    });
  });

  it('ámbar sin revisar bloquea; limitar deja prescribir', async () => {
    const patientId = await newPatient();
    await saveProfile(patientId);
    const screeningId = await answer(patientId, { S07: true });
    expect((await safety(patientId)).status).toBe('BLOCKED_SCREENING');

    await review(patientId, screeningId, 'LIMIT');

    expect((await safety(patientId)).status).toBe('PENDING_APPROVAL');
  });

  it('derivar sigue bloqueado, con su propio estado (ADR-070)', async () => {
    const patientId = await newPatient();
    await saveProfile(patientId);
    await review(patientId, await answer(patientId, { S01: true }), 'REFER');

    expect(await safety(patientId)).toMatchObject({ status: 'BLOCKED_REFERRED', blocked: true });
  });

  it('un cribado nuevo vuelve a mandar sobre la revisión del anterior', async () => {
    const patientId = await newPatient();
    await saveProfile(patientId);
    await review(patientId, await answer(patientId, { S05: true }), 'START');
    expect((await safety(patientId)).status).toBe('PENDING_APPROVAL');

    await answer(patientId, { S03: true });

    expect(await safety(patientId)).toMatchObject({
      status: 'BLOCKED_SCREENING',
      screening: { status: 'RED', reviewDecision: null },
    });
  });

  it('se revisa una sola vez, y un cribado en verde no se revisa', async () => {
    const patientId = await newPatient();
    const red = await answer(patientId, { S04: true });
    await review(patientId, red, 'START');

    const again = await review(patientId, red, 'REFER');
    expect(again.status).toBe(409);
    expect(again.body as Problem).toMatchObject({ code: 'NC-CLI-030', rule: 'RN-F15' });

    const green = await review(patientId, await answer(patientId), 'START');
    expect(green.status).toBe(409);
    expect((green.body as Problem).code).toBe('NC-CLI-030');

    const missing = await review(patientId, uuid(), 'START');
    expect(missing.status).toBe(404);
    expect((missing.body as Problem).code).toBe('NC-CLI-029');
  });

  it('todas las preguntas se responden: uno a medias se rechaza', async () => {
    const patientId = await newPatient();
    const response = await harness.post(
      `/patients/${patientId}/screenings`,
      { answers: { S01: false } },
      cookie,
    );

    expect(response.status).toBe(400);
  });

  it('la base también lo impide: revisar dos veces, revisar el verde y revisar como paciente', async () => {
    const patientId = await newPatient();
    const red = await answer(patientId, { S01: true });
    const reviewedRed = await answer(patientId, { S02: true });
    await review(patientId, reviewedRed, 'START');
    const green = await answer(patientId);
    const memberContext = {
      orgId: org.organizationId,
      userId: org.staff.responsible.userId,
      role: 'PROFESSIONAL' as const,
      memberId: org.staff.responsible.memberId,
    };
    const write = `UPDATE clinical.pre_exercise_screening
                   SET review_decision = 'START', review_note = 'Nota', reviewed_by = $2, reviewed_at = now()
                   WHERE id = $1`;

    await withContext('user', memberContext, async (client) => {
      const params = (id: string) => [id, org.staff.responsible.memberId];
      expect(await errorCode(client, write, params(reviewedRed))).toBe(PG.integrityViolation);
      expect(await errorCode(client, write, params(green))).toBe(PG.integrityViolation);
      expect(
        await errorCode(client, `UPDATE clinical.pre_exercise_screening SET status = 'GREEN'`),
      ).toBe(PG.insufficientPrivilege);
    });
    await withContext(
      'user',
      { orgId: org.organizationId, userId: uuid(), role: 'PATIENT', patientId },
      async (client) => {
        expect(await errorCode(client, write, [red, org.staff.responsible.memberId])).toBe(
          PG.insufficientPrivilege,
        );
      },
    );
  });
});

describe('RF-41 · el perfil de entrenamiento', () => {
  it('cada cambio es una revisión nueva sobre la que se editó; si alguien guardó antes, 409', async () => {
    const patientId = await newPatient();
    expect(await saveProfile(patientId)).toMatchObject({ status: 200, body: { revision: 1 } });
    expect(await saveProfile(patientId, { daysPerWeek: 5 }, 1)).toMatchObject({
      status: 200,
      body: { revision: 2 },
    });

    const stale = await saveProfile(patientId, { daysPerWeek: 3 }, 1);
    expect(stale.status).toBe(409);
    expect((stale.body as Problem).code).toBe('NC-TRA-001');

    const current = await harness.get(`/patients/${patientId}/athlete-profile`, cookie);
    expect(current.body).toMatchObject({
      current: {
        revision: 2,
        daysPerWeek: 5,
        macrocycleWeeks: 12,
        sleepTargetHours: 8,
        recordedBy: org.staff.responsible.userId,
      },
    });
  });

  it('el equipamiento y los objetivos de pruebas salen de sus catálogos (07 §2, §4)', async () => {
    const patientId = await newPatient();

    const unknown = await saveProfile(patientId, {
      equipmentCodes: ['TRINEO'],
      testTargets: { VOLAR: 10 },
    });
    expect(unknown.status).toBe(422);
    expect((unknown.body as Problem).code).toBe('NC-TRA-002');
    expect((unknown.body as Problem).details?.problems).toEqual([
      'TRINEO no es un equipo.',
      'VOLAR no es una prueba física.',
    ]);

    const known = await saveProfile(patientId, { testTargets: { WALK_6MIN: 500.5 } });
    expect(known.status, JSON.stringify(known.body)).toBe(200);
    const current = await harness.get(`/patients/${patientId}/athlete-profile`, cookie);
    expect((current.body as { current: { testTargets: object } }).current.testTargets).toEqual({
      WALK_6MIN: 500.5,
    });
  });

  it('RN-D09: guarda los decimales tal como llegan y rechaza los que tendría que redondear', async () => {
    const patientId = await newPatient();

    const rounded = await saveProfile(patientId, { sleepTargetHours: 7.75 });
    expect(rounded.status).toBe(400);
    expect((await saveProfile(patientId, { baselineWeightKg: 70.123 })).status).toBe(400);
    expect((await saveProfile(patientId, { baselineHrvMs: 45.55 })).status).toBe(400);

    const exact = await saveProfile(patientId, {
      sleepTargetHours: 7.5,
      baselineWeightKg: 70.12,
      baselineHrvMs: 45.5,
    });
    expect(exact.status, JSON.stringify(exact.body)).toBe(200);
    const current = await harness.get(`/patients/${patientId}/athlete-profile`, cookie);
    expect(current.body).toMatchObject({
      current: { revision: 1, sleepTargetHours: 7.5, baselineWeightKg: 70.12, baselineHrvMs: 45.5 },
    });
  });

  it('RN-B01: sin el consentimiento de datos de salud no se guarda nada de esto', async () => {
    const registered = await harness.post(
      '/patients',
      { firstName: 'Sin', lastName: 'Consentimiento', sex: 'M', birthDate: '1990-01-01' },
      cookie,
    );
    const patientId = (registered.body as { id: string }).id;

    const responses = [
      await saveProfile(patientId),
      await harness.post(`/patients/${patientId}/screenings`, { answers: NO_ANSWERS }, cookie),
      await harness.post(
        `/patients/${patientId}/functional-evaluations`,
        { kind: 'MOVEMENT', measuredAt: MEASURED_AT },
        cookie,
      ),
    ];

    expect(responses.map((r) => (r.body as Problem).rule)).toEqual(['RN-B01', 'RN-B01', 'RN-B01']);
  });

  it('RN-A05: con acceso de lectura se lee todo y no se escribe nada', async () => {
    const patientId = await newPatient();
    const { team } = org.staff;
    const joined = await harness.put(
      `/patients/${patientId}/care-team/${team.memberId}`,
      { role: 'COLLABORATOR', access: 'READ' },
      cookie,
    );
    expect(joined.status).toBe(204);
    const screeningId = await answer(patientId, { S01: true });
    const draft = await open(patientId, 'MOVEMENT');
    const ifMatch = String(draft.version);

    expect((await safety(patientId, team.cookie)).screening?.status).toBe('RED');
    const reads = [
      await harness.get(`/patients/${patientId}/athlete-profile`, team.cookie),
      await harness.get(`/patients/${patientId}/screenings`, team.cookie),
      await harness.get(`/functional-evaluations/${draft.id}`, team.cookie),
    ];
    expect(reads.map((response) => response.status)).toEqual([200, 200, 200]);

    const writes = [
      await harness.put(
        `/patients/${patientId}/athlete-profile`,
        { ...PROFILE, expectedRevision: 0 },
        team.cookie,
      ),
      await harness.post(`/patients/${patientId}/screenings`, { answers: NO_ANSWERS }, team.cookie),
      await review(patientId, screeningId, 'START', team.cookie),
      await harness.post(
        `/patients/${patientId}/functional-evaluations`,
        { kind: 'MOVEMENT', measuredAt: MEASURED_AT },
        team.cookie,
      ),
      await harness
        .put(
          `/functional-evaluations/${draft.id}/movement/PLANK`,
          { rightScore: 2, leftScore: 2 },
          team.cookie,
        )
        .set('If-Match', ifMatch),
      await harness
        .post(`/functional-evaluations/${draft.id}/close`, undefined, team.cookie)
        .set('If-Match', ifMatch),
    ];
    expect(writes.map((response) => response.status)).toEqual([403, 403, 403, 403, 403, 403]);
    expect(new Set(writes.map((response) => (response.body as Problem).code))).toEqual(
      new Set(['NC-CLI-013']),
    );
  });

  it('RN-A05: quien no está en el equipo ni lee ni escribe', async () => {
    const patientId = await newPatient();
    const { outsider } = org.staff;

    expect((await safety(patientId)).status).toBe('BLOCKED_CLEARANCE');
    const read = await harness.get(`/patients/${patientId}/training-safety`, outsider.cookie);
    expect(read.status).toBe(404);
    const write = await harness.put(
      `/patients/${patientId}/athlete-profile`,
      { ...PROFILE, expectedRevision: 0 },
      outsider.cookie,
    );
    expect(write.status).toBe(404);
  });
});

describe('RF-41 · la evaluación postural y las pruebas físicas', () => {
  it('cerrada no cambia; se enmienda con motivo, con sus pruebas, y la anterior pasa a enmendada (RN-D08)', async () => {
    const patientId = await newPatient();
    const draft = await open(patientId, 'FITNESS');
    expect((await close(draft)).status).toBe(422);
    const saved = await physical(draft, 'PUSH_UPS', { value: 12 });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect((saved.body as Evaluation).physicalResults).toMatchObject([
      { testCode: 'PUSH_UPS', value: 12, unit: 'repeticiones' },
    ]);
    const closed = await close(saved.body as Evaluation);
    expect((closed.body as Evaluation).status).toBe('CLOSED');

    const late = await physical(closed.body as Evaluation, 'PUSH_UPS', { value: 13 });
    expect(late.status).toBe(409);
    await withContext(
      'user',
      {
        orgId: org.organizationId,
        userId: org.staff.responsible.userId,
        role: 'PROFESSIONAL',
        memberId: org.staff.responsible.memberId,
      },
      async (client) => {
        expect(
          await errorCode(
            client,
            `DELETE FROM assessment.physical_test_result WHERE evaluation_id = $1`,
            [draft.id],
          ),
        ).toBe(PG.integrityViolation);
      },
    );

    const amended = await harness.post(
      `/functional-evaluations/${draft.id}/amend`,
      { reason: 'Se contaron mal.' },
      cookie,
    );
    expect(amended.status, JSON.stringify(amended.body)).toBe(201);
    const revision = await read((amended.body as { id: string }).id);
    expect(revision).toMatchObject({
      revision: 2,
      status: 'DRAFT',
      amendReason: 'Se contaron mal.',
    });
    expect(revision.physicalResults).toMatchObject([{ testCode: 'PUSH_UPS', value: 12 }]);

    const fixed = await physical(revision, 'PUSH_UPS', { value: 14 });
    await close(fixed.body as Evaluation);

    expect(await read(draft.id)).toMatchObject({
      status: 'AMENDED',
      amendedByEvaluationId: revision.id,
    });
    const twice = await harness.post(
      `/functional-evaluations/${draft.id}/amend`,
      { reason: 'Otra vez.' },
      cookie,
    );
    expect(twice.status).toBe(409);
  });

  it('el resumen da cada prueba por momento, con su cambio y su estado (07 §4)', async () => {
    const patientId = await newPatient();
    const record = async (moment: string, value: number) => {
      const created = await harness.post(
        `/patients/${patientId}/functional-evaluations`,
        { kind: 'FITNESS', measuredAt: MEASURED_AT, moment },
        cookie,
      );
      const draft = await read((created.body as { id: string }).id);
      const saved = await physical(draft, 'WALK_6MIN', { value });
      await close(saved.body as Evaluation);
    };

    await record('BASELINE', 480.5);
    await record('WEEK_12', 520);

    const summary = await harness.get(`/patients/${patientId}/physical-test-summary`, cookie);
    const { tests } = summary.body as {
      tests: { testCode: string; change: number | null; status: string }[];
    };
    expect(tests).toHaveLength(15);
    expect(tests.find((t) => t.testCode === 'WALK_6MIN')).toMatchObject({
      baseline: 480.5,
      week12: 520,
      change: 39.5,
      status: 'REVIEW_CHANGE',
    });
    expect(tests.find((t) => t.testCode === 'PUSH_UPS')?.status).toBe('PENDING');
  });

  it('una prueba que no es de esta evaluación no se registra, y sin la versión leída tampoco', async () => {
    const patientId = await newPatient();
    const draft = await open(patientId, 'MOVEMENT');

    const unknown = await movement(draft, 'VOLAR', { rightScore: 2, leftScore: 2 });
    expect(unknown.status).toBe(404);
    expect((unknown.body as Problem).code).toBe('NC-ASM-023');

    const other = await physical(draft, 'PUSH_UPS', { value: 10 });
    expect(other.status).toBe(404);

    const saved = await movement(draft, 'PLANK', { rightScore: 2, leftScore: 2 });
    expect(saved.status).toBe(200);
    const stale = await movement(draft, 'PLANK', { rightScore: 1, leftScore: 1 });
    expect(stale.status).toBe(409);

    const noVersion = await harness.put(
      `/functional-evaluations/${draft.id}/movement/PLANK`,
      { rightScore: 1, leftScore: 1 },
      cookie,
    );
    expect(noVersion.status).toBe(428);
  });

  it('quitar una prueba la saca de la evaluación y de la llave', async () => {
    const patientId = await newPatient();
    await saveProfile(patientId);
    await answer(patientId);
    const draft = await open(patientId, 'MOVEMENT');
    const saved = await movement(draft, 'PUSH', { rightScore: 2, pain: true });
    expect((await safety(patientId)).status).toBe('BLOCKED_PAIN');

    const removed = await harness
      .delete(`/functional-evaluations/${draft.id}/tests/PUSH`, cookie)
      .set('If-Match', String((saved.body as Evaluation).version));
    expect(removed.status, JSON.stringify(removed.body)).toBe(200);

    expect((removed.body as Evaluation).movementTests).toEqual([]);
    expect((await safety(patientId)).status).toBe('PENDING_APPROVAL');
  });

  it('07 §4: la evidencia, archivo o enlace, exige el consentimiento de imágenes; con él se guarda y se baja auditada', async () => {
    const patientId = await newPatient();
    const draft = await open(patientId, 'MOVEMENT');
    const link = 'https://videos.example.com/evidencia';

    const withoutConsent = await movement(draft, 'PLANK', {
      rightScore: 2,
      leftScore: 2,
      evidenceUrl: link,
    });
    expect(withoutConsent.status).toBe(422);
    expect(withoutConsent.body as Problem).toMatchObject({ code: 'NC-CLI-031', rule: 'RN-B01' });

    const saved = await movement(draft, 'PLANK', { rightScore: 2, leftScore: 2 });
    const row = saved.body as Evaluation;
    const fileWithoutConsent = await attach(row, 'PLANK', PNG);
    expect((fileWithoutConsent.body as Problem).code).toBe('NC-CLI-031');

    await grantImages(patientId);
    const notAnImage = await attach(row, 'PLANK', Buffer.from('esto no es una imagen'));
    expect(notAnImage.status).toBe(422);
    expect((notAnImage.body as Problem).code).toBe('NC-ASM-025');

    const noRow = await attach(row, 'PUSH', PNG);
    expect(noRow.status).toBe(404);

    const attached = await attach(row, 'PLANK', PNG);
    expect(attached.status, JSON.stringify(attached.body)).toBe(200);
    const evaluation = attached.body as Evaluation;
    expect(evaluation.movementTests[0]?.hasEvidenceFile).toBe(true);

    const download = await harness.get(
      `/functional-evaluations/${draft.id}/tests/PLANK/evidence`,
      cookie,
    );
    expect(download.status).toBe(200);
    expect(download.headers['content-type']).toBe('image/png');
    expect(download.headers['content-disposition']).toContain('attachment');
    expect(download.headers['x-content-type-options']).toBe('nosniff');

    // Corregir la prueba no pierde el archivo, y el enlace ya se admite.
    const relinked = await movement(evaluation, 'PLANK', {
      rightScore: 1,
      leftScore: 2,
      evidenceUrl: link,
    });
    expect((relinked.body as Evaluation).movementTests[0]).toMatchObject({
      status: 'CAUTION',
      hasEvidenceFile: true,
      evidenceUrl: link,
    });

    const removed = await harness
      .delete(`/functional-evaluations/${draft.id}/tests/PLANK/evidence`, cookie)
      .set('If-Match', String((relinked.body as Evaluation).version));
    expect((removed.body as Evaluation).movementTests[0]?.hasEvidenceFile).toBe(false);
    const gone = await harness.get(
      `/functional-evaluations/${draft.id}/tests/PLANK/evidence`,
      cookie,
    );
    expect(gone.status).toBe(404);
  });

  it('sin archivo en el pedido, la evidencia responde 400 con su código', async () => {
    const draft = await open(await newPatient(), 'MOVEMENT');

    const empty = await harness
      .post(`/functional-evaluations/${draft.id}/tests/PLANK/evidence`, undefined, cookie)
      .set('If-Match', String(draft.version));

    expect(empty.status).toBe(400);
    expect((empty.body as Problem).code).toBe('NC-ASM-026');
  });

  it('un enlace que no es https no se admite', async () => {
    const draft = await open(await newPatient(), 'MOVEMENT');

    const insecure = await movement(draft, 'PLANK', { evidenceUrl: 'http://videos.example.com/x' });

    expect(insecure.status).toBe(400);
  });

  it('RN-B03: las lecturas dejan su READ y las escrituras se auditan con el nombre de la prueba', async () => {
    const patientId = await newPatient();
    await saveProfile(patientId);
    const screeningId = await answer(patientId, { S01: true });
    await review(patientId, screeningId, 'START');
    const draft = await open(patientId, 'MOVEMENT');
    await movement(draft, 'PLANK', { rightScore: 2, leftScore: 2 });
    await harness.get(`/patients/${patientId}/athlete-profile`, cookie);
    await harness.get(`/patients/${patientId}/screenings`, cookie);
    await safety(patientId);
    await harness.deliver('audit.events');

    const { rows } = await pool('owner').query<{
      action: string;
      resource_type: string;
      fields: string[] | null;
    }>(
      `SELECT action, resource_type, changed_fields AS fields FROM audit.audit_log WHERE patient_id = $1`,
      [patientId],
    );
    const seen = (action: string, resource: string) =>
      rows.filter((r) => r.action === action && r.resource_type === resource);

    expect(seen('READ', 'training.athlete_profile')).toHaveLength(2);
    expect(seen('READ', 'clinical.pre_exercise_screening')).toHaveLength(1);
    expect(seen('READ', 'assessment.evaluation').length).toBeGreaterThan(0);
    expect(seen('CREATE', 'training.athlete_profile')).toHaveLength(1);
    expect(seen('CREATE', 'clinical.pre_exercise_screening')).toHaveLength(1);
    expect(seen('UPDATE', 'clinical.pre_exercise_screening')[0]?.fields).toEqual([
      'review_decision',
      'review_note',
    ]);
    expect(seen('UPDATE', 'assessment.evaluation')[0]?.fields).toEqual(['PLANK']);
  });
});

describe('RF-41 · la postura y las pruebas físicas no se mezclan con la antropometría', () => {
  it('no salen en /evaluations, no se leen por su ruta, no se calculan y en la línea de tiempo dicen qué son', async () => {
    const patientId = await newPatient();
    const draft = await open(patientId, 'MOVEMENT');
    const saved = await movement(draft, 'PLANK', { rightScore: 2, leftScore: 2 });
    await close(saved.body as Evaluation);
    await harness.deliver('assessment.calculation');

    const listed = await harness.get(`/patients/${patientId}/evaluations`, cookie);
    expect((listed.body as { evaluations: unknown[] }).evaluations).toEqual([]);
    expect((await harness.get(`/evaluations/${draft.id}`, cookie)).status).toBe(404);

    const { rows } = await pool('owner').query(
      `SELECT 1 FROM assessment.calculation_result WHERE evaluation_id = $1`,
      [draft.id],
    );
    expect(rows).toEqual([]);

    const timeline = await harness.get(`/patients/${patientId}/timeline`, cookie);
    const { items } = timeline.body as { items: { kind: string; label: string; refId: string }[] };
    expect(items.find((i) => i.refId === draft.id)).toMatchObject({
      kind: 'EVALUATION_CLOSED',
      label: 'MOVEMENT',
    });

    const functional = await harness.get(
      `/patients/${patientId}/functional-evaluations?kind=MOVEMENT`,
      cookie,
    );
    expect((functional.body as { evaluations: { id: string }[] }).evaluations).toMatchObject([
      { id: draft.id, status: 'CLOSED' },
    ]);
    const other = await harness.get(
      `/patients/${patientId}/functional-evaluations?kind=FITNESS`,
      cookie,
    );
    expect((other.body as { evaluations: unknown[] }).evaluations).toEqual([]);
  });

  it('una evaluación antropométrica no se lee por la ruta funcional, ni se le registran pruebas', async () => {
    const patientId = await newPatient();
    const created = await harness.post(
      `/patients/${patientId}/evaluations`,
      {
        level: 'ISAK2',
        measuredAt: MEASURED_AT,
        conditions: { schemaVersion: 1, fasting: true, intenseActivityLast24h: false },
      },
      cookie,
    );
    const anthropometric = (created.body as { id: string }).id;

    expect((await harness.get(`/functional-evaluations/${anthropometric}`, cookie)).status).toBe(
      404,
    );
    const write = await harness
      .put(
        `/functional-evaluations/${anthropometric}/movement/PLANK`,
        { rightScore: 2, leftScore: 2 },
        cookie,
      )
      .set('If-Match', '0');
    expect(write.status).toBe(404);
  });

  it('el catálogo trae las 14 pruebas de postura y las 15 físicas, en su orden (07 §3.3, §4)', async () => {
    const response = await harness.get('/functional-evaluations/catalog', cookie);
    const { movementTests, physicalTests } = response.body as {
      movementTests: { code: string }[];
      physicalTests: { code: string; unit: string }[];
    };

    expect(movementTests).toHaveLength(14);
    expect(movementTests[0]?.code).toBe('HEAD_NECK');
    expect(physicalTests).toHaveLength(15);
    expect(physicalTests.at(-1)).toMatchObject({ code: 'PULL_E1RM', unit: 'kg' });
  });
});

describe('RN-A01 · RN-A05 · RLS de las tablas nuevas, como app_user', () => {
  it('las ve el equipo; ni quien está fuera, ni otra organización; el paciente solo su cribado', async () => {
    const patientId = await newPatient();
    await saveProfile(patientId);
    await answer(patientId);
    const movementDraft = await open(patientId, 'MOVEMENT');
    await movement(movementDraft, 'PLANK', { rightScore: 2, leftScore: 2 });
    const fitnessDraft = await open(patientId, 'FITNESS');
    await physical(fitnessDraft, 'PUSH_UPS', { value: 10 });
    const tables = [
      'training.athlete_profile',
      'clinical.pre_exercise_screening',
      'assessment.movement_screen',
      'assessment.physical_test_result',
    ];
    const seen = async (context: Parameters<typeof withContext>[1]) =>
      withContext('user', context, async (client) => {
        const counts: Record<string, number> = {};
        for (const table of tables) {
          const { rowCount } = await client.query(`SELECT 1 FROM ${table} WHERE patient_id = $1`, [
            patientId,
          ]);
          counts[table] = rowCount ?? 0;
        }
        return counts;
      });
    const staff = (member: typeof org.staff.responsible) => ({
      orgId: org.organizationId,
      userId: member.userId,
      role: 'PROFESSIONAL' as const,
      memberId: member.memberId,
    });

    expect(await seen(staff(org.staff.responsible))).toEqual({
      'training.athlete_profile': 1,
      'clinical.pre_exercise_screening': 1,
      'assessment.movement_screen': 1,
      'assessment.physical_test_result': 1,
    });
    expect(await seen(staff(org.staff.outsider))).toEqual({
      'training.athlete_profile': 0,
      'clinical.pre_exercise_screening': 0,
      'assessment.movement_screen': 0,
      'assessment.physical_test_result': 0,
    });
    expect(await seen({ orgId: uuid(), role: 'OWNER', userId: uuid() })).toEqual({
      'training.athlete_profile': 0,
      'clinical.pre_exercise_screening': 0,
      'assessment.movement_screen': 0,
      'assessment.physical_test_result': 0,
    });
    expect(
      await seen({ orgId: org.organizationId, userId: uuid(), role: 'PATIENT', patientId }),
    ).toEqual({
      'training.athlete_profile': 0,
      'clinical.pre_exercise_screening': 1,
      'assessment.movement_screen': 0,
      'assessment.physical_test_result': 0,
    });
  });

  it('el perfil no se actualiza: cada cambio es una revisión', async () => {
    await withContext(
      'user',
      {
        orgId: org.organizationId,
        userId: org.staff.responsible.userId,
        role: 'PROFESSIONAL',
        memberId: org.staff.responsible.memberId,
      },
      async (client) => {
        expect(await errorCode(client, `UPDATE training.athlete_profile SET notes = 'x'`)).toBe(
          PG.insufficientPrivilege,
        );
        expect(await errorCode(client, `UPDATE assessment.movement_screen SET pain = false`)).toBe(
          PG.insufficientPrivilege,
        );
        expect(
          await errorCode(client, `UPDATE assessment.physical_test_result SET value = 1`),
        ).toBe(PG.insufficientPrivilege);
      },
    );
  });
});

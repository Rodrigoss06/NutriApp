import { domainError, err, isErr, isOk, type UserId } from '@nutricoach/shared-kernel';
import { beforeEach, describe, expect, it } from 'vitest';
import { ClinicalApi } from './clinical-api.js';
import { ClinicalRecordCommands } from './commands/clinical-record.commands.js';
import { ConsentCommands } from './commands/consent.commands.js';
import { PatientCommands } from './commands/patient.commands.js';
import { PatientInvitationCommands } from './commands/patient-invitation.commands.js';
import {
  DOCUMENTS,
  FakeAudit,
  FakeClock,
  FakeFiles,
  FakeIam,
  fakeEncryption,
  fakeIds,
  FakeOutbox,
  fakeTenancy,
  FakeUow,
  MemoryConsents,
  MemoryPatients,
  MemoryRecords,
  ORG,
  staffContext,
} from './clinical-fakes.spec-support.js';
import { PatientEnrollmentService } from './patient-enrollment.js';
import { ClinicalRecordQueries } from './queries/clinical-record.queries.js';
import { PatientQueries } from './queries/patient.queries.js';

const RESPONSIBLE = '0192f0a0-0000-7000-8000-0000000000a1';
const READER = '0192f0a0-0000-7000-8000-0000000000a2';
const OTHER = '0192f0a0-0000-7000-8000-0000000000a3';
const ACCOUNT = '0192f0a0-0000-7000-8000-0000000000e1' as UserId;
const PERSON = {
  firstName: 'Rosa',
  lastName: 'Mamani',
  sex: 'F',
  birthDate: '1988-03-14',
  population: 'ADULT',
  email: 'rosa@demo.test',
} as const;
const HEALTH_DATA = DOCUMENTS.find((d) => d.purpose === 'HEALTH_DATA')?.id ?? '';
const APP_ACCESS = DOCUMENTS.find((d) => d.purpose === 'APP_ACCESS')?.id ?? '';

let clock: FakeClock;
let uow: FakeUow;
let outbox: FakeOutbox;
let audit: FakeAudit;
let patients: MemoryPatients;
let consents: MemoryConsents;
let records: MemoryRecords;
let iam: FakeIam;

const responsible = staffContext('PROFESSIONAL', RESPONSIBLE);
const reader = staffContext('PROFESSIONAL', READER);
const other = staffContext('PROFESSIONAL', OTHER);

const patientCommands = () =>
  new PatientCommands(
    uow,
    clock,
    fakeIds,
    outbox,
    fakeEncryption,
    patients,
    consents,
    fakeTenancy(new Set([RESPONSIBLE, READER, OTHER]), { max: 10 }),
  );
const consentCommands = () =>
  new ConsentCommands(
    uow,
    clock,
    fakeIds,
    outbox,
    patients,
    consents,
    new FakeFiles().asRegistry(),
  );
const commands = () =>
  new ClinicalRecordCommands(uow, clock, fakeIds, outbox, patients, consents, records);
const queries = () => new ClinicalRecordQueries(uow, audit, patients, records);
const invitations = () =>
  new PatientInvitationCommands(uow, clock, patients, consents, iam.asApi());
const enrollment = () => new PatientEnrollmentService(clock, fakeIds, outbox, patients, consents);

async function registered(input: object = {}): Promise<string> {
  const result = await patientCommands().register(responsible, { ...PERSON, ...input });
  if (!result.ok) throw new Error(result.error.code);
  await patientCommands().setCareTeamMember(responsible, result.value.id, {
    memberId: READER,
    role: 'COLLABORATOR',
    access: 'READ',
  });
  return result.value.id;
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Firmado en papel por su padre, madre o tutor y escaneado: lo único que vale para un menor de 14 (⚠️). */
async function signedOnPaper(patientId: string, documentId: string): Promise<void> {
  const granted = await consentCommands().grant(responsible, patientId, {
    consentDocumentId: documentId,
    channel: 'PAPER_SCANNED',
    evidence: PNG,
    ip: null,
    userAgent: null,
  });
  if (!granted.ok) throw new Error(granted.error.code);
}

async function consented(patientId: string, documentId = HEALTH_DATA): Promise<void> {
  const granted = await consentCommands().grant(responsible, patientId, {
    consentDocumentId: documentId,
    channel: 'IN_PERSON_DIGITAL',
    evidence: null,
    ip: null,
    userAgent: null,
  });
  if (!granted.ok) throw new Error(granted.error.code);
}

beforeEach(() => {
  clock = new FakeClock();
  uow = new FakeUow();
  outbox = new FakeOutbox();
  audit = new FakeAudit();
  patients = new MemoryPatients();
  consents = new MemoryConsents();
  records = new MemoryRecords();
  iam = new FakeIam();
});

describe('RF-09 · historia clínica versionada', () => {
  it('RN-B01 · sin HEALTH_DATA vigente no se guarda la historia', async () => {
    const id = await registered();
    const saved = await commands().saveHistory(responsible, id, 0, { sleep: '6 h' });
    expect(isErr(saved) && saved.error).toMatchObject({ code: 'NC-CLI-002', rule: 'RN-B01' });
    expect(records.history).toEqual([]);
  });

  it('cada guardado es una revisión nueva sobre la que se editó; la desfasada no pisa (409)', async () => {
    const id = await registered();
    await consented(id);
    const first = await commands().saveHistory(responsible, id, 0, { sleep: '6 h' });
    expect(isOk(first) && first.value.revision).toBe(1);
    const stale = await commands().saveHistory(responsible, id, 0, { sleep: '8 h' });
    expect(isErr(stale) && stale.error.code).toBe('NC-CLI-019');
    const second = await commands().saveHistory(responsible, id, 1, { sleep: '7 h' });
    expect(isOk(second) && second.value.revision).toBe(2);
    expect(records.locks).toBe(3);
    expect(records.history.map((h) => [h.revision, h.formCode, h.formVersion])).toEqual([
      [1, 'ANAMNESIS', '1'],
      [2, 'ANAMNESIS', '1'],
    ]);
    expect(outbox.events.at(-1)).toMatchObject({
      type: 'clinical.history.revised',
      payload: { patientId: id, revision: 2 },
    });
  });

  it('RN-A05 · escribir exige WRITE en el equipo, un paciente activo y que exista', async () => {
    const id = await registered();
    await consented(id);
    const byReader = await commands().saveHistory(reader, id, 0, {});
    expect(isErr(byReader) && byReader.error.code).toBe('NC-CLI-013');
    const byOther = await commands().addNote(other, id, { body: 'x', visibility: 'CARE_TEAM' });
    expect(isErr(byOther) && byOther.error.code).toBe('NC-CLI-013');
    // OWNER ve a todos, pero lo clínico lo escribe el equipo que atiende.
    const owner = staffContext('OWNER', '0192f0a0-0000-7000-8000-0000000000a0');
    const byOwner = await commands().saveHistory(owner, id, 0, {});
    expect(isErr(byOwner) && byOwner.error.code).toBe('NC-CLI-013');
    const missing = await commands().addCondition(responsible, 'no-existe', {
      kind: 'DISEASE',
      label: 'Hipotiroidismo',
    });
    expect(isErr(missing) && missing.error.code).toBe('NC-CLI-005');
    await patientCommands().archive(responsible, id);
    const archived = await commands().addGoal(responsible, id, { kind: 'FAT_LOSS' });
    expect(isErr(archived) && archived.error.code).toBe('NC-CLI-018');
  });
});

describe('RF-09 · condiciones, objetivos y notas', () => {
  it('condiciones y objetivos: filas propias; solo cambian estado y notas', async () => {
    const id = await registered();
    await consented(id);
    const condition = await commands().addCondition(responsible, id, {
      kind: 'DISEASE',
      label: 'Hipotiroidismo',
      codeSystem: 'CIE-10',
      code: 'E03.9',
      since: '2020-01-01',
    });
    if (!condition.ok) throw new Error(condition.error.code);
    expect(records.conditionRows[0]).toMatchObject({
      status: 'ACTIVE',
      code: 'E03.9',
      notes: null,
    });
    expect(
      isOk(
        await commands().updateCondition(responsible, id, condition.value.id, {
          status: 'RESOLVED',
          notes: 'Con levotiroxina',
        }),
      ),
    ).toBe(true);
    expect(records.conditionRows[0]).toMatchObject({
      status: 'RESOLVED',
      notes: 'Con levotiroxina',
    });
    const lost = await commands().updateCondition(responsible, id, 'otra', { status: 'ACTIVE' });
    expect(isErr(lost) && lost.error.code).toBe('NC-CLI-020');

    const goal = await commands().addGoal(responsible, id, {
      kind: 'FAT_LOSS',
      metricCode: 'WEIGHT_KG',
      targetValue: 62.5,
      targetDate: '2027-01-31',
    });
    if (!goal.ok) throw new Error(goal.error.code);
    expect(
      isOk(await commands().updateGoal(responsible, id, goal.value.id, { status: 'ACHIEVED' })),
    ).toBe(true);
    expect(records.goalRows[0]).toMatchObject({ status: 'ACHIEVED', targetValue: 62.5 });
    const noGoal = await commands().updateGoal(responsible, id, 'otro', { notes: null });
    expect(isErr(noGoal) && noGoal.error.code).toBe('NC-CLI-021');
    expect(outbox.types().slice(-4)).toEqual([
      'clinical.condition.recorded',
      'clinical.condition.changed',
      'clinical.goal.recorded',
      'clinical.goal.changed',
    ]);
  });

  it('una nota no se edita: se enmienda con otra que cita una nota del paciente', async () => {
    const id = await registered();
    await consented(id);
    const note = await commands().addNote(responsible, id, {
      body: 'Refiere ansiedad por la comida.',
      visibility: 'AUTHOR_ONLY',
    });
    if (!note.ok) throw new Error(note.error.code);
    const amend = await commands().addNote(responsible, id, {
      body: 'Corrijo: por la noche.',
      visibility: 'CARE_TEAM',
      amendsNoteId: note.value.id,
    });
    expect(isOk(amend)).toBe(true);
    expect(records.noteRows.map((n) => [n.authorMemberId, n.visibility, n.amendsNoteId])).toEqual([
      [RESPONSIBLE, 'AUTHOR_ONLY', null],
      [RESPONSIBLE, 'CARE_TEAM', note.value.id],
    ]);
    const orphan = await commands().addNote(responsible, id, {
      body: 'x',
      visibility: 'CARE_TEAM',
      amendsNoteId: 'no-existe',
    });
    expect(isErr(orphan) && orphan.error.code).toBe('NC-CLI-022');
    const ownerWithoutMember = { ...staffContext('OWNER', ''), memberId: null };
    const noAuthor = await commands().addNote(ownerWithoutMember, id, {
      body: 'x',
      visibility: 'CARE_TEAM',
    });
    expect(isErr(noAuthor) && noAuthor.error.code).toBe('NC-CLI-013');
    expect(outbox.events.at(-1)).toMatchObject({
      type: 'clinical.note.written',
      payload: { visibility: 'CARE_TEAM', amends: note.value.id },
    });
  });
});

describe('RF-10 · lecturas del expediente con READ en auditoría', () => {
  it('historia, condiciones, objetivos y notas dejan su READ; sin ver al paciente, nada', async () => {
    const id = await registered();
    await consented(id);
    await commands().saveHistory(responsible, id, 0, { sleep: '6 h' });
    await commands().saveHistory(responsible, id, 1, { sleep: '7 h' });
    await commands().addCondition(responsible, id, { kind: 'ALLERGY', label: 'Maní' });
    await commands().addGoal(responsible, id, { kind: 'HEALTH', notes: 'Cenar antes de las 9' });
    await commands().addNote(responsible, id, {
      body: 'Primera consulta.',
      visibility: 'CARE_TEAM',
    });

    const history = await queries().history(reader, id);
    expect(history?.current).toMatchObject({ revision: 2, answers: { sleep: '7 h' } });
    expect(history?.revisions.map((r) => r.revision)).toEqual([2, 1]);
    expect(await queries().conditions(reader, id)).toHaveLength(1);
    expect(await queries().goals(reader, id)).toHaveLength(1);
    expect(await queries().notes(reader, id)).toHaveLength(1);
    expect(audit.entries.map((e) => [e.action, e.resourceType, e.patientId])).toEqual([
      ['READ', 'clinical.clinical_history', id],
      ['READ', 'clinical.condition', id],
      ['READ', 'clinical.goal', id],
      ['READ', 'clinical.clinical_note', id],
    ]);
    expect(await queries().history(reader, 'no-existe')).toBeNull();
    expect(audit.entries).toHaveLength(4);
  });

  it('la línea de tiempo va de lo más reciente a lo más antiguo, por páginas', async () => {
    const id = await registered();
    await consented(id);
    for (const [index, label] of ['Maní', 'Lactosa', 'Gluten'].entries()) {
      clock.current = new Date(Date.UTC(2026, 9, 9, 16 + index));
      await commands().addCondition(responsible, id, { kind: 'INTOLERANCE', label });
    }
    const first = await queries().timeline(reader, id, { limit: 2 });
    expect(first?.items.map((i) => i.detail)).toEqual(['Gluten', 'Lactosa']);
    expect(first?.nextCursor).not.toBeNull();
    const second = await queries().timeline(reader, id, {
      limit: 2,
      cursor: first?.nextCursor ?? undefined,
    });
    expect(second?.items.map((i) => i.detail)).toEqual(['Maní']);
    expect(second?.nextCursor).toBeNull();
    const garbage = await queries().timeline(reader, id, { limit: 5, cursor: '%%%' });
    expect(garbage?.items).toHaveLength(3);
    expect(audit.entries.at(-1)).toMatchObject({
      action: 'READ',
      resourceType: 'clinical.timeline',
    });
    expect(await queries().timeline(reader, 'no-existe', { limit: 5 })).toBeNull();
  });
});

describe('RN-A06 · invitar al paciente a la app', () => {
  it('por defecto al correo de su ficha; con otro correo si se indica; la ficha muestra la pendiente', async () => {
    const id = await registered();
    expect(isOk(await invitations().invite(responsible, id, {}))).toBe(true);
    expect(isOk(await invitations().invite(responsible, id, { email: 'otra@demo.test' }))).toBe(
      true,
    );
    expect(iam.invited).toEqual([
      { patientId: id, email: 'rosa@demo.test' },
      { patientId: id, email: 'otra@demo.test' },
    ]);
    const view = await new PatientQueries(
      uow,
      clock,
      audit,
      fakeEncryption,
      patients,
      consents,
      new FakeFiles().asRegistry(),
      iam.asApi(),
    ).get(responsible, id);
    expect(view?.invitation).toMatchObject({ email: 'otra@demo.test' });
  });

  it('sin correo, ya vinculado, archivado, sin WRITE o un error de iam no invitan', async () => {
    const id = await registered({ email: null });
    const noEmail = await invitations().invite(responsible, id, {});
    expect(isErr(noEmail) && noEmail.error.code).toBe('NC-CLI-024');
    const byReader = await invitations().invite(reader, id, { email: 'a@demo.test' });
    expect(isErr(byReader) && byReader.error.code).toBe('NC-CLI-013');
    iam.result = err(
      domainError({ code: 'NC-IAM-044', message: 'Ese correo ya tiene una cuenta.' }),
    );
    const taken = await invitations().invite(responsible, id, { email: 'a@demo.test' });
    expect(isErr(taken) && taken.error.code).toBe('NC-IAM-044');
    iam.result = null;
    await patients.linkAccount(id, ACCOUNT);
    const linked = await invitations().invite(responsible, id, { email: 'a@demo.test' });
    expect(isErr(linked) && linked.error.code).toBe('NC-CLI-023');
    const second = await registered();
    await patientCommands().archive(responsible, second);
    const archived = await invitations().invite(responsible, second, {});
    expect(isErr(archived) && archived.error.code).toBe('NC-CLI-018');
    const missing = await invitations().invite(responsible, 'no-existe', {});
    expect(isErr(missing) && missing.error.code).toBe('NC-CLI-005');
  });

  it('⚠️ un menor de 14 se invita con ambas finalidades firmadas en papel por su tutor; desde los 14, como un adulto', async () => {
    const child = await registered({ birthDate: '2014-03-01', population: 'CHILD' });
    const early = await invitations().invite(responsible, child, {});
    expect(isErr(early) && early.error).toMatchObject({ code: 'NC-CLI-010', rule: 'RN-B01' });
    const digital = await consentCommands().grant(responsible, child, {
      consentDocumentId: HEALTH_DATA,
      channel: 'IN_PERSON_DIGITAL',
      evidence: null,
      ip: null,
      userAgent: null,
    });
    expect(isErr(digital) && digital.error).toMatchObject({ code: 'NC-CLI-026', rule: 'RN-B01' });
    await signedOnPaper(child, HEALTH_DATA);
    await signedOnPaper(child, APP_ACCESS);
    expect(isOk(await invitations().invite(responsible, child, {}))).toBe(true);
    const teen = await registered({ birthDate: '2011-05-05', population: 'ADOLESCENT' });
    expect(isOk(await invitations().invite(responsible, teen, {}))).toBe(true);
  });
});

describe('RN-A06 y RN-B01 · inscripción desde la invitación', () => {
  const TOKEN = new Uint8Array([1, 2, 3]);
  const input = (patientId: string, accepted: readonly string[]) => ({
    patientId,
    userId: ACCOUNT,
    acceptedConsentDocumentIds: accepted,
    ip: '203.0.113.7',
    userAgent: 'prueba',
  });
  const metadata = { actorUserId: ACCOUNT, actorRole: 'ACCOUNT' as const };

  it('la vista previa pide solo lo que falta y marca al menor de 14; los textos vienen en el orden pedido', async () => {
    patients.previews.set(Buffer.from(TOKEN).toString('hex'), {
      patientId: 'p-1',
      organizationId: ORG,
      firstName: 'Rosa',
      birthDate: '2014-03-01',
      timezone: 'America/Lima',
      status: 'ACTIVE',
      linked: false,
      activePurposes: ['HEALTH_DATA'],
    });
    expect(await enrollment().preview(TOKEN)).toEqual({
      patientId: 'p-1',
      organizationId: ORG,
      firstName: 'Rosa',
      needsGuardian: true,
      linked: false,
      active: true,
      pendingPurposes: ['APP_ACCESS'],
    });
    expect(await enrollment().preview(new Uint8Array([9]))).toBeNull();
    const texts = await enrollment().consentTexts(['APP_ACCESS', 'HEALTH_DATA']);
    expect(texts.map((t) => [t.purpose, t.version])).toEqual([
      ['APP_ACCESS', '0.1-provisional'],
      ['HEALTH_DATA', '0.1-provisional'],
    ]);
  });

  it('vincula la cuenta y registra con canal APP cada finalidad pendiente aceptada', async () => {
    const id = await registered();
    await consented(id, HEALTH_DATA);
    const enrolled = await enrollment().enroll(input(id, [APP_ACCESS, HEALTH_DATA]), metadata);
    expect(isOk(enrolled)).toBe(true);
    expect(patients.rows.get(id)?.userId).toBe(ACCOUNT);
    expect(consents.rows.map((c) => [c.purpose, c.channel])).toEqual([
      ['HEALTH_DATA', 'IN_PERSON_DIGITAL'],
      ['APP_ACCESS', 'APP'],
    ]);
    expect(outbox.types().slice(-2)).toEqual([
      'clinical.consent.granted',
      'clinical.patient.linked',
    ]);
    patients.consents = consents;
    patients.accountUserId = ACCOUNT;
    expect(await enrollment().patientOfAccount()).toEqual({
      patientId: id,
      organizationId: ORG,
      hasAccess: true,
    });
    const again = await enrollment().enroll(input(id, [APP_ACCESS]), metadata);
    expect(isErr(again) && again.error.code).toBe('NC-CLI-023');
  });

  it('sin aceptar cada finalidad, un menor de 14, archivado o inexistente: no se inscribe', async () => {
    const id = await registered();
    const partial = await enrollment().enroll(input(id, [APP_ACCESS]), metadata);
    expect(isErr(partial) && partial.error).toMatchObject({ code: 'NC-CLI-025', rule: 'RN-B01' });
    const child = await registered({ birthDate: '2014-03-01', population: 'CHILD' });
    const fromApp = await enrollment().enroll(input(child, [APP_ACCESS, HEALTH_DATA]), metadata);
    expect(isErr(fromApp) && fromApp.error).toMatchObject({ code: 'NC-CLI-010', rule: 'RN-B01' });
    // Desde los 14 años acepta desde la app como un adulto.
    const teen = await registered({ birthDate: '2011-05-05', population: 'ADOLESCENT' });
    expect(isOk(await enrollment().enroll(input(teen, [APP_ACCESS, HEALTH_DATA]), metadata))).toBe(
      true,
    );
    await patientCommands().archive(responsible, id);
    const archived = await enrollment().enroll(input(id, [APP_ACCESS, HEALTH_DATA]), metadata);
    expect(isErr(archived) && archived.error.code).toBe('NC-CLI-018');
    const missing = await enrollment().enroll(input('no-existe', []), metadata);
    expect(isErr(missing) && missing.error.code).toBe('NC-CLI-005');
    expect(patients.rows.get(id)?.userId).toBeNull();
  });
});

describe('RF-06 · códigos de paciente para la auditoría', () => {
  it('la API pública da el código de los pacientes que el contexto ve', async () => {
    const id = await registered();
    const codes = await new ClinicalApi(patients, consents).patientCodes([id, 'no-existe']);
    expect([...codes.entries()]).toEqual([[id, 'P-000001']]);
  });
});

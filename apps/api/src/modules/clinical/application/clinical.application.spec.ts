import { isErr, isOk } from '@nutricoach/shared-kernel';
import { beforeEach, describe, expect, it } from 'vitest';
import { ClinicalApi } from './clinical-api.js';
import { ConsentCommands } from './commands/consent.commands.js';
import { PatientCommands } from './commands/patient.commands.js';
import {
  DOCUMENTS,
  FakeAudit,
  FakeClock,
  FakeFiles,
  fakeEncryption,
  fakeIds,
  FakeOutbox,
  fakeTenancy,
  FakeUow,
  MemoryConsents,
  MemoryPatients,
  staffContext,
} from './clinical-fakes.spec-support.js';
import { PatientQueries } from './queries/patient.queries.js';

const RESPONSIBLE = '0192f0a0-0000-7000-8000-0000000000a1';
const TEAM = '0192f0a0-0000-7000-8000-0000000000a2';
const OTHER = '0192f0a0-0000-7000-8000-0000000000a3';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PERSON = {
  firstName: 'José',
  lastName: 'Quispe',
  sex: 'M',
  birthDate: '1990-05-20',
  population: 'ADULT',
} as const;

let clock: FakeClock;
let uow: FakeUow;
let outbox: FakeOutbox;
let audit: FakeAudit;
let patients: MemoryPatients;
let consents: MemoryConsents;
let files: FakeFiles;
let capacity: { max: number };

const responsible = staffContext('PROFESSIONAL', RESPONSIBLE);
const team = staffContext('PROFESSIONAL', TEAM);
const other = staffContext('PROFESSIONAL', OTHER);
const owner = staffContext('OWNER', '0192f0a0-0000-7000-8000-0000000000a0');

const commands = () =>
  new PatientCommands(
    uow,
    clock,
    fakeIds,
    outbox,
    fakeEncryption,
    patients,
    consents,
    fakeTenancy(new Set([RESPONSIBLE, TEAM, OTHER]), capacity),
  );
const consentCommands = () =>
  new ConsentCommands(uow, clock, fakeIds, outbox, patients, consents, files.asRegistry());
const queries = () =>
  new PatientQueries(uow, clock, audit, fakeEncryption, patients, consents, files.asRegistry());

async function registered(input: object = {}): Promise<string> {
  const result = await commands().register(responsible, { ...PERSON, ...input });
  if (!result.ok) throw new Error(result.error.code);
  return result.value.id;
}

beforeEach(() => {
  clock = new FakeClock();
  uow = new FakeUow();
  outbox = new FakeOutbox();
  audit = new FakeAudit();
  patients = new MemoryPatients();
  consents = new MemoryConsents();
  files = new FakeFiles();
  capacity = { max: 3 };
});

describe('RF-08 · alta de pacientes', () => {
  it('RN-B06 · cifra el documento y el teléfono, guarda el índice ciego y suma al responsable al equipo', async () => {
    const id = await registered({
      document: { type: 'DNI', number: '4567-8912' },
      phone: '999 888 777',
    });
    const row = patients.rows.get(id);
    expect(row?.code).toBe('P-000001');
    expect(new TextDecoder().decode(row?.documentNumberEnc ?? new Uint8Array())).not.toContain(
      '45678912',
    );
    expect(row?.phoneEnc).not.toBeNull();
    expect(await patients.careTeam(id)).toEqual([
      { memberId: RESPONSIBLE, role: 'RESPONSIBLE', access: 'WRITE' },
    ]);
    expect(outbox.types()).toEqual(['clinical.patient.registered']);
  });

  it('documento inválido, documento repetido, responsable ajeno y OBESITY sin consentimiento no entran', async () => {
    const bad = await commands().register(responsible, {
      ...PERSON,
      document: { type: 'DNI', number: '123' },
    });
    expect(isErr(bad) && bad.error.code).toBe('NC-CLI-003');
    await registered({ document: { type: 'DNI', number: '45678912' } });
    const twice = await commands().register(team, {
      ...PERSON,
      document: { type: 'DNI', number: '45678912' },
    });
    expect(isErr(twice) && twice.error.code).toBe('NC-CLI-004');
    const stranger = await commands().register(responsible, {
      ...PERSON,
      responsibleMemberId: 'no-es-miembro',
    });
    expect(isErr(stranger) && stranger.error.code).toBe('NC-CLI-012');
    const obesity = await commands().register(responsible, { ...PERSON, population: 'OBESITY' });
    expect(isErr(obesity) && obesity.error.rule).toBe('RN-B01');
  });

  it('RN-A03 · el cupo se verifica al registrar y al reactivar; archivar libera', async () => {
    capacity.max = 1;
    const first = await registered();
    const over = await commands().register(responsible, PERSON);
    expect(isErr(over) && over.error.rule).toBe('RN-A03');
    expect(isOk(await commands().archive(responsible, first))).toBe(true);
    await registered();
    const back = await commands().reactivate(responsible, first);
    expect(isErr(back) && back.error.rule).toBe('RN-A03');
    const again = await commands().archive(responsible, first);
    expect(isErr(again) && again.error.code).toBe('NC-CLI-007');
  });
});

describe('RN-A05 · quién edita, gestiona y arma el equipo', () => {
  it('editar exige WRITE; el responsable lo cambia quien gestiona y el anterior queda como colaborador', async () => {
    const id = await registered();
    const notTeam = await commands().update(other, id, 0, { firstName: 'Otro' });
    expect(isErr(notTeam) && notTeam.error.code).toBe('NC-CLI-013');
    expect(
      isOk(
        await commands().setCareTeamMember(responsible, id, {
          memberId: TEAM,
          role: 'NUTRITION',
          access: 'WRITE',
        }),
      ),
    ).toBe(true);
    const byTeam = await commands().update(team, id, 0, { responsibleMemberId: TEAM });
    expect(isErr(byTeam) && byTeam.error.code).toBe('NC-CLI-006');
    expect(
      isOk(
        await commands().update(owner, id, 0, { responsibleMemberId: TEAM, lastName: 'Huamán' }),
      ),
    ).toBe(true);
    expect(patients.rows.get(id)?.responsibleMemberId).toBe(TEAM);
    expect(await patients.careTeam(id)).toEqual(
      expect.arrayContaining([
        { memberId: RESPONSIBLE, role: 'COLLABORATOR', access: 'WRITE' },
        { memberId: TEAM, role: 'RESPONSIBLE', access: 'WRITE' },
      ]),
    );
    const stale = await commands().update(owner, id, 0, { firstName: 'Tarde' });
    expect(isErr(stale) && stale.error.code).toBe('NC-CLI-015');
  });

  it('documento y teléfono se vuelven a cifrar; OBESITY solo con HEALTH_DATA', async () => {
    const id = await registered();
    const obesity = await commands().update(responsible, id, 0, { population: 'OBESITY' });
    expect(isErr(obesity) && obesity.error.rule).toBe('RN-B01');
    await consentCommands().grant(responsible, id, {
      consentDocumentId: DOCUMENTS[0]?.id ?? '',
      channel: 'IN_PERSON_DIGITAL',
      evidence: null,
      ip: null,
      userAgent: null,
    });
    const ok = await commands().update(responsible, id, 0, {
      population: 'OBESITY',
      document: { type: 'CE', number: 'ab12345' },
      phone: null,
    });
    expect(isOk(ok)).toBe(true);
    expect(patients.rows.get(id)).toMatchObject({
      population: 'OBESITY',
      documentType: 'CE',
      phoneEnc: null,
    });
    const invalid = await commands().update(responsible, id, 1, {
      document: { type: 'DNI', number: 'x' },
    });
    expect(isErr(invalid) && invalid.error.code).toBe('NC-CLI-003');
  });

  it('el equipo lo arman el responsable, OWNER o ADMIN; el responsable no se quita; un miembro ajeno no entra', async () => {
    const id = await registered();
    const byOther = await commands().setCareTeamMember(other, id, {
      memberId: OTHER,
      role: 'COLLABORATOR',
      access: 'READ',
    });
    expect(isErr(byOther) && byOther.error.code).toBe('NC-CLI-006');
    const self = await commands().setCareTeamMember(responsible, id, {
      memberId: RESPONSIBLE,
      role: 'COLLABORATOR',
      access: 'READ',
    });
    expect(isErr(self) && self.error.code).toBe('NC-CLI-014');
    const stranger = await commands().setCareTeamMember(responsible, id, {
      memberId: 'no-es-miembro',
      role: 'COLLABORATOR',
      access: 'READ',
    });
    expect(isErr(stranger) && stranger.error.code).toBe('NC-CLI-012');
    expect(
      isOk(
        await commands().setCareTeamMember(owner, id, {
          memberId: OTHER,
          role: 'COLLABORATOR',
          access: 'READ',
        }),
      ),
    ).toBe(true);
    expect(isErr(await commands().removeCareTeamMember(responsible, id, RESPONSIBLE))).toBe(true);
    expect(isOk(await commands().removeCareTeamMember(responsible, id, OTHER))).toBe(true);
    expect(isErr(await commands().removeCareTeamMember(responsible, id, OTHER))).toBe(true);
    expect(isErr(await commands().removeCareTeamMember(other, id, TEAM))).toBe(true);
    expect(isErr(await commands().archive(other, id))).toBe(true);
    for (const missing of [
      commands().update(owner, 'no-existe', 0, {}),
      commands().archive(owner, 'no-existe'),
      commands().setCareTeamMember(owner, 'no-existe', {
        memberId: OTHER,
        role: 'COLLABORATOR',
        access: 'READ',
      }),
      commands().removeCareTeamMember(owner, 'no-existe', OTHER),
    ]) {
      const result = await missing;
      expect(isErr(result) && result.error.code).toBe('NC-CLI-005');
    }
  });
});

describe('RF-05 · consentimiento', () => {
  const grant = (context = responsible, patientId = '', overrides: object = {}) =>
    consentCommands().grant(context, patientId, {
      consentDocumentId: DOCUMENTS[1]?.id ?? '',
      channel: 'PAPER_SCANNED',
      evidence: PNG,
      ip: '203.0.113.7',
      userAgent: 'prueba',
      ...overrides,
    });

  it('en papel guarda la evidencia y la registra; si falla, la descarta; un tipo no admitido se rechaza', async () => {
    const id = await registered();
    const ok = await grant(responsible, id);
    expect(isOk(ok)).toBe(true);
    expect([...files.stored.values()].every((f) => f.registered)).toBe(true);
    const twice = await grant(responsible, id);
    expect(isErr(twice) && twice.error.code).toBe('NC-CLI-008');
    expect(files.discarded).toBe(1);
    const fake = await grant(responsible, id, { evidence: new TextEncoder().encode('%PDX') });
    expect(isErr(fake) && fake.error.code).toBe('NC-CLI-017');
    const noTeam = await grant(other, id, { consentDocumentId: DOCUMENTS[0]?.id ?? '' });
    expect(isErr(noTeam) && noTeam.error.code).toBe('NC-CLI-013');
    const old = await grant(responsible, id, { consentDocumentId: 'texto-viejo' });
    expect(isErr(old) && old.error.code).toBe('NC-CLI-016');
    expect(outbox.types()).toContain('clinical.consent.granted');
  });

  it('archivado no recibe consentimientos; revocar emite el evento con la cuenta del paciente', async () => {
    const id = await registered();
    expect(
      isOk(
        await grant(responsible, id, {
          consentDocumentId: DOCUMENTS[0]?.id ?? '',
          evidence: null,
          channel: 'IN_PERSON_DIGITAL',
        }),
      ),
    ).toBe(true);
    const consentId = consents.rows[0]?.id ?? '';
    expect(isErr(await consentCommands().revoke(other, id, consentId))).toBe(true);
    expect(isOk(await consentCommands().revoke(responsible, id, consentId))).toBe(true);
    const twice = await consentCommands().revoke(responsible, id, consentId);
    expect(isErr(twice) && twice.error.code).toBe('NC-CLI-011');
    expect(outbox.events.at(-1)).toMatchObject({
      type: 'clinical.consent.revoked',
      payload: { purpose: 'HEALTH_DATA' },
    });
    await commands().archive(responsible, id);
    const archived = await grant(responsible, id);
    expect(isErr(archived) && archived.error.code).toBe('NC-CLI-018');
    expect(isErr(await consentCommands().revoke(responsible, 'no-existe', consentId))).toBe(true);
    expect(isErr(await grant(responsible, 'no-existe'))).toBe(true);
  });

  it('ConsentPolicy · sin HEALTH_DATA vigente, la API pública lo niega con RN-B01', async () => {
    const api = new ClinicalApi(patients, consents);
    const id = await registered();
    const without = await api.ensureHealthDataConsent(id);
    expect(isErr(without) && without.error.rule).toBe('RN-B01');
    await grant(responsible, id, {
      consentDocumentId: DOCUMENTS[0]?.id ?? '',
      evidence: null,
      channel: 'IN_PERSON_DIGITAL',
    });
    expect(isOk(await api.ensureHealthDataConsent(id))).toBe(true);
    expect(await api.countActivePatients()).toBe(1);
    await commands().archive(responsible, id);
    const archived = await api.ensureHealthDataConsent(id);
    expect(isErr(archived) && archived.error.code).toBe('NC-CLI-018');
    expect(isErr(await api.ensureHealthDataConsent('no-existe'))).toBe(true);
  });
});

describe('Consultas', () => {
  it('ficha con los 4 últimos dígitos, edad y READ en auditoría; búsqueda paginada por documento y nombre', async () => {
    const id = await registered({ document: { type: 'DNI', number: '45678912' } });
    await registered({ lastName: 'Zapata' });
    await registered({ lastName: 'Ayala' });
    const view = await queries().get(responsible, id);
    expect(view).toMatchObject({ documentLast4: '8912', ageYears: 36 });
    expect(audit.entries).toEqual([
      expect.objectContaining({ action: 'READ', resourceType: 'clinical.patient' }),
    ]);
    expect(await queries().get(responsible, 'no-existe')).toBeNull();

    const page = await queries().search(responsible, { status: 'ACTIVE', limit: 2 });
    expect(page.patients.map((p) => p.lastName)).toEqual(['Ayala', 'Quispe']);
    expect(page.nextCursor).not.toBeNull();
    const next = await queries().search(responsible, {
      status: 'ACTIVE',
      limit: 2,
      cursor: page.nextCursor ?? '',
    });
    expect(next.patients.map((p) => p.lastName)).toEqual(['Zapata']);
    const byDocument = await queries().search(responsible, {
      status: 'ACTIVE',
      limit: 10,
      documentType: 'DNI',
      documentNumber: '4567 8912',
    });
    expect(byDocument.patients.map((p) => p.id)).toEqual([id]);
    const invalid = await queries().search(responsible, {
      status: 'ACTIVE',
      limit: 10,
      documentType: 'DNI',
      documentNumber: '1',
    });
    expect(invalid.patients).toEqual([]);
    const garbage = await queries().search(responsible, {
      status: 'ACTIVE',
      limit: 10,
      cursor: '%%%',
    });
    expect(garbage.patients).toHaveLength(3);
  });

  it('consentimientos, textos vigentes y evidencia auditada solo si se ve al paciente', async () => {
    const id = await registered();
    await consentCommands().grant(responsible, id, {
      consentDocumentId: DOCUMENTS[1]?.id ?? '',
      channel: 'PAPER_SCANNED',
      evidence: PNG,
      ip: null,
      userAgent: null,
    });
    const consentId = consents.rows[0]?.id ?? '';
    expect(await queries().consents(responsible, id)).toHaveLength(1);
    expect(await queries().consents(responsible, 'no-existe')).toBeNull();
    expect(await queries().currentDocuments(responsible)).toHaveLength(2);
    const file = await queries().evidence(responsible, id, consentId);
    expect(file?.mimeType).toBe('image/png');
    expect(audit.entries.at(-1)).toMatchObject({
      action: 'READ',
      resourceType: 'clinical.consent',
    });
    expect(await queries().evidence(responsible, 'no-existe', consentId)).toBeNull();
    expect(await queries().evidence(responsible, id, 'otro')).toBeNull();
  });
});

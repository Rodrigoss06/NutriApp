import { isErr, isOk, type SecurityContext } from '@nutricoach/shared-kernel';
import { beforeEach, describe, expect, it } from 'vitest';
import type { FileRegistry } from '../../../platform/index.js';
import { PATIENT_NOT_FOUND } from '../domain/clinical-rules.js';
import {
  PATIENT_ANONYMIZED,
  SUPPRESSION_CODE_MISMATCH,
  SUPPRESSION_NOT_ALLOWED,
  SUPPRESSION_NOT_ARCHIVED,
} from '../domain/patient-suppression.js';
import {
  fakeIds,
  FakeClock,
  FakeOutbox,
  FakeUow,
  MemoryPatients,
  ORG,
  staffContext,
} from './clinical-fakes.spec-support.js';
import { PatientSuppressionCommands } from './commands/patient-suppression.commands.js';
import type { PatientRecord } from './ports/clinical.ports.js';

/** RN-B05 (ADR-133): la supresión con puertos en memoria. Lo que anonimiza la base lo prueba la integración. */

const PATIENT = '0192f0a0-0000-7000-8000-0000000000b1';
const OWNER = '0192f0a0-0000-7000-8000-0000000000a3';

const patient = (overrides: Partial<PatientRecord> = {}): PatientRecord => ({
  id: PATIENT,
  organizationId: ORG,
  userId: null,
  code: 'P-0007',
  firstName: 'Luis',
  lastName: 'Ejemplo Sintético',
  sex: 'M',
  birthDate: '1998-10-13',
  documentType: null,
  documentNumberEnc: null,
  documentNumberBidx: null,
  email: 'luis@demo.test',
  phoneEnc: null,
  timezone: 'America/Lima',
  population: 'ADULT',
  status: 'ARCHIVED',
  responsibleMemberId: OWNER,
  version: 1,
  anonymizedAt: null,
  ...overrides,
});

class Discards {
  readonly keys: string[] = [];
  fail = false;
  discard(key: string) {
    if (this.fail) return Promise.reject(new Error('almacenamiento caído'));
    this.keys.push(key);
    return Promise.resolve();
  }
  asRegistry(): FileRegistry {
    return this as unknown as FileRegistry;
  }
}

let patients: MemoryPatients;
let outbox: FakeOutbox;
let files: Discards;
let commands: PatientSuppressionCommands;
let owner: SecurityContext;

beforeEach(async () => {
  patients = new MemoryPatients();
  await patients.insert(patient());
  outbox = new FakeOutbox();
  files = new Discards();
  commands = new PatientSuppressionCommands(
    new FakeUow(),
    patients,
    files.asRegistry(),
    outbox,
    new FakeClock(),
    fakeIds,
  );
  owner = staffContext('OWNER', OWNER);
});

describe('RN-B05 · suprimir al paciente', () => {
  it('el dueño, con su código: lo anonimiza, sale el evento y se borran los bytes de sus archivos', async () => {
    const result = await commands.suppress(owner, PATIENT, ' p-0007 ');
    expect(isOk(result) && result.value).toEqual({ filesDeleted: 1, notDiscarded: 0 });
    expect(patients.rows.get(PATIENT)).toMatchObject({ firstName: 'Anonimizado', email: null });
    expect(outbox.types()).toEqual(['clinical.patient.anonymized']);
    expect(outbox.events[0]?.payload).toEqual({ patientId: PATIENT, filesDeleted: 1 });
    expect(files.keys).toEqual([`org/archivo-de-${PATIENT}`]);
  });

  it('un archivo que no se borró del almacenamiento se cuenta: ya está marcado borrado', async () => {
    files.fail = true;
    const result = await commands.suppress(owner, PATIENT, 'P-0007');
    expect(isOk(result) && result.value).toEqual({ filesDeleted: 1, notDiscarded: 1 });
  });

  it('con otro código, sin ser dueño, sin archivar, dos veces o sin paciente, no', async () => {
    const wrong = await commands.suppress(owner, PATIENT, 'P-0008');
    expect(isErr(wrong) && wrong.error).toBe(SUPPRESSION_CODE_MISMATCH);
    const admin = await commands.suppress(staffContext('ADMIN', OWNER), PATIENT, 'P-0007');
    expect(isErr(admin) && admin.error).toBe(SUPPRESSION_NOT_ALLOWED);
    await patients.insert(patient({ id: 'activo', status: 'ACTIVE' }));
    const active = await commands.suppress(owner, 'activo', 'P-0007');
    expect(isErr(active) && active.error).toBe(SUPPRESSION_NOT_ARCHIVED);
    await commands.suppress(owner, PATIENT, 'P-0007');
    const twice = await commands.suppress(owner, PATIENT, 'P-0007');
    expect(isErr(twice) && twice.error).toBe(PATIENT_ANONYMIZED);
    const missing = await commands.suppress(owner, 'otro', 'P-0007');
    expect(isErr(missing) && missing.error).toBe(PATIENT_NOT_FOUND);
    expect(outbox.events).toHaveLength(1);
  });
});

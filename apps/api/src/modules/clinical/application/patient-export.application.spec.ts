import { strFromU8, unzipSync } from 'fflate';
import type { OrganizationId, SecurityContext, UserId } from '@nutricoach/shared-kernel';
import { isErr, isOk } from '@nutricoach/shared-kernel';
import { v7 as uuidv7 } from 'uuid';
import { beforeEach, describe, expect, it } from 'vitest';
import type { FileRegistry, PatientFile } from '../../../platform/index.js';
import type { TenancyApi } from '../../tenancy/index.js';
import { FflateArchiveWriter } from '../adapters/out/archive/fflate-archive.writer.js';
import {
  EXPORT_EXPIRED,
  EXPORT_FAILED,
  EXPORT_NOT_ALLOWED,
  EXPORT_NOT_FOUND,
  EXPORT_NOT_READY,
  type PatientExportRecord,
} from '../domain/patient-export.js';
import { PATIENT_NOT_FOUND } from '../domain/clinical-rules.js';
import {
  fakeEncryption,
  fakeIds,
  FakeAudit,
  FakeClock,
  FakeOutbox,
  FakeUow,
  MemoryPatients,
  ORG,
  staffContext,
} from './clinical-fakes.spec-support.js';
import { ClinicalExportSource } from './clinical-export-source.js';
import { documentAad, phoneAad } from './commands/patient.commands.js';
import { PatientExportCommands } from './commands/patient-export.commands.js';
import { EXPORT_FILE_PURPOSE, PatientExportBuilder } from './patient-export-builder.js';
import { PatientExportSources } from './patient-export-sources.js';
import type { PatientRecord } from './ports/clinical.ports.js';
import type { NewPatientExport, PatientExportStore } from './ports/patient-export.ports.js';
import { PatientExportQueries } from './queries/patient-export.queries.js';

/** RN-B04 (ADR-131): pedir, armar, listar, descargar y cerrar la exportación, con puertos en memoria. La RLS la prueba la integración. */

const RESPONSIBLE = '0192f0a0-0000-7000-8000-0000000000a1';
const TEAM = '0192f0a0-0000-7000-8000-0000000000a2';
const OWNER = '0192f0a0-0000-7000-8000-0000000000a3';
const PATIENT = '0192f0a0-0000-7000-8000-0000000000b1';
const HOUR = 3_600_000;

class MemoryExports implements PatientExportStore {
  readonly records = new Map<string, PatientExportRecord>();
  readonly tables = new Map<string, Record<string, unknown>[]>();
  readonly asked: { table: string; requesterMemberId: string | null }[] = [];

  insert(record: NewPatientExport) {
    this.records.set(record.id, {
      ...record,
      status: 'PENDING',
      fileId: null,
      sizeBytes: null,
      readyAt: null,
      expiresAt: null,
    });
    return Promise.resolve();
  }
  find(id: string) {
    return Promise.resolve(this.records.get(id) ?? null);
  }
  listByRequester(patientId: string, requestedBy: string, since: Date) {
    return Promise.resolve(
      [...this.records.values()]
        .filter(
          (r) => r.patientId === patientId && r.requestedBy === requestedBy && r.createdAt >= since,
        )
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    );
  }
  markReady(
    id: string,
    file: { fileId: string; sizeBytes: number },
    readyAt: Date,
    expiresAt: Date,
  ) {
    const row = this.records.get(id);
    if (row?.status !== 'PENDING') return Promise.resolve(false);
    this.records.set(id, { ...row, status: 'READY', ...file, readyAt, expiresAt });
    return Promise.resolve(true);
  }
  toClose(expiredAt: Date, staleBefore: Date) {
    const all = [...this.records.values()];
    return Promise.resolve({
      expired: all.filter((r) => r.status === 'READY' && r.expiresAt && r.expiresAt <= expiredAt),
      stale: all.filter((r) => r.status === 'PENDING' && r.createdAt <= staleBefore),
    });
  }
  close(id: string, status: 'EXPIRED' | 'FAILED') {
    const row = this.records.get(id);
    if (row) this.records.set(id, { ...row, status });
    return Promise.resolve();
  }
  rows(
    table: { table: string },
    params: { patientId: string; requesterMemberId: string | null },
  ): Promise<readonly Record<string, unknown>[]> {
    this.asked.push({ table: table.table, requesterMemberId: params.requesterMemberId });
    return Promise.resolve(this.tables.get(table.table) ?? []);
  }
}

/** FileRegistry en memoria para la exportación: los archivos del paciente, el ZIP escrito y lo que se retira o descarta. */
class ExportFiles {
  readonly patientFiles: (PatientFile & { content: Uint8Array })[] = [];
  readonly written = new Map<string, Uint8Array>();
  readonly registered: { id: string; purpose: string; patientId: string | null }[] = [];
  readonly retired: string[] = [];
  discarded: string[] = [];
  failDiscard = false;

  listForPatient(_patientId: string, excluded: readonly string[]) {
    return Promise.resolve(this.patientFiles.filter((f) => !excluded.includes(f.purpose)));
  }
  read(id: string) {
    const file = this.patientFiles.find((f) => f.id === id);
    const written = this.written.get(id);
    if (file)
      return Promise.resolve({ content: Buffer.from(file.content), mimeType: file.mimeType });
    return Promise.resolve(
      written ? { content: Buffer.from(written), mimeType: 'application/zip' } : null,
    );
  }
  readKey(storageKey: string) {
    const file = this.patientFiles.find((f) => f.storageKey === storageKey);
    return file
      ? Promise.resolve(Buffer.from(file.content))
      : Promise.reject(new Error('sin archivo'));
  }
  writeArchive(_org: OrganizationId, content: Uint8Array) {
    const id = uuidv7();
    this.written.set(id, content);
    return Promise.resolve({
      id,
      key: `org/${id}`,
      mimeType: 'application/zip' as const,
      sha256: new Uint8Array(32),
    });
  }
  register(file: { id: string; purpose: string; patientId: string | null }) {
    this.registered.push({ id: file.id, purpose: file.purpose, patientId: file.patientId });
    return Promise.resolve();
  }
  retire(fileId: string) {
    this.retired.push(fileId);
    return Promise.resolve(`org/${fileId}`);
  }
  discard(key: string) {
    if (this.failDiscard) return Promise.reject(new Error('almacenamiento caído'));
    this.discarded.push(key);
    return Promise.resolve();
  }
  asRegistry(): FileRegistry {
    return this as unknown as FileRegistry;
  }
}

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
  email: null,
  phoneEnc: null,
  timezone: 'America/Lima',
  population: 'ADULT',
  status: 'ACTIVE',
  responsibleMemberId: RESPONSIBLE,
  version: 1,
  ...overrides,
});

const patientContext = (): SecurityContext & { patientId: string } => ({
  organizationId: ORG,
  userId: uuidv7() as UserId,
  role: 'PATIENT',
  patientId: PATIENT as SecurityContext['patientId'] & string,
});

let clock: FakeClock;
let uow: FakeUow;
let outbox: FakeOutbox;
let audit: FakeAudit;
let patients: MemoryPatients;
let store: MemoryExports;
let files: ExportFiles;
let sources: PatientExportSources;
let commands: PatientExportCommands;
let queries: PatientExportQueries;
let builder: PatientExportBuilder;
let responsible: SecurityContext;

const tenancy = { organizationIds: () => Promise.resolve([ORG]) } as unknown as TenancyApi;

beforeEach(async () => {
  clock = new FakeClock();
  uow = new FakeUow();
  outbox = new FakeOutbox();
  audit = new FakeAudit();
  patients = new MemoryPatients();
  await patients.insert(patient());
  store = new MemoryExports();
  files = new ExportFiles();
  sources = new PatientExportSources();
  commands = new PatientExportCommands(
    uow,
    store,
    patients,
    files.asRegistry(),
    tenancy,
    outbox,
    clock,
    fakeIds,
  );
  queries = new PatientExportQueries(uow, store, patients, files.asRegistry(), audit, clock);
  builder = new PatientExportBuilder(
    uow,
    store,
    patients,
    sources,
    files.asRegistry(),
    new FflateArchiveWriter(),
    clock,
  );
  responsible = staffContext('PROFESSIONAL', RESPONSIBLE);
});

async function requested(context: SecurityContext = responsible): Promise<PatientExportRecord> {
  const result = await commands.request(context, PATIENT);
  if (!isOk(result)) throw new Error(JSON.stringify(result.error));
  return result.value.export;
}

describe('RN-B04 · pedir la exportación', () => {
  it('el responsable la pide: queda pendiente con su miembro y sale el evento; otra vez, la misma', async () => {
    const first = await commands.request(responsible, PATIENT);
    expect(isOk(first) && first.value).toMatchObject({
      created: true,
      export: { status: 'PENDING' },
    });
    const record = isOk(first) ? first.value.export : null;
    expect(record).toMatchObject({ requestedByRole: 'STAFF', requestedByMember: RESPONSIBLE });
    expect(outbox.types()).toEqual(['clinical.export.requested']);
    const again = await commands.request(responsible, PATIENT);
    expect(isOk(again) && again.value).toMatchObject({
      created: false,
      export: { id: record?.id },
    });
    expect(outbox.events).toHaveLength(1);
  });

  it('una pendiente de hace más de una hora no se reutiliza: se pide otra', async () => {
    const old = await requested();
    clock.current = new Date(clock.current.getTime() + 2 * HOUR);
    const fresh = await requested();
    expect(fresh.id).not.toBe(old.id);
  });

  it('el dueño también; otro del equipo no, y un paciente que no se ve es 404', async () => {
    expect(isOk(await commands.request(staffContext('OWNER', OWNER), PATIENT))).toBe(true);
    const team = await commands.request(staffContext('PROFESSIONAL', TEAM), PATIENT);
    expect(isErr(team) && team.error).toBe(EXPORT_NOT_ALLOWED);
    const missing = await commands.request(responsible, uuidv7());
    expect(isErr(missing) && missing.error).toBe(PATIENT_NOT_FOUND);
  });

  it('el paciente la pide desde su app, sin miembro', async () => {
    const result = await commands.requestAsPatient(patientContext());
    expect(isOk(result) && result.value.export).toMatchObject({
      requestedByRole: 'PATIENT',
      requestedByMember: null,
      patientId: PATIENT,
    });
  });
});

describe('RN-B04 · armar la exportación en el worker', () => {
  it('prepara cada fuente, lee sus tablas con quien la pidió, junta los archivos y la deja lista por 24 horas', async () => {
    const prepared: string[] = [];
    sources.register(new ClinicalExportSource(fakeEncryption));
    sources.register({
      context: 'documents',
      tables: [{ table: 'documents.generated_document' }],
      prepare: (_org, patientId) => Promise.resolve(void prepared.push(patientId)),
    });
    store.tables.set('clinical.patient', [
      {
        id: PATIENT,
        first_name: 'Luis',
        document_number_enc: `\\x${Buffer.from(fakeEncryption.encrypt('12345678', documentAad(PATIENT))).toString('hex')}`,
        document_number_bidx: '\\x00',
        phone_enc: `\\x${Buffer.from(fakeEncryption.encrypt('999888777', phoneAad(PATIENT))).toString('hex')}`,
      },
    ]);
    store.tables.set('clinical.clinical_note', [{ id: 'n1', body: 'Primera consulta.' }]);
    files.patientFiles.push(
      {
        id: 'f1',
        storageKey: 'org/f1',
        purpose: 'PROGRESS_PHOTO',
        mimeType: 'image/jpeg',
        sizeBytes: 4,
        sha256: new Uint8Array([1]),
        createdAt: clock.now(),
        content: new Uint8Array([0xff, 0xd8, 0xff, 1]),
      },
      {
        id: 'old',
        storageKey: 'org/old',
        purpose: EXPORT_FILE_PURPOSE,
        mimeType: 'application/zip',
        sizeBytes: 4,
        sha256: new Uint8Array([2]),
        createdAt: clock.now(),
        content: new Uint8Array([1, 2, 3, 4]),
      },
    );
    const record = await requested();

    await builder.build(ORG, record.id);

    expect(prepared).toEqual([PATIENT]);
    expect(store.asked.map((a) => a.table)).toContain('clinical.clinical_note');
    expect(new Set(store.asked.map((a) => a.requesterMemberId))).toEqual(new Set([RESPONSIBLE]));
    const ready = store.records.get(record.id);
    expect(ready?.status).toBe('READY');
    expect((ready?.expiresAt?.getTime() ?? 0) - (ready?.readyAt?.getTime() ?? 0)).toBe(24 * HOUR);
    expect(files.registered).toEqual([
      { id: ready?.fileId, purpose: EXPORT_FILE_PURPOSE, patientId: PATIENT },
    ]);
    const zip = unzipSync(files.written.get(ready?.fileId ?? '') ?? new Uint8Array());
    const data = JSON.parse(strFromU8(zip['datos.json'] ?? new Uint8Array())) as {
      tables: Record<string, Record<string, unknown>[]>;
    };
    expect(data.tables['clinical.patient']).toEqual([
      { id: PATIENT, first_name: 'Luis', document_number: '12345678', phone: '999888777' },
    ]);
    expect(Object.keys(zip).filter((path) => path.includes('/'))).toEqual([
      'csv/clinical.patient.csv',
      'csv/clinical.clinical_note.csv',
      'fotos-de-progreso/2026-10-09-f1.jpg',
    ]);

    // Ya no está pendiente: no se vuelve a armar.
    await builder.build(ORG, record.id);
    expect(files.registered).toHaveLength(1);
  });

  it('no arma la que el trabajo de cada hora ya da por fallida, ni la de un paciente que ya no está', async () => {
    const stale = await requested();
    clock.current = new Date(clock.current.getTime() + 2 * HOUR);
    await builder.build(ORG, stale.id);
    await builder.build(ORG, uuidv7());
    const gone = await requested();
    patients.rows.delete(PATIENT);
    await builder.build(ORG, gone.id);
    expect(files.written.size).toBe(0);
  });

  it('si deja de estar pendiente mientras se arma (otra entrega la dejó lista), descarta su ZIP sin fallar', async () => {
    const record = await requested();
    const markReady = store.markReady.bind(store);
    store.markReady = () => Promise.resolve(false);
    await builder.build(ORG, record.id);
    expect(files.discarded).toHaveLength(1);
    store.markReady = markReady;
  });

  it('un error al guardar descarta el ZIP y falla para que la cola reintente', async () => {
    const record = await requested();
    files.register = () => Promise.reject(new Error('base caída'));
    await expect(builder.build(ORG, record.id)).rejects.toThrow('base caída');
    expect(files.discarded).toHaveLength(1);
    expect(store.records.get(record.id)?.status).toBe('PENDING');
  });
});

describe('RN-B04 · listar y descargar', () => {
  async function built(context: SecurityContext = responsible): Promise<PatientExportRecord> {
    const record = await requested(context);
    await builder.build(ORG, record.id);
    return store.records.get(record.id) ?? record;
  }

  it('cada uno ve las suyas, con el estado que corresponde a la hora', async () => {
    const mine = await built();
    await requested(staffContext('OWNER', OWNER));
    const listed = await queries.list(responsible, PATIENT);
    expect(isOk(listed) && listed.value.exports.map((e) => [e.id, e.status])).toEqual([
      [mine.id, 'READY'],
    ]);
    expect(isOk(listed) && listed.value.timezone).toBe('America/Lima');
    clock.current = new Date(clock.current.getTime() + 25 * HOUR);
    const later = await queries.list(responsible, PATIENT);
    expect(isOk(later) && later.value.exports.map((e) => e.status)).toEqual(['EXPIRED']);
    const missing = await queries.list(responsible, uuidv7());
    expect(isErr(missing) && missing.error).toBe(PATIENT_NOT_FOUND);
  });

  it('el paciente lista las suyas', async () => {
    const context = patientContext();
    const asked = await commands.requestAsPatient(context);
    const listed = await queries.listForPatient(context);
    expect(isOk(listed) && listed.value.exports.map((e) => e.id)).toEqual([
      isOk(asked) ? asked.value.export.id : null,
    ]);
    patients.rows.delete(PATIENT);
    const gone = await queries.listForPatient(context);
    expect(isErr(gone) && gone.error).toBe(PATIENT_NOT_FOUND);
  });

  it('descarga solo quien la pidió, del paciente de la ruta, lista y sin vencer; queda en la auditoría', async () => {
    const record = await built();
    const file = await queries.file(responsible, PATIENT, record.id);
    expect(isOk(file) && file.value.fileName).toBe('exportacion-p-0007-2026-10-09.zip');
    expect(audit.entries).toEqual([
      {
        action: 'EXPORT',
        resourceType: 'clinical.patient_export',
        resourceId: record.id,
        patientId: PATIENT,
      },
    ]);
    const owner = await queries.file(staffContext('OWNER', OWNER), PATIENT, record.id);
    expect(isErr(owner) && owner.error).toBe(EXPORT_NOT_FOUND);
    const otherPatient = await queries.file(responsible, uuidv7(), record.id);
    expect(isErr(otherPatient) && otherPatient.error).toBe(EXPORT_NOT_FOUND);
    clock.current = new Date(clock.current.getTime() + 25 * HOUR);
    const expired = await queries.file(responsible, PATIENT, record.id);
    expect(isErr(expired) && expired.error).toBe(EXPORT_EXPIRED);
    expect(audit.entries).toHaveLength(1);
  });

  it('pendiente o fallida no se descarga, y sin su archivo tampoco', async () => {
    const pending = await requested();
    const early = await queries.file(responsible, PATIENT, pending.id);
    expect(isErr(early) && early.error).toBe(EXPORT_NOT_READY);
    clock.current = new Date(clock.current.getTime() + 2 * HOUR);
    const failed = await queries.file(responsible, PATIENT, pending.id);
    expect(isErr(failed) && failed.error).toBe(EXPORT_FAILED);
    const record = await built();
    files.written.clear();
    const lost = await queries.file(responsible, PATIENT, record.id);
    expect(isErr(lost) && lost.error).toBe(EXPORT_NOT_FOUND);
  });
});

describe('RN-B04 · el trabajo de cada hora', () => {
  it('retira el archivo de las vencidas y da por fallidas las pendientes de más de una hora', async () => {
    const ready = await requested();
    await builder.build(ORG, ready.id);
    const pending = await requested(staffContext('OWNER', OWNER));
    clock.current = new Date(clock.current.getTime() + 25 * HOUR);

    expect(await commands.closeDue()).toEqual({ closed: 2, notDiscarded: 0 });
    expect(store.records.get(ready.id)?.status).toBe('EXPIRED');
    expect(store.records.get(pending.id)?.status).toBe('FAILED');
    expect(files.retired).toEqual([store.records.get(ready.id)?.fileId]);
    expect(files.discarded).toEqual([`org/${store.records.get(ready.id)?.fileId ?? ''}`]);
  });

  it('un archivo que no se pudo borrar del almacenamiento se cuenta, ya marcado borrado', async () => {
    const ready = await requested();
    await builder.build(ORG, ready.id);
    clock.current = new Date(clock.current.getTime() + 25 * HOUR);
    files.failDiscard = true;
    expect(await commands.closeDue()).toEqual({ closed: 1, notDiscarded: 1 });
  });
});

describe('RN-B04 · las fuentes de la exportación', () => {
  it('una tabla con nombre raro o repetida es un error de programación', () => {
    sources.register({ context: 'a', tables: [{ table: 'a.uno' }] });
    expect(() => {
      sources.register({ context: 'b', tables: [{ table: 'a.uno' }] });
    }).toThrow('ya está');
    expect(() => {
      sources.register({ context: 'c', tables: [{ table: 'Uno; DROP' }] });
    }).toThrow('inválida');
  });

  it('clinical deja pasar tal cual lo que no es la ficha del paciente, y la ficha sin cifrado queda con null', async () => {
    const source = new ClinicalExportSource(fakeEncryption);
    const note = { id: 'n1', body: 'x' };
    expect(await source.present('clinical.clinical_note', note)).toBe(note);
    expect(
      await source.present('clinical.patient', { id: PATIENT, document_number_enc: null }),
    ).toEqual({
      id: PATIENT,
      document_number: null,
      phone: null,
    });
  });
});

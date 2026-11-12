import type { SecurityContext, UserId } from '@nutricoach/shared-kernel';
import { beforeEach, describe, expect, it } from 'vitest';
import type { FileRegistry } from '../../../platform/index.js';
import {
  HEALTH_DATA_REQUIRED,
  IMAGES_CONSENT_REQUIRED,
  PATIENT_ARCHIVED,
  PATIENT_NOT_FOUND,
  WRITE_ACCESS_REQUIRED,
} from '../domain/clinical-rules.js';
import {
  RECORD_DOCUMENT_CONTENT_CONFLICT,
  RECORD_DOCUMENT_CONTENT_REQUIRED,
  RECORD_DOCUMENT_FILE_UNSUPPORTED,
  RECORD_DOCUMENT_LOCKED,
  RECORD_DOCUMENT_NOT_FOUND,
  RECORD_DOCUMENT_NOT_REVIEWABLE,
  RECORD_DOCUMENT_VERSION_CONFLICT,
} from '../domain/record-document.js';
import {
  FakeAudit,
  FakeClock,
  fakeIds,
  FakeOutbox,
  FakeUow,
  MemoryConsents,
  MemoryPatients,
  ORG,
  staffContext,
} from './clinical-fakes.spec-support.js';
import { RecordDocumentCommands } from './commands/record-document.commands.js';
import type { PatientRecord } from './ports/clinical.ports.js';
import type {
  NewRecordDocument,
  RecordDocumentChanges,
  RecordDocumentRecord,
  RecordDocumentStore,
} from './ports/record-document.ports.js';
import { RecordDocumentQueries } from './queries/record-document.queries.js';

const PATIENT = '0192f0a0-0000-7000-8000-0000000000c1';
const OTHER_PATIENT = '0192f0a0-0000-7000-8000-0000000000c2';
const WRITER = '0192f0a0-0000-7000-8000-0000000000a1';
const READER = '0192f0a0-0000-7000-8000-0000000000a2';
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 1, 2]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1]);
const MP4 = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70]);
const LINK = 'https://videos.example.com/sentadilla';

const patientOf = (id: string): SecurityContext => ({
  organizationId: ORG,
  userId: `0192f0a0-0000-7000-8000-0000000000e${id.at(-1) ?? '0'}` as UserId,
  role: 'PATIENT',
  patientId: id as SecurityContext['patientId'],
  memberId: null,
});

/** clinical.record_document en memoria: los borrados no se leen y la versión manda, como en la base. Sin RLS. */
class MemoryDocuments implements RecordDocumentStore {
  readonly rows = new Map<string, RecordDocumentRecord & { deleted: boolean }>();
  /** Otro cambió la fila entre la lectura y la escritura. */
  raceOnUpdate = false;
  constructor(private readonly files: FakeRegistry) {}
  insert(document: NewRecordDocument) {
    const { content, ...row } = document;
    this.rows.set(document.id, {
      ...row,
      file: null,
      reviewNote: null,
      contentByRole: content?.role ?? null,
      contentAt: content ? document.createdAt : null,
      reviewedAt: null,
      version: 1,
      deleted: false,
    });
    return Promise.resolve();
  }
  find(id: string) {
    const row = this.rows.get(id);
    return Promise.resolve(row && !row.deleted ? this.#withFile(row) : null);
  }
  listOfPatient(patientId: string) {
    return Promise.resolve(
      [...this.rows.values()]
        .filter((row) => row.patientId === patientId && !row.deleted)
        .map((row) => this.#withFile(row)),
    );
  }
  update(id: string, expectedVersion: number, changes: RecordDocumentChanges) {
    const row = this.rows.get(id);
    if (this.raceOnUpdate || !row || row.deleted || row.version !== expectedVersion) {
      return Promise.resolve(false);
    }
    this.rows.set(id, {
      ...row,
      version: expectedVersion + 1,
      status: changes.status ?? row.status,
      ...(changes.content
        ? {
            linkUrl: changes.content.linkUrl,
            fileId: changes.content.fileId,
            contentByRole: changes.content.role,
            contentAt: changes.content.at,
          }
        : {}),
      ...(changes.reviewNote === undefined ? {} : { reviewNote: changes.reviewNote }),
      ...(changes.reviewed ? { reviewedAt: changes.reviewed.at } : {}),
      ...(changes.deleted ? { deleted: true, linkUrl: null, fileId: null } : {}),
    });
    return Promise.resolve(true);
  }
  #withFile(row: RecordDocumentRecord & { deleted: boolean }): RecordDocumentRecord {
    const stored = row.fileId ? this.files.stored.get(row.fileId) : undefined;
    const document: RecordDocumentRecord & { deleted?: boolean } = {
      ...row,
      file: stored ? { mimeType: stored.mimeType, sizeBytes: stored.content.byteLength } : null,
    };
    delete document.deleted;
    return document;
  }
}

/** FileRegistry falsa: PDF, JPEG y PNG por sus primeros bytes, con lo registrado, lo retirado y lo descartado. */
class FakeRegistry {
  readonly stored = new Map<
    string,
    { content: Uint8Array; mimeType: string; purpose: string | null; retired: boolean }
  >();
  readonly discarded: string[] = [];
  counter = 0;
  write(_org: string, content: Uint8Array) {
    const mimeType =
      content[0] === 0x25 ? 'application/pdf' : content[0] === 0xff ? 'image/jpeg' : null;
    if (!mimeType) return Promise.resolve(null);
    this.counter += 1;
    const id = `file-${String(this.counter)}`;
    this.stored.set(id, { content, mimeType, purpose: null, retired: false });
    return Promise.resolve({ id, key: `org/${id}`, mimeType, sha256: new Uint8Array(32) });
  }
  register(file: { id: string; purpose: string }) {
    const row = this.stored.get(file.id);
    if (row) row.purpose = file.purpose;
    return Promise.resolve();
  }
  retire(fileId: string) {
    const row = this.stored.get(fileId);
    if (!row || row.retired) return Promise.resolve(null);
    row.retired = true;
    return Promise.resolve(`org/${fileId}`);
  }
  discard(key: string) {
    this.discarded.push(key);
    return Promise.resolve();
  }
  read(fileId: string) {
    const row = this.stored.get(fileId);
    return Promise.resolve(
      row && !row.retired ? { content: Buffer.from(row.content), mimeType: row.mimeType } : null,
    );
  }
}

let patients: MemoryPatients;
let consents: MemoryConsents;
let files: FakeRegistry;
let documents: MemoryDocuments;
let outbox: FakeOutbox;
let audit: FakeAudit;
let commands: RecordDocumentCommands;
let queries: RecordDocumentQueries;
const writer = staffContext('PROFESSIONAL', WRITER);
const reader = staffContext('PROFESSIONAL', READER);
const patient = patientOf(PATIENT);

const grant = (patientId: string, purpose: 'HEALTH_DATA' | 'IMAGES') =>
  consents.rows.push({
    id: `${purpose}-${patientId}`,
    patientId,
    purpose,
    documentVersion: '1.0',
    channel: 'IN_PERSON_DIGITAL',
    grantedAt: new Date('2026-11-01T15:00:00Z'),
    revokedAt: null,
    evidenceFileId: null,
  });

const addPatient = (id: string, status: PatientRecord['status'] = 'ACTIVE') => {
  patients.rows.set(id, {
    id,
    organizationId: ORG,
    status,
    timezone: 'America/Lima',
    version: 1,
  } as unknown as PatientRecord);
  patients.teams.set(id, [
    { memberId: WRITER, role: 'RESPONSIBLE', access: 'WRITE' },
    { memberId: READER, role: 'SUPPORT', access: 'READ' },
  ] as never);
};

const valueOf = <T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
};

beforeEach(() => {
  const clock = new FakeClock();
  const uow = new FakeUow();
  outbox = new FakeOutbox();
  audit = new FakeAudit();
  patients = new MemoryPatients();
  consents = new MemoryConsents();
  files = new FakeRegistry();
  documents = new MemoryDocuments(files);
  const registry = files as unknown as FileRegistry;
  commands = new RecordDocumentCommands(
    uow,
    clock,
    fakeIds,
    outbox,
    registry,
    patients,
    consents,
    documents,
  );
  queries = new RecordDocumentQueries(uow, audit, registry, patients, consents, documents);
  addPatient(PATIENT);
  addPatient(OTHER_PATIENT);
  grant(PATIENT, 'HEALTH_DATA');
  grant(OTHER_PATIENT, 'HEALTH_DATA');
});

describe('RN-G21 · P-31 · el coach pide y agrega documentos', () => {
  it('un pedido sin contenido queda «Pendiente», sin archivo, y su evento no lleva el título', async () => {
    const added = valueOf(
      await commands.addAsStaff(
        writer,
        PATIENT,
        { title: 'Análisis de sangre', category: 'CLINICAL' },
        null,
      ),
    );
    expect(added).toMatchObject({ status: 'PENDING', version: 1 });
    expect(files.stored.size).toBe(0);
    expect(outbox.events[0]).toMatchObject({
      type: 'clinical.document.added',
      payload: {
        patientId: PATIENT,
        category: 'CLINICAL',
        status: 'PENDING',
        content: null,
        byRole: 'STAFF',
      },
    });
    expect(JSON.stringify(outbox.events[0]?.payload)).not.toContain('Análisis');
  });

  it('con un PDF entra «Validado» y su archivo queda registrado como del expediente', async () => {
    const added = valueOf(
      await commands.addAsStaff(
        writer,
        PATIENT,
        { title: 'Contrato', category: 'ADMINISTRATIVE' },
        PDF,
      ),
    );
    expect(added.status).toBe('VALIDATED');
    expect(files.stored.get('file-1')?.purpose).toBe('RECORD_DOCUMENT');
    expect((await documents.find(added.id))?.file).toEqual({
      mimeType: 'application/pdf',
      sizeBytes: 7,
    });
  });

  it('07 · un enlace o una foto piden el consentimiento de imágenes; sin él no se guarda y el archivo se descarta', async () => {
    const technique = {
      title: 'Video de sentadilla',
      category: 'TECHNIQUE' as const,
      linkUrl: LINK,
    };
    expect(await commands.addAsStaff(writer, PATIENT, technique, null)).toEqual({
      ok: false,
      error: IMAGES_CONSENT_REQUIRED,
    });
    expect(
      await commands.addAsStaff(writer, PATIENT, { title: 'Foto', category: 'PROGRESS' }, JPEG),
    ).toEqual({ ok: false, error: IMAGES_CONSENT_REQUIRED });
    expect(files.discarded).toEqual(['org/file-1']);
    grant(PATIENT, 'IMAGES');
    expect(valueOf(await commands.addAsStaff(writer, PATIENT, technique, null)).status).toBe(
      'VALIDATED',
    );
  });

  it('un enlace y un archivo juntos, o un archivo que no es PDF, JPEG ni PNG, no entran', async () => {
    const input = { title: 'Video', category: 'TECHNIQUE' as const, linkUrl: LINK };
    expect(await commands.addAsStaff(writer, PATIENT, input, PDF)).toEqual({
      ok: false,
      error: RECORD_DOCUMENT_CONTENT_CONFLICT,
    });
    expect(
      await commands.addAsStaff(writer, PATIENT, { title: 'Video', category: 'TECHNIQUE' }, MP4),
    ).toEqual({ ok: false, error: RECORD_DOCUMENT_FILE_UNSUPPORTED });
    expect(files.stored.size).toBe(0);
  });

  it('RN-A05 · RN-B01 · sin escritura en el equipo, sin HEALTH_DATA o con el alumno archivado, no se guarda nada', async () => {
    const input = { title: 'Contrato', category: 'ADMINISTRATIVE' as const };
    expect(await commands.addAsStaff(reader, PATIENT, input, PDF)).toEqual({
      ok: false,
      error: WRITE_ACCESS_REQUIRED,
    });
    expect(files.discarded).toEqual(['org/file-1']);
    consents.rows.splice(0, consents.rows.length);
    expect(await commands.addAsStaff(writer, PATIENT, input, null)).toEqual({
      ok: false,
      error: HEALTH_DATA_REQUIRED,
    });
    addPatient(PATIENT, 'ARCHIVED');
    expect(await commands.addAsStaff(writer, PATIENT, input, null)).toEqual({
      ok: false,
      error: PATIENT_ARCHIVED,
    });
    expect(await commands.addAsStaff(writer, 'no-existe', input, null)).toEqual({
      ok: false,
      error: PATIENT_NOT_FOUND,
    });
    expect(documents.rows.size).toBe(0);
  });
});

describe('RN-G21 · P-31 · el alumno sube y el coach revisa', () => {
  it('el alumno siempre trae contenido; lo que sube queda «Por revisar»', async () => {
    expect(
      await commands.addAsPatient(patient, { title: 'Receta', category: 'CLINICAL' }, null),
    ).toEqual({
      ok: false,
      error: RECORD_DOCUMENT_CONTENT_REQUIRED,
    });
    const added = valueOf(
      await commands.addAsPatient(patient, { title: 'Receta', category: 'CLINICAL' }, PDF),
    );
    expect(added.status).toBe('IN_REVIEW');
    expect(
      await commands.addAsPatient(
        { ...patient, patientId: null },
        { title: 'X', category: 'REPORT' },
        PDF,
      ),
    ).toEqual({ ok: false, error: PATIENT_NOT_FOUND });
  });

  it('el alumno completa el pedido del coach; el coach lo devuelve con una nota y el alumno lo reemplaza', async () => {
    const request = valueOf(
      await commands.addAsStaff(
        writer,
        PATIENT,
        { title: 'Análisis de sangre', category: 'CLINICAL' },
        null,
      ),
    );
    const filled = valueOf(await commands.replaceAsPatient(patient, request.id, 1, { file: PDF }));
    expect(filled).toEqual({ id: request.id, status: 'IN_REVIEW', version: 2 });
    const returned = valueOf(
      await commands.review(writer, request.id, 2, {
        decision: 'RETURN',
        note: 'Falta la segunda página',
      }),
    );
    expect(returned.status).toBe('PENDING');
    expect((await documents.find(request.id))?.reviewNote).toBe('Falta la segunda página');
    const again = valueOf(await commands.replaceAsPatient(patient, request.id, 3, { file: PDF }));
    expect(again.status).toBe('IN_REVIEW');
    // El archivo anterior se marca borrado y sus bytes se descartan después de confirmar; la nota ya no aplica.
    expect(files.stored.get('file-1')?.retired).toBe(true);
    expect(files.discarded).toEqual(['org/file-1']);
    expect((await documents.find(request.id))?.reviewNote).toBeNull();
    const validated = valueOf(
      await commands.review(writer, request.id, 4, { decision: 'VALIDATE' }),
    );
    expect(validated).toEqual({ id: request.id, status: 'VALIDATED', version: 5 });
    expect(outbox.events.map((event) => event.type)).toEqual([
      'clinical.document.added',
      'clinical.document.replaced',
      'clinical.document.reviewed',
      'clinical.document.replaced',
      'clinical.document.reviewed',
    ]);
  });

  it('lo validado ya no lo cambia el alumno; el coach sí, y queda validado', async () => {
    const added = valueOf(
      await commands.addAsStaff(
        writer,
        PATIENT,
        { title: 'Contrato', category: 'ADMINISTRATIVE' },
        PDF,
      ),
    );
    expect(await commands.replaceAsPatient(patient, added.id, 1, { file: PDF })).toEqual({
      ok: false,
      error: RECORD_DOCUMENT_LOCKED,
    });
    expect(files.discarded).toEqual(['org/file-2']);
    expect(valueOf(await commands.replaceAsStaff(writer, added.id, 1, { file: PDF })).status).toBe(
      'VALIDATED',
    );
  });

  it('reemplazar pide contenido y la versión vigente; solo se revisa lo que está por revisar', async () => {
    const added = valueOf(
      await commands.addAsPatient(patient, { title: 'Receta', category: 'CLINICAL' }, PDF),
    );
    expect(await commands.replaceAsPatient(patient, added.id, 1, {})).toEqual({
      ok: false,
      error: RECORD_DOCUMENT_CONTENT_REQUIRED,
    });
    expect(
      await commands.replaceAsPatient(patient, added.id, 1, { linkUrl: LINK, file: PDF }),
    ).toEqual({
      ok: false,
      error: RECORD_DOCUMENT_CONTENT_CONFLICT,
    });
    expect(await commands.replaceAsPatient(patient, added.id, 7, { file: PDF })).toEqual({
      ok: false,
      error: RECORD_DOCUMENT_VERSION_CONFLICT,
    });
    documents.raceOnUpdate = true;
    expect(await commands.review(writer, added.id, 1, { decision: 'VALIDATE' })).toEqual({
      ok: false,
      error: RECORD_DOCUMENT_VERSION_CONFLICT,
    });
    documents.raceOnUpdate = false;
    valueOf(await commands.review(writer, added.id, 1, { decision: 'VALIDATE' }));
    expect(await commands.review(writer, added.id, 2, { decision: 'VALIDATE' })).toEqual({
      ok: false,
      error: RECORD_DOCUMENT_NOT_REVIEWABLE,
    });
  });

  it('el alumno no ve ni toca los documentos de otro alumno', async () => {
    const other = valueOf(
      await commands.addAsPatient(
        patientOf(OTHER_PATIENT),
        { title: 'Receta', category: 'CLINICAL' },
        PDF,
      ),
    );
    expect(await commands.replaceAsPatient(patient, other.id, 1, { file: PDF })).toEqual({
      ok: false,
      error: RECORD_DOCUMENT_NOT_FOUND,
    });
    expect(await commands.deleteAsPatient(patient, other.id, 1)).toEqual({
      ok: false,
      error: RECORD_DOCUMENT_NOT_FOUND,
    });
    expect(await queries.file(patient, other.id)).toBeNull();
    expect(await queries.list(patient, OTHER_PATIENT)).toEqual({
      ok: false,
      error: PATIENT_NOT_FOUND,
    });
  });
});

describe('RN-G21 · P-31 · borrar, con auditoría', () => {
  it('el alumno borra lo suyo mientras está por revisar: el archivo se borra y el documento ya no se lista', async () => {
    const added = valueOf(
      await commands.addAsPatient(patient, { title: 'Receta', category: 'CLINICAL' }, PDF),
    );
    expect((await commands.deleteAsPatient(patient, added.id, 1)).ok).toBe(true);
    expect(files.stored.get('file-1')?.retired).toBe(true);
    expect(files.discarded).toEqual(['org/file-1']);
    expect(outbox.events.at(-1)).toMatchObject({
      type: 'clinical.document.deleted',
      payload: { patientId: PATIENT, category: 'CLINICAL', byRole: 'PATIENT' },
    });
    expect(valueOf(await queries.list(writer, PATIENT)).documents).toEqual([]);
  });

  it('el alumno no borra lo validado ni lo que pidió el coach; el coach borra cualquiera, sin pedir HEALTH_DATA', async () => {
    const own = valueOf(
      await commands.addAsPatient(patient, { title: 'Receta', category: 'CLINICAL' }, PDF),
    );
    valueOf(await commands.review(writer, own.id, 1, { decision: 'VALIDATE' }));
    expect(await commands.deleteAsPatient(patient, own.id, 2)).toEqual({
      ok: false,
      error: RECORD_DOCUMENT_LOCKED,
    });
    const request = valueOf(
      await commands.addAsStaff(writer, PATIENT, { title: 'Análisis', category: 'CLINICAL' }, null),
    );
    valueOf(await commands.replaceAsPatient(patient, request.id, 1, { file: PDF }));
    expect(await commands.deleteAsPatient(patient, request.id, 2)).toEqual({
      ok: false,
      error: RECORD_DOCUMENT_LOCKED,
    });
    consents.rows.splice(0, consents.rows.length);
    expect((await commands.deleteAsStaff(writer, own.id, 2)).ok).toBe(true);
    expect(await commands.deleteAsStaff(reader, request.id, 2)).toEqual({
      ok: false,
      error: WRITE_ACCESS_REQUIRED,
    });
    documents.raceOnUpdate = true;
    expect(await commands.deleteAsStaff(writer, request.id, 2)).toEqual({
      ok: false,
      error: RECORD_DOCUMENT_VERSION_CONFLICT,
    });
  });
});

describe('RN-B03 · ver el expediente queda en la auditoría', () => {
  it('la lista trae los consentimientos para avisar antes de subir, y deja su lectura', async () => {
    valueOf(
      await commands.addAsStaff(writer, PATIENT, { title: 'Análisis', category: 'CLINICAL' }, null),
    );
    const view = valueOf(await queries.list(writer, PATIENT));
    expect(view.consents).toEqual({ healthData: true, images: false });
    expect(view.documents.map((document) => document.status)).toEqual(['PENDING']);
    expect(audit.entries).toEqual([
      {
        action: 'READ',
        resourceType: 'clinical.record_document',
        resourceId: PATIENT,
        patientId: PATIENT,
      },
    ]);
    expect(await queries.list(writer, 'no-existe')).toEqual({
      ok: false,
      error: PATIENT_NOT_FOUND,
    });
  });

  it('descargar un archivo deja su lectura; un pedido sin archivo no tiene qué descargar', async () => {
    const added = valueOf(
      await commands.addAsPatient(patient, { title: 'Receta médica', category: 'CLINICAL' }, PDF),
    );
    const request = valueOf(
      await commands.addAsStaff(writer, PATIENT, { title: 'Análisis', category: 'CLINICAL' }, null),
    );
    const file = await queries.file(patient, added.id);
    expect(file).toMatchObject({ mimeType: 'application/pdf', title: 'Receta médica' });
    expect(audit.entries.at(-1)).toEqual({
      action: 'READ',
      resourceType: 'clinical.record_document',
      resourceId: added.id,
      patientId: PATIENT,
    });
    expect(await queries.file(writer, request.id)).toBeNull();
    expect(await queries.file(writer, 'no-existe')).toBeNull();
  });
});

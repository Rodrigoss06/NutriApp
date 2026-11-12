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
import type { FileRegistry } from '../../../platform/index.js';
import type { ClinicalApi } from '../../clinical/index.js';
import type { ReportMesocycle } from '../domain/mesocycle-report.js';
import {
  PHOTO_MESOCYCLE_NOT_FOUND,
  PHOTO_UNSUPPORTED,
  PHOTOS_NOT_OPEN,
  type ProgressPhotoRecord,
} from '../domain/progress-photo.js';
import { ProgressPhotoCommands } from './commands/progress-photo.commands.js';
import type { MesocycleReportBuilder } from './mesocycle-report-builder.js';
import type { ProgramStore } from './ports/program.ports.js';
import type { ProgressPhotoStore } from './ports/progress-photo.ports.js';
import type { WeeklyReviewStore } from './ports/weekly-review.ports.js';
import type { ProgramSnapshot } from './program-document.js';
import { ProgressPhotoQueries } from './queries/progress-photo.queries.js';

const ORG = '0192f0a0-0000-7000-8000-00000000000a' as OrganizationId;
const PATIENT = '0192f0a0-0000-7000-8000-0000000000c1';
const staff: SecurityContext = {
  organizationId: ORG,
  userId: '0192f0a0-0000-7000-8000-0000000000e1' as UserId,
  role: 'PROFESSIONAL',
  patientId: null,
  memberId: '0192f0a0-0000-7000-8000-0000000000a1' as SecurityContext['memberId'],
};
const patient: SecurityContext = {
  organizationId: ORG,
  userId: '0192f0a0-0000-7000-8000-0000000000e2' as UserId,
  role: 'PATIENT',
  patientId: PATIENT as SecurityContext['patientId'],
  memberId: null,
};

/** Hoy es el 2026-11-11 en Lima: la última semana del mesociclo 1 empezó el 27/10; la del 2, todavía no. */
const NOW = new Date('2026-11-11T15:00:00.000Z');
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 1]);

const week = (weekNo: number, weekStart: string) => ({
  weekNo,
  weekStart,
  weekEnd: weekStart,
  isDeload: false,
  plannedSets: 6,
  sessionsPlanned: 2,
});
const MESOCYCLES: Record<number, ReportMesocycle> = {
  1: {
    position: 1,
    name: 'Base',
    startDate: '2026-10-06',
    endDate: '2026-11-02',
    weeks: [week(1, '2026-10-06'), week(4, '2026-10-27')],
  },
  2: {
    position: 2,
    name: 'Carga',
    startDate: '2026-11-03',
    endDate: '2026-11-30',
    weeks: [week(5, '2026-11-03'), week(8, '2026-11-24')],
  },
};

const snapshotOf = (lineageId: string, patientId = PATIENT) =>
  ({
    lineageId,
    patientId,
    name: lineageId === 'lineage-1' ? 'Macrociclo' : 'Programa anterior',
    startDate: '2026-10-06',
    mesocycles: [
      {
        position: 1,
        name: 'Base',
        weeks: [1, 2, 3, 4].map((weekNo) => ({ weekNo, isDeload: false, sessions: [] })),
      },
    ],
  }) as unknown as ProgramSnapshot;

const photo = (overrides: Partial<ProgressPhotoRecord> = {}): ProgressPhotoRecord => ({
  id: 'photo-1',
  organizationId: ORG,
  patientId: PATIENT,
  programLineageId: 'lineage-1',
  mesocyclePosition: 1,
  view: 'FRONT',
  fileId: 'file-old',
  uploadedBy: 'user-1',
  uploadedByRole: 'STAFF',
  uploadedAt: NOW,
  ...overrides,
});

class MemoryPhotos implements ProgressPhotoStore {
  rows: ProgressPhotoRecord[] = [];
  failInsert = false;
  insert(row: ProgressPhotoRecord) {
    if (this.failInsert) return Promise.reject(new Error('La base falló.'));
    this.rows.push(row);
    return Promise.resolve();
  }
  find(id: string) {
    return Promise.resolve(this.rows.find((row) => row.id === id) ?? null);
  }
  byView(lineageId: string, position: number, view: string) {
    return Promise.resolve(
      this.rows.find(
        (r) =>
          r.programLineageId === lineageId && r.mesocyclePosition === position && r.view === view,
      ) ?? null,
    );
  }
  replace(
    id: string,
    file: Pick<ProgressPhotoRecord, 'fileId' | 'uploadedBy' | 'uploadedByRole' | 'uploadedAt'>,
  ) {
    this.rows = this.rows.map((row) => (row.id === id ? { ...row, ...file } : row));
    return Promise.resolve();
  }
  ofPatient(patientId: string) {
    return Promise.resolve(this.rows.filter((row) => row.patientId === patientId));
  }
  deleteOfPatient(patientId: string) {
    const removed = this.rows.filter((row) => row.patientId === patientId);
    this.rows = this.rows.filter((row) => row.patientId !== patientId);
    return Promise.resolve(removed);
  }
}

let photos: MemoryPhotos;
let discarded: string[];
let retired: string[];
let events: DomainEvent[];
let audits: AuditEntry[];
let contexts: SecurityContext[];
let patientStatus: 'ACTIVE' | 'ARCHIVED' | null;
let writable: boolean;
let health: boolean;
let photosConsent: boolean;
let published: string | null;
let fileContent: Buffer | null;

const uow = {
  run: <T>(c: SecurityContext, work: () => Promise<T>) => {
    contexts.push(c);
    return work();
  },
  query: <T>(c: SecurityContext, work: () => Promise<T>) => {
    contexts.push(c);
    return work();
  },
};
const clock = { now: () => NOW };
const ids = { newId: () => 'photo-new' as never };
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
const files = {
  write: (_org: string, content: Uint8Array) => {
    if (content[0] === 0xff)
      return Promise.resolve({
        id: 'file-new',
        key: 'org/file-new',
        mimeType: 'image/jpeg',
        sha256: new Uint8Array(),
      });
    if (content[0] === 0x25)
      return Promise.resolve({
        id: 'file-pdf',
        key: 'org/file-pdf',
        mimeType: 'application/pdf',
        sha256: new Uint8Array(),
      });
    return Promise.resolve(null);
  },
  register: () => Promise.resolve(),
  discard: (key: string) => {
    discarded.push(key);
    return Promise.resolve();
  },
  retire: (fileId: string) => {
    retired.push(fileId);
    return Promise.resolve(`org/${fileId}`);
  },
  read: () =>
    Promise.resolve(fileContent ? { content: fileContent, mimeType: 'image/jpeg' } : null),
} as unknown as FileRegistry;
const NOT_WRITABLE = { code: 'NC-CLI-013', message: 'Sin acceso.' };
const NO_HEALTH = { code: 'NC-CLI-002', message: 'Sin HEALTH_DATA.' };
const NO_PHOTOS = { code: 'NC-CLI-033', message: 'Sin consentimiento de fotos.' };
const clinical = {
  patientRef: () =>
    Promise.resolve(patientStatus ? { timezone: 'America/Lima', status: patientStatus } : null),
  ensureRecordWritable: () =>
    Promise.resolve(writable ? ok({ timezone: 'America/Lima' }) : err(NOT_WRITABLE)),
  ensureHealthDataConsent: () => Promise.resolve(health ? ok(undefined) : err(NO_HEALTH)),
  ensureProgressPhotosConsent: () =>
    Promise.resolve(photosConsent ? ok(undefined) : err(NO_PHOTOS)),
} as unknown as ClinicalApi;
const builder = {
  publishedMesocycle: (_patientId: string, position: number) => {
    const mesocycle = MESOCYCLES[position];
    return Promise.resolve(
      published && mesocycle
        ? { lineageId: published, snapshot: snapshotOf(published), mesocycle }
        : null,
    );
  },
} as unknown as MesocycleReportBuilder;
const reviews = {
  publishedProgramOf: () =>
    Promise.resolve(
      published ? { programId: 'program-1', patientId: PATIENT, lineageId: published } : null,
    ),
} as unknown as WeeklyReviewStore;
const programs = {
  latestSnapshot: (lineageId: string) =>
    Promise.resolve(lineageId === 'ajeno' ? snapshotOf(lineageId, 'otro') : snapshotOf(lineageId)),
} as unknown as ProgramStore;

const commands = () =>
  new ProgressPhotoCommands(uow, clock, ids, outbox, files, photos, clinical, builder);
const queries = () =>
  new ProgressPhotoQueries(uow, clock, audit, files, clinical, photos, programs, reviews);

beforeEach(() => {
  photos = new MemoryPhotos();
  discarded = [];
  retired = [];
  events = [];
  audits = [];
  contexts = [];
  patientStatus = 'ACTIVE';
  writable = true;
  health = true;
  photosConsent = true;
  published = 'lineage-1';
  fileContent = Buffer.from(JPEG);
});

describe('RN-G20 · subir las fotos de progreso', () => {
  it('el coach sube la frontal del mesociclo que ya cerró, con su evento y sin descartar nada', async () => {
    expect(await commands().uploadAsStaff(staff, PATIENT, 1, 'FRONT', JPEG)).toEqual(
      ok({ id: 'photo-new' }),
    );
    expect(photos.rows[0]).toMatchObject({
      fileId: 'file-new',
      uploadedByRole: 'STAFF',
      view: 'FRONT',
    });
    expect(events.map((e) => [e.type, (e.payload as { replaced: boolean }).replaced])).toEqual([
      ['training.photo.uploaded', false],
    ]);
    expect(discarded).toEqual([]);
  });

  it('subir otra vez la reemplaza: el archivo anterior se marca borrado y sus bytes se descartan al confirmar', async () => {
    photos.rows = [photo()];
    expect(await commands().uploadAsStaff(staff, PATIENT, 1, 'FRONT', JPEG)).toEqual(
      ok({ id: 'photo-1' }),
    );
    expect(retired).toEqual(['file-old']);
    expect(discarded).toEqual(['org/file-old']);
    expect(photos.rows).toEqual([expect.objectContaining({ id: 'photo-1', fileId: 'file-new' })]);
  });

  it('el alumno sube la suya: su programa lo busca el sistema antes de su transacción', async () => {
    expect(await commands().uploadAsPatient(patient, 1, 'SIDE', JPEG)).toEqual(
      ok({ id: 'photo-new' }),
    );
    expect(contexts.map((c) => c.role)).toEqual(['SYSTEM', 'PATIENT']);
    expect(photos.rows[0]?.uploadedByRole).toBe('PATIENT');
  });

  it('sin programa publicado o sin el mesociclo, ni se escriben los bytes; sin sesión de alumno, no hay alumno', async () => {
    published = null;
    expect(await commands().uploadAsPatient(patient, 1, 'SIDE', JPEG)).toEqual(
      err(PHOTO_MESOCYCLE_NOT_FOUND),
    );
    expect(discarded).toEqual([]);
    published = 'lineage-1';
    expect(await commands().uploadAsStaff(staff, PATIENT, 3, 'SIDE', JPEG)).toEqual(
      err(PHOTO_MESOCYCLE_NOT_FOUND),
    );
    expect(discarded).toEqual(['org/file-new']);
    expect((await commands().uploadAsPatient(staff, 1, 'SIDE', JPEG)).ok).toBe(false);
  });

  it('solo JPEG o PNG: otro tipo no se guarda y un PDF se descarta', async () => {
    expect(
      await commands().uploadAsStaff(staff, PATIENT, 1, 'FRONT', new Uint8Array([1, 2])),
    ).toEqual(err(PHOTO_UNSUPPORTED));
    expect(await commands().uploadAsStaff(staff, PATIENT, 1, 'FRONT', PDF)).toEqual(
      err(PHOTO_UNSUPPORTED),
    );
    expect(discarded).toEqual(['org/file-pdf']);
  });

  it('sin acceso, archivado, sin HEALTH_DATA, sin su consentimiento o antes de la última semana, se descarta lo subido', async () => {
    writable = false;
    expect(await commands().uploadAsStaff(staff, PATIENT, 1, 'FRONT', JPEG)).toEqual(
      err(NOT_WRITABLE),
    );
    writable = true;
    patientStatus = 'ARCHIVED';
    expect((await commands().uploadAsPatient(patient, 1, 'FRONT', JPEG)).ok).toBe(false);
    patientStatus = null;
    expect((await commands().uploadAsPatient(patient, 1, 'FRONT', JPEG)).ok).toBe(false);
    patientStatus = 'ACTIVE';
    health = false;
    expect(await commands().uploadAsPatient(patient, 1, 'FRONT', JPEG)).toEqual(err(NO_HEALTH));
    health = true;
    photosConsent = false;
    expect(await commands().uploadAsStaff(staff, PATIENT, 1, 'FRONT', JPEG)).toEqual(
      err(NO_PHOTOS),
    );
    photosConsent = true;
    expect(await commands().uploadAsStaff(staff, PATIENT, 2, 'FRONT', JPEG)).toEqual(
      err(PHOTOS_NOT_OPEN),
    );
    expect(discarded).toHaveLength(6);
    expect(photos.rows).toEqual([]);
  });

  it('si la base falla, los bytes nuevos se descartan y el error sigue', async () => {
    photos.failInsert = true;
    await expect(commands().uploadAsStaff(staff, PATIENT, 1, 'FRONT', JPEG)).rejects.toThrow(
      /base/,
    );
    expect(discarded).toEqual(['org/file-new']);
  });

  it('al revocar o archivar se borran todas, con sus archivos; sin fotos, nada', async () => {
    photos.rows = [photo(), photo({ id: 'photo-2', view: 'BACK', fileId: 'file-back' })];
    expect(await commands().purge(PATIENT)).toEqual({
      removed: 2,
      keys: ['org/file-old', 'org/file-back'],
    });
    expect(photos.rows).toEqual([]);
    expect(await commands().purge(PATIENT)).toEqual({ removed: 0, keys: [] });
  });
});

describe('RN-G20 · RN-B03 · ver las fotos', () => {
  it('el equipo ve las del programa vigente y las de otros programas; la lectura queda auditada', async () => {
    photos.rows = [
      photo(),
      photo({ id: 'old', programLineageId: 'lineage-0' }),
      photo({ id: 'x', programLineageId: 'ajeno' }),
    ];
    const result = await queries().list(staff, PATIENT);
    if (!result.ok) throw new Error('Debía listar.');
    expect(result.value.consentActive).toBe(true);
    expect(
      result.value.programs.map((p) => [p.lineageId, p.current, p.mesocycles.map((m) => m.open)]),
    ).toEqual([
      ['lineage-1', true, [true]],
      ['lineage-0', false, [false]],
    ]);
    expect(result.value.photos.map((p) => p.id)).toEqual(['photo-1', 'old', 'x']);
    expect(audits).toHaveLength(1);
  });

  it('para el alumno, sus programas los lee el sistema; archivado o sin consentimiento, sin fotos', async () => {
    photos.rows = [photo()];
    expect((await queries().list(patient, PATIENT)).ok).toBe(true);
    expect(contexts.map((c) => c.role)).toEqual(['PATIENT', 'SYSTEM']);
    photosConsent = false;
    const revoked = await queries().list(staff, PATIENT);
    expect(revoked.ok && [revoked.value.consentActive, revoked.value.photos]).toEqual([false, []]);
    photosConsent = true;
    patientStatus = 'ARCHIVED';
    const archived = await queries().list(staff, PATIENT);
    expect(archived.ok && archived.value.photos).toEqual([]);
    patientStatus = null;
    expect((await queries().list(staff, PATIENT)).ok).toBe(false);
    expect((await queries().list(patient, null)).ok).toBe(false);
  });

  it('una foto sale con el alumno activo y su consentimiento; si no, como si no existiera', async () => {
    photos.rows = [photo()];
    expect(await queries().file(staff, 'photo-1')).toMatchObject({
      mimeType: 'image/jpeg',
      view: 'FRONT',
    });
    expect(audits.map((a) => a.resourceId)).toEqual(['photo-1']);
    expect(await queries().file(staff, 'nope')).toBeNull();
    expect(
      await queries().file(
        { ...patient, patientId: 'otro' as SecurityContext['patientId'] },
        'photo-1',
      ),
    ).toBeNull();
    photosConsent = false;
    expect(await queries().file(staff, 'photo-1')).toBeNull();
    photosConsent = true;
    patientStatus = 'ARCHIVED';
    expect(await queries().file(staff, 'photo-1')).toBeNull();
    patientStatus = 'ACTIVE';
    fileContent = null;
    expect(await queries().file(staff, 'photo-1')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import {
  canRequestExport,
  downloadable,
  effectiveStatus,
  EXPORT_EXPIRED,
  EXPORT_FAILED,
  EXPORT_NOT_ALLOWED,
  EXPORT_NOT_READY,
  exportFileName,
  reusablePending,
  type PatientExportRecord,
} from './patient-export.js';

const NOW = new Date('2026-11-13T15:00:00Z');
const RESPONSIBLE = '00000000-0000-7000-8000-0000000000aa';

const record = (overrides: Partial<PatientExportRecord> = {}): PatientExportRecord => ({
  id: '00000000-0000-7000-8000-000000000001',
  organizationId: '00000000-0000-7000-8000-0000000000bb',
  patientId: '00000000-0000-7000-8000-0000000000cc',
  requestedBy: '00000000-0000-7000-8000-0000000000dd',
  requestedByRole: 'STAFF',
  requestedByMember: RESPONSIBLE,
  status: 'PENDING',
  fileId: null,
  sizeBytes: null,
  createdAt: new Date('2026-11-13T14:50:00Z'),
  readyAt: null,
  expiresAt: null,
  ...overrides,
});

const ready = (expiresAt: string) =>
  record({
    status: 'READY',
    fileId: '00000000-0000-7000-8000-0000000000ee',
    sizeBytes: 1024,
    readyAt: new Date(Date.parse(expiresAt) - 86_400_000),
    expiresAt: new Date(expiresAt),
  });

describe('RN-B04 · quién pide la exportación del paciente', () => {
  it('el responsable del paciente y el dueño, aunque no sea el responsable (ADR-131)', () => {
    const patient = { responsibleMemberId: RESPONSIBLE };
    expect(canRequestExport({ role: 'PROFESSIONAL', memberId: RESPONSIBLE }, patient)).toBeNull();
    expect(canRequestExport({ role: 'ADMIN', memberId: RESPONSIBLE }, patient)).toBeNull();
    expect(canRequestExport({ role: 'OWNER', memberId: 'otro' }, patient)).toBeNull();
  });

  it('del resto del equipo, nadie: tampoco el administrador', () => {
    const patient = { responsibleMemberId: RESPONSIBLE };
    expect(canRequestExport({ role: 'PROFESSIONAL', memberId: 'otro' }, patient)).toBe(
      EXPORT_NOT_ALLOWED,
    );
    expect(canRequestExport({ role: 'ADMIN', memberId: 'otro' }, patient)).toBe(EXPORT_NOT_ALLOWED);
    expect(canRequestExport({ role: 'ADMIN', memberId: null }, patient)).toBe(EXPORT_NOT_ALLOWED);
    expect(EXPORT_NOT_ALLOWED.rule).toBe('RN-B04');
  });
});

describe('RN-B04 · la exportación queda 24 horas', () => {
  it('lista hasta su hora de vencimiento; después, vencida aunque el trabajo de cada hora no pasó', () => {
    expect(effectiveStatus(ready('2026-11-13T15:00:01Z'), NOW)).toBe('READY');
    expect(effectiveStatus(ready('2026-11-13T15:00:00Z'), NOW)).toBe('EXPIRED');
    expect(
      effectiveStatus(record({ ...ready('2026-11-14T00:00:00Z'), status: 'EXPIRED' }), NOW),
    ).toBe('EXPIRED');
  });

  it('un pedido pendiente de hace una hora o más ya no se termina: fallido', () => {
    expect(effectiveStatus(record({ createdAt: new Date('2026-11-13T14:00:01Z') }), NOW)).toBe(
      'PENDING',
    );
    expect(effectiveStatus(record({ createdAt: new Date('2026-11-13T14:00:00Z') }), NOW)).toBe(
      'FAILED',
    );
  });

  it('se reutiliza el pendiente que todavía puede terminarse, no uno fallido ni uno listo', () => {
    const fresh = record({ id: '00000000-0000-7000-8000-000000000002' });
    const stale = record({ createdAt: new Date('2026-11-13T13:00:00Z') });
    expect(reusablePending([fresh, stale], NOW)).toBe(fresh);
    expect(reusablePending([stale, ready('2026-11-14T00:00:00Z')], NOW)).toBeNull();
  });

  it('se descarga solo lista y sin vencer; si no, dice por qué', () => {
    expect(downloadable(ready('2026-11-14T00:00:00Z'), NOW)).toBeNull();
    expect(downloadable(record(), NOW)).toBe(EXPORT_NOT_READY);
    expect(downloadable(ready('2026-11-13T12:00:00Z'), NOW)).toBe(EXPORT_EXPIRED);
    expect(downloadable(record({ status: 'FAILED' }), NOW)).toBe(EXPORT_FAILED);
  });

  it('el ZIP se llama con el código del paciente, sin símbolos, y el día en que quedó lista', () => {
    expect(exportFileName('P-0007', NOW)).toBe('exportacion-p-0007-2026-11-13.zip');
    expect(exportFileName('Ñandú 12/b', NOW)).toBe('exportacion-nandu-12-b-2026-11-13.zip');
    expect(exportFileName('***', NOW)).toBe('exportacion-paciente-2026-11-13.zip');
  });
});

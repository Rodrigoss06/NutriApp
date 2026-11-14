import { describe, expect, it } from 'vitest';
import {
  PATIENT_EXPORT_STATUS_LABELS,
  PATIENT_EXPORT_STATUSES,
  patientExportListResponseSchema,
  patientExportSchema,
} from './patient-export.js';

describe('RN-B04 · la exportación del paciente', () => {
  const ready = {
    id: '00000000-0000-7000-8000-000000000001',
    status: 'READY',
    createdAt: '2026-11-13T15:00:00.000Z',
    readyAt: '2026-11-13T15:01:00.000Z',
    expiresAt: '2026-11-14T15:01:00.000Z',
    sizeBytes: 48_213,
  };

  it('una lista para descargar trae hasta cuándo y su tamaño; una pendiente, no', () => {
    expect(patientExportSchema.parse(ready)).toEqual(ready);
    const pending = {
      ...ready,
      status: 'PENDING',
      readyAt: null,
      expiresAt: null,
      sizeBytes: null,
    };
    const list = { exports: [pending], timezone: 'America/Lima' };
    expect(patientExportListResponseSchema.parse(list)).toEqual(list);
    expect(patientExportListResponseSchema.safeParse({ exports: [pending] }).success).toBe(false);
    expect(patientExportSchema.safeParse({ ...ready, status: 'DONE' }).success).toBe(false);
    expect(patientExportSchema.safeParse({ ...ready, sizeBytes: 0 }).success).toBe(false);
  });

  it('cada estado tiene su texto', () => {
    expect(Object.keys(PATIENT_EXPORT_STATUS_LABELS)).toEqual([...PATIENT_EXPORT_STATUSES]);
  });
});

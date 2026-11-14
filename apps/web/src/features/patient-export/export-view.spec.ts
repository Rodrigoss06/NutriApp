import type { PatientExport } from '@nutricoach/contracts';
import { describe, expect, it } from 'vitest';
import { formatBytes, hasPending } from './export-view';

const item = (status: PatientExport['status']): PatientExport => ({
  id: '00000000-0000-7000-8000-000000000001',
  status,
  createdAt: '2026-11-13T15:00:00.000Z',
  readyAt: null,
  expiresAt: null,
  sizeBytes: null,
});

describe('RN-B04 · la exportación en pantalla', () => {
  it('el tamaño en KB hasta 1 MB y en MB con un decimal, en formato es-PE y redondeado solo al mostrar (RN-D09)', () => {
    expect(formatBytes(200)).toBe('1 KB');
    expect(formatBytes(48_213)).toBe('47 KB');
    expect(formatBytes(1_258_291)).toBe('1.2 MB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB');
  });

  it('mientras una se prepara no se ofrece pedir otra', () => {
    expect(hasPending([item('READY'), item('PENDING')])).toBe(true);
    expect(hasPending([item('READY'), item('FAILED'), item('EXPIRED')])).toBe(false);
    expect(hasPending([])).toBe(false);
  });
});

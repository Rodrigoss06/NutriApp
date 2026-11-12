import type { ProgressPhotosResponse } from '@nutricoach/contracts';
import { describe, expect, it } from 'vitest';
import { fittedSize, lastWeekStart, photoComparison, photoFileUrl, photoSlots } from './photo-view';

const LINEAGE = '01920000-0000-7000-8000-00000000000a';
const OLD = '01920000-0000-7000-8000-00000000000b';

const photo = (id: string, lineage: string, position: number, view: 'FRONT' | 'SIDE' | 'BACK') => ({
  id,
  programLineageId: lineage,
  mesocyclePosition: position,
  view,
  uploadedByRole: 'PATIENT' as const,
  uploadedAt: '2026-11-11T10:00:00.000Z',
});

const RESPONSE: ProgressPhotosResponse = {
  consentActive: true,
  programs: [
    {
      lineageId: LINEAGE,
      name: 'Full Body',
      current: true,
      mesocycles: [
        {
          position: 1,
          name: 'Mesociclo 1',
          startDate: '2026-10-06',
          endDate: '2026-11-02',
          open: true,
        },
        {
          position: 2,
          name: 'Mesociclo 2',
          startDate: '2026-11-03',
          endDate: '2026-11-30',
          open: false,
        },
      ],
    },
    {
      lineageId: OLD,
      name: 'Programa anterior',
      current: false,
      mesocycles: [
        { position: 1, name: 'Base', startDate: '2026-08-04', endDate: '2026-08-31', open: false },
      ],
    },
  ],
  photos: [
    photo('front-1', LINEAGE, 1, 'FRONT'),
    photo('front-old', OLD, 1, 'FRONT'),
    photo('side-1', LINEAGE, 1, 'SIDE'),
    photo('huerfana', '01920000-0000-7000-8000-00000000000c', 1, 'BACK'),
  ],
};

describe('RN-G20 · P-30 · las fotos en pantalla', () => {
  it('la comparativa pone la foto del primer mesociclo frente a la del último; con una sola, no compara', () => {
    const [front, side, back] = photoComparison(RESPONSE);
    expect(front).toMatchObject({
      label: 'Frontal',
      initial: { id: 'front-old', programName: 'Programa anterior' },
      current: { id: 'front-1', mesocycleName: 'Mesociclo 1' },
    });
    expect(side).toMatchObject({ label: 'Lateral', initial: null, current: { id: 'side-1' } });
    expect(back).toMatchObject({ label: 'Posterior', initial: null, current: null });
  });

  it('cada mesociclo del programa publicado con sus tres vistas, y desde cuándo se suben', () => {
    const rows = photoSlots(RESPONSE);
    expect(
      rows.map((row) => [row.position, row.open, row.opensOn, row.slots.map((s) => s.photoId)]),
    ).toEqual([
      [1, true, '2026-10-27', ['front-1', 'side-1', null]],
      [2, false, '2026-11-24', [null, null, null]],
    ]);
    expect(photoSlots({ ...RESPONSE, programs: [] })).toEqual([]);
    expect(lastWeekStart('2026-11-30')).toBe('2026-11-24');
  });

  it('cada foto sale por la API, por la ruta de quien la mira', () => {
    expect(photoFileUrl('x', 'staff')).toBe('/api/v1/progress-photos/x/file');
    expect(photoFileUrl('x', 'patient')).toBe('/api/v1/me/progress-photos/x/file');
  });

  it('una foto grande se achica hasta 2048 px del lado mayor; una chica no se agranda', () => {
    expect(fittedSize(4032, 3024, 2048)).toEqual({ width: 2048, height: 1536 });
    expect(fittedSize(800, 600, 2048)).toEqual({ width: 800, height: 600 });
  });
});

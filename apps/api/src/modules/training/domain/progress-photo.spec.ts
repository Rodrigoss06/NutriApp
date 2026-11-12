import { describe, expect, it } from 'vitest';
import { isPhotoView, PHOTO_MIME_TYPES, photosOpen } from './progress-photo.js';

const mesocycle = {
  weeks: [
    {
      weekNo: 1,
      weekStart: '2026-10-06',
      weekEnd: '2026-10-12',
      isDeload: false,
      plannedSets: 9,
      sessionsPlanned: 3,
    },
    {
      weekNo: 4,
      weekStart: '2026-10-27',
      weekEnd: '2026-11-02',
      isDeload: false,
      plannedSets: 9,
      sessionsPlanned: 3,
    },
  ],
};

describe('RN-G20 · P-30 · las fotos de progreso', () => {
  it('se suben desde que empieza la última semana del mesociclo, y después también', () => {
    expect(photosOpen(mesocycle, '2026-10-26')).toBe(false);
    expect(photosOpen(mesocycle, '2026-10-27')).toBe(true);
    expect(photosOpen(mesocycle, '2026-12-01')).toBe(true);
    expect(photosOpen({ weeks: [] }, '2026-12-01')).toBe(false);
  });

  it('tres vistas, y solo JPEG o PNG', () => {
    expect(['FRONT', 'SIDE', 'BACK'].every(isPhotoView)).toBe(true);
    expect(isPhotoView('TOP')).toBe(false);
    expect(PHOTO_MIME_TYPES.has('image/jpeg')).toBe(true);
    expect(PHOTO_MIME_TYPES.has('application/pdf')).toBe(false);
  });
});

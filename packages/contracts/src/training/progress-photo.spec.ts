import { describe, expect, it } from 'vitest';
import { PHOTO_VIEW_LABELS, progressPhotosResponseSchema } from './progress-photo.js';

describe('RN-G20 · P-30 · las fotos de progreso', () => {
  it('tres vistas, con su nombre', () => {
    expect(PHOTO_VIEW_LABELS).toEqual({ FRONT: 'Frontal', SIDE: 'Lateral', BACK: 'Posterior' });
  });

  it('la lista no trae los bytes: cada foto se pide aparte, con su vista y quién la subió', () => {
    const parsed = progressPhotosResponseSchema.safeParse({
      consentActive: true,
      programs: [],
      photos: [
        {
          id: '01920000-0000-7000-8000-000000000001',
          programLineageId: '01920000-0000-7000-8000-000000000002',
          mesocyclePosition: 1,
          view: 'TOP',
          uploadedByRole: 'STAFF',
          uploadedAt: '2026-11-12T10:00:00.000Z',
        },
      ],
    });
    expect(parsed.success).toBe(false);
  });
});

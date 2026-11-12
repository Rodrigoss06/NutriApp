import { describe, expect, it } from 'vitest';
import {
  addRecordDocumentSchema,
  RECORD_DOCUMENT_CATEGORIES,
  RECORD_DOCUMENT_CATEGORY_LABELS,
  recordDocumentsResponseSchema,
  replaceRecordDocumentContentSchema,
  reviewRecordDocumentSchema,
} from './record-documents.js';

describe('RN-G21 · P-31 · el contrato del expediente de documentos', () => {
  it('las 8 categorías fijas de la hoja, con sus nombres', () => {
    expect(RECORD_DOCUMENT_CATEGORIES.map((code) => RECORD_DOCUMENT_CATEGORY_LABELS[code])).toEqual(
      [
        'Administrativo',
        'Clínico',
        'Progreso',
        'Evaluación APECS',
        'Técnica',
        'Seguimiento',
        'Evaluaciones físicas',
        'Reporte',
      ],
    );
  });

  it('un pedido trae título y categoría; el enlace, si viene, es https', () => {
    expect(
      addRecordDocumentSchema.parse({ title: ' Análisis de sangre ', category: 'CLINICAL' }),
    ).toEqual({ title: 'Análisis de sangre', category: 'CLINICAL' });
    expect(
      addRecordDocumentSchema.safeParse({
        title: 'Video de sentadilla',
        category: 'TECHNIQUE',
        linkUrl: 'https://videos.example.com/sentadilla',
      }).success,
    ).toBe(true);
    for (const linkUrl of [
      'http://videos.example.com/a',
      'javascript:alert(1)',
      'no es un enlace',
    ]) {
      expect(
        addRecordDocumentSchema.safeParse({ title: 'Video', category: 'TECHNIQUE', linkUrl })
          .success,
      ).toBe(false);
    }
    expect(addRecordDocumentSchema.safeParse({ title: '', category: 'CLINICAL' }).success).toBe(
      false,
    );
    expect(addRecordDocumentSchema.safeParse({ title: 'Ficha', category: 'OTRA' }).success).toBe(
      false,
    );
    expect(
      replaceRecordDocumentContentSchema.safeParse({
        linkUrl: `https://a.example.com/${'x'.repeat(2000)}`,
      }).success,
    ).toBe(false);
  });

  it('devolver un documento pide la nota para el alumno; validarlo, no', () => {
    expect(reviewRecordDocumentSchema.parse({ decision: 'VALIDATE' })).toEqual({
      decision: 'VALIDATE',
    });
    expect(
      reviewRecordDocumentSchema.parse({ decision: 'RETURN', note: ' Falta la segunda página ' }),
    ).toEqual({ decision: 'RETURN', note: 'Falta la segunda página' });
    expect(reviewRecordDocumentSchema.safeParse({ decision: 'RETURN' }).success).toBe(false);
    expect(reviewRecordDocumentSchema.safeParse({ decision: 'RETURN', note: ' ' }).success).toBe(
      false,
    );
  });

  it('la lista trae cada documento con su contenido, o sin contenido si es un pedido, y los consentimientos', () => {
    const parsed = recordDocumentsResponseSchema.parse({
      consents: { healthData: true, images: false },
      documents: [
        {
          id: 'd-1',
          category: 'CLINICAL',
          title: 'Análisis de sangre',
          status: 'PENDING',
          content: null,
          reviewNote: null,
          createdByRole: 'STAFF',
          createdAt: '2026-11-12T15:00:00.000Z',
          contentByRole: null,
          contentAt: null,
          reviewedAt: null,
          version: 1,
        },
        {
          id: 'd-2',
          category: 'ADMINISTRATIVE',
          title: 'Contrato',
          status: 'VALIDATED',
          content: { kind: 'FILE', mimeType: 'application/pdf', sizeBytes: 1024 },
          reviewNote: null,
          createdByRole: 'STAFF',
          createdAt: '2026-11-12T15:00:00.000Z',
          contentByRole: 'STAFF',
          contentAt: '2026-11-12T15:00:00.000Z',
          reviewedAt: null,
          version: 1,
        },
      ],
    });
    expect(parsed.documents.map((document) => document.content?.kind ?? null)).toEqual([
      null,
      'FILE',
    ]);
  });
});

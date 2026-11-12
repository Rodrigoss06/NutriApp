import { describe, expect, it } from 'vitest';
import {
  canDeleteDocument,
  needsImagesConsent,
  RECORD_DOCUMENT_LOCKED,
  RECORD_DOCUMENT_NOT_REVIEWABLE,
  RECORD_DOCUMENT_CONTENT_REQUIRED,
  statusOnAdd,
  statusOnContent,
  statusOnReview,
  type RecordDocumentState,
} from './record-document.js';

const doc = (overrides: Partial<RecordDocumentState> = {}): RecordDocumentState => ({
  status: 'IN_REVIEW',
  createdByRole: 'PATIENT',
  ...overrides,
});

describe('RN-G21 · P-31 · los estados del expediente de documentos', () => {
  it('el coach pide sin contenido («Pendiente») o agrega con contenido («Validado»); el alumno sube «Por revisar»', () => {
    expect(statusOnAdd('STAFF', false)).toEqual({ ok: true, value: 'PENDING' });
    expect(statusOnAdd('STAFF', true)).toEqual({ ok: true, value: 'VALIDATED' });
    expect(statusOnAdd('PATIENT', true)).toEqual({ ok: true, value: 'IN_REVIEW' });
    expect(statusOnAdd('PATIENT', false)).toEqual({
      ok: false,
      error: RECORD_DOCUMENT_CONTENT_REQUIRED,
    });
  });

  it('el alumno completa un pedido, o reemplaza lo suyo, y queda «Por revisar»; lo validado ya no lo cambia', () => {
    expect(statusOnContent('PATIENT', doc({ status: 'PENDING', createdByRole: 'STAFF' }))).toEqual({
      ok: true,
      value: 'IN_REVIEW',
    });
    expect(statusOnContent('PATIENT', doc())).toEqual({ ok: true, value: 'IN_REVIEW' });
    expect(statusOnContent('PATIENT', doc({ status: 'VALIDATED' }))).toEqual({
      ok: false,
      error: RECORD_DOCUMENT_LOCKED,
    });
  });

  it('el contenido que pone el coach entra «Validado», también en un documento del alumno', () => {
    for (const status of ['PENDING', 'IN_REVIEW', 'VALIDATED'] as const) {
      expect(statusOnContent('STAFF', doc({ status }))).toEqual({ ok: true, value: 'VALIDATED' });
    }
  });

  it('solo lo que está «Por revisar» se valida o se devuelve a «Pendiente»', () => {
    expect(statusOnReview(doc(), 'VALIDATE')).toEqual({ ok: true, value: 'VALIDATED' });
    expect(statusOnReview(doc(), 'RETURN')).toEqual({ ok: true, value: 'PENDING' });
    for (const status of ['PENDING', 'VALIDATED'] as const) {
      expect(statusOnReview(doc({ status }), 'VALIDATE')).toEqual({
        ok: false,
        error: RECORD_DOCUMENT_NOT_REVIEWABLE,
      });
    }
  });

  it('el coach borra cualquiera; el alumno, solo los que él creó mientras estén «Por revisar»', () => {
    for (const status of ['PENDING', 'IN_REVIEW', 'VALIDATED'] as const) {
      expect(canDeleteDocument('STAFF', doc({ status, createdByRole: 'STAFF' }))).toBe(true);
    }
    expect(canDeleteDocument('PATIENT', doc())).toBe(true);
    expect(canDeleteDocument('PATIENT', doc({ status: 'VALIDATED' }))).toBe(false);
    expect(canDeleteDocument('PATIENT', doc({ status: 'PENDING' }))).toBe(false);
    // Un pedido del coach que el alumno completó sigue siendo del coach.
    expect(canDeleteDocument('PATIENT', doc({ createdByRole: 'STAFF' }))).toBe(false);
  });

  it('07, «Privacidad» · las fotos y los enlaces, donde van los videos, piden el consentimiento de imágenes; un PDF no', () => {
    expect(needsImagesConsent({ kind: 'LINK' })).toBe(true);
    expect(needsImagesConsent({ kind: 'FILE', mimeType: 'image/jpeg' })).toBe(true);
    expect(needsImagesConsent({ kind: 'FILE', mimeType: 'image/png' })).toBe(true);
    expect(needsImagesConsent({ kind: 'FILE', mimeType: 'application/pdf' })).toBe(false);
  });
});

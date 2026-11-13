import type { RecordDocument } from '@nutricoach/contracts';
import { describe, expect, it } from 'vitest';
import {
  acceptedFiles,
  documentFileUrl,
  documentsByCategory,
  fileSummary,
  linkHost,
  patientCanDelete,
  patientCanReplace,
  pendingDocuments,
  uploadedDocuments,
} from './record-documents-view';

const doc = (overrides: Partial<RecordDocument> = {}): RecordDocument => ({
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
  ...overrides,
});

describe('RN-G21 · P-31 · el expediente en pantalla', () => {
  it('las 8 categorías de la hoja, en su orden, con sus documentos', () => {
    const groups = documentsByCategory([
      doc({ id: 'a', category: 'TECHNIQUE' }),
      doc({ id: 'b', category: 'CLINICAL' }),
      doc({ id: 'c', category: 'CLINICAL' }),
    ]);
    expect(groups.map((group) => [group.label, group.documents.map((d) => d.id)])).toEqual([
      ['Administrativo', []],
      ['Clínico', ['b', 'c']],
      ['Progreso', []],
      ['Evaluación APECS', []],
      ['Técnica', ['a']],
      ['Seguimiento', []],
      ['Evaluaciones físicas', []],
      ['Reporte', []],
    ]);
  });

  it('en la app, arriba lo que hay que subir: lo pedido o devuelto; abajo, lo ya subido', () => {
    const documents = [
      doc({ id: 'pedido' }),
      doc({ id: 'subido', status: 'IN_REVIEW', createdByRole: 'PATIENT' }),
      doc({ id: 'devuelto', status: 'PENDING', reviewNote: 'Falta la segunda página' }),
      doc({ id: 'validado', status: 'VALIDATED' }),
    ];
    expect(pendingDocuments(documents).map((d) => d.id)).toEqual(['pedido', 'devuelto']);
    expect(uploadedDocuments(documents).map((d) => d.id)).toEqual(['subido', 'validado']);
  });

  it('el alumno borra lo suyo por revisar y no cambia lo validado, como decide la API', () => {
    expect(patientCanDelete(doc({ status: 'IN_REVIEW', createdByRole: 'PATIENT' }))).toBe(true);
    expect(patientCanDelete(doc({ status: 'IN_REVIEW', createdByRole: 'STAFF' }))).toBe(false);
    expect(patientCanDelete(doc({ status: 'VALIDATED', createdByRole: 'PATIENT' }))).toBe(false);
    expect(patientCanReplace(doc({ status: 'PENDING' }))).toBe(true);
    expect(patientCanReplace(doc({ status: 'VALIDATED' }))).toBe(false);
  });

  it('cada archivo sale por la API, por la ruta de quien lo mira, con su tipo y su peso', () => {
    expect(documentFileUrl('x', 'staff')).toBe('/api/v1/record-documents/x/file');
    expect(documentFileUrl('x', 'patient')).toBe('/api/v1/me/record-documents/x/file');
    expect(fileSummary('application/pdf', 120_400)).toBe('PDF · 120 KB');
    expect(fileSummary('image/jpeg', 2_350_000)).toBe('JPEG · 2.4 MB');
    expect(fileSummary('image/png', 200)).toBe('PNG · 1 KB');
    expect(linkHost('https://drive.example.com/carpeta/123')).toBe('drive.example.com');
  });

  it('07 · sin el consentimiento de imágenes solo se elige un PDF', () => {
    expect(acceptedFiles(false)).toBe('application/pdf');
    expect(acceptedFiles(true)).toBe('application/pdf,image/jpeg,image/png');
  });
});

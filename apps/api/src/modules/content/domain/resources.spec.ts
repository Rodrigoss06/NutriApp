import { describe, expect, it } from 'vitest';
import {
  RESOURCE_ARCHIVED,
  RESOURCE_FIELD_MISMATCH,
  resourceChanges,
  type ResourceRecord,
} from './resources.js';

const base: ResourceRecord = {
  id: '0193a000-0000-7000-8000-000000000001',
  kind: 'LINK',
  title: 'Guía de porciones',
  fileId: null,
  url: 'https://example.com/guia',
  bodyMarkdown: null,
  tags: [],
  status: 'ACTIVE',
  createdBy: '0193a000-0000-7000-8000-000000000002',
  createdAt: new Date('2026-11-07T15:00:00Z'),
};

describe('RF-30 · un recurso cambia sin cambiar de tipo (ADR-094)', () => {
  it('el título, las etiquetas y el estado cambian en cualquier tipo; solo cuenta lo que cambia', () => {
    expect(
      resourceChanges(base, { title: 'Porciones', tags: ['cena'], status: 'ARCHIVED' }),
    ).toEqual({
      ok: true,
      value: { title: 'Porciones', tags: ['cena'], status: 'ARCHIVED' },
    });
    expect(resourceChanges(base, { title: 'Guía de porciones' })).toEqual({ ok: true, value: {} });
  });

  it('la URL solo en un enlace o un video; el texto solo en un artículo; un PDF no cambia su archivo', () => {
    expect(resourceChanges(base, { url: 'https://example.com/otra' })).toEqual({
      ok: true,
      value: { url: 'https://example.com/otra' },
    });
    expect(resourceChanges(base, { bodyMarkdown: 'Texto' })).toEqual({
      ok: false,
      error: RESOURCE_FIELD_MISMATCH,
    });
    const article = { ...base, kind: 'ARTICLE' as const, url: null, bodyMarkdown: 'Toma agua.' };
    expect(resourceChanges(article, { url: 'https://example.com' })).toEqual({
      ok: false,
      error: RESOURCE_FIELD_MISMATCH,
    });
    const file = { ...base, kind: 'FILE' as const, url: null, fileId: base.id };
    expect(resourceChanges(file, { url: 'https://example.com' }).ok).toBe(false);
  });

  it('un recurso archivado solo se restaura: no cambia su contenido', () => {
    const archived = { ...base, status: 'ARCHIVED' as const };
    expect(resourceChanges(archived, { title: 'Otro' })).toEqual({
      ok: false,
      error: RESOURCE_ARCHIVED,
    });
    expect(resourceChanges(archived, { status: 'ACTIVE' })).toEqual({
      ok: true,
      value: { status: 'ACTIVE' },
    });
  });
});

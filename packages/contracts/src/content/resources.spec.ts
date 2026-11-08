import { describe, expect, it } from 'vitest';
import {
  createResourceSchema,
  updateResourceSchema,
  uploadResourceFieldsSchema,
} from './resources.js';

describe('RF-30 · material educativo (ADR-094)', () => {
  it('un enlace o un video por https; un artículo con su texto', () => {
    expect(
      createResourceSchema.parse({
        kind: 'LINK',
        title: 'Guía de porciones',
        url: 'https://example.com/guia',
      }),
    ).toEqual({
      kind: 'LINK',
      title: 'Guía de porciones',
      url: 'https://example.com/guia',
      tags: [],
    });
    expect(
      createResourceSchema.safeParse({
        kind: 'VIDEO',
        title: 'Técnica',
        url: 'http://example.com/v',
      }).success,
    ).toBe(false);
    expect(
      createResourceSchema.safeParse({ kind: 'LINK', title: 'X', url: 'javascript:alert(1)' })
        .success,
    ).toBe(false);
    expect(
      createResourceSchema.safeParse({ kind: 'ARTICLE', title: 'Hidratación', bodyMarkdown: '  ' })
        .success,
    ).toBe(false);
  });

  it('cada tipo solo con lo suyo: un artículo no lleva URL', () => {
    expect(
      createResourceSchema.safeParse({
        kind: 'ARTICLE',
        title: 'Hidratación',
        bodyMarkdown: 'Toma agua.',
        url: 'https://example.com',
      }).success,
    ).toBe(false);
  });

  it('las etiquetas en minúsculas, sin repetir; en el multipart, separadas por coma', () => {
    expect(
      createResourceSchema.safeParse({
        kind: 'ARTICLE',
        title: 'Hidratación',
        bodyMarkdown: 'Toma agua.',
        tags: ['agua', 'Agua'],
      }).success,
    ).toBe(false);
    expect(uploadResourceFieldsSchema.parse({ title: 'Recetario', tags: 'Cena, rápido,' })).toEqual(
      {
        title: 'Recetario',
        tags: ['cena', 'rápido'],
      },
    );
    expect(uploadResourceFieldsSchema.parse({ title: 'Recetario' }).tags).toEqual([]);
  });

  it('un cambio dice qué cambia', () => {
    expect(updateResourceSchema.safeParse({}).success).toBe(false);
    expect(updateResourceSchema.parse({ status: 'ARCHIVED' })).toEqual({ status: 'ARCHIVED' });
  });
});

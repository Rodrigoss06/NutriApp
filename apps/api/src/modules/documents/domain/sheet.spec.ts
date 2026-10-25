import { describe, expect, it } from 'vitest';
import {
  ageOn,
  planSheetKind,
  resolveSheetBrand,
  sheetFileName,
  type BrandRecord,
} from './sheet.js';

const ORGANIZATION = 'Consultorio Demo';

const brand = (overrides: Partial<BrandRecord> = {}): BrandRecord => ({
  displayName: null,
  logoFileId: null,
  primaryColor: null,
  secondaryColor: null,
  contact: { phone: null, email: null, website: null },
  pdfFooter: null,
  ...overrides,
});

describe('RN-H01 · cinco fichas', () => {
  it('la dieta por intercambios tiene su ficha y el menú la suya', () => {
    expect(planSheetKind('EXCHANGES')).toBe('EXCHANGE_DIET');
    expect(planSheetKind('WEEKLY_MENU')).toBe('WEEKLY_MENU');
  });

  it('la composición se imprime con la ficha del menú: no hay una sexta', () => {
    expect(planSheetKind('COMPOSITION')).toBe('WEEKLY_MENU');
  });

  it('el archivo se nombra por la ficha, sin datos del paciente', () => {
    expect(sheetFileName('EXCHANGE_DIET')).toBe('ficha-dieta-por-intercambios.pdf');
    expect(sheetFileName('ANTHROPOMETRY')).toBe('ficha-resultados-antropometricos.pdf');
  });
});

describe('RN-H03 · la marca del profesional o la de su organización', () => {
  it('sin marca propia ni de la organización, lleva el nombre de la organización y ningún color fijado', () => {
    expect(resolveSheetBrand(null, null, ORGANIZATION)).toEqual({
      displayName: 'Consultorio Demo',
      logoFileId: null,
      primaryColor: null,
      secondaryColor: null,
      contact: { phone: null, email: null, website: null },
      footer: null,
    });
  });

  it('la marca de la organización da cada dato que fijó', () => {
    const organization = brand({
      displayName: 'Nutrición Integral',
      logoFileId: 'logo-org',
      primaryColor: '#1d4ed8',
      contact: { phone: '999 000 111', email: null, website: 'nutricion.example' },
      pdfFooter: 'Atención con cita previa',
    });
    expect(resolveSheetBrand(null, organization, ORGANIZATION)).toEqual({
      displayName: 'Nutrición Integral',
      logoFileId: 'logo-org',
      primaryColor: '#1d4ed8',
      secondaryColor: null,
      contact: { phone: '999 000 111', email: null, website: 'nutricion.example' },
      footer: 'Atención con cita previa',
    });
  });

  it('cada dato de la marca propia manda; lo que el profesional no fijó sale de la organización', () => {
    const organization = brand({
      displayName: 'Nutrición Integral',
      logoFileId: 'logo-org',
      primaryColor: '#1d4ed8',
      secondaryColor: '#9333ea',
      contact: { phone: '999 000 111', email: 'hola@nutricion.example', website: null },
    });
    const member = brand({
      displayName: 'Lic. Ana Demo',
      primaryColor: '#be123c',
      contact: { phone: null, email: 'ana@nutricion.example', website: null },
    });
    expect(resolveSheetBrand(member, organization, ORGANIZATION)).toMatchObject({
      displayName: 'Lic. Ana Demo',
      logoFileId: 'logo-org',
      primaryColor: '#be123c',
      secondaryColor: '#9333ea',
      contact: { phone: '999 000 111', email: 'ana@nutricion.example', website: null },
    });
  });
});

describe('RN-H02 · la ficha no depende del día en que se genera', () => {
  it('la edad es la cumplida el día del origen', () => {
    expect(ageOn('1998-10-24', '2026-10-24')).toBe(28);
    expect(ageOn('1998-10-25', '2026-10-24')).toBe(27);
    expect(ageOn('1998-11-01', '2026-10-24')).toBe(27);
    expect(ageOn('1998-02-28', '2026-03-01')).toBe(28);
  });
});

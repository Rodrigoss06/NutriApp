import { describe, expect, it } from 'vitest';
import { BRANDING_LIMITS, updateBrandingSchema } from './branding.js';

const VALID = {
  displayName: '  Consultorio Demo ',
  primaryColor: '#0F766E',
  secondaryColor: null,
  contact: {
    phone: '+51 (01) 999-000',
    email: 'citas@demo.test',
    website: 'https://demo.test/citas',
  },
  pdfFooter: 'Colegiatura CNP 0000',
};

describe('RN-H03 · la marca de las fichas que se escribe', () => {
  it('recorta los textos y guarda el color en minúsculas', () => {
    expect(updateBrandingSchema.parse(VALID)).toEqual({
      ...VALID,
      displayName: 'Consultorio Demo',
      primaryColor: '#0f766e',
    });
  });

  it('un dato vacío es «sin dato»: llega como null', () => {
    expect(
      updateBrandingSchema.parse({
        displayName: '',
        primaryColor: null,
        secondaryColor: null,
        contact: { phone: ' ', email: '', website: '' },
        pdfFooter: '   ',
      }),
    ).toEqual({
      displayName: null,
      primaryColor: null,
      secondaryColor: null,
      contact: { phone: null, email: null, website: null },
      pdfFooter: null,
    });
  });

  it('el web puede ir sin https://', () => {
    expect(
      updateBrandingSchema.parse({
        ...VALID,
        contact: { ...VALID.contact, website: 'consultorio.pe' },
      }).contact.website,
    ).toBe('consultorio.pe');
  });

  it.each([
    ['un color sin #', { primaryColor: '0f766e' }],
    ['un color de tres cifras', { secondaryColor: '#fff' }],
    ['un teléfono con letras', { contact: { ...VALID.contact, phone: 'llamar al 999' } }],
    ['un correo sin dominio', { contact: { ...VALID.contact, email: 'citas@' } }],
    ['una web sin dominio', { contact: { ...VALID.contact, website: 'javascript:alert(1)' } }],
    ['un nombre de una letra', { displayName: 'C' }],
    ['un pie de más de 120 caracteres', { pdfFooter: 'x'.repeat(BRANDING_LIMITS.pdfFooter + 1) }],
  ])('%s no pasa', (_, change) => {
    expect(updateBrandingSchema.safeParse({ ...VALID, ...change }).success).toBe(false);
  });
});

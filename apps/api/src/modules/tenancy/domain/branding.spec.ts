import { describe, expect, it } from 'vitest';
import {
  changedBrandingFields,
  checkLogo,
  EMPTY_BRANDING,
  LOGO_RULES,
  type BrandingText,
} from './branding.js';

const BRAND: BrandingText = {
  displayName: 'Consultorio Demo',
  primaryColor: '#0f766e',
  secondaryColor: null,
  contact: { phone: '+51 999 000 111', email: 'citas@demo.test', website: null },
  pdfFooter: null,
};

describe('RN-H03 · el logo de la marca (ADR-066)', () => {
  it('un PNG o JPEG entero de hasta 1 MB y 2000 px por lado sirve', () => {
    expect(checkLogo({ status: 'OK' }, LOGO_RULES.maxBytes)).toBeNull();
  });

  it('lo que no es una imagen entera, lo que mide de más y lo que pesa de más, cada uno con su error', () => {
    expect(checkLogo({ status: 'INVALID' }, 10)?.code).toBe('NC-TEN-040');
    expect(checkLogo({ status: 'TOO_LARGE' }, 10)?.code).toBe('NC-TEN-041');
    expect(checkLogo({ status: 'OK' }, LOGO_RULES.maxBytes + 1)?.code).toBe('NC-TEN-042');
  });
});

describe('RN-H03 · el cambio de marca nombra sus campos, nunca sus valores (02 §8)', () => {
  it('sin marca previa, cuenta lo que se fija', () => {
    expect(changedBrandingFields(null, BRAND)).toEqual([
      'displayName',
      'primaryColor',
      'contact.phone',
      'contact.email',
    ]);
  });

  it('solo lo que cambió; lo mismo otra vez no cambia nada', () => {
    expect(
      changedBrandingFields(BRAND, {
        ...BRAND,
        secondaryColor: '#d97706',
        contact: { ...BRAND.contact, phone: null },
        pdfFooter: 'Colegiatura CNP 0000',
      }),
    ).toEqual(['secondaryColor', 'contact.phone', 'pdfFooter']);
    expect(changedBrandingFields(BRAND, BRAND)).toEqual([]);
    expect(changedBrandingFields(null, EMPTY_BRANDING)).toEqual([]);
  });
});

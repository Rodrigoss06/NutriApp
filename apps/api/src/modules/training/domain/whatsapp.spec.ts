import { isErr } from '@nutricoach/shared-kernel';
import { describe, expect, it } from 'vitest';
import {
  PHONE_MISSING,
  PHONE_WITHOUT_COUNTRY_CODE,
  WHATSAPP_NOT_ENABLED,
  whatsappLink,
} from './whatsapp.js';

const link = (phone: string | null, enabled = true) => {
  const result = whatsappLink(phone, enabled);
  return isErr(result) ? result.error.code : result.value;
};

describe('P-35 · el chat de WhatsApp del alumno, con un enlace wa.me y sin integrar mensajería', () => {
  it('con el código de país, wa.me con los dígitos: sin «+», espacios, guiones ni paréntesis', () => {
    expect(link('+51 987 654 321')).toBe('https://wa.me/51987654321');
    expect(link('+51 (987) 654-321')).toBe('https://wa.me/51987654321');
    expect(link('0051 987.654.321')).toBe('https://wa.me/51987654321');
    expect(link('+1 415 555 0100')).toBe('https://wa.me/14155550100');
  });

  it('sin el código de país pide agregarlo: no se supone +51 (Rodrigo, 2026-11-11)', () => {
    expect(link('987 654 321')).toBe(PHONE_WITHOUT_COUNTRY_CODE.code);
    expect(link('51987654321')).toBe(PHONE_WITHOUT_COUNTRY_CODE.code);
  });

  it('un número que no es de teléfono, o con menos de 8 o más de 15 dígitos, también pide corregirlo', () => {
    expect(link('+51 987 ABC')).toBe(PHONE_WITHOUT_COUNTRY_CODE.code);
    expect(link('+51 9876')).toBe(PHONE_WITHOUT_COUNTRY_CODE.code);
    expect(link('+51 9876543210987654')).toBe(PHONE_WITHOUT_COUNTRY_CODE.code);
  });

  it('sin teléfono lo dice; y sin el seguimiento por WhatsApp activado en el perfil, no hay enlace', () => {
    expect(link(null)).toBe(PHONE_MISSING.code);
    expect(link('   ')).toBe(PHONE_MISSING.code);
    expect(link('+51 987 654 321', false)).toBe(WHATSAPP_NOT_ENABLED.code);
  });
});

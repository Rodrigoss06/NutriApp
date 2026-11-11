import { describe, expect, it } from 'vitest';
import { saveAthleteProfileSchema, whatsappLinkResponseSchema } from './athlete-profile.js';

const PROFILE = {
  objective: 'HYPERTROPHY',
  level: 'BEGINNER',
  daysPerWeek: 3,
  equipmentCodes: ['FULL_GYM'],
  medicalClearance: 'CLEARED',
  expectedRevision: 0,
};

describe('RN-G17 · ADR-080 · la anticoncepción hormonal del perfil', () => {
  it('es opcional: sin dato vale null', () => {
    expect(saveAthleteProfileSchema.parse(PROFILE).hormonalContraception).toBeNull();
  });

  it('es un sí o un no', () => {
    const accepts = (value: unknown) =>
      saveAthleteProfileSchema.safeParse({ ...PROFILE, hormonalContraception: value }).success;
    expect(accepts(true)).toBe(true);
    expect(accepts(false)).toBe(true);
    expect(accepts('ORAL')).toBe(false);
  });
});

describe('P-35 · el seguimiento asistido por WhatsApp', () => {
  it('se activa por alumno en su perfil; sin decirlo, queda apagado', () => {
    expect(saveAthleteProfileSchema.parse(PROFILE).whatsappFollowUp).toBe(false);
    expect(
      saveAthleteProfileSchema.parse({ ...PROFILE, whatsappFollowUp: true }).whatsappFollowUp,
    ).toBe(true);
  });

  it('el enlace solo abre un chat de wa.me por https', () => {
    const accepts = (url: string) => whatsappLinkResponseSchema.safeParse({ url }).success;
    expect(accepts('https://wa.me/51987654321')).toBe(true);
    expect(accepts('http://wa.me/51987654321')).toBe(false);
    expect(accepts('https://example.com/51987654321')).toBe(false);
  });
});

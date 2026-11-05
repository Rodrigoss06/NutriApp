import { describe, expect, it } from 'vitest';
import { grantMyConsentSchema } from './patient.js';

describe('RN-G17 · lo que el paciente autoriza desde la app', () => {
  it('solo MENSTRUAL_TRACKING: las finalidades obligatorias no se dan por aquí', () => {
    expect(grantMyConsentSchema.safeParse({ purpose: 'MENSTRUAL_TRACKING' }).success).toBe(true);
    expect(grantMyConsentSchema.safeParse({ purpose: 'HEALTH_DATA' }).success).toBe(false);
    expect(grantMyConsentSchema.safeParse({ purpose: 'IMAGES' }).success).toBe(false);
  });

  it('el paciente sale de la sesión: enviarlo en el cuerpo se rechaza (02 §10)', () => {
    expect(
      grantMyConsentSchema.safeParse({
        purpose: 'MENSTRUAL_TRACKING',
        patientId: '0193a000-0000-7000-8000-000000000001',
      }).success,
    ).toBe(false);
  });
});

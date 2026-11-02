import { describe, expect, it } from 'vitest';
import {
  createMotivationalMessageSchema,
  updateAppSettingsSchema,
  updateMotivationalMessageSchema,
} from './app.js';

describe('RF-27 · ajustes de la app del paciente', () => {
  const valid = {
    themeColor: '#1F8A70',
    welcomeMessage: 'Vamos paso a paso.',
    enabledSections: ['NUTRITION', 'HYDRATION'],
    allowWeightLog: false,
  };

  it('el color del tema en #RRGGBB, que se guarda en minúsculas', () => {
    expect(updateAppSettingsSchema.parse(valid).themeColor).toBe('#1f8a70');
    expect(updateAppSettingsSchema.safeParse({ ...valid, themeColor: 'verde' }).success).toBe(
      false,
    );
    expect(updateAppSettingsSchema.safeParse({ ...valid, themeColor: null }).success).toBe(true);
  });

  it('las secciones son de la lista y sin repetir', () => {
    expect(
      updateAppSettingsSchema.safeParse({ ...valid, enabledSections: ['NUTRITION', 'NUTRITION'] })
        .success,
    ).toBe(false);
    expect(updateAppSettingsSchema.safeParse({ ...valid, enabledSections: ['CHAT'] }).success).toBe(
      false,
    );
  });
});

describe('RF-27 · mensajes motivacionales', () => {
  it('con texto de hasta 280 caracteres y fechas en orden', () => {
    expect(createMotivationalMessageSchema.parse({ body: '¡Bien hecho!' })).toEqual({
      body: '¡Bien hecho!',
      activeFrom: null,
      activeTo: null,
    });
    expect(createMotivationalMessageSchema.safeParse({ body: 'a'.repeat(281) }).success).toBe(
      false,
    );
    expect(
      createMotivationalMessageSchema.safeParse({
        body: 'Hola',
        activeFrom: '2026-11-10',
        activeTo: '2026-11-01',
      }).success,
    ).toBe(false);
  });

  it('cambiarlo pide algo que cambiar', () => {
    expect(updateMotivationalMessageSchema.safeParse({}).success).toBe(false);
    expect(updateMotivationalMessageSchema.safeParse({ activeTo: '2026-11-01' }).success).toBe(
      true,
    );
  });
});

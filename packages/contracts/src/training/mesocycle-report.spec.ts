import { describe, expect, it } from 'vitest';
import {
  createMesocycleReportSchema,
  MESOCYCLE_REPORT_TEXT_LABELS,
  mesocycleReportCommentSchema,
  saveMesocycleReportSchema,
} from './mesocycle-report.js';

describe('RN-G19 · P-28 · el informe del mesociclo', () => {
  it('los cuatro textos del coach se recortan, llegan hasta 1000 caracteres y pueden quedar sin escribir', () => {
    expect(
      saveMesocycleReportSchema.parse({
        achievement: '  Cumplió 11 de 12 sesiones.  ',
        limitation: null,
        adjustment: '',
        priority: 'Sueño',
      }),
    ).toEqual({
      achievement: 'Cumplió 11 de 12 sesiones.',
      limitation: null,
      adjustment: '',
      priority: 'Sueño',
    });
    const long = 'a'.repeat(1001);
    expect(
      saveMesocycleReportSchema.safeParse({
        achievement: long,
        limitation: null,
        adjustment: null,
        priority: null,
      }).success,
    ).toBe(false);
    expect(
      saveMesocycleReportSchema.safeParse({
        achievement: null,
        limitation: null,
        adjustment: null,
        priority: null,
        status: 'SENT',
      }).success,
    ).toBe(false);
  });

  it('se crea por la posición del mesociclo en el programa; el comentario del alumno, hasta 1000 caracteres', () => {
    expect(
      createMesocycleReportSchema.safeParse({
        programId: '01920000-0000-7000-8000-000000000001',
        mesocyclePosition: 0,
      }).success,
    ).toBe(false);
    expect(mesocycleReportCommentSchema.parse({ comment: ' Me siento mejor. ' })).toEqual({
      comment: 'Me siento mejor.',
    });
    expect(mesocycleReportCommentSchema.safeParse({ comment: 'a'.repeat(1001) }).success).toBe(
      false,
    );
  });

  it('los rótulos son los de la hoja de Jeremy', () => {
    expect(Object.values(MESOCYCLE_REPORT_TEXT_LABELS)).toEqual([
      'Logro principal',
      'Limitante',
      'Ajuste principal',
      'Prioridad siguiente',
    ]);
  });
});

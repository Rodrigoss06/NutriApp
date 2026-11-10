import { describe, expect, it } from 'vitest';
import { dayProfileChoiceSchema, todayActionSchema } from './schedule.js';

describe('P-20.3 y P-20.4 · los cambios del día (ADR-104)', () => {
  it('hoy se puede dejar, mover o deshacer; nada más', () => {
    for (const action of ['NOT_TRAINING', 'MOVE_TO_TOMORROW', 'UNDO']) {
      expect(todayActionSchema.safeParse({ action }).success).toBe(true);
    }
    expect(todayActionSchema.safeParse({ action: 'MOVE_TO_YESTERDAY' }).success).toBe(false);
    expect(todayActionSchema.safeParse({}).success).toBe(false);
  });

  it('el coach elige un perfil por su código, Entrenamiento incluido, o null para volver al programa', () => {
    expect(dayProfileChoiceSchema.parse({ profileCode: 'TRAINING' })).toEqual({
      profileCode: 'TRAINING',
    });
    expect(dayProfileChoiceSchema.parse({ profileCode: null })).toEqual({ profileCode: null });
    expect(dayProfileChoiceSchema.safeParse({ profileCode: 'descanso' }).success).toBe(false);
    expect(dayProfileChoiceSchema.safeParse({}).success).toBe(false);
  });
});

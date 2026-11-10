import type { DaySchedule } from '@nutricoach/contracts';
import { describe, expect, it } from 'vitest';
import { hasSchedule, scheduleLine, todayNotice } from './day-schedule';

const day = (overrides: Partial<DaySchedule['today']> = {}): DaySchedule['today'] => ({
  localDate: '2026-11-10',
  profile: { code: 'TRAINING', name: 'Entrenamiento' },
  kcal: 2_510,
  sessions: 1,
  change: null,
  ...overrides,
});
const schedule = (overrides: Partial<DaySchedule> = {}): DaySchedule => ({
  today: day(),
  tomorrow: day({
    localDate: '2026-11-11',
    profile: { code: 'REST', name: 'Descanso' },
    kcal: 2_230,
    sessions: 0,
  }),
  options: { notTraining: true, moveToTomorrow: true, undo: null },
  ...overrides,
});

describe('P-20.3 · la agenda de hoy y mañana en la app (ADR-104)', () => {
  it('cada día dice su perfil, sus kcal y sus sesiones', () => {
    expect(scheduleLine(day())).toBe('Entrenamiento · 2,510 kcal · 1 sesión');
    expect(scheduleLine(day({ sessions: 0 }))).toBe('Entrenamiento · 2,510 kcal · sin sesión');
    expect(scheduleLine(day({ profile: null, kcal: null, sessions: 2 }))).toBe('2 sesiones');
  });

  it('dice lo que cambió hoy; sin cambios, nada', () => {
    expect(todayNotice(schedule())).toBeNull();
    expect(
      todayNotice(
        schedule({
          today: day({ profile: { code: 'REST', name: 'Descanso' }, change: 'NOT_TRAINING' }),
          options: { notTraining: false, moveToTomorrow: false, undo: 'NOT_TRAINING' },
        }),
      ),
    ).toBe('Hoy no entrenas: tu meta es la de Descanso.');
    expect(
      todayNotice(
        schedule({
          today: day({ change: 'MOVED', sessions: 0 }),
          options: { notTraining: false, moveToTomorrow: false, undo: 'MOVED' },
        }),
      ),
    ).toBe('Tu sesión de hoy pasó a mañana.');
    expect(todayNotice(schedule({ today: day({ change: 'MOVED' }) }))).toBe(
      'Hoy haces la sesión que pasaste de ayer.',
    );
    expect(
      todayNotice(
        schedule({ today: day({ profile: { code: 'ALTO', name: 'Alto' }, change: 'PROFILE' }) }),
      ),
    ).toBe('Tu coach eligió Alto para hoy.');
  });

  it('sin programa ni cambios no hay agenda que mostrar', () => {
    expect(hasSchedule(schedule())).toBe(true);
    expect(
      hasSchedule(schedule({ today: day({ sessions: null }), tomorrow: day({ sessions: null }) })),
    ).toBe(false);
    expect(
      hasSchedule(
        schedule({ today: day({ sessions: null }), tomorrow: day({ change: 'PROFILE' }) }),
      ),
    ).toBe(true);
  });
});

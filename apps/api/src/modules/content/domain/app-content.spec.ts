import { describe, expect, it } from 'vitest';
import { messageOfTheDay, settingsOrDefault, type MessageRecord } from './app-content.js';

const message = (id: string, extra: Partial<MessageRecord> = {}): MessageRecord => ({
  id,
  patientId: null,
  body: `Mensaje ${id}`,
  activeFrom: null,
  activeTo: null,
  createdAt: new Date(`2026-10-0${id}T12:00:00Z`),
  ...extra,
});

describe('RF-27 · ajustes de la app del paciente', () => {
  it('sin fila, los de 05.3: todas las secciones, peso permitido, sin tema ni bienvenida', () => {
    expect(settingsOrDefault(null)).toEqual({
      themeColor: null,
      welcomeMessage: null,
      enabledSections: [
        'NUTRITION',
        'HYDRATION',
        'TRAINING',
        'CHECKIN',
        'NOTES',
        'EVOLUTION',
        'RESOURCES',
      ],
      allowWeightLog: true,
      updatedAt: null,
    });
  });
});

describe('RF-27 · el mensaje de hoy', () => {
  it('los del paciente van antes que los de todos', () => {
    const own = message('2', { patientId: 'p' });
    expect(messageOfTheDay([message('1'), own], '2026-11-01')).toBe(own);
  });

  it('sin mensajes propios vigentes, uno de todos; sin ninguno, null', () => {
    const general = message('1');
    const ended = message('2', { patientId: 'p', activeTo: '2026-10-31' });
    expect(messageOfTheDay([general, ended], '2026-11-01')).toBe(general);
    expect(messageOfTheDay([], '2026-11-01')).toBeNull();
  });

  it('solo los vigentes ese día: con inicio y fin inclusive', () => {
    const future = message('1', { activeFrom: '2026-11-02' });
    const lastDay = message('2', { activeTo: '2026-11-01' });
    expect(messageOfTheDay([future, lastDay], '2026-11-01')).toBe(lastDay);
    expect(messageOfTheDay([future, lastDay], '2026-11-02')).toBe(future);
  });

  it('rota cada día entre los vigentes, igual para el mismo día', () => {
    const all = [message('3'), message('1'), message('2')];
    const days = ['2026-11-01', '2026-11-02', '2026-11-03'].map(
      (day) => messageOfTheDay(all, day)?.id,
    );
    expect(new Set(days).size).toBe(3);
    expect(messageOfTheDay(all, '2026-11-01')?.id).toBe(days[0]);
    expect(messageOfTheDay([...all].reverse(), '2026-11-01')?.id).toBe(days[0]);
  });
});

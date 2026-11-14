import type { OverviewPatient } from '@nutricoach/contracts';
import { describe, expect, it } from 'vitest';
import { alertFilter, alertHref, overviewFacts } from './overview-view';

const ID = '0193a000-0000-7000-8000-000000000001';
const patient = (values: Partial<OverviewPatient> = {}): OverviewPatient => ({
  patientId: ID,
  alerts: ['LOW_ADHERENCE'],
  lastLogDate: '2026-11-06',
  adherence7dPct: 57.142857,
  adherence30dPct: 70,
  unreadNotes: 0,
  lastEvaluationAt: null,
  lastWeightKg: null,
  nextAppointmentAt: null,
  updatedAt: '2026-11-07T15:50:00.000Z',
  ...values,
});

describe('RF-34 · las alertas en Inicio', () => {
  it('cada alerta lleva a la pantalla donde se atiende', () => {
    expect(alertHref(ID, 'LOW_ADHERENCE')).toBe(`/panel/pacientes/${ID}/analitica`);
    expect(alertHref(ID, 'FATIGUE_AMBER')).toBe(`/panel/pacientes/${ID}/analitica/rutina`);
    expect(alertHref(ID, 'PENDING_REVIEW')).toBe(
      `/panel/pacientes/${ID}/entrenamiento/control-semanal`,
    );
    expect(alertHref(ID, 'UNREAD_NOTES')).toBe(`/panel/pacientes/${ID}/seguimiento`);
  });

  it('RN-D09 · los números con que se calcularon, redondeados solo al mostrar', () => {
    expect(overviewFacts(patient())).toEqual([
      'Último registro: 6 de noviembre de 2026',
      'Adherencia de 7 días: 57.1 %',
    ]);
    expect(
      overviewFacts(patient({ lastLogDate: null, adherence7dPct: null, unreadNotes: 2 })),
    ).toEqual(['Todavía no registra en su app', '2 notas sin leer']);
    // RF-34 · la próxima cita, en la hora de la organización (ADR-125).
    expect(
      overviewFacts(patient({ nextAppointmentAt: '2026-11-16T14:00:00.000Z' }), 'America/Lima').at(
        -1,
      ),
    ).toMatch(/^Próxima cita: 16 nov\.? 2026,? 9:00/);
  });

  it('el filtro de la URL solo acepta una alerta conocida', () => {
    expect(alertFilter('READINESS_RED')).toBe('READINESS_RED');
    expect(alertFilter(['WEEKLY_RED', 'X'])).toBe('WEEKLY_RED');
    expect(alertFilter('DROP TABLE')).toBeNull();
    expect(alertFilter(undefined)).toBeNull();
  });
});

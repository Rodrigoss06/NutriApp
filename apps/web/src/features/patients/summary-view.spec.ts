import type { OverviewPatient } from '@nutricoach/contracts';
import { describe, expect, it } from 'vitest';
import { activeSection, offered, RECORD_GROUPS, sectionLabel } from './record-sections';
import { justStarted, summaryFacts } from './summary-view';

const ID = '0193a000-0000-7000-8000-000000000001';
const row = (values: Partial<OverviewPatient> = {}): OverviewPatient => ({
  patientId: ID,
  alerts: [],
  lastLogDate: '2026-11-15',
  adherence7dPct: 57.142857,
  adherence30dPct: 80,
  unreadNotes: 2,
  lastEvaluationAt: '2026-11-02T15:00:00.000Z',
  lastWeightKg: 71.45,
  nextAppointmentAt: null,
  updatedAt: '2026-11-16T12:00:00.000Z',
  ...values,
});

describe('ADR-138 · las secciones del expediente en la barra lateral', () => {
  const at = (rest: string) => activeSection(`/panel/pacientes/${ID}${rest}`, ID)?.label ?? null;

  it('cada ruta queda en su sección, también en sus páginas internas; el Resumen, solo en la suya', () => {
    expect(at('')).toBe('Resumen');
    expect(at('/ficha')).toBe('Ficha');
    expect(at('/evaluaciones/0193a000-0000-7000-8000-000000000002/comparacion')).toBe(
      'Evaluaciones',
    );
    expect(at('/evaluaciones/evolucion')).toBe('Evolución');
    expect(at('/entrenamiento')).toBe('Seguridad');
    expect(at('/entrenamiento/control-semanal')).toBe('Control semanal');
    expect(at('/entrenamiento/programas/0193a000-0000-7000-8000-000000000003')).toBe('Programas');
    expect(at('/analitica')).toBe('Analítica de dieta');
    expect(at('/analitica/rutina')).toBe('Analítica de rutina');
    expect(at('/historia/revisiones/2')).toBe('Historia clínica');
    expect(activeSection('/panel/pacientes/otro/dieta', ID)).toBeNull();
    expect(activeSection('/panel/agenda', ID)).toBeNull();
  });

  it('el Resumen y cinco grupos con las 24 secciones, sin rutas repetidas', () => {
    const paths = RECORD_GROUPS.flatMap((group) => group.sections.map((section) => section.path));
    expect(RECORD_GROUPS.map((group) => group.label)).toEqual([
      'Seguimiento',
      'Nutrición',
      'Entrenamiento',
      'Evaluaciones',
      'Expediente',
    ]);
    expect(paths).toHaveLength(24);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('ADR-127 · una bandera apagada no ofrece su sección; sin banderas, todas', () => {
    const photos = RECORD_GROUPS[0]?.sections.find((section) => section.label === 'Fotos');
    expect(photos).toBeDefined();
    if (!photos) return;
    expect(offered(photos, null)).toBe(true);
    expect(
      offered(photos, {
        MESOCYCLE_REPORT: true,
        PROGRESS_PHOTOS: false,
        RECORD_DOCUMENTS: true,
      }),
    ).toBe(false);
  });

  it('la app lleva la palabra de la organización para el paciente', () => {
    const app = RECORD_GROUPS.at(-1)?.sections.find((section) => section.path === '/app');
    expect(app && sectionLabel(app, 'Asesorado')).toBe('App del asesorado');
  });
});

describe('ADR-138 · el Resumen del expediente, de la fila del panel', () => {
  it('RN-D09 · los números de la API, redondeados solo al mostrar, con la sección donde se ven enteros', () => {
    const facts = summaryFacts(row(), 'America/Lima');
    const byKey = new Map(facts.map((fact) => [fact.key, fact]));

    expect(byKey.get('last-log')?.value).toBe('15 de noviembre de 2026');
    expect(byKey.get('notes')).toMatchObject({ value: '2', link: 'Leer sus notas' });
    expect(byKey.get('adherence')).toMatchObject({ value: '57.1 %', section: '/analitica' });
    expect(byKey.get('adherence')?.detail).toContain('En 30 días: 80.0 %.');
    expect(byKey.get('weight')?.value).toBe('71.5 kg');
    expect(byKey.get('appointment')?.value).toBe('Sin citas programadas');
    expect(byKey.get('evaluation')?.value).toMatch(/^2 nov\.? 2026/);
  });

  it('sin datos dice qué falta, no 0', () => {
    const facts = summaryFacts(
      row({
        lastLogDate: null,
        adherence7dPct: null,
        adherence30dPct: null,
        unreadNotes: 0,
        lastEvaluationAt: null,
        lastWeightKg: null,
      }),
      'America/Lima',
    );
    expect(facts.map((fact) => fact.value)).toEqual([
      'Todavía no registra en su app',
      '0',
      'Sin días con meta',
      'Sin citas programadas',
      'Todavía no tiene',
      'Sin peso en 30 días',
    ]);
    expect(justStarted(null)).toBe(true);
    expect(justStarted(row({ lastLogDate: null, lastEvaluationAt: null }))).toBe(true);
    expect(justStarted(row())).toBe(false);
  });
});

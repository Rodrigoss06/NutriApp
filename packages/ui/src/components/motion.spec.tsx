// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { enterStyle } from '../lib/motion';
import { Button } from './button';
import { CompositionBar } from './composition-bar';
import { ContourBackground, contourLayers } from './contour-background';
import { Notice } from './notice';
import { ReferenceRuler, rulerLayout, type RulerBand } from './reference-ruler';

afterEach(cleanup);

/** La tabla de ACE para hombres adultos de la semilla (assessment.reference_range). */
const ACE: RulerBand[] = [
  { min: 2, max: 6, label: 'Grasa esencial', tone: 'caution' },
  { min: 6, max: 14, label: 'Atlético', tone: 'neutral' },
  { min: 14, max: 18, label: 'Fitness', tone: 'neutral' },
  { min: 18, max: 25, label: 'Promedio', tone: 'neutral' },
  { min: 25, max: null, label: 'Obesidad', tone: 'risk' },
];

describe('RN-D10 · regla de referencia: dibuja las bandas que llegan de la API', () => {
  it('el marcador cae en el valor sin redondear y se resalta la banda que lo contiene', () => {
    const layout = rulerLayout(20.26, ACE);

    expect(layout?.bands.filter((band) => band.active).map((band) => band.label)).toEqual([
      'Promedio',
    ]);
    const promedio = layout?.bands.find((band) => band.label === 'Promedio');
    expect(layout?.valuePct).toBeGreaterThan(promedio?.left ?? 100);
    expect(layout?.valuePct).toBeLessThan((promedio?.left ?? 0) + (promedio?.width ?? 0));
  });

  it('intervalos semiabiertos, como la interpretación: 25 ya es «Obesidad»', () => {
    const active = rulerLayout(25, ACE)?.bands.find((band) => band.active);
    expect(active?.label).toBe('Obesidad');
  });

  it('un extremo abierto recibe aire y el valor siempre queda dentro del dibujo', () => {
    const layout = rulerLayout(40, ACE);

    expect(layout?.hi).toBeGreaterThan(40);
    expect(layout?.valuePct).toBeLessThan(100);
    expect(rulerLayout(0.5, ACE)?.valuePct).toBeGreaterThan(0);
  });

  it('no rotula límites que quedarían encimados y pone marcas a paso redondo', () => {
    const crowded: RulerBand[] = [
      { min: null, max: 18.5, label: 'Bajo peso', tone: 'caution' },
      { min: 18.5, max: 18.9, label: 'Casi', tone: 'neutral' },
      { min: 18.9, max: 25, label: 'Normal', tone: 'neutral' },
      { min: 25, max: null, label: 'Alto', tone: 'caution' },
    ];
    const layout = rulerLayout(22, crowded);
    const labels = layout?.edges.map((edge) => edge.value);

    expect(labels).toContain(18.5);
    expect(labels).not.toContain(18.9);
    const gaps = (layout?.edges ?? []).slice(1).map((e, i) => e.pct - (layout?.edges[i]?.pct ?? 0));
    expect(gaps.every((gap) => gap >= 9)).toBe(true);
    expect(layout?.ticks.length).toBeGreaterThan(5);
    expect(layout?.ticks.length).toBeLessThanOrEqual(46);
  });

  it('sin límites finitos no hay regla; la regla no entra al árbol de accesibilidad', () => {
    expect(rulerLayout(1, [{ min: null, max: null, label: 'Todo', tone: 'neutral' }])).toBeNull();
    const { container } = render(<ReferenceRuler value={20.26} bands={ACE} />);
    expect(container.querySelector('[data-ruler]')?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('[data-ruler-marker]')?.className).toContain('nc-to-value');
  });
});

describe('barra de composición (Kerr): proporción de un vistazo, cifras aparte', () => {
  it('cada tramo pesa lo que su masa, crece en orden y la leyenda nombra cada color', () => {
    render(
      <CompositionBar
        label="Proporción de las cinco masas"
        segments={[
          { key: 'adipose', label: 'Adiposa', value: 23.4, color: 'var(--data-adipose)' },
          { key: 'muscle', label: 'Muscular', value: 35.9, color: 'var(--data-muscle)' },
          { key: 'none', label: 'Vacía', value: 0, color: 'red' },
        ]}
      />,
    );
    const bar = screen.getByRole('img', { name: 'Proporción de las cinco masas' });
    const segments = bar.querySelectorAll<HTMLElement>('[data-segment]');

    expect(segments).toHaveLength(2);
    expect(segments[1]?.style.flexGrow).toBe('35.9');
    expect(segments[1]?.style.getPropertyValue('--k')).toBe('1');
    expect(screen.getByText('Muscular')).toBeTruthy();
    expect(screen.queryByText('Vacía')).toBeNull();
    expect(bar.textContent).toBe('');
  });
});

describe('WCAG 2.2.2 · fondo de curvas de nivel que se puede pausar', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('dibuja dos capas deterministas y pausa con su botón; la preferencia queda en el navegador', async () => {
    const { container } = render(<ContourBackground seed={2} />);
    await act(async () => {
      await Promise.resolve();
    });
    const root = container.firstElementChild as HTMLElement;
    const button = screen.getByRole('button', { name: 'Pausar animación' });

    expect(root.dataset.motion).toBe('running');
    expect(container.querySelectorAll('svg.nc-contours-a, svg.nc-contours-b')).toHaveLength(2);
    expect(button.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(button);

    expect(root.dataset.motion).toBe('paused');
    expect(screen.getByRole('button', { name: 'Reanudar animación' })).toBeTruthy();
    expect(window.localStorage.getItem('nc-motion')).toBe('paused');
    expect(contourLayers(2)[0].paths).toEqual(contourLayers(2)[0].paths);
  });

  it('arranca pausado si quien mira lo pausó antes', async () => {
    window.localStorage.setItem('nc-motion', 'paused');
    const { container } = render(<ContourBackground controls="none" />);
    await act(async () => {
      await Promise.resolve();
    });

    expect((container.firstElementChild as HTMLElement).dataset.motion).toBe('paused');
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('animaciones reutilizables (ADR-051)', () => {
  it('el botón principal brilla una vez solo si es la acción principal; los otros no', () => {
    render(
      <>
        <Button attention>Entrar</Button>
        <Button variant="secondary" attention>
          Cancelar
        </Button>
      </>,
    );

    expect(screen.getByRole('button', { name: 'Entrar' }).className).toContain('nc-shine-once');
    expect(screen.getByRole('button', { name: 'Cancelar' }).className).not.toContain('nc-shine');
  });

  it('un aviso nuevo late; el índice de entrada va en --i', () => {
    render(<Notice tone="warning" title="Se necesita una tercera toma" attention />);

    expect(screen.getByRole('status').className).toContain('nc-pulse');
    expect(enterStyle(3)).toEqual({ '--i': 3 });
  });

  it('con «reducir movimiento» ninguna animación corre y la línea de medición se oculta', () => {
    // happy-dom cambia import.meta.url: se lee desde la raíz del paquete, donde corre vitest.
    const css = readFileSync(join(process.cwd(), 'src/styles.css'), 'utf8');
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));

    for (const name of [
      'nc-enter',
      'nc-to-value',
      'nc-grow',
      'nc-pulse',
      'nc-contours-a',
      'nc-scan',
    ]) {
      expect(reduced, name).toContain(`.${name}`);
    }
    expect(reduced).toContain('animation: none');
  });
});

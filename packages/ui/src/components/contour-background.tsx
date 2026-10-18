'use client';

import { Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '../lib/cn';

/** Preferencia de quien mira, en su navegador: si pausó el fondo, sigue pausado en las otras pantallas. */
const STORAGE_KEY = 'nc-motion';

type Point = readonly [number, number];

/**
 * Un anillo de curva de nivel: un óvalo deformado por tres ondas. Determinista: la misma semilla da el mismo
 * dibujo en cada visita.
 */
function ring(cx: number, cy: number, radius: number, seed: number, k: number): Point[] {
  const points: Point[] = [];
  const steps = 36;
  for (let s = 0; s < steps; s += 1) {
    const t = (s / steps) * Math.PI * 2;
    const r =
      radius +
      9 * Math.sin(3 * t + seed + k * 0.35) +
      6 * Math.sin(5 * t - seed * 1.7 - k * 0.22) +
      3 * Math.sin(9 * t + k);
    points.push([cx + r * Math.cos(t) * 1.25, cy + r * Math.sin(t)]);
  }
  return points;
}

/** Curva cerrada y suave por los puntos (Catmull-Rom pasado a Bézier cúbica). */
function smoothPath(points: readonly Point[]): string {
  const n = points.length;
  const at = (i: number) => points[((i % n) + n) % n] as Point;
  const f = (x: number) => x.toFixed(1);
  let d = `M${f(at(0)[0])} ${f(at(0)[1])}`;
  for (let i = 0; i < n; i += 1) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const c1: Point = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Point = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return `${d}Z`;
}

export interface ContourLayer {
  readonly paths: readonly string[];
}

/** Las dos capas del fondo: anillos concéntricos alrededor de dos centros, como un mapa de relieve. */
export function contourLayers(seed: number): readonly [ContourLayer, ContourLayer] {
  const layer = (cx: number, cy: number, s: number): ContourLayer => ({
    paths: Array.from({ length: 14 }, (_, k) => smoothPath(ring(cx, cy, 40 + k * 26, s, k))),
  });
  return [layer(260, 420, seed), layer(620, 160, seed + 2.8)];
}

export interface ContourBackgroundProps {
  /** Cambia el dibujo; cada zona destacada usa la suya. */
  readonly seed?: number;
  /** Dónde va el botón de pausa dentro de la zona. */
  readonly controls?: 'top-right' | 'bottom-right' | 'none';
  /**
   * false: las curvas quedan quietas, como textura (la franja de resultados). Sin movimiento no hay botón de pausa.
   */
  readonly animated?: boolean;
  readonly className?: string;
}

/**
 * Fondo animado de curvas de nivel (ADR-051) para las zonas destacadas: entrar, el inicio del panel y la cabecera
 * de Hoy. Toma el color de la marca. Solo transform: dos capas que derivan despacio y una línea de medición que
 * barre. Se pausa con su botón (WCAG 2.2.2), fuera de la vista y con la pestaña oculta; con «reducir movimiento»
 * queda quieto y sin botón. Las curvas se dibujan en el navegador: no pesan en el HTML ni retrasan la primera
 * pintura.
 */
export function ContourBackground({
  seed = 1.3,
  controls = 'top-right',
  animated = true,
  className,
}: ContourBackgroundProps) {
  const root = useRef<HTMLDivElement>(null);
  const [layers, setLayers] = useState<readonly [ContourLayer, ContourLayer] | null>(null);
  const [paused, setPaused] = useState(false);
  const [away, setAway] = useState(false);

  useEffect(() => {
    setLayers(contourLayers(seed));
  }, [seed]);

  useEffect(() => {
    try {
      setPaused(window.localStorage.getItem(STORAGE_KEY) === 'paused');
    } catch {
      // Sin almacenamiento (navegación privada, sitio bloqueado): el fondo arranca en movimiento.
    }
  }, []);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    let visible = true;
    const update = () => {
      setAway(!visible || document.hidden);
    };
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(([entry]) => {
            visible = entry?.isIntersecting ?? true;
            update();
          });
    observer?.observe(element);
    document.addEventListener('visibilitychange', update);
    return () => {
      observer?.disconnect();
      document.removeEventListener('visibilitychange', update);
    };
  }, []);

  const toggle = () => {
    const next = !paused;
    setPaused(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? 'paused' : 'running');
    } catch {
      // La preferencia vale solo para esta visita.
    }
  };

  return (
    <div
      ref={root}
      data-motion={paused || away ? 'paused' : 'running'}
      className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}
    >
      {layers ? (
        <div
          aria-hidden
          className="nc-contours absolute inset-0"
          style={{
            color: 'color-mix(in oklab, var(--brand-primary) 52%, var(--hero-foreground))',
          }}
        >
          {layers.map((layer, n) => (
            <svg
              key={n === 0 ? 'a' : 'b'}
              className={cn(
                'absolute -inset-[10%] h-[120%] w-[120%]',
                animated && 'will-change-transform',
                animated && (n === 0 ? 'nc-contours-a' : 'nc-contours-b'),
              )}
              viewBox="0 0 800 600"
              preserveAspectRatio="xMidYMid slice"
            >
              {layer.paths.map((d, i) => (
                <path
                  key={i}
                  d={d}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={i % 4 === 0 ? 1.4 : 0.8}
                  opacity={(i % 4 === 0 ? 0.55 : 0.32) * (n === 0 ? 1 : 0.75)}
                />
              ))}
            </svg>
          ))}
          {animated ? <div className="nc-scan absolute inset-y-0 left-0 w-1/3 opacity-50" /> : null}
        </div>
      ) : null}
      {controls === 'none' || !animated ? null : (
        <button
          type="button"
          aria-pressed={paused}
          onClick={toggle}
          className={cn(
            'pointer-events-auto absolute z-10 inline-flex min-h-7 items-center gap-1.5 rounded-full border border-hero-foreground/30 bg-hero/70 px-3 font-label text-xs font-medium text-hero-foreground backdrop-blur-sm hover:bg-hero motion-reduce:hidden',
            controls === 'top-right' ? 'top-3 right-3' : 'right-3 bottom-3',
          )}
        >
          {paused ? (
            <Play aria-hidden className="size-3" />
          ) : (
            <Pause aria-hidden className="size-3" />
          )}
          {paused ? 'Reanudar animación' : 'Pausar animación'}
        </button>
      )}
    </div>
  );
}

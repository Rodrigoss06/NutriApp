import { ContourBackground, enterStyle } from '@nutricoach/ui';
import type { ReactNode } from 'react';

/**
 * Marco de las pantallas de acceso (ADR-051): a la izquierda, la zona destacada con el fondo de curvas de nivel y lo
 * que distingue al producto; a la derecha, el formulario. En el celular, la zona se acorta arriba y el formulario
 * queda a mano. Profesionales y pacientes entran por aquí: el texto les sirve a ambos.
 */
export function AuthCard({
  title,
  description,
  children,
}: Readonly<{ title: string; description?: ReactNode; children: ReactNode }>) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section
        aria-label="NutriCoach"
        className="relative flex min-h-56 flex-col justify-between gap-10 overflow-hidden bg-hero px-6 py-6 text-hero-foreground sm:px-10 lg:min-h-dvh lg:py-10"
      >
        <ContourBackground seed={1.3} controls="top-right" />
        <p className="relative flex items-center gap-2.5 font-semibold [font-stretch:108%]">
          <span
            aria-hidden
            className="flex size-8 items-center justify-center rounded-md bg-brand text-sm font-bold text-brand-foreground"
          >
            N
          </span>
          NutriCoach
        </p>
        <div className="relative flex max-w-xl flex-col gap-4">
          <p
            className="nc-enter font-display text-4xl leading-[1.05] text-balance sm:text-5xl lg:text-6xl"
            style={enterStyle(0)}
          >
            Cada cifra, con su método.
          </p>
          <p
            className="nc-enter hidden max-w-md text-pretty text-hero-muted sm:block"
            style={enterStyle(1)}
          >
            Evaluación antropométrica, composición corporal, energía y seguimiento diario en un solo
            lugar.
          </p>
        </div>
      </section>
      <main
        id="contenido"
        className="mx-auto flex w-full max-w-md flex-col justify-center gap-6 px-6 py-10 sm:px-8"
      >
        <div className="nc-enter flex flex-col gap-2" style={enterStyle(2)}>
          <h1 className="text-3xl font-semibold">{title}</h1>
          {description ? <p className="text-muted-foreground">{description}</p> : null}
        </div>
        <div className="nc-enter" style={enterStyle(3)}>
          {children}
        </div>
      </main>
    </div>
  );
}

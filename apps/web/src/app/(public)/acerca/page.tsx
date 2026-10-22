import type { Metadata } from 'next';
import { BackLink } from '@/features/shell/back-link';

export const metadata: Metadata = { title: 'Acerca de' };

/**
 * Acerca de la aplicación, con la atribución de sus fuentes de datos. Es el único lugar donde aparece (ADR-055,
 * ADR-056): nombra solo las fuentes que de verdad se cargan, sin logos ni aval del Estado.
 */
export default function AboutPage() {
  return (
    <main
      id="contenido"
      className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12"
    >
      <div>
        <BackLink />
      </div>
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold">Acerca de NutriCoach</h1>
        <p className="text-pretty">
          Una plataforma para nutricionistas y entrenadores: evaluación antropométrica, composición
          corporal, energía, dieta, rutinas y seguimiento diario de cada paciente. Cada cifra lleva
          el método con que se calculó.
        </p>
      </div>
      <section aria-labelledby="fuentes" className="flex flex-col gap-3">
        <h2 id="fuentes" className="text-xl font-semibold">
          Fuentes de los datos
        </h2>
        <p className="text-pretty">
          Datos nutricionales referenciales basados en las Tablas peruanas de composición de
          alimentos (2017) y en las Tablas auxiliares para la formulación y evaluación de regímenes
          alimentarios (TAFERA, 2016) del Instituto Nacional de Salud (INS/CENAN).
        </p>
        <p className="text-pretty">
          El gasto energético de las actividades físicas usa los MET del 2024 Adult Compendium of
          Physical Activities (Herrmann SD, Willis EA, Ainsworth BE y otros, Journal of Sport and
          Health Science, 2024;13(1):6-12), con sus descripciones traducidas al español.
        </p>
        <p className="text-pretty text-muted-foreground">
          NutriCoach es un desarrollo independiente: ninguna entidad del Estado lo avala ni lo
          patrocina.
        </p>
      </section>
    </main>
  );
}

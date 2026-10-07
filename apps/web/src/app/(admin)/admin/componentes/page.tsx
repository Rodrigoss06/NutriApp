import { methodLabel } from '@nutricoach/contracts';
import {
  Button,
  EmptyState,
  formatNumber,
  IndicatorCard,
  MethodBadge,
  Notice,
  parseBrand,
  StatusBadge,
  Steps,
} from '@nutricoach/ui';
import { CalendarCheck, Dumbbell, Inbox, Menu, TrendingUp, UtensilsCrossed } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { internalToolsEnabled } from '@/config/env';
import { ChartExample } from '@/features/catalog/chart-example';
import { InteractiveExamples } from '@/features/catalog/interactive-examples';
import { LiveBrand } from '@/features/catalog/live-brand';

export const metadata: Metadata = {
  title: 'Catálogo de componentes',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const hex = (value: string | string[] | undefined) =>
  typeof value === 'string' ? `#${value}` : undefined;

/**
 * Catálogo del sistema de diseño (P3): solo en local y staging. Acepta ?primary=FFE600&secondary=1A1A2E para
 * probar la accesibilidad con marcas extremas.
 */
export default async function ComponentCatalogPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  // APP_ENV se lee en cada petición: staging y producción usan la misma imagen (01 §6).
  await connection();
  if (!internalToolsEnabled()) notFound();
  const params = await searchParams;
  const brand = parseBrand({
    primary: hex(params['primary']) ?? '#0f766e',
    secondary: hex(params['secondary']),
  });

  return (
    <main id="contenido" className="mx-auto flex max-w-5xl flex-col gap-10 p-4 lg:p-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">Catálogo de componentes</h1>
        <p className="text-muted-foreground">
          Sistema de diseño de NutriCoach. Cambia el color primario y mira cómo cambian los botones,
          la barra lateral y la barra inferior sin tocar ningún componente.
        </p>
      </header>

      <LiveBrand initial={brand} />

      <section aria-labelledby="botones" className="flex flex-col gap-4">
        <h2 id="botones" className="text-xl font-semibold">
          Botones
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button data-testid="primary-button">Guardar</Button>
          <Button variant="secondary">Cancelar</Button>
          <Button variant="ghost">Más opciones</Button>
          <Button variant="danger">Anular</Button>
          <Button size="touch">Registrar comida</Button>
          <Button disabled>No disponible</Button>
        </div>
      </section>

      <section aria-labelledby="indicadores" className="flex flex-col gap-4">
        <h2 id="indicadores" className="text-xl font-semibold">
          Indicadores con su método (RN-D02)
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <IndicatorCard
            label="% de grasa"
            value={formatNumber(20.2563, 'percent')}
            unit="%"
            method={
              <MethodBadge
                label={methodLabel('FAT_DW1974_SIRI1961')}
                code="FAT_DW1974_SIRI1961"
                version="1.0.0"
              />
            }
            status={<StatusBadge tone="warning">Por encima de la meta</StatusBadge>}
          />
          <IndicatorCard
            label="Masa grasa"
            value={formatNumber(16.2104, 'mass')}
            unit="kg"
            method={
              <MethodBadge label={methodLabel('FAT_DW1974_SIRI1961')} code="FAT_DW1974_SIRI1961" />
            }
            status={<StatusBadge tone="info">Sin cambio significativo</StatusBadge>}
          />
          <IndicatorCard
            label="Gasto energético en reposo"
            value={formatNumber(1758.75, 'kcal')}
            unit="kcal"
            method={<MethodBadge label={methodLabel('RMR_MIFFLIN1990')} code="RMR_MIFFLIN1990" />}
            status={<StatusBadge tone="success">En rango</StatusBadge>}
          />
        </div>
      </section>

      <section aria-labelledby="avisos" className="flex flex-col gap-4">
        <h2 id="avisos" className="text-xl font-semibold">
          Avisos
        </h2>
        <Notice tone="info" title="La proyección es una estimación inicial" rule="RN-E05">
          Se recalcula con el peso nuevo en cada evaluación.
        </Notice>
        <Notice tone="success" title="Plan publicado" />
        <Notice tone="warning" title="Ritmo de pérdida fuera de 0.5 a 1 % semanal" rule="RN-E04">
          El objetivo implica 1.2 % por semana.
        </Notice>
        <Notice tone="danger" title="Los carbohidratos salen negativos" rule="RN-E07">
          Baja la proteína o la grasa para poder guardar.
        </Notice>
      </section>

      <section aria-labelledby="pasos" className="flex flex-col gap-4">
        <h2 id="pasos" className="text-xl font-semibold">
          Pasos de asistente
        </h2>
        <Steps
          label="Pasos de la evaluación"
          currentId="tomas"
          steps={[
            { id: 'nivel', label: 'Nivel y condiciones' },
            { id: 'tomas', label: 'Tomas' },
            { id: 'resultados', label: 'Resultados' },
            { id: 'cierre', label: 'Cierre' },
          ]}
        />
      </section>

      <InteractiveExamples />

      <section aria-labelledby="grafico" className="flex flex-col gap-4">
        <h2 id="grafico" className="text-xl font-semibold">
          Meta contra real
        </h2>
        <ChartExample />
      </section>

      <section aria-labelledby="vacio" className="flex flex-col gap-4">
        <h2 id="vacio" className="text-xl font-semibold">
          Estado vacío
        </h2>
        <EmptyState
          icon={Inbox}
          title="Aún no hay registros"
          description="Cuando el paciente registre su primera comida la verás aquí."
          action={<Button variant="secondary">Enviar recordatorio</Button>}
        />
      </section>

      <section aria-labelledby="navegacion" className="flex flex-col gap-4">
        <h2 id="navegacion" className="text-xl font-semibold">
          Navegación del panel y de la app
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-border p-3">
            <p className="mb-2 text-sm text-muted-foreground">
              Barra lateral del panel (sección activa)
            </p>
            <span
              data-testid="sidebar-active"
              className="flex min-h-touch items-center gap-3 rounded-md bg-brand px-3 text-sm font-medium text-brand-foreground"
            >
              Inicio
            </span>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="mb-2 text-sm text-muted-foreground">Barra inferior de la app</p>
            <div className="flex">
              {[
                { label: 'Hoy', icon: CalendarCheck, active: true },
                { label: 'Plan', icon: UtensilsCrossed },
                { label: 'Entreno', icon: Dumbbell },
                { label: 'Progreso', icon: TrendingUp },
                { label: 'Más', icon: Menu },
              ].map(({ label, icon: Icon, active }) => (
                <span
                  key={label}
                  data-testid={active ? 'bottom-active' : undefined}
                  className={`flex min-h-touch flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium ${active ? 'text-brand-text' : 'text-muted-foreground'}`}
                >
                  <Icon aria-hidden className="size-6" />
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

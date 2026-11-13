import type { MeApp, MeConsents, PatientEvolutionResponse } from '@nutricoach/contracts';
import { EmptyState, Notice } from '@nutricoach/ui';
import { TrendingUp } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ProgressCard } from '@/features/patient-app/progress-card';
import { serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Progreso' };

/**
 * Progreso (RF-30, ADR-091, ADR-107): el peso, la cintura, la cadera y la suma de 6 pliegues de cada evaluación, con el cambio real o «sin cambio
 * significativo» (RN-C06), y el % de grasa y la masa muscular del método principal (RN-D05), cada uno con su método (RN-D02),
 * si el profesional dejó la sección a la vista. Sin interpretaciones clínicas.
 */
export default async function Page() {
  const [app, evolution] = await Promise.all([
    serverApi<MeApp>('/me/app'),
    serverApi<PatientEvolutionResponse>('/me/evolution'),
  ]);
  if (!app.ok || !evolution.ok) {
    return <Notice tone="danger" title="No pudimos cargar tu progreso" />;
  }
  // Las fotos van con su propia autorización (RN-G20): se ven aunque Progreso no muestre la evolución, si su organización las
  // tiene (ADR-127). Apagadas, el enlace queda mientras su autorización siga vigente, para que pueda retirarla (ADR-128).
  const showPhotos = app.data.features.PROGRESS_PHOTOS || (await hasActivePhotosConsent());
  const photos = showPhotos ? (
    <Link
      href="/mi/progreso/fotos"
      className="flex min-h-touch items-center rounded-lg border border-border bg-card p-4 font-medium text-brand-text underline"
    >
      Fotos de progreso
    </Link>
  ) : null;
  if (!app.data.enabledSections.includes('EVOLUTION')) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">Progreso</h1>
        {photos}
        <EmptyState
          icon={TrendingUp}
          title="Tu profesional no activó Progreso en tu app"
          description="Si quieres ver tu evolución, pídeselo a tu profesional."
        />
      </div>
    );
  }
  const { evaluationCount, items } = evolution.data;
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Progreso</h1>
        {evaluationCount > 0 ? (
          <p className="text-sm text-muted-foreground">
            {evaluationCount === 1
              ? 'De tu evaluación.'
              : `De tus ${String(evaluationCount)} evaluaciones.`}{' '}
            Un cambio que no supera el margen de error de la medición es «sin cambio significativo».
          </p>
        ) : null}
      </header>
      {photos}
      {items.length === 0 ? (
        <EmptyState
          icon={TrendingUp}
          title="Aún no hay evaluaciones"
          description="Tu evolución aparecerá aquí después de tu primera evaluación."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <ProgressCard key={item.item} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

async function hasActivePhotosConsent(): Promise<boolean> {
  const consents = await serverApi<MeConsents>('/me/consents');
  return (
    consents.ok &&
    consents.data.consents.some((item) => item.purpose === 'PROGRESS_PHOTOS' && item.active)
  );
}

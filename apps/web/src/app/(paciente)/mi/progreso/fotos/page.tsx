import type { MeApp, MeConsents, ProgressPhotosResponse } from '@nutricoach/contracts';
import { EmptyState, Notice } from '@nutricoach/ui';
import { Camera } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PhotosConsent } from '@/features/patient-app/photos-consent';
import { Section } from '@/features/patients/section';
import { PhotoSlots } from '@/features/training/photo-slots';
import { photoComparison, photoSlots } from '@/features/training/photo-view';
import { PhotoComparison } from '@/features/training/progress-photos';
import { serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Fotos de progreso' };

/**
 * Tus fotos de progreso (P-30; RN-G20): tu autorización, las tres fotos de cada mesociclo, que subes desde su última semana, y la
 * comparativa por vista. Sin tu autorización no se suben ni se ven; al retirarla, se borran. Si tu organización apagó las fotos
 * (ADR-128), queda solo tu autorización, para que puedas retirarla.
 */
export default async function Page() {
  const [app, consents] = await Promise.all([
    serverApi<MeApp>('/me/app'),
    serverApi<MeConsents>('/me/consents'),
  ]);
  if (!app.ok || !consents.ok) {
    return <Notice tone="danger" title="No pudimos cargar tus fotos" />;
  }
  const consent = consents.data.consents.find((item) => item.purpose === 'PROGRESS_PHOTOS');
  const header = (
    <div className="flex flex-col gap-1">
      <Link
        href="/mi/progreso"
        className="flex min-h-touch items-center text-sm text-brand-text underline"
      >
        Volver a Progreso
      </Link>
      <h1 className="text-2xl font-semibold">Fotos de progreso</h1>
    </div>
  );
  if (!app.data.features.PROGRESS_PHOTOS) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <Section title="Tu autorización">
          <PhotosConsent consent={consent} paused />
        </Section>
      </div>
    );
  }
  const photos = await serverApi<ProgressPhotosResponse>('/me/progress-photos');
  if (!photos.ok) {
    return <Notice tone="danger" title="No pudimos cargar tus fotos" />;
  }
  const rows = photoSlots(photos.data);
  return (
    <div className="flex flex-col gap-6">
      {header}
      <Section title="Tu autorización">
        <PhotosConsent consent={consent} />
      </Section>
      {photos.data.consentActive ? (
        <>
          <Section
            title="Tus fotos de cada mesociclo"
            description="Frontal, lateral y posterior, desde la última semana del mesociclo. Subir otra la reemplaza."
          >
            {rows.length === 0 ? (
              <EmptyState
                icon={Camera}
                title="Todavía no tienes un programa"
                description="Las fotos se suben por cada mesociclo de tu programa de entrenamiento."
              />
            ) : (
              <PhotoSlots
                rows={rows}
                audience="patient"
                uploadBase="/me/progress-photos"
                canUpload
              />
            )}
          </Section>
          <Section title="Comparativa">
            <PhotoComparison comparison={photoComparison(photos.data)} audience="patient" />
          </Section>
        </>
      ) : null}
    </div>
  );
}

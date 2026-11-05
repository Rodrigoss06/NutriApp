import type { MeApp, MeConsents, MeTraining } from '@nutricoach/contracts';
import { EmptyState, Notice } from '@nutricoach/ui';
import { ClipboardCheck } from 'lucide-react';
import type { Metadata } from 'next';
import {
  initialValues,
  performanceFromTraining,
  sessionPrefill,
} from '@/features/patient-app/checkin';
import { CheckinForm } from '@/features/patient-app/checkin-form';
import { IndicationCard } from '@/features/patient-app/indication-card';
import { serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Registro diario' };

/**
 * El registro diario de entrenamiento y recuperación de hoy (RF-28, RN-G11, 07 §9), si el profesional dejó la sección a la
 * vista. Si ya se hizo, se corrige: el registro nuevo reemplaza al anterior (RN-G12). Los síntomas del ciclo aparecen solo con
 * la autorización MENSTRUAL_TRACKING vigente (RN-G17).
 */
export default async function Page() {
  const [app, training, consents] = await Promise.all([
    serverApi<MeApp>('/me/app'),
    serverApi<MeTraining>('/me/training'),
    serverApi<MeConsents>('/me/consents'),
  ]);
  if (!app.ok || !training.ok || !consents.ok) {
    return <Notice tone="danger" title="No pudimos cargar tu registro diario" />;
  }
  if (!app.data.enabledSections.includes('CHECKIN')) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">Registro diario</h1>
        <EmptyState
          icon={ClipboardCheck}
          title="Tu profesional no activó el registro diario en tu app"
          description="Si quieres registrar cómo te recuperas, pídeselo a tu profesional."
        />
      </div>
    );
  }
  const { checkin, workouts, localDate } = training.data;
  const activeByPurpose = new Map(
    consents.data.consents.map((consent) => [consent.purpose, consent.active]),
  );
  const menstrualTracking = activeByPurpose.get('MENSTRUAL_TRACKING') === true;
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Registro diario</h1>
        <p className="text-muted-foreground">
          Menos de 2 minutos. Lo que no sepas, déjalo en blanco: no cuenta como cero.
        </p>
      </header>
      {checkin ? (
        <>
          <IndicationCard readiness={checkin.readiness} action="none" />
          <Notice tone="info" title="Ya hiciste tu registro de hoy">
            Si cambias algo y lo guardas, el registro nuevo reemplaza al anterior.
          </Notice>
        </>
      ) : null}
      <CheckinForm
        localDate={localDate}
        initial={initialValues(checkin, sessionPrefill(workouts))}
        menstrualTracking={menstrualTracking}
        performanceFromSession={performanceFromTraining(training.data)}
        correcting={checkin !== null}
      />
    </div>
  );
}

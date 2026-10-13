import type { AccountResponse } from '@nutricoach/contracts';
import { BrandStyle } from '@nutricoach/ui';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { organizationBrand, patientBrand } from '@/features/brand/organization-brand';
import { RedirectToLogin } from '@/features/session/session-actions';
import { PatientShell } from '@/features/shell/patient-shell';
import { ServiceWorkerRegistration } from '@/features/shell/service-worker-registration';
import { serverApi } from '@/lib/api/server';

export const metadata: Metadata = {
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'NutriCoach', statusBarStyle: 'default' },
};

/**
 * App instalable del paciente (02 §11), primero para el celular. Vive bajo /mi/, el alcance de la PWA. Pide la cuenta
 * en cada petición: sin sesión PATIENT válida (perdió APP_ACCESS o HEALTH_DATA, o fue archivado: RN-B02), a /entrar.
 * Su tema de color (content.patient_app_setting) pasa por los mismos tokens que la marca de la organización.
 */
export default async function PatientLayout({ children }: Readonly<{ children: ReactNode }>) {
  const account = await serverApi<AccountResponse>('/account');
  if (!account.ok) return <RedirectToLogin />;
  if (account.data.kind === 'PLATFORM') redirect('/admin/plataforma');
  if (account.data.kind === 'STAFF') redirect('/panel');
  const brand = organizationBrand();
  return (
    <>
      <BrandStyle brand={patientBrand(brand.colors, null)} />
      <ServiceWorkerRegistration />
      <PatientShell displayName={brand.displayName} logoUrl={brand.logoUrl}>
        {children}
      </PatientShell>
    </>
  );
}

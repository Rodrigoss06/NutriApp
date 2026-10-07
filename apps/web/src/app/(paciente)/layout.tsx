import { BrandStyle } from '@nutricoach/ui';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { organizationBrand, patientBrand } from '@/features/brand/organization-brand';
import { PatientShell } from '@/features/shell/patient-shell';
import { ServiceWorkerRegistration } from '@/features/shell/service-worker-registration';

export const metadata: Metadata = {
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'NutriCoach', statusBarStyle: 'default' },
};

/**
 * App instalable del paciente (02 §11), primero para el celular. Vive bajo /mi/, el alcance de la PWA. Su tema
 * de color (content.patient_app_setting) pasa por los mismos tokens que la marca de la organización.
 */
export default function PatientLayout({ children }: Readonly<{ children: ReactNode }>) {
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

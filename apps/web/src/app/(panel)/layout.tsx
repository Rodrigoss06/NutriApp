import { BrandStyle } from '@nutricoach/ui';
import type { ReactNode } from 'react';
import { organizationBrand } from '@/features/brand/organization-brand';
import { PanelShell } from '@/features/shell/panel-shell';

/** Panel del profesional (02 §11) con la marca de su organización (RN-H03). */
export default function PanelLayout({ children }: Readonly<{ children: ReactNode }>) {
  const brand = organizationBrand();
  return (
    <>
      <BrandStyle brand={brand.colors} />
      <PanelShell
        displayName={brand.displayName}
        logoUrl={brand.logoUrl}
        patientLabel={brand.patientLabel}
        organizations={[]}
        activeOrganizationId=""
      >
        {children}
      </PanelShell>
    </>
  );
}

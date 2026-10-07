import type { ReactNode } from 'react';
import { BrandMark } from './brand-mark';
import { OrganizationSwitcher, type OrganizationOption } from './organization-switcher';
import { PanelFrame } from './panel-frame';
import { PatientSearch } from './patient-search';

export interface PanelShellProps {
  readonly displayName: string;
  readonly logoUrl: string | null;
  readonly patientLabel: string;
  readonly organizations: readonly OrganizationOption[];
  readonly activeOrganizationId: string;
  readonly children: ReactNode;
}

/** Panel del profesional (02 §11): barra lateral, buscador de pacientes y selector de organización. */
export function PanelShell({
  displayName,
  logoUrl,
  patientLabel,
  organizations,
  activeOrganizationId,
  children,
}: PanelShellProps) {
  return (
    <PanelFrame
      patientLabel={patientLabel}
      brand={<BrandMark displayName={displayName} logoUrl={logoUrl} />}
      tools={
        <>
          <PatientSearch patientLabel={patientLabel} />
          <OrganizationSwitcher organizations={organizations} activeId={activeOrganizationId} />
        </>
      }
    >
      {children}
    </PanelFrame>
  );
}

import type { ReactNode } from 'react';
import { LogoutButton } from '@/features/session/session-actions';
import { BrandMark } from './brand-mark';
import { OrganizationSwitcher, type OrganizationOption } from './organization-switcher';
import { PanelFrame } from './panel-frame';
import { PatientSearch } from './patient-search';

export interface PanelShellProps {
  readonly displayName: string;
  readonly logoUrl: string | null;
  readonly patientLabel: string;
  /** El dueño ve la auditoría en el menú (RF-06). */
  readonly showAudit?: boolean;
  readonly organizations: readonly OrganizationOption[];
  readonly activeOrganizationId: string;
  readonly notices?: ReactNode;
  readonly children: ReactNode;
}

/** Panel del profesional (02 §11): barra lateral, buscador de pacientes, selector de organización y salir. */
export function PanelShell({
  displayName,
  logoUrl,
  patientLabel,
  showAudit = false,
  organizations,
  activeOrganizationId,
  notices,
  children,
}: PanelShellProps) {
  return (
    <PanelFrame
      patientLabel={patientLabel}
      showAudit={showAudit}
      brand={<BrandMark displayName={displayName} logoUrl={logoUrl} />}
      notices={notices}
      tools={
        <>
          <PatientSearch patientLabel={patientLabel} />
          <OrganizationSwitcher organizations={organizations} activeId={activeOrganizationId} />
          <LogoutButton />
        </>
      }
    >
      {children}
    </PanelFrame>
  );
}
